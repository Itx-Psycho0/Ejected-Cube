import {
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  Object3D,
  SphereGeometry,
  Vector2,
} from 'three';
import { Boss, type BossContext } from './Boss';
import { eyeMaterial, fleshMaterial, glowMaterial } from './materials';

interface Arm {
  baseAngle: number;
  segs: number;
  len: number;
  phase: number;
  /** 0 = idle curl, 1 = reaching for `target`. */
  reach: number;
  reachTarget: number;
  target: Vector2;
  pts: Vector2[];
}

const ARM_SEGS = 16;
const CLUB_SEGS = 22;

/** Zone 4 boss: a giant squid with eight arms, two clubbed tentacles and ink. */
export class Kraken extends Boss {
  readonly name = 'Kraken';
  private arms: Arm[] = [];
  private armMesh: InstancedMesh;
  private suckerMesh: InstancedMesh;
  private eyes: Group[] = [];
  private skin = fleshMaterial(0x9a3438, { wet: true, emissive: 0x300810, emissiveIntensity: 0.4 });
  private dummy = new Object3D();
  private slamArm = -1;
  readonly extras: Object3D[] = [];

  constructor(difficulty: number) {
    super(160, difficulty);
    this.registerGlow(this.skin as unknown as import('three').MeshStandardMaterial);

    // Mantle: long torpedo body pointing right, head at the origin.
    const prof: Vector2[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      prof.push(new Vector2(Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) * 22 * (1 - t * 0.75) + 1, t * 110));
    }
    const mantleGeo = new LatheGeometry(prof, 24);
    mantleGeo.rotateZ(-Math.PI / 2);
    const mantle = new Mesh(mantleGeo, this.skin);
    mantle.position.x = 8;
    this.root.add(mantle);
    const head = new Mesh(new SphereGeometry(20, 24, 16), this.skin);
    head.scale.set(1.1, 0.95, 0.95);
    this.root.add(head);
    for (const z of [-1, 1]) {
      const fin = new Mesh(new ConeGeometry(18, 34, 3), this.skin);
      fin.scale.set(1, 1, 0.12);
      fin.rotation.z = z > 0 ? -2.3 : -0.84;
      fin.position.set(108, z * 10, 0);
      this.root.add(fin);
    }

    // Eyes: sclera, slit pupil, glossy cornea.
    for (const z of [-1, 1]) {
      const eye = new Group();
      const sclera = new Mesh(new SphereGeometry(7, 20, 14), fleshMaterial(0xe8d48a, { emissive: 0x6a5a10, emissiveIntensity: 0.6 }));
      const pupil = new Mesh(new SphereGeometry(3.6, 14, 10), eyeMaterial());
      pupil.scale.set(0.5, 0.28, 1);
      pupil.position.z = 5.6;
      eye.add(sclera, pupil);
      eye.position.set(-4, 6, z * 17);
      eye.rotation.y = z > 0 ? 0 : Math.PI;
      this.eyes.push(eye);
      this.root.add(eye);
    }

