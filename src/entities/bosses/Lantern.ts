import { CatmullRomCurve3, ConeGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TubeGeometry, Vector2, Vector3, BufferGeometry } from 'three';
import { Boss, type BossContext } from './Boss';
import { lumpySphere, merge } from '../../world/geometry';
import { eyeMaterial, fleshMaterial, glowMaterial, toothMaterial } from './materials';

/** Zone 2 boss: a giant anglerfish whose lure blinds and summons. */
export class Lantern extends Boss {
  readonly name = 'The Lantern';
  private jaw = new Group();
  private lure = new Group();
  private bulbMat: MeshStandardMaterial;
  private mouthOpen = 0;
  private mouthTarget = 0.1;
  private charging = false;

  constructor(difficulty: number) {
    super(140, difficulty);
    this.bulbMat = glowMaterial(0xffe08a, 6);
    this.registerGlow(this.bulbMat);
    this.build();
    this.attacks = [this.luring, this.lunge, this.teeth];
  }

  private build() {
    const skin = fleshMaterial(0x5a4a52, { wet: true, emissive: 0x1a3a48, emissiveIntensity: 0.55 });
    const body = new Mesh(lumpySphere(1, 4, 0.1, 1.4, 2), skin);
    body.scale.set(36, 28, 24);
    this.root.add(body);

    // Upper teeth hang from the head's front-bottom edge (forward is -x).
    const teeth: BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 15 - 0.5) * 2.2;
      const t = new ConeGeometry(1.4 + Math.random(), 7 + Math.random() * 7, 6);
      t.rotateZ(Math.PI);
      t.translate(-30 * Math.cos(a * 0.6), -8, Math.sin(a) * 20);
      teeth.push(t);
    }
    this.root.add(new Mesh(merge(teeth), toothMaterial()));

    // Lower jaw hinged at the back.
    this.jaw.position.set(18, -10, 0);
    const jawMesh = new Mesh(lumpySphere(1, 3, 0.1, 1.6, 6), skin);
    jawMesh.scale.set(38, 9, 22);
    jawMesh.position.set(-24, -4, 0);
    const lowerTeeth: BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 13 - 0.5) * 2.2;
      const t = new ConeGeometry(1.5, 8 + Math.random() * 8, 6);
      t.translate(-24 - 30 * Math.cos(a * 0.6), 6, Math.sin(a) * 18);
      lowerTeeth.push(t);
    }
    this.jaw.add(jawMesh, new Mesh(merge(lowerTeeth), toothMaterial()));
    this.root.add(this.jaw);

    // Glowing gullet visible when the mouth opens.
    const gullet = new Mesh(new SphereGeometry(12, 16, 10), glowMaterial(0xff3355, 1.2));
    gullet.position.set(-14, -10, 0);
    this.root.add(gullet);

    // Eye.
    const eye = new Mesh(new SphereGeometry(4, 16, 12), eyeMaterial());
    eye.position.set(-20, 10, 16);
    const iris = new Mesh(new SphereGeometry(1.6, 12, 8), glowMaterial(0x7ffcff, 2));
    iris.position.set(-22.5, 10.5, 18.6);
    this.root.add(eye, iris);

    // Lure: a curved stalk (illicium) ending in a glowing bulb (esca).
    const curve = new CatmullRomCurve3([new Vector3(-10, 24, 0), new Vector3(-16, 46, 0), new Vector3(-40, 52, 0), new Vector3(-56, 40, 0)]);
    const stalk = new Mesh(new TubeGeometry(curve, 30, 1.2, 8), skin);
    this.lure.add(stalk);
    const bulb = new Mesh(new SphereGeometry(4.2, 18, 14), this.bulbMat);
    bulb.position.set(-56, 37, 0);
    const filaments: BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const f = new ConeGeometry(0.4, 6, 4);
      f.rotateZ(Math.PI + (i - 2.5) * 0.3);
      f.translate(-56 + (i - 2.5) * 1.2, 31, 0);
      filaments.push(f);
    }
    this.lure.add(bulb, new Mesh(merge(filaments), this.bulbMat));
    this.root.add(this.lure);

    // Pectoral fin and dorsal spines.
    const finMat = fleshMaterial(0x3a2a30, { wet: true });
    const fin = new Mesh(new ConeGeometry(9, 22, 5), finMat);
    fin.scale.set(1, 1, 0.12);
    fin.rotation.z = -1.9;
    fin.position.set(6, -6, 22);
    this.root.add(fin);
    for (let i = 0; i < 5; i++) {
      const sp = new Mesh(new ConeGeometry(1.2, 10 - i, 5), finMat);
      sp.position.set(10 + i * 6, 26 - i * 2, 0);
      sp.rotation.z = -0.4;
      this.root.add(sp);
    }
    this.root.scale.setScalar(1.15);
    this.finalizeModel();
  }

  override enter(bounds: Vector2) {
    super.enter(bounds);
    this.home.set(bounds.x * 0.62, bounds.y * 0.05);
  }

  private *luring(ctx: BossContext) {
    this.mouthTarget = 0.6;
    for (let i = 0; i < 6; i++) {
      this.bulbMat.emissiveIntensity = 14;
      yield 0.12;
    }
    ctx.darken(0.82, 3.4);
    ctx.sfx('roar');
    const n = this.phase2 ? 5 : 3;
    for (let i = 0; i < n; i++) ctx.spawnEnemy('lanternfish', ctx.bounds.x + 30 + i * 20, (Math.random() - 0.5) * ctx.bounds.y * 1.2);
    yield 2.6;
    this.mouthTarget = 0.1;
    yield 0.6;
  }

  private *lunge(ctx: BossContext) {
    const y = ctx.player.pos.y;
    ctx.telegraph.show(0, y, ctx.bounds.x * 2.2, 80, 1.05);
    ctx.sfx('charge');
    this.mouthTarget = 1;
    while (Math.abs(this.pos.y - y) > 3) {
      this.pos.y += (y - this.pos.y) * Math.min(1, this.dt * 8);
      yield 0;
    }
    yield 0.6;
    this.charging = true;
    ctx.sfx('roar');
    while (this.pos.x > -ctx.bounds.x - 160) {
      this.pos.x -= (this.phase2 ? 820 : 680) * this.dt;
      ctx.shake(0.05);
      yield 0;
    }
    this.charging = false;
    this.pos.x = ctx.bounds.x + 160;
    this.pos.y = this.home.y;
    this.mouthTarget = 0.1;
    while (this.pos.x > this.home.x + 2) {
      this.pos.x += (this.home.x - this.pos.x) * Math.min(1, this.dt * 2.5);
      yield 0;
    }
    yield 0.4;
  }

  private *teeth(ctx: BossContext) {
    this.mouthTarget = 0.9;
    yield 0.4;
    const volleys = this.phase2 ? 4 : 3;
    for (let v = 0; v < volleys; v++) {
      const sx = this.pos.x - 40;
      const sy = this.pos.y - 10;
      const d = this.aim(ctx, sx, sy);
      ctx.projectiles.fan('tooth', sx, sy, d.x, d.y, this.phase2 ? 9 : 7, 0.9, 260, { radius: 2.2, damage: 12 });
      ctx.sfx('shoot');
      yield 0.45;
    }
    this.mouthTarget = 0.1;
    yield 0.5;
  }

  protected animate(dt: number) {
    if (this.state === 'fight' && !this.charging) this.pos.y += Math.sin(this.t * 0.9) * 0.4;
    this.mouthOpen += (this.mouthTarget - this.mouthOpen) * Math.min(1, dt * 6);
    this.jaw.rotation.z = this.mouthOpen * 0.55;
    this.lure.rotation.z = Math.sin(this.t * 1.3) * 0.06;
    this.bulbMat.emissiveIntensity += (6 + Math.sin(this.t * 3) * 1.5 - this.bulbMat.emissiveIntensity) * Math.min(1, dt * 4);
    this.root.rotation.z = this.charging ? 0.05 : Math.sin(this.t * 0.6) * 0.04;
  }

  protected updateHitboxes() {
    const s = 1.15;
    this.hitboxes = [
      { x: this.pos.x, y: this.pos.y, r: 32 * s, mult: 1, harmful: true },
      { x: this.pos.x - 30 * s, y: this.pos.y - 12 * s, r: 13 * s, mult: this.mouthOpen > 0.5 ? 1.8 : 0.8, harmful: true },
      { x: this.pos.x - 56 * s, y: this.pos.y + 37 * s, r: 6 * s, mult: 1.5, harmful: false },
    ];
  }
}
