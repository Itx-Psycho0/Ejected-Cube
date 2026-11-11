import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, OctahedronGeometry, SphereGeometry, TorusGeometry, Vector2 } from 'three';
import { Boss, type BossContext } from './Boss';
import { glowMaterial } from './materials';

/** Space boss: a sentinel core behind orbiting armour plates. */
export class Core extends Boss {
  readonly name = 'Sentinel Core';
  private rings: Mesh[] = [];
  private plates = new Group();
  private coreMat: MeshStandardMaterial;
  private spin = 0;

  constructor(difficulty: number) {
    super(130, difficulty);
    const metal = new MeshStandardMaterial({ color: 0x7d8590, roughness: 0.35, metalness: 0.9, emissive: 0x203a5a, emissiveIntensity: 0.3 });
    this.coreMat = glowMaterial(0x6ff6ff, 3);
    this.registerGlow(metal, this.coreMat);
    const core = new Mesh(new OctahedronGeometry(13, 0), this.coreMat);
    const shell = new Mesh(new OctahedronGeometry(17, 1), new MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.9, roughness: 0.3, wireframe: true }));
    this.root.add(core, shell);
    for (let i = 0; i < 3; i++) {
      const ring = new Mesh(new TorusGeometry(26 + i * 5, 1.2, 8, 48), metal);
      ring.rotation.set(i * 1.1, i * 0.7, 0);
      this.rings.push(ring);
      this.root.add(ring);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const plate = new Mesh(new BoxGeometry(4, 20, 14), metal);
      plate.position.set(Math.cos(a) * 36, Math.sin(a) * 36, 0);
      plate.rotation.z = a;
      this.plates.add(plate);
    }
    this.root.add(this.plates);
    this.attacks = [this.spiral, this.rings2, this.drones];
    this.finalizeModel();
  }

  override enter(bounds: Vector2) {
    super.enter(bounds);
    this.home.set(bounds.x * 0.55, 0);
  }

  /** Two rotating arms of orbs: find the gap and move with it. */
  private *spiral(ctx: BossContext) {
    const shots = this.phase2 ? 34 : 24;
    const arms = this.phase2 ? 3 : 2;
    for (let i = 0; i < shots; i++) {
      for (let k = 0; k < arms; k++) {
        const a = this.spin + (k / arms) * Math.PI * 2;
        ctx.projectiles.spawnBullet('orb', this.pos.x, this.pos.y, Math.cos(a) * 150, Math.sin(a) * 150, { radius: 3, damage: 10, life: 5 });
      }
      this.spin += 0.24;
      if (i % 3 === 0) ctx.sfx('shoot');
      yield 0.1;
    }
    yield 0.8;
  }

  private *rings2(ctx: BossContext) {
    for (let w = 0; w < (this.phase2 ? 3 : 2); w++) {
      const n = 18;
      const gap = Math.atan2(ctx.player.pos.y - this.pos.y, ctx.player.pos.x - this.pos.x) + (Math.random() - 0.5) * 0.8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        let da = a - gap;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < 0.34) continue;
        ctx.projectiles.spawnBullet('orb', this.pos.x, this.pos.y, Math.cos(a) * 130, Math.sin(a) * 130, { radius: 3.2, damage: 10, life: 5 });
      }
      ctx.sfx('shoot');
      ctx.shake(0.2);
      yield 0.9;
    }
    yield 0.5;
  }

  private *drones(ctx: BossContext) {
    ctx.sfx('roar');
    const n = this.phase2 ? 4 : 3;
    for (let i = 0; i < n; i++) ctx.spawnEnemy('lanternfish', ctx.bounds.x + 20 + i * 22, (i - (n - 1) / 2) * 40);
    yield 2;
  }

  protected animate(dt: number, ctx: BossContext) {
    if (this.state === 'fight') this.pos.y = Math.sin(this.t * 0.6) * ctx.bounds.y * 0.4;
    this.rings.forEach((r, i) => {
      r.rotation.x += dt * (0.5 + i * 0.2);
      r.rotation.y += dt * (0.3 + i * 0.15);
    });
    this.plates.rotation.z += dt * (this.phase2 ? 1.1 : 0.7);
    this.coreMat.emissiveIntensity = Math.max(this.coreMat.emissiveIntensity, 3 + Math.sin(this.t * 4) * 0.8);
  }

  protected updateHitboxes() {
    this.hitboxes = [{ x: this.pos.x, y: this.pos.y, r: 17, mult: 1.3, harmful: true }];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + this.plates.rotation.z;
      this.hitboxes.push({ x: this.pos.x + Math.cos(a) * 36, y: this.pos.y + Math.sin(a) * 36, r: 11, mult: 0.2, harmful: true });
    }
  }
}

/** Space boss: a warship with broadsides, a missile wall and a main beam. */
export class Dreadnought extends Boss {
  readonly name = 'Dreadnought';
  private engineMat: MeshStandardMaterial;

