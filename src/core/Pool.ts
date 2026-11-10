/**
 * Fixed-capacity object pool. Objects are created up front so nothing is
 * allocated (or garbage collected) during gameplay.
 */
export class Pool<T extends { active: boolean }> {
  readonly items: T[] = [];
  constructor(capacity: number, factory: (index: number) => T) {
    for (let i = 0; i < capacity; i++) this.items.push(factory(i));
  }
  acquire(): T | null {
    for (const it of this.items) if (!it.active) return (it.active = true), it;
    return null;
  }
  forEachActive(fn: (item: T) => void) {
    for (const it of this.items) if (it.active) fn(it);
  }
  countActive() {
    let n = 0;
    for (const it of this.items) if (it.active) n++;
    return n;
  }
}
