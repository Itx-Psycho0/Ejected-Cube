/**
 * 2D/3D gradient noise (Perlin style) with a seeded permutation table, plus fBm.
 * Used at load time for terrain heights, rock shapes and procedural textures.
 */
export class Noise {
  private perm = new Uint8Array(512);
  constructor(seed = 1337) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed >>> 0 || 1;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private static fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  private static grad2(h: number, x: number, y: number) {
    const u = h & 1 ? x : -x;
    const v = h & 2 ? y : -y;
    return (h & 4 ? u + v : u - v) * 0.7071;
  }
  private static grad3(h: number, x: number, y: number, z: number) {
    const hh = h & 15;
    const u = hh < 8 ? x : y;
    const v = hh < 4 ? y : hh === 12 || hh === 14 ? x : z;
    return (hh & 1 ? -u : u) + (hh & 2 ? -v : v);
  }

  /** Returns roughly -1..1. `period` (in lattice cells) makes it tile. */
  noise2(x: number, y: number, period = 256): number {
    const P = this.perm;
    let xi = Math.floor(x);
    let yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    xi = ((xi % period) + period) % period;
    yi = ((yi % period) + period) % period;
    const xi1 = (xi + 1) % period;
    const yi1 = (yi + 1) % period;
    const u = Noise.fade(xf);
    const v = Noise.fade(yf);
    const aa = P[P[xi & 255] + (yi & 255)];
    const ab = P[P[xi & 255] + (yi1 & 255)];
    const ba = P[P[xi1 & 255] + (yi & 255)];
    const bb = P[P[xi1 & 255] + (yi1 & 255)];
    const x1 = Noise.grad2(aa, xf, yf) + u * (Noise.grad2(ba, xf - 1, yf) - Noise.grad2(aa, xf, yf));
    const x2 = Noise.grad2(ab, xf, yf - 1) + u * (Noise.grad2(bb, xf - 1, yf - 1) - Noise.grad2(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 1.4;
  }

  noise3(x: number, y: number, z: number): number {
    const P = this.perm;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = Noise.fade(x);
    const v = Noise.fade(y);
    const w = Noise.fade(z);
    const A = P[X] + Y;
    const AA = P[A] + Z;
    const AB = P[A + 1] + Z;
    const B = P[X + 1] + Y;
    const BA = P[B] + Z;
    const BB = P[B + 1] + Z;
    const g = Noise.grad3;
    const l = (a: number, b: number, t: number) => a + t * (b - a);
    return l(
      l(l(g(P[AA], x, y, z), g(P[BA], x - 1, y, z), u), l(g(P[AB], x, y - 1, z), g(P[BB], x - 1, y - 1, z), u), v),
      l(
        l(g(P[AA + 1], x, y, z - 1), g(P[BA + 1], x - 1, y, z - 1), u),
        l(g(P[AB + 1], x, y - 1, z - 1), g(P[BB + 1], x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    );
  }

  fbm2(x: number, y: number, octaves = 5, period = 256): number {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2(x * f, y * f, period * f);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }

  /** Sharp ridges, good for rock strata and trench walls. */
  ridged2(x: number, y: number, octaves = 4): number {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.noise2(x * f, y * f));
      sum += n * n * amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum;
  }
}

export const noise = new Noise(90210);
