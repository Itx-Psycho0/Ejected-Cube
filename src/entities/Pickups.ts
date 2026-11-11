import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three';
import { Random } from '../core/Random';
import type { PowerUp } from './Player';
import { merge } from '../world/geometry';
import type { Family } from '../themes/themes';

export type PickupKind = 'spark' | 'repair' | 'shard' | PowerUp;

export interface Pickup {
  active: boolean;
  kind: PickupKind;
  pos: Vector2;
  vel: Vector2;
  age: number;
  phase: number;
  root: Object3D | null;
  index: number;
}

const SPARK_MAX = 160;
const POWERUPS: PowerUp[] = ['shield', 'magnet', 'spread'];
export const POWERUP_INFO: Record<PowerUp, { label: string; color: number }> = {
  shield: { label: 'Shield', color: 0x3fc9a8 },
  magnet: { label: 'Magnet', color: 0x5aa9e6 },
  spread: { label: 'Triple shot', color: 0xb48cff },
};

/** What the common pickup is called in each family (HUD popups, tutorial). */
export const SPARK_NAME: Record<Family, string> = { water: 'plankton', sky: 'coins', space: 'crystals' };

const SPARK_LOOK: Record<Family, { geo: () => BufferGeometry; color: [number, number, number]; spin: boolean }> = {
  water: { geo: () => new IcosahedronGeometry(1, 1), color: [0.5, 2.0, 1.5], spin: false },
  sky: { geo: () => new CylinderGeometry(1.5, 1.5, 0.45, 18).rotateX(Math.PI / 2), color: [2.2, 1.55, 0.3], spin: true },
  space: { geo: () => new OctahedronGeometry(1.35, 0), color: [0.6, 1.7, 2.3], spin: true },
};

/**
 * Collectables. The common one (plankton, coins or crystals depending on
 * the world) is a single instanced mesh; rarer items use small pooled models.
 */
export class Pickups {
  readonly items: Pickup[] = [];
  private sparks: InstancedMesh;
  private sparkGeo = {} as Record<Family, BufferGeometry>;
  private family: Family = 'water';
  private repairVariants: Record<Family, Object3D>[] = [];
  private dummy = new Object3D();
  private rnd = new Random(2);
  private timers = { pattern: 1.5, repair: 20, power: 14, shard: 16 };
  private color = new Color();

  constructor(scene: Scene) {
    for (const f of ['water', 'sky', 'space'] as Family[]) this.sparkGeo[f] = SPARK_LOOK[f].geo();
    this.sparks = new InstancedMesh(this.sparkGeo.water, new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), SPARK_MAX);
    this.sparks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.sparks.frustumCulled = false;
    this.sparks.count = 0;
    scene.add(this.sparks);