  constructor(difficulty: number) {
    super(160, difficulty);
    const hull = new MeshStandardMaterial({ color: 0x5a626e, roughness: 0.4, metalness: 0.85, emissive: 0x101a2a, emissiveIntensity: 0.3 });
    const dark = new MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.5, metalness: 0.8 });
    this.engineMat = glowMaterial(0xff8a3a, 4);
    this.registerGlow(hull);
    const body = new Mesh(new BoxGeometry(110, 18, 26), hull);
    const prow = new Mesh(new ConeGeometry(15, 44, 4), hull);
    prow.rotation.z = Math.PI / 2;
    prow.rotation.x = Math.PI / 4;
    prow.scale.set(1, 1, 0.62);
    prow.position.x = -76;
    const bridge = new Mesh(new BoxGeometry(26, 16, 14), dark);
    bridge.position.set(24, 16, 0);
    const win = new Mesh(new BoxGeometry(20, 3, 14.4), glowMaterial(0x8fd1e8, 2.4));
    win.position.set(22, 19, 0);
    const keel = new Mesh(new BoxGeometry(70, 8, 14), dark);
    keel.position.set(-4, -12, 0);
    this.root.add(body, prow, bridge, win, keel);
    for (const x of [-36, -12, 12]) {
      const turret = new Mesh(new CylinderGeometry(5, 6, 5, 12), dark);
      turret.position.set(x, 11, 8);
      const barrel = new Mesh(new CylinderGeometry(1, 1, 14, 8), dark);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(x - 9, 13, 8);
      this.root.add(turret, barrel);
    }
    for (const y of [-5, 5]) {
      const nozzle = new Mesh(new CylinderGeometry(6, 7.5, 10, 14), dark);
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.set(58, y, 0);
      const flame = new Mesh(new SphereGeometry(5, 12, 10), this.engineMat);
      flame.scale.set(1.6, 1, 1);
      flame.position.set(66, y, 0);
      this.root.add(nozzle, flame);
    }
    this.attacks = [this.broadside, this.wall, this.beam];
    this.finalizeModel();
  }

  override enter(bounds: Vector2) {
    super.enter(bounds);
    this.home.set(bounds.x * 0.6, bounds.y * 0.1);
  }

  private *broadside(ctx: BossContext) {
    const volleys = this.phase2 ? 4 : 3;
    for (let v = 0; v < volleys; v++) {
      const sx = this.pos.x - 50;
      const sy = this.pos.y + 12;
      const d = this.aim(ctx, sx, sy);
      ctx.projectiles.fan('orb', sx, sy, d.x, d.y, this.phase2 ? 7 : 5, 0.8, 190, { radius: 3.2, damage: 10 });
      ctx.sfx('shoot');
      yield 0.6;
    }
    yield 0.5;
  }

  private *wall(ctx: BossContext) {
    for (let w = 0; w < (this.phase2 ? 3 : 2); w++) {
      const gap = (Math.random() - 0.5) * ctx.bounds.y * 1.2;
      ctx.telegraph.show(ctx.bounds.x - 14, gap, 24, 76, 0.7);
      yield 0.7;
      for (let y = -ctx.bounds.y; y <= ctx.bounds.y; y += 16) {
        if (Math.abs(y - gap) < 38) continue;
        ctx.projectiles.spawnBullet('tooth', ctx.bounds.x + 20, y, -220, 0, { radius: 3, damage: 11, life: 5 });
      }
      ctx.sfx('shoot');
      yield 1.2;
    }
    yield 0.4;
  }

  /** Main gun: a marked lane, then a dense beam of bolts. */
  private *beam(ctx: BossContext) {
    const y = ctx.player.pos.y;
    ctx.telegraph.show(0, y, ctx.bounds.x * 2.2, 34, 1.1);
    ctx.sfx('charge');
    yield 1.1;
    for (let k = 0; k < 14; k++) {
      for (const dy of [-8, 0, 8]) ctx.projectiles.spawnBullet('spike', this.pos.x - 70, y + dy, -700, 0, { radius: 2.8, damage: 13, life: 1.5 });
      if (k % 4 === 0) ctx.sfx('slam');
      ctx.shake(0.08);
      yield 0.05;
    }
    yield 0.9;
  }

  protected animate(_dt: number, ctx: BossContext) {
    if (this.state === 'fight') this.pos.y = this.home.y + Math.sin(this.t * 0.5) * ctx.bounds.y * 0.3;
    this.engineMat.emissiveIntensity = 3.5 + Math.sin(this.t * 20) * 0.8;
    this.root.rotation.z = Math.sin(this.t * 0.4) * 0.02;
  }

  protected updateHitboxes() {
    this.hitboxes = [
      { x: this.pos.x - 40, y: this.pos.y, r: 14, mult: 1, harmful: true },
      { x: this.pos.x - 10, y: this.pos.y, r: 15, mult: 1, harmful: true },
      { x: this.pos.x + 20, y: this.pos.y + 8, r: 16, mult: 1.5, harmful: true },
      { x: this.pos.x + 50, y: this.pos.y, r: 14, mult: 1, harmful: false },
    ];
  }
}
