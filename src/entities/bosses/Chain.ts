import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector2,
  DoubleSide,
} from 'three';
import { Boss, SegmentTrail, type BossContext } from './Boss';
import { glowMaterial } from './materials';

const SEGMENTS = 20;

/** Zone 3 boss: a siphonophore, a colony of glowing zooids strung on a stem. */
export interface ChainSkin {
  name: string;
  glow: number;
  shell: number;
  strand: number;
  hue: number;
}

export const CHAIN_SKINS: Record<'water' | 'sky' | 'space', ChainSkin> = {
  water: { name: 'The Chain', glow: 0xb48cff, shell: 0x9a7aff, strand: 0xff5ac8, hue: 0.72 },
  sky: { name: 'Kite Dragon', glow: 0xff5a3a, shell: 0xffc35a, strand: 0xffe08a, hue: 0.04 },
  space: { name: 'Star Wyrm', glow: 0x6ff6ff, shell: 0x8fd1e8, strand: 0x9fe8ff, hue: 0.52 },
};

export class Chain extends Boss {
  readonly name: string;
  private hue: number;
  private trail = new SegmentTrail(SEGMENTS, 15);
  private head = new Group();
  private cores: InstancedMesh;
  private bracts: InstancedMesh;
  private strands: InstancedMesh;
  private coreMat: MeshStandardMaterial;
  private dummy = new Object3D();
  private diving = false;
  private diveTarget = new Vector2();
  private pathT = 0;

  constructor(difficulty: number, skin: ChainSkin = CHAIN_SKINS.water) {
    super(150, difficulty);
    this.name = skin.name;
    this.hue = skin.hue;
    this.coreMat = glowMaterial(skin.glow, 3);
    this.registerGlow(this.coreMat);

    // Head: a float plus a crown of swimming bells.
    const bellProfile = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      bellProfile.push(new Vector2(Math.sin(t * Math.PI * 0.55) * 7, Math.cos(t * Math.PI * 0.55) * 9));
    }
    const bellGeo = new LatheGeometry(bellProfile, 20);
    const bellMat = new MeshPhysicalMaterial({
      color: 0xd8c8ff,
      emissive: skin.glow,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.5,
      roughness: 0.15,
      clearcoat: 1,
      side: DoubleSide,
      depthWrite: false,
    });
    const float = new Mesh(new SphereGeometry(9, 20, 14), bellMat);
    float.scale.set(1.5, 0.9, 0.9);
    this.head.add(float);
    for (let i = 0; i < 6; i++) {
      const b = new Mesh(bellGeo, bellMat);
      const a = (i / 6) * Math.PI * 2;
      b.position.set(4 + Math.cos(a) * 3, -6, Math.sin(a) * 8);
      b.rotation.z = Math.PI / 2 + Math.cos(a) * 0.4;
      b.scale.setScalar(0.8);
      this.head.add(b);
    }
    const eyeGlow = new Mesh(new SphereGeometry(3.4, 12, 8), this.coreMat);
    eyeGlow.position.set(-6, 0, 0);
    this.head.add(eyeGlow);
    this.root.add(this.head);

