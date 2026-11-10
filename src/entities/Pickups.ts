import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  DoubleSide,
} from 'three';
import { Random } from '../core/Random';
import type { PowerUp } from './Player';
import { merge } from '../world/geometry';

export type PickupKind = 'plankton' | 'ammo' | 'repair' | 'pearl' | PowerUp;

export interface Pickup {
  active: boolean;
  kind: PickupKind;
  pos: Vector2;
  vel: Vector2;
  age: number;
  phase: number;
  revealed: number;
  root: Object3D | null;
  index: number;
}

const PLANKTON_MAX = 160;
const POWERUPS: PowerUp[] = ['shield', 'magnet', 'spread', 'torpedo'];
export const POWERUP_INFO: Record<PowerUp, { label: string; color: number }> = {
  shield: { label: 'Shield bubble', color: 0x2ef2c8 },
  magnet: { label: 'Plankton magnet', color: 0x6fd2ff },
  spread: { label: 'Triple sonar', color: 0xb48cff },
  torpedo: { label: 'Homing torpedoes', color: 0xffb347 },
};

/**
 * Collectables. Plankton is the most common and is drawn as one instanced
 * mesh; rarer items get small detailed models from per-kind pools.
 */
export class Pickups {
  readonly items: Pickup[] = [];
  private plankton: InstancedMesh;
  private pools = new Map<PickupKind, Object3D[]>();
  private dummy = new Object3D();
  private rnd = new Random(2);
  private timers = { pattern: 2, ammo: 10, repair: 22, power: 16, pearl: 18 };
  private color = new Color();

  constructor(scene: Scene) {
    this.plankton = new InstancedMesh(
      new IcosahedronGeometry(1, 1),
      new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      PLANKTON_MAX,
    );
    this.plankton.instanceMatrix.setUsage(DynamicDrawUsage);
    this.plankton.frustumCulled = false;
    this.plankton.count = 0;
    scene.add(this.plankton);

    for (let i = 0; i < PLANKTON_MAX; i++) this.items.push(this.blank('plankton', i, null));
    const build: [PickupKind, number, () => Object3D][] = [
      ['ammo', 4, () => this.ammoModel()],
      ['repair', 3, () => this.repairModel()],
      ['pearl', 4, () => this.pearlModel()],
      ...POWERUPS.map((p) => [p, 2, () => this.powerModel(p)] as [PickupKind, number, () => Object3D]),
    ];
    for (const [kind, n, make] of build) {
      const list: Object3D[] = [];
      for (let i = 0; i < n; i++) {
        const o = make();
        o.visible = false;
        scene.add(o);
        list.push(o);
        this.items.push(this.blank(kind, i, o));
      }
      this.pools.set(kind, list);
    }
  }

  private blank(kind: PickupKind, index: number, root: Object3D | null): Pickup {
    return { active: false, kind, pos: new Vector2(), vel: new Vector2(), age: 0, phase: 0, revealed: 0, root, index };
  }

  private halo(color: number, r = 9) {
    const m = new Mesh(
      new RingGeometry(r * 0.82, r, 40),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    );
    m.name = 'halo';
    return m;
  }

  private ammoModel() {
    const g = new Group();
    const body = new Mesh(
      new CapsuleGeometry(2.6, 6, 6, 14),
      new MeshStandardMaterial({ color: 0x2a1850, emissive: 0xb48cff, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.4 }),
    );
    body.rotation.z = Math.PI / 2;
    const capMat = new MeshStandardMaterial({ color: 0xc0c6cc, metalness: 0.95, roughness: 0.3 });
    for (const x of [-4.4, 4.4]) {
      const cap = new Mesh(new CylinderGeometry(2.9, 2.9, 1.4, 14), capMat);
      cap.rotation.z = Math.PI / 2;
      cap.position.x = x;
      g.add(cap);
    }
    g.add(body, this.halo(0xb48cff, 10));
    return g;
  }

