/** Small, fast seeded PRNG (mulberry32). Used for daily dives so every player gets the same run. */
export class Random {
  private s: number;
  constructor(seed = Date.now()) {
    this.s = seed >>> 0;
  }
  reseed(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number) {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number) {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Weighted pick from [item, weight] pairs. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = this.next() * total;
    for (const [item, w] of entries) {
      if ((r -= w) <= 0) return item;
    }
    return entries[entries.length - 1][0];
  }
}

/** Seed derived from today's UTC date, e.g. 20261110. */
export function dailySeed(date = new Date()): number {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

/** Unseeded RNG for cosmetic effects that must not affect gameplay determinism. */
export const fx = new Random((Math.random() * 2 ** 32) >>> 0);