    // Body zooids: glowing core, translucent bract shell and hanging stinging strand.
    this.cores = new InstancedMesh(new SphereGeometry(3.4, 12, 8), this.coreMat, SEGMENTS);
    this.bracts = new InstancedMesh(
      new SphereGeometry(7, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
      new MeshBasicMaterial({ color: skin.shell, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
      SEGMENTS,
    );
    const strandGeo = new CylinderGeometry(0.3, 0.05, 26, 4, 1);
    strandGeo.translate(0, -13, 0);
    this.strands = new InstancedMesh(strandGeo, new MeshStandardMaterial({ color: skin.strand, emissive: skin.strand, emissiveIntensity: 1.4, transparent: true, opacity: 0.7 }), SEGMENTS);
    for (const m of [this.cores, this.bracts, this.strands]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      // Instanced parts live in world space, so they stay outside the moving root.
    }
    this.extras.push(this.cores, this.bracts, this.strands);
    this.attacks = [this.volley, this.whip, this.bloom];
    this.finalizeModel();
  }

  /** Instanced body parts are added to the scene separately by the game. */
  readonly extras: Object3D[] = [];

  override enter(bounds: Vector2) {
    super.enter(bounds);
    this.home.set(bounds.x * 0.45, 0);
    this.trail.reset(this.pos.x, this.pos.y, 1);
  }

  private *volley(ctx: BossContext) {
    for (let i = 1; i < SEGMENTS; i += this.phase2 ? 1 : 2) {
      const p = this.trail.points[i];
      const d = this.aim(ctx, p.x, p.y);
      ctx.projectiles.spawnBullet('orb', p.x, p.y, d.x * 170, d.y * 170, { radius: 3, damage: 10 });
      ctx.sfx('shoot');
      yield 0.07;
    }
    yield 0.8;
  }

  private *whip(ctx: BossContext) {
    const y = ctx.player.pos.y;
    ctx.telegraph.show(0, y, ctx.bounds.x * 2.2, 40, 1);
    ctx.sfx('charge');
    yield 1;
    this.diving = true;
    this.diveTarget.set(-ctx.bounds.x - 140, y);
    ctx.sfx('roar');
    while (this.pos.x > -ctx.bounds.x - 120) {
      this.pos.x -= (this.phase2 ? 640 : 520) * this.dt;
      this.pos.y += (y - this.pos.y) * Math.min(1, this.dt * 6);
      yield 0;
    }
    // Loop around off-screen and come back from the right.
    this.pos.set(ctx.bounds.x + 200, -y * 0.5);
    this.diving = false;
    yield 0.8;
  }

  private *bloom(ctx: BossContext) {
    for (let i = 2; i < SEGMENTS; i += 4) {
      const p = this.trail.points[i];
      ctx.projectiles.radial('orb', p.x, p.y, this.phase2 ? 8 : 6, 110, this.t, { radius: 2.6, damage: 9 });
    }
    ctx.sfx('shoot');
    yield 1.2;
  }

  protected animate(dt: number, ctx: BossContext) {
    if (this.state === 'fight' && !this.diving) {
      this.pathT += dt * (this.phase2 ? 0.75 : 0.55);
      const tx = this.home.x + Math.cos(this.pathT) * ctx.bounds.x * 0.32;
      const ty = Math.sin(this.pathT * 2) * ctx.bounds.y * 0.55;
      this.pos.x += (tx - this.pos.x) * Math.min(1, dt * 1.6);
      this.pos.y += (ty - this.pos.y) * Math.min(1, dt * 1.6);
    }
    this.trail.push(this.pos.x, this.pos.y);
    const p0 = this.trail.points[1];
    this.head.rotation.z = Math.atan2(this.pos.y - p0.y, this.pos.x - p0.x) + Math.PI;
    const d = this.dummy;
    const alive = this.state !== 'dead';
    const shrink = 0.6 + 0.4 * (this.hp / this.maxHp);
    const c = new Color();
    for (let i = 0; i < SEGMENTS; i++) {
      const p = this.trail.points[i];
      const pulse = 1 + Math.sin(this.t * 4 - i * 0.5) * 0.15;
      d.position.set(p.x, p.y, 0);
      d.rotation.set(0, 0, Math.sin(this.t * 2 + i) * 0.3);
      d.scale.setScalar(i === 0 ? 0.001 : pulse * shrink * (1 - i / SEGMENTS * 0.35) * (alive ? 1 : 0));
      d.updateMatrix();
      this.cores.setMatrixAt(i, d.matrix);
      this.bracts.setMatrixAt(i, d.matrix);
      d.rotation.z = Math.sin(this.t * 1.7 + i * 0.6) * 0.35;
      d.updateMatrix();
      this.strands.setMatrixAt(i, d.matrix);
      this.cores.setColorAt(i, c.setHSL(this.hue + Math.sin(this.t + i * 0.3) * 0.05, 1, 0.6 + this.flash * 0.4));
    }
    for (const m of [this.cores, this.bracts, this.strands]) m.instanceMatrix.needsUpdate = true;
    if (this.cores.instanceColor) this.cores.instanceColor.needsUpdate = true;
  }

  protected updateHitboxes() {
    this.hitboxes = [{ x: this.pos.x, y: this.pos.y, r: 14, mult: 1.5, harmful: true }];
    for (let i = 2; i < SEGMENTS; i += 2) {
      const p = this.trail.points[i];
      this.hitboxes.push({ x: p.x, y: p.y, r: 8, mult: 0.7, harmful: true });
    }
  }
}