  private repairModel() {
    const g = new Group();
    const box = new Mesh(new BoxGeometry(8, 7, 7), new MeshStandardMaterial({ color: 0xe8792a, roughness: 0.5, metalness: 0.3 }));
    const crossMat = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 });
    const c1 = new Mesh(new BoxGeometry(1.4, 4.6, 0.4), crossMat);
    const c2 = new Mesh(new BoxGeometry(4.6, 1.4, 0.4), crossMat);
    c1.position.z = c2.position.z = 3.6;
    const strap = new Mesh(new BoxGeometry(8.4, 1, 7.4), new MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }));
    strap.position.y = 2.2;
    g.add(box, c1, c2, strap, this.halo(0xff9a5a, 10));
    return g;
  }

  private pearlModel() {
    const g = new Group();
    const shellMat = new MeshStandardMaterial({ color: 0x8a7e86, roughness: 0.7, side: DoubleSide });
    const lower = new Mesh(new SphereGeometry(5, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shellMat);
    lower.scale.y = 0.45;
    const upper = new Mesh(new SphereGeometry(5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
    upper.scale.y = 0.4;
    upper.rotation.z = 0.7;
    upper.position.set(-2, 1, 0);
    const pearl = new Mesh(
      new SphereGeometry(2, 20, 14),
      new MeshStandardMaterial({ color: 0xfff6ee, emissive: 0xffe6f2, emissiveIntensity: 1.4, roughness: 0.1, metalness: 0.2 }),
    );
    pearl.name = 'pearl';
    pearl.position.y = 1.2;
    g.add(lower, upper, pearl);
    return g;
  }

  private powerModel(kind: PowerUp) {
    const info = POWERUP_INFO[kind];
    const g = new Group();
    const mat = new MeshStandardMaterial({ color: 0x0b1a22, emissive: info.color, emissiveIntensity: 2.2, metalness: 0.5, roughness: 0.3 });
    let core: Mesh;
    switch (kind) {
      case 'shield':
        core = new Mesh(new IcosahedronGeometry(4.5, 1), mat);
        break;
      case 'magnet': {
        const arc = new TorusGeometry(4, 1.4, 10, 20, Math.PI);
        const l = new BoxGeometry(2.8, 3, 2.8);
        l.translate(-4, -1.5, 0);
        const r = new BoxGeometry(2.8, 3, 2.8);
        r.translate(4, -1.5, 0);
        core = new Mesh(merge([arc, l, r]), mat);
        break;
      }
      case 'spread': {
        const parts = [-0.4, 0, 0.4].map((a) => {
          const c = new CapsuleGeometry(0.9, 6, 4, 8);
          c.rotateZ(Math.PI / 2 + a);
          return c;
        });
        core = new Mesh(merge(parts), mat);
        break;
      }
      case 'torpedo': {
        const body = new CapsuleGeometry(1.6, 7, 6, 12);
        body.rotateZ(Math.PI / 2);
        const fin = new BoxGeometry(1.5, 5, 0.4);
        fin.translate(-4, 0, 0);
        core = new Mesh(merge([body, fin]), mat);
        break;
      }
    }
    const shell = new Mesh(
      new SphereGeometry(8, 24, 16),
      new MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    g.add(core, shell, this.halo(info.color, 11));
    g.userData.core = core;
    return g;
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
    it.revealed = 0;
    if (it.root) it.root.visible = true;
    return it;
  }

  /** Lay out plankton in a readable shape so collecting it feels like a line to follow. */
  spawnPattern(x: number, bounds: Vector2) {
    const r = this.rnd;
    const type = r.pick(['sine', 'arc', 'ring', 'line', 'cluster'] as const);
    const cy = r.range(-bounds.y * 0.55, bounds.y * 0.6);
    const n = r.int(8, 14);
    for (let i = 0; i < n; i++) {
      let px = x + i * 16;
      let py = cy;
      switch (type) {
        case 'sine':
          py = cy + Math.sin(i * 0.6) * 34;
          break;
        case 'arc':
          py = cy + Math.sin((i / (n - 1)) * Math.PI) * 50 - 25;
          break;
        case 'ring': {
          const a = (i / n) * Math.PI * 2;
          px = x + 40 + Math.cos(a) * 36;
          py = cy + Math.sin(a) * 36;
          break;
        }
        case 'cluster':
          px = x + r.range(0, 60);
          py = cy + r.range(-30, 30);
          break;
      }
      this.spawn('plankton', px, Math.max(-bounds.y * 0.8, Math.min(bounds.y * 0.8, py)));
    }
  }

  /** Item director. `needs` biases drops toward what the player is short of. */
  direct(dt: number, bounds: Vector2, allowed: boolean, needs: { ammo: number; hull: number; oxygen: number }, pearlChance: number) {
    if (!allowed) return;
    const t = this.timers;
    const x = bounds.x + 40;
    const y = () => this.rnd.range(-bounds.y * 0.6, bounds.y * 0.65);
    t.pattern -= dt * (needs.oxygen < 0.35 ? 1.8 : 1);
    t.ammo -= dt * (needs.ammo < 0.25 ? 2.5 : 1);
    t.repair -= dt * (needs.hull < 0.4 ? 1.8 : 1);
    t.power -= dt;
    t.pearl -= dt;
    if (t.pattern <= 0) {
      this.spawnPattern(x, bounds);
      t.pattern = this.rnd.range(2.2, 3.8);
    }
    if (t.ammo <= 0) {
      this.spawn('ammo', x, y());
      t.ammo = this.rnd.range(9, 14);
    }
    if (t.repair <= 0) {
      this.spawn('repair', x, y());
      t.repair = this.rnd.range(20, 30);
    }
    if (t.power <= 0) {
      this.spawn(this.rnd.pick(POWERUPS), x, y());
      t.power = this.rnd.range(16, 24);
    }
    if (t.pearl <= 0) {
      if (this.rnd.chance(pearlChance)) this.spawn('pearl', x, y());
      t.pearl = this.rnd.range(14, 22);
    }
  }

  reveal(x: number, y: number, radius: number) {
    for (const p of this.items) if (p.active && Math.hypot(p.pos.x - x, p.pos.y - y) < radius) p.revealed = 6;
  }

  update(dt: number, scrollSpeed: number, bounds: Vector2, px: number, py: number, magnetRadius: number, collectRadius: number, onCollect: (p: Pickup) => void) {
    const d = this.dummy;
    let n = 0;
    const time = performance.now() * 0.001;
    for (const p of this.items) {
      if (!p.active) continue;
      p.age += dt;
      p.revealed = Math.max(0, p.revealed - dt);
      p.vel.x = -scrollSpeed;
      p.vel.y = Math.sin(p.age * 2 + p.phase) * 8;
      const dx = px - p.pos.x;
      const dy = py - p.pos.y;
      const dist = Math.hypot(dx, dy);
      if (magnetRadius > 0 && dist < magnetRadius && p.kind !== 'pearl') {
        const pull = 380 * (1 - dist / magnetRadius) + 120;
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
      if (p.kind === 'plankton') {
        d.position.set(p.pos.x, p.pos.y, 0);
        d.rotation.set(time + p.phase, time * 1.3, 0);
        d.scale.setScalar(2 + Math.sin(time * 5 + p.phase) * 0.45);
        d.updateMatrix();
        this.plankton.setMatrixAt(n, d.matrix);
        this.plankton.setColorAt(n, this.color.setRGB(0.25, 1.9, 1.55));
        n++;
      } else if (p.root) {
        const r = p.root;
        r.position.set(p.pos.x, p.pos.y, 0);
        r.rotation.y = time * 1.2 + p.phase;
        r.rotation.z = Math.sin(time + p.phase) * 0.2;
        const halo = r.getObjectByName('halo');
        if (halo) {
          halo.rotation.y = -r.rotation.y;
          halo.scale.setScalar(1 + Math.sin(time * 4 + p.phase) * 0.08);
        }
        if (p.kind === 'pearl') {
          // Pearls hide in the dark: barely visible until a sonar ping reveals them.
          const vis = 0.12 + Math.min(1, p.revealed) * 0.88;
          r.scale.setScalar(0.6 + vis * 0.6);
          const pearl = r.getObjectByName('pearl') as Mesh<SphereGeometry, MeshStandardMaterial> | undefined;
          if (pearl) pearl.material.emissiveIntensity = 0.2 + vis * 2.4;
        }
      }
    }
    this.plankton.count = n;
    this.plankton.instanceMatrix.needsUpdate = true;
    if (this.plankton.instanceColor) this.plankton.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const p of this.items) {
      p.active = false;
      if (p.root) p.root.visible = false;
    }
    this.timers = { pattern: 2, ammo: 10, repair: 22, power: 16, pearl: 18 };
  }
}
