import { DynamicDrawUsage, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, SphereGeometry, Vector2 } from 'three';
import { Boss, type BossContext } from './Boss';
import { lumpySphere } from '../../world/geometry';
import { INK } from '../../fx/InkFx';
import { glowMaterial } from './materials';

const ARMS = 6;
const SEGS = 14;

/**
 * The final boss: the Blot itself. A heaving mass of ink with one eye and
 * six tendrils. It fights with the powers it lent its creatures: the
 * Thunderhead's marked strikes, the Core's spiral, the walls with one gap,
 * the Lantern's lunge and the Kraken's slams, and it splits off ink spawn.
 */
export class BlotBoss extends Boss {
  readonly name = 'The Blot';
  private blobs: Mesh[] = [];
  private eye = new Group();
  private iris = new Group();
  private irisMat: MeshStandardMaterial;
  private arms: InstancedMesh;
  private armPts: Vector2[][] = [];
  private reach: number[] = new Array(ARMS).fill(0);
  private reachTarget: number[] = new Array(ARMS).fill(0);
  private reachTo: Vector2[] = Array.from({ length: ARMS }, () => new Vector2());
  private dummy = new Object3D();
  private charging = false;
  private spin = 0;
  readonly extras: Object3D[] = [];
  onPhase2Taunt: (() => void) | null = null;

  constructor(difficulty: number) {
    super(280, difficulty);
    this.irisMat = glowMaterial(0xe0302a, 2.2);
    this.registerGlow(this.irisMat);
    const core = new Mesh(lumpySphere(1, 3, 0.2, 1.3, 2), INK);
    core.scale.set(34, 30, 26);
    this.root.add(core);
    this.blobs.push(core);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = new Mesh(lumpySphere(1, 2, 0.3, 1.6, i * 3), INK);
      b.position.set(Math.cos(a) * 28, Math.sin(a) * 24, (i % 2) * 8);
      b.scale.setScalar(12 + (i % 3) * 4);
      b.userData = { a, base: b.scale.x };
      this.root.add(b);
      this.blobs.push(b);
    }
    const sclera = new Mesh(new SphereGeometry(1, 28, 16), new MeshStandardMaterial({ color: 0xf2ecdf, roughness: 0.3, emissive: 0x302820, emissiveIntensity: 0.5 }));
    sclera.scale.set(18, 11, 6);
    const iris = new Mesh(new SphereGeometry(6.4, 20, 14), this.irisMat);
    iris.scale.z = 0.5;
    const pupil = new Mesh(new SphereGeometry(3, 14, 10), new MeshStandardMaterial({ color: 0x000000, roughness: 0.05 }));
    pupil.scale.set(0.55, 1.1, 0.4);
    pupil.position.z = 2.4;
    this.iris.add(iris, pupil);
    this.iris.position.z = 4.6;
    this.eye.add(sclera, this.iris);
    this.eye.position.set(-14, 6, 24);
    this.root.add(this.eye);

