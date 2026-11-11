import {
  BufferGeometry,
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector2,
} from 'three';
import { Boss, SegmentTrail, type BossContext } from './Boss';
import { lumpySphere, merge } from '../../world/geometry';
import { eyeMaterial, fleshMaterial, glowMaterial, toothMaterial } from './materials';
import { getTextures } from '../../world/textures';

const SEGS = 26;

/** Final boss: an armoured sea serpent the station was built to study. */
export class Leviathan extends Boss {
  readonly name = 'Leviathan';
  private trail = new SegmentTrail(SEGS, 19);
  private head = new Group();
  private jaw = new Group();
  private gillMat: MeshStandardMaterial;
  private plates: InstancedMesh;
  private spines: InstancedMesh;
  private dummy = new Object3D();
  private charging = false;
  private swimT = 0;
  private mouth = 0;
  readonly extras: Object3D[] = [];

  constructor(difficulty: number) {
    super(190, difficulty);
    const tex = getTextures();
    const armour = new MeshStandardMaterial({
      color: 0x3a4a48,
      roughness: 0.45,
      metalness: 0.35,
      normalMap: tex.rockNormal,
      emissive: 0x0a2a2a,
      emissiveIntensity: 0.4,
    });
    const flesh = fleshMaterial(0x5a6a5a, { wet: true });
    this.gillMat = glowMaterial(0xff9a3a, 2.5);
    this.registerGlow(armour, this.gillMat);

    // Head: armoured skull, hinged jaw, teeth, eyes and glowing gill weak spots.
    const skull = new Mesh(lumpySphere(1, 4, 0.12, 1.8, 12), armour);
    skull.scale.set(40, 17, 20);
    this.head.add(skull);
    const crest: BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const c = new ConeGeometry(3 - i * 0.25, 14 - i, 5);
      c.rotateZ(0.7);
      c.translate(-18 + i * 8, 15, 0);
      crest.push(c);
    }
    this.head.add(new Mesh(merge(crest), armour));
    this.jaw.position.set(22, -8, 0);
    const jawMesh = new Mesh(lumpySphere(1, 3, 0.1, 2, 4), flesh);
    jawMesh.scale.set(40, 6, 17);
    jawMesh.position.set(-28, -3, 0);
    const teeth: BufferGeometry[] = [];
    for (let i = 0; i < 18; i++) {
      const t = new ConeGeometry(1.3, 8, 5);
      t.translate(-58 + i * 3.6, 3, (i % 2 ? 1 : -1) * 11);
      teeth.push(t);
    }
    this.jaw.add(jawMesh, new Mesh(merge(teeth), toothMaterial()));
    this.head.add(this.jaw);
    const upperTeeth: BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      const t = new ConeGeometry(1.4, 9, 5);
      t.rotateZ(Math.PI);
      t.translate(-36 + i * 3.4, -12, (i % 2 ? 1 : -1) * 12);
      upperTeeth.push(t);
    }
    this.head.add(new Mesh(merge(upperTeeth), toothMaterial()));
    for (const z of [-1, 1]) {
      const eye = new Mesh(new SphereGeometry(3.6, 16, 12), eyeMaterial());
      eye.position.set(-24, 5, z * 15);
      const glow = new Mesh(new SphereGeometry(1.6, 10, 8), glowMaterial(0xffd166, 5));
      glow.position.set(-26.5, 5.5, z * 17);
      this.head.add(eye, glow);
      for (let g = 0; g < 3; g++) {
        const gill = new Mesh(new SphereGeometry(2.4, 10, 8), this.gillMat);
        gill.scale.set(0.4, 1.6, 1);
        gill.position.set(10 + g * 6, -2, z * 18.5);
        this.head.add(gill);
      }
    }
    this.root.add(this.head);

    // Body: instanced armour rings with dorsal spines, tapering to the tail.
    const ring = lumpySphere(1, 2, 0.12, 2.5, 21);
    ring.scale(1.2, 1, 1);
    this.plates = new InstancedMesh(ring, armour, SEGS);
    this.spines = new InstancedMesh(new ConeGeometry(1, 3.2, 5), flesh, SEGS);
    for (const m of [this.plates, this.spines]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = true;
    }
    this.extras.push(this.plates, this.spines);
    this.attacks = [this.charge, this.orbs, this.summon, this.wall];
    this.finalizeModel();
  }

  override enter(bounds: Vector2) {
    super.enter(bounds);
    this.home.set(bounds.x * 0.55, 0);
    this.trail.reset(this.pos.x, this.pos.y, 1);
  }

  protected override onPhase2() {
    this.gillMat.emissive.setHex(0xff3a2a);
  }

  private *charge(ctx: BossContext) {
    const y = ctx.player.pos.y;
    ctx.telegraph.show(0, y, ctx.bounds.x * 2.2, 70, 1.1);
    ctx.sfx('charge');
    this.mouth = 1;
    yield 1.1;
    this.charging = true;
    ctx.sfx('roar');
    while (this.pos.x > -ctx.bounds.x - 200) {
      this.pos.x -= (this.phase2 ? 900 : 760) * this.dt;
      this.pos.y += (y - this.pos.y) * Math.min(1, this.dt * 10);
      ctx.shake(0.06);
      yield 0;
    }
    // Wait for the body to clear the screen, then re-enter from the right.
    for (let i = 0; i < 40; i++) {
      this.pos.x -= 760 * this.dt;
      yield 0;
    }
    this.charging = false;
    this.pos.set(ctx.bounds.x + 220, this.home.y);
    this.trail.reset(this.pos.x, this.pos.y, 1);
    this.mouth = 0.1;
    yield 0.6;
  }

  private *orbs(ctx: BossContext) {
    const volleys = this.phase2 ? 4 : 3;
    for (let v = 0; v < volleys; v++) {
      const sx = this.pos.x + 12;
      const sy = this.pos.y - 4;
      const d = this.aim(ctx, sx, sy);
      ctx.projectiles.fan('orb', sx, sy, d.x, d.y, 5, 0.7, 200, { radius: 3.4, damage: 12 });
      ctx.sfx('shoot');
      yield 0.5;
    }
    yield 0.6;
  }

  private *summon(ctx: BossContext) {
    ctx.sfx('roar');
    this.mouth = 0.8;
    ctx.spawnEnemy('puffer', ctx.bounds.x + 30, ctx.bounds.y * 0.45);
    ctx.spawnEnemy('puffer', ctx.bounds.x + 60, -ctx.bounds.y * 0.35);
    if (this.phase2) ctx.spawnEnemy('mine', ctx.bounds.x + 40, ctx.bounds.y * 0.05);
    yield 1.4;
    this.mouth = 0.1;
    yield 0.4;
  }

  /** A wall of orbs with one gap to slip through. */
  private *wall(ctx: BossContext) {
    const walls = this.phase2 ? 3 : 2;
    for (let w = 0; w < walls; w++) {
      const gap = (Math.random() - 0.5) * ctx.bounds.y * 1.2;
      ctx.telegraph.show(ctx.bounds.x - 10, gap, 20, 70, 0.6);
      yield 0.6;
      for (let y = -ctx.bounds.y; y <= ctx.bounds.y; y += 15) {
        if (Math.abs(y - gap) < 34) continue;
        ctx.projectiles.spawnBullet('orb', ctx.bounds.x + 20, y, -230, 0, { radius: 3.4, damage: 14, life: 5 });
      }
      ctx.sfx('shoot');
      yield 1.1;
    }
    yield 0.6;
  }

  protected animate(dt: number, ctx: BossContext) {
    if (this.state === 'fight' && !this.charging) {
      this.swimT += dt;
      const tx = this.home.x + Math.sin(this.swimT * 0.5) * ctx.bounds.x * 0.15;
      const ty = Math.sin(this.swimT * 0.9) * ctx.bounds.y * 0.5;
      this.pos.x += (tx - this.pos.x) * Math.min(1, dt * 1.2);
      this.pos.y += (ty - this.pos.y) * Math.min(1, dt * 1.2);
    }
    this.trail.push(this.pos.x, this.pos.y);
    const p1 = this.trail.points[2];
    const heading = Math.atan2(this.pos.y - p1.y, this.pos.x - p1.x);
    this.head.rotation.z = heading + Math.PI;
    this.jaw.rotation.z += (this.mouth * 0.5 + Math.sin(this.t * 2) * 0.05 - this.jaw.rotation.z) * Math.min(1, dt * 5);
    this.gillMat.emissiveIntensity = Math.max(this.gillMat.emissiveIntensity, 2 + Math.sin(this.t * 5) * 1.2 + (this.phase2 ? 2 : 0));

    const d = this.dummy;
    const alive = this.state !== 'dead' ? 1 : 0;
    for (let i = 0; i < SEGS; i++) {
      const p = this.trail.points[i];
      const q = this.trail.points[Math.max(0, i - 1)];
      const ang = Math.atan2(q.y - p.y, q.x - p.x);
      const taper = (1 - (i / SEGS) * 0.7) * alive;
      const r = 15 * taper;
      d.position.set(p.x, p.y, -6);
      d.rotation.set(Math.sin(this.t * 2 + i * 0.4) * 0.2, 0, ang);
      d.scale.set(r * 1.1, r, r);
      d.updateMatrix();
      this.plates.setMatrixAt(i, d.matrix);
      d.position.set(p.x - Math.sin(ang) * r * 0.95, p.y + Math.cos(ang) * r * 0.95, -6);
      d.rotation.set(0, 0, ang - Math.PI / 2 + 0.4 + Math.PI);
      d.scale.setScalar(r * 0.55);
      d.updateMatrix();
      this.spines.setMatrixAt(i, d.matrix);
    }
    this.plates.instanceMatrix.needsUpdate = true;
    this.spines.instanceMatrix.needsUpdate = true;
  }

  protected updateHitboxes() {
    const c = Math.cos(this.head.rotation.z);
    const s = Math.sin(this.head.rotation.z);
    const gx = this.pos.x + c * 16;
    const gy = this.pos.y + s * 16;
    this.hitboxes = [
      { x: this.pos.x, y: this.pos.y, r: 24, mult: 1, harmful: true },
      { x: gx, y: gy, r: 9, mult: this.phase2 ? 2.2 : 1.4, harmful: true },
    ];
    for (let i = 2; i < SEGS; i += 2) {
      const p = this.trail.points[i];
      this.hitboxes.push({ x: p.x, y: p.y, r: 13 * (1 - (i / SEGS) * 0.7), mult: 0.25, harmful: true });
    }
  }
}