    for (let i = 0; i < SPARK_MAX; i++) this.items.push(this.blank('spark', i, null));
    const build: [PickupKind, number, () => Object3D][] = [
      ['repair', 3, () => this.repairModel()],
      ['shard', 4, () => this.shardModel()],
      ...POWERUPS.map((p) => [p, 2, () => this.powerModel(p)] as [PickupKind, number, () => Object3D]),
    ];
    for (const [kind, n, make] of build) {
      for (let i = 0; i < n; i++) {
        const o = make();
        o.visible = false;
        scene.add(o);
        this.items.push(this.blank(kind, i, o));
      }
    }
  }

  private blank(kind: PickupKind, index: number, root: Object3D | null): Pickup {
    return { active: false, kind, pos: new Vector2(), vel: new Vector2(), age: 0, phase: 0, root, index };
  }

  private halo(color: number, r = 9) {
    const m = new Mesh(
      new RingGeometry(r * 0.84, r, 40),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    );
    m.name = 'halo';
    return m;
  }

  /** Repair item: a supply crate underwater, a heart in the sky, a power cell in space. */
  private repairModel() {
    const g = new Group();
    const white = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 });
    const crate = new Group();
    crate.add(new Mesh(new BoxGeometry(8, 7, 7), new MeshStandardMaterial({ color: 0xe8792a, roughness: 0.5, metalness: 0.2 })));
    const c1 = new Mesh(new BoxGeometry(1.4, 4.6, 0.4), white);
    const c2 = new Mesh(new BoxGeometry(4.6, 1.4, 0.4), white);
    c1.position.z = c2.position.z = 3.6;
    crate.add(c1, c2);

    const heart = new Group();
    const red = new MeshStandardMaterial({ color: 0xe5484d, roughness: 0.35, emissive: 0x7a1014, emissiveIntensity: 0.6 });
    const lobe = new SphereGeometry(2.9, 16, 12);
    const tip = new ConeGeometry(4.6, 6, 16).rotateX(Math.PI);
    heart.add(new Mesh(merge([lobe.clone().translate(-2.2, 1.6, 0), lobe.clone().translate(2.2, 1.6, 0), tip.translate(0, -2.4, 0)]), red));
    heart.scale.set(1, 1, 0.6);

    const cell = new Group();
    cell.add(
      new Mesh(new CylinderGeometry(3, 3, 8, 16), new MeshStandardMaterial({ color: 0x2a3340, metalness: 0.7, roughness: 0.35 })),
      new Mesh(new CylinderGeometry(3.1, 3.1, 4, 16), new MeshStandardMaterial({ color: 0x000000, emissive: 0x6dff8a, emissiveIntensity: 2.4, toneMapped: false })),
      new Mesh(new CylinderGeometry(1.2, 1.2, 9.4, 10), new MeshStandardMaterial({ color: 0xc0c6cc, metalness: 0.9, roughness: 0.3 })),
    );
    g.add(crate, heart, cell, this.halo(0xff8a6a, 10));
    this.repairVariants.push({ water: crate, sky: heart, space: cell });
    heart.visible = cell.visible = false;
    return g;
  }

  private shardModel() {
    const g = new Group();
    const gem = new Mesh(
      new OctahedronGeometry(3.6, 0),
      new MeshStandardMaterial({ color: 0xf6ecff, emissive: 0xd9b8ff, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0.3, flatShading: true }),
    );
    gem.scale.set(0.8, 1.3, 0.8);
    g.add(gem, this.halo(0xe6ccff, 8));
    return g;
  }

  private powerModel(kind: PowerUp) {
    const info = POWERUP_INFO[kind];
    const g = new Group();
    const mat = new MeshStandardMaterial({ color: 0x10202a, emissive: info.color, emissiveIntensity: 2, metalness: 0.4, roughness: 0.3 });
    let core: Mesh;
    if (kind === 'shield') core = new Mesh(new IcosahedronGeometry(4.5, 1), mat);
    else if (kind === 'magnet') {
      const arc = new TorusGeometry(4, 1.4, 10, 20, Math.PI);
      const l = new BoxGeometry(2.8, 3, 2.8).translate(-4, -1.5, 0);
      const r = new BoxGeometry(2.8, 3, 2.8).translate(4, -1.5, 0);
      core = new Mesh(merge([arc, l, r]), mat);
    } else {
      const parts = [-0.4, 0, 0.4].map((a) => new CapsuleGeometry(0.9, 6, 4, 8).rotateZ(Math.PI / 2 + a));
      core = new Mesh(merge(parts), mat);
    }
    g.add(core, this.halo(info.color, 11));
    return g;
  }

  setFamily(f: Family) {
    this.family = f;
    this.sparks.geometry = this.sparkGeo[f];
    for (const v of this.repairVariants) for (const k of Object.keys(v) as Family[]) v[k].visible = k === f;
  }

  seed(seed: number) {
    this.rnd.reseed(seed);
  }

  spawn(kind: PickupKind, x: number, y: number): Pickup | null {
    const it = this.items.find((p) => !p.active && p.kind === kind);
    if (!it) return null;
    it.active = true;
    it.pos.set(x, y);
    it.vel.set(0, 0);
    it.age = 0;
    it.phase = this.rnd.next() * 10;
    if (it.root) it.root.visible = true;
    return it;
  }

  /** Lay sparks out in a readable line to follow. */
  spawnPattern(x: number, bounds: Vector2) {
    const r = this.rnd;
    const type = r.pick(['sine', 'arc', 'line', 'ring'] as const);
    const cy = r.range(-bounds.y * 0.5, bounds.y * 0.55);
    const n = r.int(7, 11);
    for (let i = 0; i < n; i++) {
      let px = x + i * 17;
      let py = cy;
      if (type === 'sine') py = cy + Math.sin(i * 0.6) * 30;
      else if (type === 'arc') py = cy + Math.sin((i / (n - 1)) * Math.PI) * 44 - 22;
      else if (type === 'ring') {
        const a = (i / n) * Math.PI * 2;
        px = x + 40 + Math.cos(a) * 32;
        py = cy + Math.sin(a) * 32;
      }
      this.spawn('spark', px, Math.max(-bounds.y * 0.78, Math.min(bounds.y * 0.78, py)));
    }
  }

  /** Item director. Low energy brings repair items sooner. */
  direct(dt: number, bounds: Vector2, sparks: boolean, extras: boolean, energy: number) {
    const t = this.timers;
    const x = bounds.x + 40;
    const y = () => this.rnd.range(-bounds.y * 0.55, bounds.y * 0.6);
    t.pattern -= dt * (energy < 0.35 ? 1.6 : 1);
    if (sparks && t.pattern <= 0) {
      this.spawnPattern(x, bounds);
      t.pattern = this.rnd.range(2.4, 3.6);
    }
    if (!extras) return;
    t.repair -= dt * (energy < 0.4 ? 2.2 : 1);
    t.power -= dt;
    t.shard -= dt;
    if (t.repair <= 0) {
      this.spawn('repair', x, y());
      t.repair = this.rnd.range(18, 26);
    }
    if (t.power <= 0) {
      this.spawn(this.rnd.pick(POWERUPS), x, y());
      t.power = this.rnd.range(18, 26);
    }
    if (t.shard <= 0) {
      if (this.rnd.chance(0.7)) this.spawn('shard', x, y());
      t.shard = this.rnd.range(15, 22);
    }
  }

  countActive(kind: PickupKind) {
    let n = 0;
    for (const p of this.items) if (p.active && p.kind === kind) n++;
    return n;
  }

  update(dt: number, scrollSpeed: number, bounds: Vector2, px: number, py: number, magnetRadius: number, collectRadius: number, onCollect: (p: Pickup) => void) {
    const d = this.dummy;
    let n = 0;
    const time = performance.now() * 0.001;
    const look = SPARK_LOOK[this.family];
    // Everything is drawn in a little when close, so pickups glide into the craft.
    const pullRadius = Math.max(magnetRadius, collectRadius * 2.4);
    for (const p of this.items) {
      if (!p.active) continue;
      p.age += dt;
      p.vel.x = -scrollSpeed;
      p.vel.y = Math.sin(p.age * 2 + p.phase) * 6;
      const dx = px - p.pos.x;
      const dy = py - p.pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < pullRadius) {
        const pull = 420 * (1 - dist / pullRadius) + 140;
        p.vel.x += (dx / dist) * pull;
        p.vel.y += (dy / dist) * pull;
      }
      p.pos.addScaledVector(p.vel, dt);
      if (dist < collectRadius) {
        p.active = false;
        if (p.root) p.root.visible = false;
        onCollect(p);
        continue;
      }
      if (p.pos.x < -bounds.x - 50) {
        p.active = false;
        if (p.root) p.root.visible = false;
        continue;
      }
      const grow = Math.min(1, p.age * 5);
      if (p.kind === 'spark') {
        d.position.set(p.pos.x, p.pos.y, 0);
        if (look.spin) d.rotation.set(0, time * 3 + p.phase, 0);
        else d.rotation.set(time + p.phase, time * 1.3, 0);
        d.scale.setScalar((2.2 + Math.sin(time * 5 + p.phase) * 0.35) * grow);
        d.updateMatrix();
        this.sparks.setMatrixAt(n, d.matrix);
        this.sparks.setColorAt(n, this.color.setRGB(look.color[0], look.color[1], look.color[2]));
        n++;
      } else if (p.root) {
        const r = p.root;
        r.position.set(p.pos.x, p.pos.y, 0);
        r.rotation.y = time * 1.2 + p.phase;
        r.scale.setScalar(grow);
        const halo = r.getObjectByName('halo');
        if (halo) {
          halo.rotation.y = -r.rotation.y;
          halo.scale.setScalar(1 + Math.sin(time * 4 + p.phase) * 0.08);
        }
      }
    }
    this.sparks.count = n;
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const p of this.items) {
      p.active = false;
      if (p.root) p.root.visible = false;
    }
    this.timers = { pattern: 1.5, repair: 20, power: 14, shard: 16 };
  }
}
