import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, Texture } from 'three';
import { Noise } from '../core/noise';

/**
 * Procedural textures generated once at load time on a canvas.
 * No image downloads, no hotlinking, and every texture tiles seamlessly.
 */

const n = new Noise(4242);

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function finish(tex: Texture, srgb: boolean, repeat = 1) {
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Tileable fBm height field in 0..1. */
function heightField(size: number, scale: number, octaves: number, ridged = false) {
  const h = new Float32Array(size * size);
  const period = scale;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * scale;
      const v = (y / size) * scale;
      let val: number;
      if (ridged) {
        val = 0;
        let amp = 0.5;
        let f = 1;
        for (let o = 0; o < octaves; o++) {
          const r = 1 - Math.abs(n.noise2(u * f, v * f, period * f));
          val += r * r * amp;
          amp *= 0.5;
          f *= 2;
        }
      } else val = n.fbm2(u, v, octaves, period) * 0.5 + 0.5;
      h[y * size + x] = val;
    }
  }
  return h;
}

/** Converts a height field to a tangent-space normal map. */
function normalMapFrom(h: Float32Array, size: number, strength: number): CanvasTexture {
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new CanvasTexture(c);
}

function greyMapFrom(h: Float32Array, size: number, map: (v: number) => number): CanvasTexture {
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, map(h[i]) * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new CanvasTexture(c);
}

export interface TextureSet {
  rockNormal: Texture;
  sandNormal: Texture;
  sandRough: Texture;
  rustColor: Texture;
  rustNormal: Texture;
  rustRough: Texture;
  hullNormal: Texture;
  scalesNormal: Texture;
  chainAlpha: Texture;
}

let cache: TextureSet | null = null;

export function getTextures(): TextureSet {
  if (cache) return cache;

  const rockH = heightField(256, 8, 6, true);
  const sandH = heightField(256, 16, 4);

  // Sand ripples: noise plus directional sine.
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const i = y * 256 + x;
      sandH[i] = sandH[i] * 0.6 + (Math.sin((x / 256) * Math.PI * 2 * 12 + sandH[i] * 4) * 0.5 + 0.5) * 0.4;
    }

  const rustH = heightField(256, 6, 6);
  const rustC = canvas(256);
  {
    const ctx = rustC.getContext('2d')!;
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const v = rustH[i];
      const rust = Math.max(0, Math.min(1, (v - 0.42) * 3));
      // Painted steel mixing into orange-brown corrosion.
      const r = 60 + rust * 110 + v * 20;
      const g = 64 + rust * 40 + v * 15;
      const b = 66 - rust * 30 + v * 10;
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // Hull panel seams for the escape cube's normal map (paint is done per loadout).
  const hullH = heightField(512, 4, 5);
  const hullNH = new Float32Array(512 * 512);
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const seam = x % 128 < 2 || y % 128 < 2 ? -0.6 : 0;
      hullNH[y * 512 + x] = hullH[y * 512 + x] * 0.15 + seam;
    }

  // Fish/creature scales: hex-ish cells.
  const scaleH = new Float32Array(128 * 128);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const row = Math.floor(y / 8);
      const xx = (x + (row % 2) * 4) % 8;
      const yy = y % 8;
      scaleH[y * 128 + x] = Math.sqrt(Math.max(0, 1 - ((xx - 4) ** 2 + (yy - 2) ** 2) / 20));
    }

  // Chain links (alpha) for tethered mines.
  const chainC = canvas(64);
  {
    const ctx = chainC.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.ellipse(32, 18, 14, 20, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(27, 38, 10, 26);
  }

  cache = {
    rockNormal: finish(normalMapFrom(rockH, 256, 6), false),
    sandNormal: finish(normalMapFrom(sandH, 256, 3), false),
    sandRough: finish(greyMapFrom(sandH, 256, (v) => 0.75 + v * 0.25), false),
    rustColor: finish(new CanvasTexture(rustC), true),
    rustNormal: finish(normalMapFrom(rustH, 256, 5), false),
    rustRough: finish(greyMapFrom(rustH, 256, (v) => 0.5 + v * 0.45), false),
    hullNormal: finish(normalMapFrom(hullNH, 512, 4), false),
    scalesNormal: finish(normalMapFrom(scaleH, 128, 2.5), false),
    chainAlpha: finish(new CanvasTexture(chainC), false),
  };
  return cache;
}

const groundCache = new Map<string, Texture>();

/** Normal map for each ground surface type used by the themes. */
export function groundNormal(type: 'sand' | 'paper' | 'tiles' | 'studs' | 'snow' | 'clay'): Texture {
  const hit = groundCache.get(type);
  if (hit) return hit;
  if (type === 'sand') return getTextures().sandNormal;
  const size = 256;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let val = 0;
      switch (type) {
        case 'paper':
          val = n.fbm2(u * 24, v * 24, 3, 24) * 0.3 + Math.abs(n.noise2(u * 64, v * 4, 64)) * 0.25;
          break;
        case 'tiles': {
          const gx = (u * 4) % 1;
          const gy = (v * 4) % 1;
          val = gx < 0.03 || gy < 0.03 ? -1 : n.fbm2(u * 16, v * 16, 2, 16) * 0.05;
          break;
        }
        case 'studs': {
          const cx = ((u * 8) % 1) - 0.5;
          const cy = ((v * 8) % 1) - 0.5;
          const r = Math.hypot(cx, cy);
          val = r < 0.3 ? 1 : r < 0.34 ? 0.5 : 0;
          break;
        }
        case 'snow':
          val = n.fbm2(u * 8, v * 8, 5, 8) * 0.6;
          break;
        case 'clay':
          // Soft lumps plus faint thumb-print rings.
          val = n.fbm2(u * 6, v * 6, 3, 6) * 0.7 + Math.sin(Math.hypot(u - 0.5, v - 0.5) * 120) * 0.03;
          break;
      }
      h[y * size + x] = val;
    }
  const strength = type === 'studs' ? 5 : type === 'tiles' ? 4 : 3;
  const tex = finish(normalMapFrom(h, size, strength), false);
  groundCache.set(type, tex);
  return tex;
}
