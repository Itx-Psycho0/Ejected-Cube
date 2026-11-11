import { BoxGeometry, BufferGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Scene, Vector2 } from 'three';
import { lumpySphere, merge } from '../world/geometry';
import type { Family } from '../themes/themes';
import { Random } from '../core/Random';

interface Gate {
  active: boolean;
  x: number;
  gapY: number;
  gap: number;
  passed: boolean;
  hit: boolean;
  root: Group;
  top: Group;
  bottom: Group;
  bodies: Record<Family, [Mesh, Mesh]>;
}

const W = 16;
const LEN = 300;

/**
 * Gate obstacles: a column from above and one from below with a gap to fly
 * through. Rock pillars underwater, floating rock spires in the sky and
 * laser pylons in space. Flying through one cleanly pays a bonus.
 */
export class Gates {
  private gates: Gate[] = [];
  private rnd = new Random(77);
  private timer = 8;
  private queue: number[] = [];
  private queueGap = 0;
  private family: Family = 'water';

  constructor(scene: Scene) {
    const rock = new MeshStandardMaterial({ color: 0x6e6a62, roughness: 0.95 });
    const coral = new MeshStandardMaterial({ color: 0xff7a7a, roughness: 0.7, emissive: 0x3a0a10, emissiveIntensity: 0.4 });
    const sky = new MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.9 });
    const grass = new MeshStandardMaterial({ color: 0x6aa84f, roughness: 0.9 });
    const metal = new MeshStandardMaterial({ color: 0x4a525c, roughness: 0.35, metalness: 0.85 });
    const laser = new MeshStandardMaterial({ color: 0x000000, emissive: 0xff3a3a, emissiveIntensity: 3.5, toneMapped: false });

    const column = (seed: number): BufferGeometry => {
      const parts: BufferGeometry[] = [];
      for (let y = 0; y < LEN; y += 22) parts.push(lumpySphere(W * 0.62, 1, 0.22, 0.6, seed + y).scale(1, 1.3, 0.9).translate(0, y + 11, 0));
      return merge(parts);
    };
    const waterGeo = column(3);
    const waterTip = lumpySphere(W * 0.5, 1, 0.3, 1.4, 9).scale(1.2, 0.7, 1);
    const skyGeo = column(17);
    const skyTip = new CylinderGeometry(W * 0.8, W * 0.55, 6, 8);
    const pylon = merge([new BoxGeometry(W * 0.8, LEN, W * 0.8).translate(0, LEN / 2, 0), new BoxGeometry(W * 1.2, 8, W * 1.2).translate(0, 4, 0)]);
    const beam = new BoxGeometry(W * 0.22, LEN, W * 0.9).translate(-W * 0.45, LEN / 2, 0);

    for (let i = 0; i < 8; i++) {
      const root = new Group();
      const top = new Group();
      const bottom = new Group();
      root.add(top, bottom);
      bottom.rotation.z = Math.PI; // the lower column grows downward from the gap
      const make = (geo: BufferGeometry, mat: MeshStandardMaterial, tip?: [BufferGeometry, MeshStandardMaterial]) => {
        const g = new Mesh(geo, mat);
        if (tip) g.add(new Mesh(tip[0], tip[1]));
        g.castShadow = true;
        g.frustumCulled = false;
        return g;
      };
      const pair = (fam: Family): [Mesh, Mesh] => {
        if (fam === 'water') return [make(waterGeo, rock, [waterTip, coral]), make(waterGeo, rock, [waterTip, coral])];
        if (fam === 'sky') return [make(skyGeo, sky, [skyTip, grass]), make(skyGeo, sky, [skyTip, grass])];
        const a = make(pylon, metal);
        a.add(new Mesh(beam, laser));
        const b = make(pylon, metal);
        b.add(new Mesh(beam, laser));
        return [a, b];
      };
      const bodies = { water: pair('water'), sky: pair('sky'), space: pair('space') } as Record<Family, [Mesh, Mesh]>;
      for (const f of Object.keys(bodies) as Family[]) {
        top.add(bodies[f][0]);
        bottom.add(bodies[f][1]);
      }
      root.visible = false;
      scene.add(root);
      this.gates.push({ active: false, x: 0, gapY: 0, gap: 50, passed: false, hit: false, root, top, bottom, bodies });
    }
    this.setFamily('water');
  }

  setFamily(f: Family) {
    this.family = f;
    for (const g of this.gates) for (const k of Object.keys(g.bodies) as Family[]) for (const m of g.bodies[k]) m.visible = k === f;
  }

  /** Every so often a short run of gates rolls in; frequency and tightness grow with the level. */
  direct(dt: number, level: number, bounds: Vector2, allowed: boolean) {
    if (!allowed || level < 2) return;
    this.timer -= dt;
    if (this.timer <= 0 && this.queue.length === 0) {
      const n = Math.min(5, 2 + Math.floor(level / 4));
      const base = this.rnd.range(-bounds.y * 0.35, bounds.y * 0.35);
      const amp = this.rnd.range(18, 40);
      for (let i = 0; i < n; i++) this.queue.push(Math.max(-bounds.y * 0.5, Math.min(bounds.y * 0.5, base + Math.sin(i * 1.3) * amp)));
      this.timer = Math.max(7, 16 - level * 0.6);
      this.queueGap = 0;
    }
    if (this.queue.length) {
      this.queueGap -= dt;
      if (this.queueGap <= 0) {
        this.spawn(bounds.x + 40, this.queue.shift()!, Math.max(40, 62 - level * 1.4));
        this.queueGap = 1.15;
      }
    }
  }

  spawn(x: number, gapY: number, half: number) {
    const g = this.gates.find((q) => !q.active);
    if (!g) return;
    g.active = true;
    g.x = x;
    g.gapY = gapY;
    g.gap = half;
    g.passed = g.hit = false;
    g.root.visible = true;
    g.top.position.set(0, gapY + half, 0);
    g.bottom.position.set(0, gapY - half, 0);
  }

  /**
   * Moves gates and resolves collisions. `onHit` when the craft touches a
   * column, `onPass` when it flies cleanly through.
   */
  update(dt: number, speed: number, bounds: Vector2, px: number, py: number, r: number, onHit: () => void, onPass: () => void) {
    for (const g of this.gates) {
      if (!g.active) continue;
      g.x -= speed * dt;
      g.root.position.set(g.x, 0, -2);
      const inX = Math.abs(px - g.x) < W / 2 + r * 0.8;
      if (inX && !g.hit && (py + r * 0.7 > g.gapY + g.gap || py - r * 0.7 < g.gapY - g.gap)) {
        g.hit = true;
        onHit();
      }
      if (!g.passed && g.x < px - W) {
        g.passed = true;
        if (!g.hit) onPass();
      }
      if (g.x < -bounds.x - 60) {
        g.active = false;
        g.root.visible = false;
      }
    }
    void this.family;
  }

  clear() {
    for (const g of this.gates) {
      g.active = false;
      g.root.visible = false;
    }
    this.queue = [];
    this.timer = 8;
  }
}
