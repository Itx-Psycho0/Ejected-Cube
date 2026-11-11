import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';
import { Noise } from '../core/noise';

const n = new Noise(5151);
let wear: Float32Array | null = null;

function wearMap(size: number) {
  if (wear) return wear;
  wear = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) wear[y * size + x] = n.fbm2((x / size) * 4, (y / size) * 4, 5, 4) * 0.5 + 0.5;
  return wear;
}

export interface HullPaint {
  color: string;
  accent: string;
  pattern: string;
  callsign: string;
}

/**
 * Paints the capsule hull on a canvas: base colour, pattern, panel seams,
 * rivets, the pilot's call sign and a pass of chips and grime.
 */
export class HullPainter {
  readonly map: CanvasTexture;
  readonly rough: CanvasTexture;
  private c = document.createElement('canvas');
  private r = document.createElement('canvas');

  constructor() {
    this.c.width = this.c.height = 512;
    this.r.width = this.r.height = 512;
    this.map = new CanvasTexture(this.c);
    this.map.colorSpace = SRGBColorSpace;
    this.rough = new CanvasTexture(this.r);
    for (const t of [this.map, this.rough]) {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.minFilter = LinearMipmapLinearFilter;
      t.anisotropy = 4;
    }
  }

  paint(p: HullPaint) {
    const S = 512;
    const ctx = this.c.getContext('2d')!;
    ctx.fillStyle = p.color;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = p.accent;
    switch (p.pattern) {
      case 'hazard':
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 404, S, 40);
        ctx.clip();
        ctx.fillStyle = '#1b1b1b';
        ctx.fillRect(0, 404, S, 40);
        ctx.fillStyle = p.accent;
        for (let x = -60; x < 560; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x, 444);
          ctx.lineTo(x + 20, 444);
          ctx.lineTo(x + 40, 404);
          ctx.lineTo(x + 20, 404);
          ctx.fill();
        }
        ctx.restore();
        break;
      case 'stripe':
        ctx.fillRect(0, 196, S, 34);
        ctx.fillRect(0, 244, S, 12);
        break;
      case 'checker':
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) ctx.fillRect(x * 64, y * 64, 64, 64);
        break;
      case 'panels':
        for (let i = 0; i < 6; i++) ctx.fillRect(((i * 197) % 384) + 8, ((i * 131) % 384) + 8, 120, 120);
        break;
      case 'camo':
        for (let i = 0; i < 26; i++) {
          ctx.beginPath();
          const x = (i * 211) % S;
          const y = (i * 137) % S;
          ctx.ellipse(x, y, 30 + (i % 5) * 9, 18 + (i % 3) * 10, i, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'dots':
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          ctx.beginPath();
          ctx.arc(x * 64 + (y % 2) * 32 + 16, y * 64 + 32, 12, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
    }
    // Seams and rivets.
    ctx.strokeStyle = 'rgba(30,20,10,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 128);
      ctx.lineTo(S, i * 128);
      ctx.moveTo(i * 128, 0);
      ctx.lineTo(i * 128, S);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,240,220,0.5)';
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j < 16; j++) {
        ctx.beginPath();
        ctx.arc(i * 128 + 6, j * 32 + 16, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    // Call sign.
    ctx.fillStyle = 'rgba(20,20,20,0.85)';
    ctx.font = 'bold 54px monospace';
    ctx.fillText(p.callsign.slice(0, 8).toUpperCase(), 140, 96);
    ctx.font = 'bold 16px monospace';
    ctx.fillText('ATLAS ENGINE · ESCAPE CUBE', 120, 330);
    // Wear: grime and chipped paint.
    const w = wearMap(S);
    const img = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < S * S; i++) {
      const v = w[i];
      const grime = (1 - v) * 0.28;
      for (let c = 0; c < 3; c++) {
        let val = img.data[i * 4 + c];
        val = val * (1 - grime) + 30 * grime;
        if (v > 0.74) val = 130 + c * 6;
        img.data[i * 4 + c] = val;
      }
    }
    ctx.putImageData(img, 0, 0);
    const rc = this.r.getContext('2d')!;
    const rimg = rc.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = w[i];
      const r = v > 0.74 ? 0.25 : 0.45 + (1 - v) * 0.35;
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = r * 255;
      rimg.data[i * 4 + 3] = 255;
    }
    rc.putImageData(rimg, 0, 0);
    this.map.needsUpdate = true;
    this.rough.needsUpdate = true;
  }
}
