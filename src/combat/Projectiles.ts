import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Scene,
  Vector2,
} from 'three';
import { Pool } from '../core/Pool';

export type ShotKind = 'bolt' | 'torpedo';
export type BulletKind = 'orb' | 'spike' | 'lava' | 'tooth' | 'ink';

export interface Shot {
  active: boolean;
  kind: ShotKind;
  pos: Vector2;
  /** Position at the start of the frame, for swept collision tests. */
  prev: Vector2;
  vel: Vector2;
  damage: number;
  life: number;
  /** Seconds since fired: the beam grows out of the muzzle. */
  age: number;
  /** 0..1 beam strength: thins and dims as the laser charge runs low. */
  power: number;
  index: number;
}

/** Visual length of a laser bolt; at the fire rate the stream reads as one beam. */
const BOLT_LEN = 58;

/** Squared distance from point (px, py) to segment a-b. */
export function segDist2(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t - px;
  const cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}

export interface Bullet {
  active: boolean;
  kind: BulletKind;
  pos: Vector2;
  vel: Vector2;
  radius: number;
  damage: number;
  life: number;
  gravity: number;
  color: Color;
  /** Set once a near miss has been counted. */
  grazed: boolean;
  index: number;
}

const BULLET_COLORS: Record<BulletKind, number> = {
  orb: 0xff4d6d,
  spike: 0xffd166,
  lava: 0xff7a1a,
  tooth: 0xf3f0e6,
  ink: 0x6a1a8a,
};

/**
 * Pooled projectiles rendered as two instanced meshes (player shots and
 * hostile bullets). Zero allocations while playing.
 */
export class Projectiles {
  readonly shots: Pool<Shot>;
  readonly bullets: Pool<Bullet>;
  private shotMesh: InstancedMesh;
  private glowMesh: InstancedMesh;
  private bulletMesh: InstancedMesh;
  private dummy = new Object3D();
  /** Laser colours, set from the world's accent. */
  laserCore = 0xfff3d6;
  laserGlow = 0xff9a4a;
  private tmpColor = new Color();

  constructor(scene: Scene) {
    // Unit-length beam along +x with its head at the origin; scaled per shot.
    const beam = (r: number, sides: number) => {
      const g = new CylinderGeometry(r, r * 0.35, 1, sides, 1, true);
      g.rotateZ(Math.PI / 2);
      g.translate(-0.5, 0, 0);
      return g;
    };
    const mesh = (geo: CylinderGeometry, mat: MeshBasicMaterial) => {
      const m = new InstancedMesh(geo, mat, 200);
      m.instanceColor = new InstancedBufferAttribute(new Float32Array(200 * 3), 3);
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      return m;
    };
    this.shotMesh = mesh(beam(0.75, 6), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.glowMesh = mesh(
      beam(2.6, 8),
      new MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false }),
    );