    this.arms = new InstancedMesh(new SphereGeometry(1, 10, 8), INK, ARMS * SEGS);
    this.arms.instanceMatrix.setUsage(DynamicDrawUsage);
    this.arms.frustumCulled = false;
    this.extras.push(this.arms);
    for (let i = 0; i < ARMS; i++) this.armPts.push(Array.from({ length: SEGS }, () => new Vector2()));
    this.attacks = [this.inkStrike, this.spiral, this.wall, this.lunge, this.slam, this.spawn];
    this.idleBetween = 0.9;
    this.finalizeModel();
  }

  override enter(bounds: Vector2) {
    super.enter(bounds);
    this.home.set(bounds.x * 0.55, 0);
  }

  protected override onPhase2() {
    this.irisMat.emissive.setHex(0xff2a6a);
    this.onPhase2Taunt?.();
  }

  /** Borrowed from the Thunderhead: marked columns, then ink falls down them. */
  private *inkStrike(ctx: BossContext) {
    const lanes = this.phase2 ? 4 : 3;
    const xs = [ctx.player.pos.x];
    for (let i = 1; i < lanes; i++) xs.push(-ctx.bounds.x * 0.8 + Math.random() * ctx.bounds.x * 1.2);
    for (const x of xs) ctx.telegraph.show(x, 0, ctx.bounds.y * 2.2, 26, 0.9, Math.PI / 2);
    ctx.sfx('charge');
    yield 0.9;
    for (const x of xs) for (let k = 0; k < 8; k++) ctx.projectiles.spawnBullet('ink', x + (Math.random() - 0.5) * 6, ctx.bounds.y + 20 + k * 24, 0, -560, { radius: 4.2, damage: 13, life: 2 });
    ctx.shake(0.4);
    ctx.sfx('slam');
    yield 1;
  }

  /** Borrowed from the Sentinel Core. */
  private *spiral(ctx: BossContext) {
    const shots = this.phase2 ? 30 : 22;
    const arms = this.phase2 ? 3 : 2;
    for (let i = 0; i < shots; i++) {
      for (let k = 0; k < arms; k++) {
        const a = this.spin + (k / arms) * Math.PI * 2;
        ctx.projectiles.spawnBullet('ink', this.pos.x, this.pos.y, Math.cos(a) * 140, Math.sin(a) * 140, { radius: 4, damage: 10, life: 5 });
      }
      this.spin += 0.26;
      if (i % 3 === 0) ctx.sfx('shoot');
      yield 0.1;
    }
    yield 0.7;
  }

  /** Borrowed from the Leviathan and the Dreadnought. */
  private *wall(ctx: BossContext) {
    for (let w = 0; w < (this.phase2 ? 3 : 2); w++) {
      const gap = (Math.random() - 0.5) * ctx.bounds.y * 1.2;
      ctx.telegraph.show(ctx.bounds.x - 14, gap, 24, 80, 0.7);
      yield 0.7;
      for (let y = -ctx.bounds.y; y <= ctx.bounds.y; y += 16) {
        if (Math.abs(y - gap) < 40) continue;
        ctx.projectiles.spawnBullet('ink', ctx.bounds.x + 20, y, -220, 0, { radius: 4, damage: 11, life: 5 });
      }
      ctx.sfx('shoot');
      yield 1.1;
    }
    yield 0.3;
  }

  /** Borrowed from the Lantern and the Airship. */
  private *lunge(ctx: BossContext) {
    const y = ctx.player.pos.y;
    ctx.telegraph.show(0, y, ctx.bounds.x * 2.2, 80, 1.1);
    ctx.sfx('charge');
    while (Math.abs(this.pos.y - y) > 3) {
      this.pos.y += (y - this.pos.y) * Math.min(1, this.dt * 7);
      yield 0;
    }
    yield 0.6;
    this.charging = true;
    ctx.sfx('roar');
    while (this.pos.x > -ctx.bounds.x - 180) {
      this.pos.x -= (this.phase2 ? 760 : 620) * this.dt;
      ctx.shake(0.05);
      yield 0;
    }
    this.charging = false;
    this.pos.set(ctx.bounds.x + 180, this.home.y);
    while (this.pos.x > this.home.x + 2) {
      this.pos.x += (this.home.x - this.pos.x) * Math.min(1, this.dt * 2.6);
      yield 0;
    }
    yield 0.3;
  }

  /** Borrowed from the Kraken. */
  private *slam(ctx: BossContext) {
    const y = ctx.player.pos.y;
    const arm = Math.floor(Math.random() * ARMS);
    ctx.telegraph.show(-ctx.bounds.x * 0.1, y, ctx.bounds.x * 2, 26, 0.9);
    ctx.sfx('charge');
    yield 0.9;
    this.reachTo[arm].set(-ctx.bounds.x * 1.2, y);
    this.reachTarget[arm] = 1;
    ctx.shake(0.45);
    ctx.sfx('slam');
    yield 0.7;
    this.reachTarget[arm] = 0;
    yield 0.5;
  }

  /** The Blot buds off ink-stained spawn. */
  private *spawn(ctx: BossContext) {
    ctx.sfx('roar');
    const n = this.phase2 ? 4 : 3;
    for (let i = 0; i < n; i++) ctx.spawnEnemy(i % 2 ? 'jelly' : 'lanternfish', this.pos.x - 10, this.pos.y + (i - (n - 1) / 2) * 30);
    yield 1.8;
  }

  protected animate(dt: number, ctx: BossContext) {
    if (this.state === 'fight' && !this.charging) {
      this.pos.y = this.home.y + Math.sin(this.t * 0.55) * ctx.bounds.y * 0.35;
    }
    // Heaving ink.
    for (const b of this.blobs) {
      if (!b.userData.base) continue;
      const a = b.userData.a + this.t * 0.6;
      b.position.x = Math.cos(a) * (28 + Math.sin(this.t * 2 + a) * 4);
      b.position.y = Math.sin(a) * (24 + Math.cos(this.t * 1.7 + a) * 4);
      b.scale.setScalar(b.userData.base * (1 + Math.sin(this.t * 3 + a * 2) * 0.12) * (this.phase2 ? 1.15 : 1));
    }
    this.blobs[0].scale.set(34 + Math.sin(this.t * 2) * 2, 30 + Math.cos(this.t * 2.3) * 2, 26);
    // The eye watches the player.
    const p = ctx.player.pos;
    this.iris.position.x += (Math.max(-9, Math.min(9, (p.x - this.pos.x) * 0.05)) - this.iris.position.x) * Math.min(1, dt * 5);
    this.iris.position.y += (Math.max(-5, Math.min(5, (p.y - this.pos.y) * 0.05)) - this.iris.position.y) * Math.min(1, dt * 5);
    // Tendrils.
    const d = this.dummy;
    let idx = 0;
    for (let i = 0; i < ARMS; i++) {
      this.reach[i] += (this.reachTarget[i] - this.reach[i]) * Math.min(1, dt * (this.reachTarget[i] > this.reach[i] ? 9 : 3));
      let x = this.pos.x;
      let y = this.pos.y;
      let ang = Math.PI + (i - (ARMS - 1) / 2) * 0.42;
      const r = this.reach[i];
      const seg = r > 0.01 ? Math.max(7, (Math.hypot(this.reachTo[i].x - x, this.reachTo[i].y - y) / SEGS) * r + 7 * (1 - r)) : 7;
      for (let s = 0; s < SEGS; s++) {
        ang += Math.sin(this.t * 1.8 + i + s * 0.5) * 0.12 * (1 - r);
        if (r > 0.01) {
          const want = Math.atan2(this.reachTo[i].y - y, this.reachTo[i].x - x);
          ang += Math.atan2(Math.sin(want - ang), Math.cos(want - ang)) * r * 0.6;
        }
        x += Math.cos(ang) * seg;
        y += Math.sin(ang) * seg;
        this.armPts[i][s].set(x, y);
        const rad = (6 * (1 - s / SEGS) + 1.2) * (this.state === 'dead' ? 0 : 1);
        d.position.set(x, y, -4);
        d.scale.set(rad * 1.3, rad, rad);
        d.rotation.set(0, 0, ang);
        d.updateMatrix();
        this.arms.setMatrixAt(idx++, d.matrix);
      }
    }
    this.arms.instanceMatrix.needsUpdate = true;
    this.root.rotation.z = Math.sin(this.t * 0.7) * 0.06;
  }

  protected updateHitboxes() {
    this.hitboxes = [
      { x: this.pos.x, y: this.pos.y, r: 30, mult: 1, harmful: true },
      { x: this.pos.x - 14, y: this.pos.y + 6, r: 9, mult: 2, harmful: false },
    ];
    for (let i = 0; i < ARMS; i++) {
      const active = this.reach[i] > 0.4;
      for (let s = 4; s < SEGS; s += 3) {
        const pt = this.armPts[i][s];
        this.hitboxes.push({ x: pt.x, y: pt.y, r: active ? 6 : 4, mult: 0.3, harmful: active });
      }
    }
  }
}
