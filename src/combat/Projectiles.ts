import {
  CapsuleGeometry,
  Color,
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
  index: number;
}

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
  private bulletMesh: InstancedMesh;
  private dummy = new Object3D();
  private tmpColor = new Color();

  constructor(scene: Scene) {
    const shotGeo = new CapsuleGeometry(0.9, 7, 4, 8);
    shotGeo.rotateZ(Math.PI / 2);
    this.shotMesh = new InstancedMesh(shotGeo, new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 200);
    this.shotMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(200 * 3), 3);
    this.shotMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shotMesh.frustumCulled = false;
    this.shotMesh.count = 0;

    this.bulletMesh = new InstancedMesh(
      new IcosahedronGeometry(1, 1),
      new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      400,
    );
    this.bulletMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(400 * 3), 3);
    this.bulletMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.bulletMesh.frustumCulled = false;
    this.bulletMesh.count = 0;
    scene.add(this.shotMesh, this.bulletMesh);

    this.shots = new Pool(200, (index) => ({
      active: false,
      kind: 'bolt' as ShotKind,
      pos: new Vector2(),
      prev: new Vector2(),
      vel: new Vector2(),
      damage: 1,
      life: 0,
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

  fire(kind: ShotKind, x: number, y: number, vx: number, vy: number, damage: number) {
    const s = this.shots.acquire();
    if (!s) return null;
    s.kind = kind;
    s.pos.set(x, y);
    s.prev.set(x, y);
    s.vel.set(vx, vy);
    s.damage = damage;
    s.life = kind === 'torpedo' ? 3 : 1.6;
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
      if (s.kind === 'torpedo') {
        const t = homing(s);
        if (t) {
          const desired = t.clone().sub(s.pos).setLength(420);
          s.vel.lerp(desired, 1 - Math.exp(-4 * dt));
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
      d.scale.set(torp ? 1.3 : 1, torp ? 1.6 : 1, torp ? 1.6 : 1);
      d.updateMatrix();
      this.shotMesh.setMatrixAt(n, d.matrix);
      this.shotMesh.setColorAt(n, this.tmpColor.setHex(torp ? 0xffb347 : 0xfff3d6).multiplyScalar(torp ? 3 : 2.4));
      n++;
    }
    this.shotMesh.count = n;
    this.shotMesh.instanceMatrix.needsUpdate = true;
    if (this.shotMesh.instanceColor) this.shotMesh.instanceColor.needsUpdate = true;

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
