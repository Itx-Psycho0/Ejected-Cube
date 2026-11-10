import { ConeGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector2, Vector3 } from 'three';
import { Boss, type BossContext } from './Boss';
import { limb, lumpySphere } from '../../world/geometry';
import { crackTexture, eyeMaterial, fleshMaterial } from './materials';

/** Zone 1 boss: a hydrothermal-vent crab with glowing magma veins. */
export class Warden extends Boss {
  readonly name = 'Thermal Warden';
  private legs: Group[] = [];
  private claws: { arm: Group; finger: Group }[] = [];
  private shellMat: MeshStandardMaterial;
  private spawnAdds = false;

  constructor(difficulty: number) {
    super(110, difficulty);
    this.shellMat = new MeshStandardMaterial({
      color: 0x6a2a1e,
      roughness: 0.55,
      metalness: 0.15,
      emissive: 0xff6a1a,
      emissiveMap: crackTexture(),
      emissiveIntensity: 2.2,
      normalMap: fleshMaterial(0).normalMap,
    });
    this.registerGlow(this.shellMat);
    this.build();
    this.attacks = [this.lob, this.snap, this.eruption];
  }

  private build() {
    const body = new Group();
    this.root.add(body);
    const shell = new Mesh(lumpySphere(1, 4, 0.14, 1.6, 5), this.shellMat);
    shell.scale.set(30, 12, 22);
    shell.position.y = 4;
    const belly = new Mesh(lumpySphere(1, 3, 0.1, 2, 8), fleshMaterial(0xc89a72));
    belly.scale.set(24, 6, 18);
    belly.position.y = -3;
    body.add(shell, belly);

    // Spiked rim along the carapace edge.
    const spikeMat = new MeshStandardMaterial({ color: 0x3a1610, roughness: 0.5 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const s = new Mesh(new ConeGeometry(1.6, 6, 6), spikeMat);
      s.position.set(Math.cos(a) * 29, 6, Math.sin(a) * 21);
      s.rotation.z = -Math.cos(a) * 1.2;
      s.rotation.x = Math.sin(a) * 1.2;
      body.add(s);
    }

    // Eyes on stalks.
    const legMat = fleshMaterial(0x7a3424);
    for (const z of [-5, 5]) {
      const stalk = new Mesh(limb(new Vector3(-22, 8, z), new Vector3(-27, 18, z * 1.3), 1.4, 1, 8), legMat);
      const eye = new Mesh(new SphereGeometry(2.4, 14, 10), eyeMaterial());
      eye.position.set(-27.5, 19.5, z * 1.3);
      body.add(stalk, eye);
    }

    // Six walking legs, two segments each.
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? 1 : -1;
      const k = i % 3;
      const hip = new Group();
      hip.position.set(-10 + k * 11, -2, side * 16);
      const femur = new Mesh(limb(new Vector3(), new Vector3(0, 10, side * 16), 2.6, 1.8, 8), legMat);
      const knee = new Group();
      knee.position.set(0, 10, side * 16);
      const tibia = new Mesh(limb(new Vector3(), new Vector3(0, -30, side * 6), 1.8, 0.5, 8), legMat);
      knee.add(tibia);
      hip.add(femur, knee);
      hip.userData = { side, k };
      this.legs.push(hip);
      body.add(hip);
    }

    // Two big claws reaching forward (-x is toward the player).
    for (const side of [1, -1]) {
      const arm = new Group();
      arm.position.set(-20, 0, side * 14);
      const upper = new Mesh(limb(new Vector3(), new Vector3(-14, 6, side * 6), 3.6, 3, 10), legMat);
      const fore = new Mesh(limb(new Vector3(-14, 6, side * 6), new Vector3(-26, 2, side * 4), 3, 3.4, 10), legMat);
      const palm = new Mesh(lumpySphere(1, 3, 0.15, 2, 3 + side), this.shellMat);
      palm.scale.set(11, 7, 7);
      palm.position.set(-32, 2, side * 4);
      const fixedFinger = new Mesh(new ConeGeometry(3.2, 16, 8), legMat);
      fixedFinger.rotation.z = Math.PI / 2;
      fixedFinger.position.set(-46, -1, side * 4);
      const finger = new Group();
      finger.position.set(-38, 4, side * 4);
      const moving = new Mesh(new ConeGeometry(2.8, 15, 8), legMat);
      moving.rotation.z = Math.PI / 2;
      moving.position.set(-7, 0, 0);
      finger.add(moving);
      arm.add(upper, fore, palm, fixedFinger, finger);
      this.claws.push({ arm, finger });
      body.add(arm);
    }
    this.root.scale.setScalar(1.25);
    this.finalizeModel();
  }