    this.bulletMesh = new InstancedMesh(
      new IcosahedronGeometry(1, 1),
      new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      400,
    );
    this.bulletMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(400 * 3), 3);
    this.bulletMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.bulletMesh.frustumCulled = false;
    this.bulletMesh.count = 0;
    scene.add(this.glowMesh, this.shotMesh, this.bulletMesh);

    this.shots = new Pool(200, (index) => ({
      active: false,
      kind: 'bolt' as ShotKind,
      pos: new Vector2(),
      prev: new Vector2(),
      vel: new Vector2(),
      damage: 1,
      life: 0,
      age: 0,
      power: 1,
      index,
    }));
    this.bullets = new Pool(400, (index) => ({
      active: false,
      kind: 'orb' as BulletKind,
      pos: new Vector2(),
      vel: new Vector2(),
      radius: 3,
      damage: 10,
      life: 0,
      gravity: 0,
      color: new Color(),
      grazed: false,
      index,
    }));
  }

  fire(kind: ShotKind, x: number, y: number, vx: number, vy: number, damage: number, power = 1) {
    const s = this.shots.acquire();
    if (!s) return null;
    s.kind = kind;
    s.pos.set(x, y);
    s.prev.set(x, y);
    s.vel.set(vx, vy);
    s.damage = damage;
    s.life = kind === 'torpedo' ? 3 : 1.6;
    s.age = 0;
    s.power = power;
    return s;
  }

  spawnBullet(kind: BulletKind, x: number, y: number, vx: number, vy: number, opts: { radius?: number; damage?: number; gravity?: number; life?: number } = {}) {
    const b = this.bullets.acquire();
    if (!b) return null;
    b.kind = kind;
    b.pos.set(x, y);
    b.vel.set(vx, vy);
    b.radius = opts.radius ?? 3.2;
    b.damage = opts.damage ?? 12;
    b.gravity = opts.gravity ?? 0;
    b.life = opts.life ?? 6;
    b.color.setHex(BULLET_COLORS[kind]);
    b.grazed = false;
    return b;
  }

  /** Fire a ring of bullets. */
  radial(kind: BulletKind, x: number, y: number, count: number, speed: number, offset = 0, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      this.spawnBullet(kind, x, y, Math.cos(a) * speed, Math.sin(a) * speed, opts);
    }
  }

  /** Fire `count` bullets fanned around a direction. */
  fan(kind: BulletKind, x: number, y: number, dirX: number, dirY: number, count: number, spread: number, speed: number, opts = {}) {
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < count; i++) {
      const a = base + (count === 1 ? 0 : (i / (count - 1) - 0.5) * spread);
      this.spawnBullet(kind, x, y, Math.cos(a) * speed, Math.sin(a) * speed, opts);
    }
  }

  update(dt: number, bounds: Vector2, homing: (s: Shot) => Vector2 | null) {
    const d = this.dummy;
    let n = 0;
    for (const s of this.shots.items) {
      if (!s.active) continue;
      s.life -= dt;
      s.age += dt;
      if (s.kind === 'torpedo') {
        const t = homing(s);
        if (t) {
          const sp = s.vel.length();
          const ang = Math.atan2(t.y - s.pos.y, t.x - s.pos.x);
          const k = 1 - Math.exp(-4 * dt);
          s.vel.x += (Math.cos(ang) * 420 - s.vel.x) * k;
          s.vel.y += (Math.sin(ang) * 420 - s.vel.y) * k;
          if (sp < 1) s.vel.set(420, 0);
        }
      }
      s.prev.copy(s.pos);
      s.pos.addScaledVector(s.vel, dt);
      if (s.life <= 0 || s.pos.x > bounds.x + 40 || s.pos.x < -bounds.x - 40 || Math.abs(s.pos.y) > bounds.y + 40) {
        s.active = false;
        continue;
      }
      d.position.set(s.pos.x, s.pos.y, 0);
      d.rotation.set(0, 0, Math.atan2(s.vel.y, s.vel.x));
      const torp = s.kind === 'torpedo';
      // The beam grows out of the muzzle, so it never pokes out behind the craft.
      const len = torp ? 14 : Math.min(BOLT_LEN * (0.55 + s.power * 0.45), 6 + s.age * s.vel.length());
      const thick = torp ? 2 : 0.4 + s.power * 0.6;
      d.scale.set(len, thick, thick);
      d.updateMatrix();
      this.shotMesh.setMatrixAt(n, d.matrix);
      this.glowMesh.setMatrixAt(n, d.matrix);
      this.shotMesh.setColorAt(n, this.tmpColor.setHex(torp ? 0xffb347 : this.laserCore).multiplyScalar(torp ? 3 : 0.8 + 1.8 * s.power));
      this.glowMesh.setColorAt(n, this.tmpColor.setHex(torp ? 0xff8a2a : this.laserGlow).multiplyScalar(torp ? 1 : 0.25 + 0.75 * s.power));
      n++;
    }
    for (const m of [this.shotMesh, this.glowMesh]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    n = 0;
    const t = performance.now() * 0.001;
    for (const b of this.bullets.items) {
      if (!b.active) continue;
      b.life -= dt;
      b.vel.y += b.gravity * dt;
      b.pos.addScaledVector(b.vel, dt);
      if (b.life <= 0 || b.pos.x < -bounds.x - 60 || b.pos.x > bounds.x + 120 || Math.abs(b.pos.y) > bounds.y + 80) {
        b.active = false;
        continue;
      }
      d.position.set(b.pos.x, b.pos.y, 0);
      const pulse = 1 + Math.sin(t * 12 + b.index) * 0.12;
      if (b.kind === 'spike' || b.kind === 'tooth') {
        d.rotation.set(0, 0, Math.atan2(b.vel.y, b.vel.x));
        d.scale.set(b.radius * 1.8, b.radius * 0.55, b.radius * 0.55);
      } else {
        d.rotation.set(t * 2, t * 3, 0);
        d.scale.setScalar(b.radius * pulse);
      }
      d.updateMatrix();
      this.bulletMesh.setMatrixAt(n, d.matrix);
      this.bulletMesh.setColorAt(n, this.tmpColor.copy(b.color).multiplyScalar(b.kind === 'ink' ? 1.6 : 2.4));
      n++;
    }
    this.bulletMesh.count = n;
    this.bulletMesh.instanceMatrix.needsUpdate = true;
    if (this.bulletMesh.instanceColor) this.bulletMesh.instanceColor.needsUpdate = true;
  }

  clearBullets() {
    for (const b of this.bullets.items) b.active = false;
  }
  clearAll() {
    this.clearBullets();
    for (const s of this.shots.items) s.active = false;
  }
}
