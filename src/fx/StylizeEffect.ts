import { CanvasTexture, Color, RepeatWrapping, Uniform } from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { Noise } from '../core/noise';

/**
 * One screen-space pass that gives each theme its drawn look:
 * - Sobel edges on depth (silhouettes) and luminance (inner lines) -> ink outlines
 * - luminance cross-hatching -> pencil sketch
 * - monochrome wash that keeps reds -> sumi-e ink painting
 * - paper fibre overlay, saturation and contrast grading
 */
const fragment = /* glsl */ `
uniform float uOutline;
uniform float uOutlineWidth;
uniform vec3 uOutlineColor;
uniform float uHatch;
uniform float uInk;
uniform float uPaper;
uniform float uSaturation;
uniform float uContrast;
uniform float uPosterize;
uniform vec3 uPaperColor;
uniform sampler2D uPaperTex;

float ecViewZ(float d) {
  return (cameraNear * cameraFar) / ((cameraFar - cameraNear) * d - cameraFar);
}
float ecLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = ecLum(c);

  float edge = 0.0;
  if (uOutline > 0.0) {
    vec2 t = texelSize * uOutlineWidth;
    float z = -ecViewZ(depth);
    float zl = -ecViewZ(readDepth(uv - vec2(t.x, 0.0)));
    float zr = -ecViewZ(readDepth(uv + vec2(t.x, 0.0)));
    float zu = -ecViewZ(readDepth(uv + vec2(0.0, t.y)));
    float zd = -ecViewZ(readDepth(uv - vec2(0.0, t.y)));
    float dz = (abs(zl - z) + abs(zr - z) + abs(zu - z) + abs(zd - z)) / max(z, 1.0);
    float depthEdge = smoothstep(0.06, 0.16, dz);
    float ll = ecLum(texture2D(inputBuffer, uv - vec2(t.x, 0.0)).rgb);
    float lr = ecLum(texture2D(inputBuffer, uv + vec2(t.x, 0.0)).rgb);
    float lu = ecLum(texture2D(inputBuffer, uv + vec2(0.0, t.y)).rgb);
    float ld = ecLum(texture2D(inputBuffer, uv - vec2(0.0, t.y)).rgb);
    float lumEdge = smoothstep(0.12, 0.3, length(vec2(lr - ll, lu - ld)));
    edge = max(depthEdge, lumEdge * 0.6);
  }

  // Grade.
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5;

  if (uPosterize > 0.0) {
    float pl = floor(l * uPosterize + 0.5) / uPosterize;
    c *= pl / max(l, 0.001);
  }

  vec2 px = uv * resolution;

  if (uHatch > 0.0) {
    // Cross-hatching: denser strokes in darker areas, on white paper.
    float ink = 1.0;
    float s1 = abs(fract((px.x + px.y) / 6.0) - 0.5);
    float s2 = abs(fract((px.x - px.y) / 6.0) - 0.5);
    float s3 = abs(fract((px.x + px.y * 0.3) / 4.0) - 0.5);
    if (l < 0.62) ink = min(ink, smoothstep(0.08, 0.2, s1));
    if (l < 0.42) ink = min(ink, smoothstep(0.08, 0.2, s2));
    if (l < 0.24) ink = min(ink, smoothstep(0.1, 0.24, s3));
    vec3 sketch = mix(uOutlineColor, uPaperColor, ink);
    // Keep a hint of blue pencil for bright accents.
    float accent = smoothstep(0.25, 0.5, c.b - max(c.r, c.g));
    sketch = mix(sketch, vec3(0.18, 0.44, 0.87), accent * 0.8);
    c = mix(c, sketch, uHatch);
  }

  if (uInk > 0.0) {
    // Sumi-e: grey ink wash on rice paper, with vermilion left in colour.
    float red = smoothstep(0.12, 0.35, c.r - max(c.g, c.b));
    float wash = pow(clamp(1.0 - l, 0.0, 1.0), 1.3);
    vec3 mono = mix(uPaperColor, vec3(0.07), wash);
    c = mix(c, mix(mono, c, red), uInk);
  }

  if (uPaper > 0.0) {
    float fibre = texture2D(uPaperTex, px / 512.0).r;
    c *= mix(1.0, 0.86 + 0.24 * fibre, uPaper);
  }

  c = mix(c, uOutlineColor, edge * uOutline);
  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}
`;

function paperTexture() {
  const n = new Noise(31);
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const fbm = n.fbm2((x / size) * 32, (y / size) * 32, 4, 32) * 0.5 + 0.5;
      const fibre = Math.abs(n.noise2((x / size) * 80, (y / size) * 6, 80));
      const v = 0.75 * fbm + 0.25 * (1 - fibre);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

export class StylizeEffect extends Effect {
  constructor() {
    super('StylizeEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uOutline', new Uniform(0)],
        ['uOutlineWidth', new Uniform(1)],
        ['uOutlineColor', new Uniform(new Color(0x111111))],
        ['uHatch', new Uniform(0)],
        ['uInk', new Uniform(0)],
        ['uPaper', new Uniform(0)],
        ['uSaturation', new Uniform(1)],
        ['uContrast', new Uniform(1)],
        ['uPosterize', new Uniform(0)],
        ['uPaperColor', new Uniform(new Color(0xfbfaf5))],
        ['uPaperTex', new Uniform(paperTexture())],
      ]),
    });
  }

  set(key: string, value: number) {
    (this.uniforms.get(key) as Uniform<number>).value = value;
  }
  setColor(key: string, hex: number) {
    (this.uniforms.get(key) as Uniform<Color>).value.setHex(hex);
  }
  get(key: string) {
    return (this.uniforms.get(key) as Uniform<number>).value;
  }
}
