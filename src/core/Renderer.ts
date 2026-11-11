import { HalfFloatType, NoToneMapping, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector2, WebGLRenderer } from 'three';
import {
  BloomEffect,
  BlendFunction,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { QualityPreset } from './Quality';
import { StylizeEffect } from '../fx/StylizeEffect';
import type { ThemeFx } from '../themes/themes';
import { damp } from './math';

type Num = 'bloom' | 'bloomThreshold' | 'outline' | 'hatch' | 'paper' | 'ink' | 'saturation' | 'contrast' | 'vignette' | 'grain' | 'posterize';
const NUM_KEYS: Num[] = ['bloom', 'bloomThreshold', 'outline', 'hatch', 'paper', 'ink', 'saturation', 'contrast', 'vignette', 'grain', 'posterize'];

/**
 * Owns the WebGL renderer and the post-processing chain:
 *   RenderPass -> [bloom, chromatic aberration, ACES] -> [stylize, vignette, grain]
 * Theme FX values blend smoothly when the world changes.
 */
export class Renderer {
  readonly gl: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  private composer: EffectComposer;
  private bloom!: BloomEffect;
  private chromatic!: ChromaticAberrationEffect;
  private vignette!: VignetteEffect;
  private noise!: NoiseEffect;
  readonly stylize = new StylizeEffect();
  private passA?: EffectPass;
  private passB?: EffectPass;
  private preset: QualityPreset;
  private caOffset = new Vector2();
  private fx: Record<Num, number> = {
    bloom: 1.3,
    bloomThreshold: 0.62,
    outline: 0,
    hatch: 0,
    paper: 0,
    ink: 0,
    saturation: 1,
    contrast: 1,
    vignette: 0.7,
    grain: 0.06,
    posterize: 0,
  };
  private target: Record<Num, number> = { ...this.fx };
  private chromaticBase = 1;
  private renderScale = 1;
  /** 0..1 chromatic aberration pulse, decays every frame. */
  aberration = 0;

  constructor(
    canvas: HTMLCanvasElement,
    readonly scene: Scene,
    preset: QualityPreset,
  ) {
    this.preset = preset;
    this.gl = new WebGLRenderer({ canvas, antialias: false, stencil: false, depth: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = NoToneMapping;
    this.gl.shadowMap.type = PCFSoftShadowMap;
    this.gl.info.autoReset = false;

    this.camera = new PerspectiveCamera(48, 1, 1, 2600);
    this.camera.position.set(0, 0, 230);

    this.composer = new EffectComposer(this.gl, { frameBufferType: HalfFloatType, multisampling: preset.msaa });
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.buildEffects();
    this.resize();
  }

  /** Built once. Rebuilding passes mid-game caused black frames, so quality changes only adjust settings. */
  private buildEffects() {
    const p = this.preset;
    this.bloom = new BloomEffect({
      intensity: this.fx.bloom,
      luminanceThreshold: this.fx.bloomThreshold,
      luminanceSmoothing: 0.25,
      mipmapBlur: true,
      radius: 0.72,
      resolutionScale: p.bloomScale,
    });
    this.chromatic = new ChromaticAberrationEffect({ offset: this.caOffset, radialModulation: true, modulationOffset: 0.25 });
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: this.fx.vignette });
    this.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.passA = new EffectPass(this.camera, this.bloom, this.chromatic, tone);
    this.passB = new EffectPass(this.camera, this.stylize, this.vignette, this.noise);
    this.composer.addPass(this.passA);
    this.composer.addPass(this.passB);
  }

  applyQuality(preset: QualityPreset) {
    if (preset.msaa !== this.preset.msaa) this.composer.multisampling = preset.msaa;
    this.preset = preset;
    this.gl.shadowMap.enabled = preset.shadows;
    this.bloom.resolution.scale = preset.bloomScale;
    this.resize();
  }

  /** Dynamic resolution: 0.55..1 of the preset's pixel ratio. */
  setRenderScale(scale: number) {
    if (Math.abs(scale - this.renderScale) < 0.01) return;
    this.renderScale = scale;
    this.resize();
  }

  /** Blend toward a theme's look. `instant` snaps (menus, first frame). */
  setTheme(fx: ThemeFx, paperColor: number, instant = false) {
    for (const k of NUM_KEYS) this.target[k] = fx[k];
    this.chromaticBase = fx.chromatic ? 1 : 0;
    this.stylize.setColor('uOutlineColor', fx.outlineColor);
    this.stylize.setColor('uPaperColor', paperColor);
    if (instant) Object.assign(this.fx, this.target);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio) * this.renderScale;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = this.camera.aspect < 1 ? 62 : 48;
    this.camera.updateProjectionMatrix();
    this.stylize.set('uOutlineWidth', Math.max(1, pr * 0.9));
  }

  render(dt: number) {
    for (const k of NUM_KEYS) this.fx[k] = damp(this.fx[k], this.target[k], 1.6, Math.max(dt, 0.016));
    const f = this.fx;
    this.bloom.intensity = f.bloom;
    this.bloom.luminanceMaterial.threshold = f.bloomThreshold;
    this.vignette.darkness = f.vignette;
    this.noise.blendMode.opacity.value = f.grain;
    const s = this.stylize;
    s.set('uOutline', f.outline);
    s.set('uHatch', f.hatch);
    s.set('uPaper', f.paper);
    s.set('uInk', f.ink);
    s.set('uSaturation', f.saturation);
    s.set('uContrast', f.contrast);
    s.set('uPosterize', f.posterize > 0.5 ? f.posterize : 0);

    this.aberration = Math.max(0, this.aberration - dt * 2.2);
    const a = this.preset.chromatic ? 0.0006 * this.chromaticBase + this.aberration * 0.004 : 0;
    this.caOffset.set(a, a * 0.6);
    this.gl.info.reset();
    this.composer.render(dt);
  }

  compile() {
    this.gl.compile(this.scene, this.camera);
  }

  async warmup() {
    await this.gl.compileAsync(this.scene, this.camera);
  }

  playfieldHalfSize(out: Vector2): Vector2 {
    const dist = this.camera.position.z;
    const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * dist;
    return out.set(halfH * this.camera.aspect, halfH);
  }

  get drawCalls() {
    return this.gl.info.render.calls;
  }
}
