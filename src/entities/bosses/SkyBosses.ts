import { BoxGeometry, ConeGeometry, CylinderGeometry, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import { Boss, type BossContext } from './Boss';
import { limb, lumpySphere, merge } from '../../world/geometry';
import { glowMaterial } from './materials';

/** Sky boss: a thunderhead that throws lightning down marked lanes. */
export class Storm extends Boss {
  readonly name = 'Thunderhead';
  private eyes: MeshStandardMaterial;
  private cloudMat: MeshStandardMaterial;

  constructor(difficulty: number) {
    super(120, difficulty);
    this.cloudMat = new MeshStandardMaterial({ color: 0x565c6c, roughness: 1, emissive: 0x8fa8ff, emissiveIntensity: 0.05 });
    this.eyes = glowMaterial(0xfff2a0, 4);
    this.registerGlow(this.cloudMat);
    const puffs: [number, number, number, number][] = [
      [0, 0, 0, 26],
      [-26, -4, 4, 20],
      [26, -2, -4, 22],
      [-10, 16, 0, 18],
      [14, 18, 2, 17],
      [44, -8, 0, 14],
      [-44, -8, 0, 13],
      [0, -14, 6, 20],
    ];
    const cloud = new Mesh(merge(puffs.map(([x, y, z, r], i) => lumpySphere(r, 2, 0.12, 0.3, i).translate(x, y, z))), this.cloudMat);
    this.root.add(cloud);
    for (const x of [-12, 8]) {
      const eye = new Mesh(new SphereGeometry(3.4, 12, 10), this.eyes);
      eye.scale.set(1.3, 0.55, 1);
      eye.position.set(x - 8, 2, 24);
      eye.rotation.z = x < 0 ? -0.35 : 0.35;
      this.root.add(eye);
    }
    const bolt = new Mesh(
      merge([limb(new Vector3(-6, -24, 10), new Vector3(-14, -40, 10), 2.4, 2, 4), limb(new Vector3(-14, -40, 10), new Vector3(-4, -42, 10), 2, 1.6, 4), limb(new Vector3(-4, -42, 10), new Vector3(-12, -62, 10), 1.6, 0.1, 4)]),
      this.eyes,
    );
    this.root.add(bolt);
    this.attacks = [this.lightning, this.hail, this.gust];
    this.finalizeModel();
  }

  override enter(bounds: Vector2) {
    super.enter(bounds);
    this.home.set(bounds.x * 0.55, bounds.y * 0.42);
  }

  /** Marked columns, then bolts strike straight down them. */
  private *lightning(ctx: BossContext) {
    const lanes = this.phase2 ? 4 : 3;
    const xs: number[] = [ctx.player.pos.x];
    for (let i = 1; i < lanes; i++) xs.push(-ctx.bounds.x * 0.8 + Math.random() * ctx.bounds.x * 1.2);
    for (const x of xs) ctx.telegraph.show(x, 0, ctx.bounds.y * 2.2, 26, 1, Math.PI / 2);
    ctx.sfx('charge');
    this.eyes.emissiveIntensity = 12;
    yield 1;
    for (const x of xs) for (let k = 0; k < 9; k++) ctx.projectiles.spawnBullet('spike', x + (Math.random() - 0.5) * 6, ctx.bounds.y + 20 + k * 22, 0, -640, { radius: 3, damage: 13, life: 2 });
    ctx.shake(0.5);
    ctx.sfx('slam');
    yield 1.1;
  }

  private *hail(ctx: BossContext) {
    const n = this.phase2 ? 14 : 9;
    for (let i = 0; i < n; i++) {
      const sx = this.pos.x - 40 + Math.random() * 60;
      ctx.projectiles.spawnBullet('orb', sx, this.pos.y - 20, -60 - Math.random() * 150, 40 + Math.random() * 40, { gravity: -150, radius: 3.4, damage: 10, life: 5 });
      ctx.sfx('shoot');
      yield 0.16;
    }
    yield 0.7;
  }

  /** A wall of wind-blown debris with one gap. */
  private *gust(ctx: BossContext) {
    const gap = (Math.random() - 0.5) * ctx.bounds.y * 1.1;
    ctx.telegraph.show(ctx.bounds.x - 14, gap, 24, 76, 0.7);
    yield 0.7;
    for (let y = -ctx.bounds.y; y <= ctx.bounds.y; y += 16) {
      if (Math.abs(y - gap) < 38) continue;
      ctx.projectiles.spawnBullet('orb', ctx.bounds.x + 20, y, -210, 0, { radius: 3.4, damage: 11, life: 5 });
    }
    ctx.sfx('shoot');
    yield 1.4;
  }

  protected animate(dt: number, ctx: BossContext) {
    if (this.state === 'fight') {
      this.pos.x = this.home.x + Math.sin(this.t * 0.4) * ctx.bounds.x * 0.18;
      this.pos.y = this.home.y + Math.sin(this.t * 0.9) * 8;
    }
    this.eyes.emissiveIntensity += (4 - this.eyes.emissiveIntensity) * Math.min(1, dt * 3);
    this.cloudMat.emissiveIntensity = Math.max(this.cloudMat.emissiveIntensity, Math.random() < dt * 0.8 ? 1.2 : 0.05);
    this.root.rotation.z = Math.sin(this.t * 0.5) * 0.03;
  }

  protected updateHitboxes() {
    this.hitboxes = [
      { x: this.pos.x, y: this.pos.y, r: 30, mult: 1, harmful: true },
      { x: this.pos.x - 30, y: this.pos.y - 4, r: 18, mult: 1, harmful: true },
      { x: this.pos.x + 30, y: this.pos.y - 2, r: 18, mult: 1, harmful: false },
    ];
  }
}

/** Sky boss: an armed airship that shoots, bombs and rams. */
export class Zeppelin extends Boss {
  readonly name = 'Ironclad Airship';
  private props: Mesh[] = [];
  private charging = false;

  constructor(difficulty: number) {
    super(150, difficulty);
    const skin = new MeshStandardMaterial({ color: 0x8a5a44, roughness: 0.6, metalness: 0.1, emissive: 0x401808, emissiveIntensity: 0.2 });
    const dark = new MeshStandardMaterial({ color: 0x2f3338, roughness: 0.5, metalness: 0.6 });
    const brass = new MeshStandardMaterial({ color: 0xb8893a, roughness: 0.35, metalness: 0.8 });
    this.registerGlow(skin);
    const env = new Mesh(new SphereGeometry(22, 28, 18), skin);
    env.scale.set(2.6, 1, 1);
    this.root.add(env);
    for (let i = -2; i <= 2; i++) {
      const rib = new Mesh(new TorusGeometry(22 * Math.sqrt(1 - (i * 0.36) ** 2), 0.7, 6, 28), brass);
      rib.rotation.y = Math.PI / 2;
      rib.position.x = i * 20;
      this.root.add(rib);
    }
    const gondola = new Mesh(new BoxGeometry(38, 9, 12), dark);
    gondola.position.set(-4, -26, 0);
    const windows = new Mesh(new BoxGeometry(30, 2.4, 12.4), glowMaterial(0xffd98a, 2.2));
    windows.position.set(-4, -24.5, 0);
    this.root.add(gondola, windows);
    for (const x of [-18, 10]) this.root.add(new Mesh(limb(new Vector3(x, -21, 0), new Vector3(x, -14, 0), 0.8, 0.8, 6), dark));
    for (const [y, rz] of [
      [10, 0.5],
      [-10, -0.5],
    ] as const) {
      const fin = new Mesh(new BoxGeometry(22, 14, 1), dark);
      fin.position.set(50, y, 0);
      fin.rotation.z = rz;
      this.root.add(fin);
    }
    for (const z of [-9, 9]) {
      const prop = new Mesh(merge([new BoxGeometry(0.8, 16, 1.6), new BoxGeometry(0.8, 1.6, 16)]), brass);
      prop.position.set(18, -26, z);
      this.props.push(prop);
      this.root.add(prop);
    }
    const nose = new Mesh(new ConeGeometry(6, 12, 12), brass);
    nose.rotation.z = Math.PI / 2;
    nose.position.x = -60;
    const cannon = new Mesh(new CylinderGeometry(1.6, 2.2, 16, 10), dark);
    cannon.rotation.z = Math.PI / 2 + 0.25;
    cannon.position.set(-28, -30, 0);
    this.root.add(nose, cannon);
    this.attacks = [this.burst, this.bombs, this.ram];
    this.finalizeModel();
  }

  override enter(bounds: Vector2) {
    super.enter(bounds);
    this.home.set(bounds.x * 0.52, bounds.y * 0.2);
  }

  private *burst(ctx: BossContext) {
    const volleys = this.phase2 ? 4 : 3;
    for (let v = 0; v < volleys; v++) {
      const sx = this.pos.x - 36;
      const sy = this.pos.y - 32;
      const d = this.aim(ctx, sx, sy);
      for (let k = 0; k < 3; k++) {
        ctx.projectiles.spawnBullet('orb', sx, sy, d.x * 230, d.y * 230, { radius: 3, damage: 10 });
        ctx.sfx('shoot');
        yield 0.1;
      }
      yield 0.55;
    }
    yield 0.5;
  }

  private *bombs(ctx: BossContext) {
    const n = this.phase2 ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const T = 1.3;
      const g = -240;
      const tx = ctx.player.pos.x + (Math.random() - 0.5) * 70;
      const ty = ctx.player.pos.y;
      const sx = this.pos.x - 10 + i * 4;
      const sy = this.pos.y - 34;
      ctx.projectiles.spawnBullet('lava', sx, sy, (tx - sx) / T, (ty - sy) / T - 0.5 * g * T, { gravity: g, radius: 4.4, damage: 12, life: 4 });
      ctx.sfx('shoot');
      yield 0.24;
    }
    yield 0.7;
  }

  private *ram(ctx: BossContext) {
    const y = ctx.player.pos.y;
    ctx.telegraph.show(0, y, ctx.bounds.x * 2.2, 70, 1.2);
    ctx.sfx('charge');
    while (Math.abs(this.pos.y - y) > 3) {
      this.pos.y += (y - this.pos.y) * Math.min(1, this.dt * 6);
      yield 0;
    }
    yield 0.7;
    this.charging = true;
    ctx.sfx('roar');
    while (this.pos.x > -ctx.bounds.x - 190) {
      this.pos.x -= (this.phase2 ? 640 : 540) * this.dt;
      yield 0;
    }
    this.charging = false;
    this.pos.set(ctx.bounds.x + 200, this.home.y);
    while (this.pos.x > this.home.x + 2) {
      this.pos.x += (this.home.x - this.pos.x) * Math.min(1, this.dt * 2.2);
      yield 0;
    }
    yield 0.4;
  }

  protected animate(dt: number) {
    if (this.state === 'fight' && !this.charging) this.pos.y += Math.sin(this.t * 0.8) * 0.3;
    for (const p of this.props) p.rotation.x += dt * 22;
    this.root.rotation.z = Math.sin(this.t * 0.6) * 0.03;
  }

  protected updateHitboxes() {
    this.hitboxes = [
      { x: this.pos.x, y: this.pos.y, r: 22, mult: 1, harmful: true },
      { x: this.pos.x - 34, y: this.pos.y, r: 18, mult: 1, harmful: true },
      { x: this.pos.x + 34, y: this.pos.y, r: 18, mult: 1, harmful: true },
      { x: this.pos.x - 4, y: this.pos.y - 26, r: 12, mult: 1.6, harmful: true },
    ];
  }
}