  override enter(bounds: Vector2) {
    super.enter(bounds);
    this.home.set(bounds.x * 0.58, -bounds.y * 0.25);
  }

  protected override onPhase2() {
    this.spawnAdds = true;
  }

  private *lob(ctx: BossContext) {
    const n = this.phase2 ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const T = 1.25;
      const g = -260;
      const tx = ctx.player.pos.x + (Math.random() - 0.5) * 60;
      const ty = ctx.player.pos.y + (Math.random() - 0.5) * 40;
      const sx = this.pos.x - 30;
      const sy = this.pos.y + 20;
      ctx.projectiles.spawnBullet('lava', sx, sy, (tx - sx) / T, (ty - sy) / T - 0.5 * g * T, { gravity: g, radius: 4.2, damage: 14, life: 4 });
      ctx.sfx('shoot');
      yield 0.2;
    }
    yield 0.6;
  }

  private *snap(ctx: BossContext) {
    const y = ctx.player.pos.y;
    ctx.telegraph.show(0, y, ctx.bounds.x * 2.2, 30, 0.9);
    ctx.sfx('charge');
    this.claws.forEach((c) => (c.finger.rotation.z = 0.6));
    yield 0.9;
    for (let row = -1; row <= 1; row++)
      for (let k = 0; k < 6; k++)
        ctx.projectiles.spawnBullet('spike', this.pos.x - 40 + k * 10, y + row * 9, -620, 0, { radius: 2.6, damage: 16 });
    this.claws.forEach((c) => (c.finger.rotation.z = -0.1));
    ctx.shake(0.4);
    ctx.sfx('slam');
    yield 0.9;
  }

  private *eruption(ctx: BossContext) {
    if (this.spawnAdds) {
      ctx.spawnEnemy('urchin', ctx.bounds.x + 30, ctx.bounds.y * 0.5);
      ctx.spawnEnemy('urchin', ctx.bounds.x + 60, -ctx.bounds.y * 0.2);
    }
    const waves = this.phase2 ? 3 : 2;
    for (let w = 0; w < waves; w++) {
      ctx.projectiles.radial('lava', this.pos.x, this.pos.y + 10, 16, 120, w * 0.2, { radius: 3.4, damage: 12, gravity: -30 });
      ctx.shake(0.25);
      ctx.sfx('shoot');
      yield 0.55;
    }
    yield 0.6;
  }

  protected animate(dt: number) {
    if (this.state === 'fight') this.pos.y = this.home.y + Math.sin(this.t * 0.7) * 30;
    for (const leg of this.legs) {
      const { side, k } = leg.userData as { side: number; k: number };
      leg.rotation.x = Math.sin(this.t * 3 + k * 1.3) * 0.18 * side;
      leg.rotation.z = Math.cos(this.t * 3 + k * 1.3) * 0.12;
    }
    for (const c of this.claws) {
      c.arm.rotation.z = Math.sin(this.t * 1.4) * 0.08;
      c.finger.rotation.z += (Math.sin(this.t * 6) * 0.15 - c.finger.rotation.z) * Math.min(1, dt * 2);
    }
    this.shellMat.emissiveIntensity = Math.max(this.shellMat.emissiveIntensity, 1.6 + Math.sin(this.t * 3) * 0.6);
  }

  protected updateHitboxes() {
    const s = 1.25;
    this.hitboxes = [
      { x: this.pos.x, y: this.pos.y + 4 * s, r: 30 * s, mult: 1, harmful: true },
      { x: this.pos.x - 46 * s, y: this.pos.y + 2 * s, r: 11 * s, mult: 0.5, harmful: true },
    ];
  }
}
