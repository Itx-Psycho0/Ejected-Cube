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
  hullColor: Texture;
  hullRough: Texture;
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

  // Escape pod hull: hazard-orange paint, panel seams, rivets, stencil, wear.
  const hullH = heightField(512, 4, 5);
  const hullC = canvas(512);
  const hullRC = canvas(512);
  {
    const ctx = hullC.getContext('2d')!;
    ctx.fillStyle = '#e8792a';
    ctx.fillRect(0, 0, 512, 512);
    // Panel seams
    ctx.strokeStyle = 'rgba(40,20,10,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 128);
      ctx.lineTo(512, i * 128);
      ctx.moveTo(i * 128, 0);
      ctx.lineTo(i * 128, 512);
      ctx.stroke();
    }
    // Rivets
    ctx.fillStyle = 'rgba(255,220,180,0.55)';
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j < 16; j++) {
        ctx.beginPath();
        ctx.arc(i * 128 + 6, j * 32 + 16, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    // Hazard stripes band
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 384 + 20, 512, 40);
    ctx.clip();
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, 404, 512, 40);
    ctx.fillStyle = '#f2c230';
    for (let x = -60; x < 560; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 444);
      ctx.lineTo(x + 20, 444);
      ctx.lineTo(x + 40, 404);
      ctx.lineTo(x + 20, 404);
      ctx.fill();
    }
    ctx.restore();
    // Stencil text
    ctx.fillStyle = 'rgba(20,20,20,0.85)';
    ctx.font = 'bold 44px monospace';
    ctx.fillText('EC-07', 150, 90);
    ctx.font = 'bold 18px monospace';
    ctx.fillText('ESCAPE CAPSULE  /  HADAL STATION KESTREL', 14, 240);
    ctx.fillText('DO NOT OBSTRUCT HATCH', 160, 330);
    // Wear: scratches and chipped paint
    const img = ctx.getImageData(0, 0, 512, 512);
    for (let i = 0; i < 512 * 512; i++) {
      const v = hullH[i];
      const chip = v > 0.72 ? 1 : 0;
      const grime = (1 - v) * 0.35;
      for (let c = 0; c < 3; c++) {
        let val = img.data[i * 4 + c];
        val = val * (1 - grime) + 30 * grime;
        if (chip) val = 120 + c * 6;
        img.data[i * 4 + c] = val;
      }
    }
    ctx.putImageData(img, 0, 0);
    for (let s = 0; s < 70; s++) {
      ctx.strokeStyle = `rgba(200,190,170,${0.1 + Math.random() * 0.25})`;
      ctx.lineWidth = 0.6 + Math.random();
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 16);
      ctx.stroke();
    }
    // Roughness: paint 0.45, chips (bare metal) 0.25, grime 0.8
    const rctx = hullRC.getContext('2d')!;
    const rimg = rctx.createImageData(512, 512);
    for (let i = 0; i < 512 * 512; i++) {
      const v = hullH[i];
      const r = v > 0.72 ? 0.25 : 0.45 + (1 - v) * 0.4;
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = r * 255;
      rimg.data[i * 4 + 3] = 255;
    }
    rctx.putImageData(rimg, 0, 0);
  }
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
    hullColor: finish(new CanvasTexture(hullC), true),
    hullRough: finish(new CanvasTexture(hullRC), false),
    hullNormal: finish(normalMapFrom(hullNH, 512, 4), false),
    scalesNormal: finish(normalMapFrom(scaleH, 128, 2.5), false),
    chainAlpha: finish(new CanvasTexture(chainC), false),
  };
  return cache;
}