    // Arms are drawn as instanced tapered spheres in world space.
    for (let i = 0; i < 10; i++) {
      const club = i >= 8;
      const segs = club ? CLUB_SEGS : ARM_SEGS;
      this.arms.push({
        baseAngle: Math.PI + (i - 4.5) * 0.24,
        segs,
        len: club ? 9 : 7.5,
        phase: i * 0.9,
        reach: 0,
        reachTarget: 0,
        target: new Vector2(),
        pts: Array.from({ length: segs }, () => new Vector2()),
      });
    }
    const total = this.arms.reduce((n, a) => n + a.segs, 0);
    this.armMesh = new InstancedMesh(new SphereGeometry(1, 12, 8), this.skin, total);
    this.armMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(total * 3), 3);
    this.suckerMesh = new InstancedMesh(new SphereGeometry(0.6, 6, 4), fleshMaterial(0xf0c8b0), total);
    for (const m of [this.armMesh, this.suckerMesh]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = true;
    }
    this.extras.push(this.armMesh, this.suckerMesh);
    this.root.add(new Mesh(new SphereGeometry(5, 10, 8), glowMaterial(0xff4060, 0.6)));
    this.attacks = [this.slam, this.ink, this.grab];
    this.finalizeModel();
  }

  override enter(bounds: Vector2) {
    super.enter(bounds);
    this.home.set(bounds.x * 0.72, bounds.y * 0.1);
  }

  private *slam(ctx: BossContext): Generator<number, void, unknown> {
    const y = ctx.player.pos.y;
    const arm = Math.floor(Math.random() * 8);
    ctx.telegraph.show(-ctx.bounds.x * 0.1, y, ctx.bounds.x * 2, 26, 1);
    ctx.sfx('charge');
    yield 1;
    this.slamArm = arm;
    const a = this.arms[arm];
    a.target.set(-ctx.bounds.x * 1.2, y);
    a.reachTarget = 1;
    ctx.shake(0.45);
    ctx.sfx('slam');
    yield 0.75;
    a.reachTarget = 0;
    this.slamArm = -1;
    if (this.phase2) {
      yield 0.3;
      yield* this.slam(ctx);
    }
    yield 0.6;
  }

  private *ink(ctx: BossContext) {
    this.v3.set(this.pos.x - 10, this.pos.y, 0);
    ctx.particles.burst(this.v3, { count: 90, color: 0x0a0612, speed: 140, size: 60, life: 4, drag: 1.4, smoke: true, spread: 10 });
    ctx.darken(0.25, 3);
    ctx.sfx('roar');
    yield 0.4;
    for (let i = 0; i < (this.phase2 ? 8 : 5); i++) {
      const d = this.aim(ctx, this.pos.x, this.pos.y);
      ctx.projectiles.spawnBullet('ink', this.pos.x - 20, this.pos.y, d.x * 90 + (Math.random() - 0.5) * 40, d.y * 90 + (Math.random() - 0.5) * 40, { radius: 7, damage: 12, life: 7 });
      yield 0.25;
    }
    yield 1;
  }

  private *grab(ctx: BossContext) {
    const p = ctx.player.pos;
    ctx.telegraph.show(p.x, p.y, 70, 70, 0.9, Math.PI / 4);
    ctx.sfx('charge');
    const tx = p.x;
    const ty = p.y;
    yield 0.9;
    for (const i of [8, 9]) {
      this.arms[i].target.set(tx, ty + (i === 8 ? 8 : -8));
      this.arms[i].reachTarget = 1;
    }
    ctx.sfx('slam');
    yield 0.9;
    for (const i of [8, 9]) this.arms[i].reachTarget = 0;
    yield 0.7;
  }

  protected animate(dt: number, ctx: BossContext) {
    if (this.state === 'fight') this.pos.y = this.home.y + Math.sin(this.t * 0.5) * 22;
    this.root.rotation.z = Math.sin(this.t * 0.7) * 0.05;
    for (const e of this.eyes) e.rotation.x = Math.sin(this.t * 0.4) * 0.1;
    const d = this.dummy;
    const c = new Color();
    let idx = 0;
    const ox = this.pos.x - 14;
    const oy = this.pos.y - 4;
    const dir = new Vector2();
    for (const a of this.arms) {
      a.reach += (a.reachTarget - a.reach) * Math.min(1, dt * (a.reachTarget > a.reach ? 9 : 3));
      let x = ox + Math.cos(a.baseAngle) * 10;
      let y = oy + Math.sin(a.baseAngle) * 14;
      let ang = a.baseAngle;
      const reachLen = a.reach > 0.01 ? Math.hypot(a.target.x - x, a.target.y - y) : 0;
      const seg = a.reach > 0.01 ? Math.max(a.len, (reachLen / a.segs) * a.reach + a.len * (1 - a.reach)) : a.len;
      for (let s = 0; s < a.segs; s++) {
        const f = s / a.segs;
        const curl = Math.sin(this.t * 1.6 + a.phase + s * 0.45) * 0.32 + Math.sin(this.t * 0.7 + a.phase) * 0.2;
        ang += curl * 0.35 * (1 - a.reach);
        if (a.reach > 0.01) {
          dir.set(a.target.x - x, a.target.y - y);
          const want = Math.atan2(dir.y, dir.x);
          let diff = want - ang;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          ang += diff * a.reach * 0.6;
        }
        x += Math.cos(ang) * seg;
        y += Math.sin(ang) * seg;
        if (ctx.floorAt && y < ctx.floorAt(x) + 3) y = ctx.floorAt(x) + 3;
        a.pts[s].set(x, y);
        const isClub = a.segs === CLUB_SEGS && s > a.segs - 5;
        const r = (isClub ? 4.2 : 5.2 * (1 - f * 0.8) + 0.7) * (this.state === 'dead' ? 0 : 1);
        d.position.set(x, y, Math.sin(a.phase) * 10);
        d.rotation.set(0, 0, ang);
        d.scale.set(r * 1.35, r, r);
        d.updateMatrix();
        this.armMesh.setMatrixAt(idx, d.matrix);
        this.armMesh.setColorAt(idx, c.setHex(0xffffff).multiplyScalar(1 - f * 0.25 + this.flash * 0.6));
        d.position.y -= r * 0.75;
        d.scale.setScalar(r * 0.55);
        d.updateMatrix();
        this.suckerMesh.setMatrixAt(idx, d.matrix);
        idx++;
      }
    }
    this.armMesh.instanceMatrix.needsUpdate = true;
    this.suckerMesh.instanceMatrix.needsUpdate = true;
    if (this.armMesh.instanceColor) this.armMesh.instanceColor.needsUpdate = true;
  }

  protected updateHitboxes() {
    this.hitboxes = [
      { x: this.pos.x, y: this.pos.y, r: 24, mult: 1, harmful: true },
      { x: this.pos.x + 50, y: this.pos.y, r: 18, mult: 0.8, harmful: true },
      { x: this.pos.x - 4, y: this.pos.y + 6, r: 9, mult: 1.8, harmful: false },
    ];
    for (let i = 0; i < this.arms.length; i++) {
      const a = this.arms[i];
      const active = a.reach > 0.4 || i === this.slamArm;
      for (let s = 3; s < a.segs; s += 3) {
        const p = a.pts[s];
        this.hitboxes.push({ x: p.x, y: p.y, r: active ? 7 : 5, mult: 0.3, harmful: active || s > a.segs - 6 });
      }
    }
  }
}

