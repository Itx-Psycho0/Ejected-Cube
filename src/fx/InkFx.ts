import { Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Scene, SphereGeometry, Vector3 } from 'three';
import { lumpySphere } from '../world/geometry';
import type { Particles } from './Particles';
import type { HitCircle } from '../entities/bosses';

/** Glossy black ink: the Blot's material, shared by every corrupted thing. */
export const INK = new MeshPhysicalMaterial({
  color: 0x07070b,
  roughness: 0.14,
  metalness: 0.1,
  clearcoat: 1,
  clearcoatRoughness: 0.08,
  emissive: 0x2a0a3a,
  emissiveIntensity: 0.35,
});

const blobGeo = lumpySphere(1, 2, 0.32, 1.6, 21);

/**
 * The Blot's mark on a boss: glossy ink growths stuck to its body and a
 * steady drip. `strength` grows with each boss of the journey, so the ink
 * visibly spreads as the story closes in.
 */
export class InkCorruption {
  private blobs: Mesh[] = [];
  private acc = 0;
  private v = new Vector3();

  constructor(
    root: Object3D,
    private strength: number,
    radius: number,
  ) {
    const n = Math.round(3 + strength * 9);
    for (let i = 0; i < n; i++) {
      const m = new Mesh(blobGeo, INK);
      const a = i * 2.39996;
      const y = (i / n) * 2 - 1;
      const rr = Math.sqrt(1 - y * y);
      // Divide by the root's own scale so blobs sit on the surface of scaled bosses.
      const s = root.scale.x || 1;
      m.position.set((Math.cos(a) * rr * radius * 0.85) / s, (y * radius * 0.7) / s, (Math.sin(a) * rr * radius * 0.6 + radius * 0.3) / s);
      m.scale.setScalar(((radius * (0.12 + Math.random() * 0.12)) / s) * (0.7 + strength * 0.6));
      m.userData.phase = Math.random() * 10;
      root.add(m);
      this.blobs.push(m);
    }
  }

  update(dt: number, time: number, hitboxes: HitCircle[], particles: Particles, phase2: boolean) {
    for (const b of this.blobs) {
      const k = 1 + Math.sin(time * 3 + b.userData.phase) * 0.12;
      b.scale.y = b.scale.x * k;
    }
    this.acc += dt * (4 + this.strength * 16) * (phase2 ? 2 : 1);
    while (this.acc >= 1 && hitboxes.length) {
      this.acc -= 1;
      const h = hitboxes[Math.floor(Math.random() * Math.min(3, hitboxes.length))];
      this.v.set(h.x + (Math.random() - 0.5) * h.r, h.y - h.r * 0.4, 4);
      particles.burst(this.v, { count: 1, color: 0x0a0a10, speed: 8, size: 6 + this.strength * 6, life: 1.4, drag: 1, gravity: -70, smoke: true });
    }
  }

  dispose() {
    for (const b of this.blobs) b.removeFromParent();
  }
}

/**
 * The Blot watching: a huge eye opens far behind the action, follows the
 * player for a moment, then sinks back into its ink.
 */
export class BlotEye {
  readonly root = new Group();
  private lid = 0;
  private time = 0;
  private iris: Group;
  active = false;
  private dur = 0;

  constructor(scene: Scene) {
    const body = new Mesh(lumpySphere(1, 3, 0.18, 1.2, 4), INK);
    body.scale.set(150, 95, 40);
    const sclera = new Mesh(new SphereGeometry(1, 32, 16), new MeshStandardMaterial({ color: 0xf2ecdf, roughness: 0.3, emissive: 0x403830, emissiveIntensity: 0.6 }));
    sclera.scale.set(95, 52, 24);
    sclera.position.z = 22;
    this.iris = new Group();
    const iris = new Mesh(new SphereGeometry(30, 24, 16), new MeshStandardMaterial({ color: 0xc8352c, emissive: 0xc8352c, emissiveIntensity: 1.2, roughness: 0.2 }));
    iris.scale.z = 0.4;
    const pupil = new Mesh(new SphereGeometry(15, 20, 12), new MeshStandardMaterial({ color: 0x000000, roughness: 0.05 }));
    pupil.position.z = 8;
    pupil.scale.set(0.6, 1, 0.4);
    this.iris.add(iris, pupil);
    this.iris.position.z = 40;
    this.root.add(body, sclera, this.iris);
    this.root.position.set(80, 70, -620);
    this.root.visible = false;
    scene.add(this.root);
  }

  open(x: number, seconds = 4.5) {
    this.active = true;
    this.root.visible = true;
    this.root.position.x = x;
    this.time = 0;
    this.dur = seconds;
  }

  update(dt: number, px: number, py: number) {
    if (!this.active) return;
    this.time += dt;
    const t = this.time;
    const opening = Math.min(1, t / 0.9);
    const closing = Math.max(0, 1 - (t - (this.dur - 0.8)) / 0.8);
    this.lid = Math.min(opening, closing);
    this.root.scale.set(1, Math.max(0.02, this.lid), 1);
    this.root.position.x -= dt * 6;
    // The iris tracks the player.
    this.iris.position.x += ((px - this.root.position.x) * 0.12 - this.iris.position.x) * Math.min(1, dt * 3);
    this.iris.position.y += ((py - this.root.position.y) * 0.12 - this.iris.position.y) * Math.min(1, dt * 3);
    this.iris.position.x = Math.max(-55, Math.min(55, this.iris.position.x));
    this.iris.position.y = Math.max(-24, Math.min(24, this.iris.position.y));
    if (t >= this.dur) {
      this.active = false;
      this.root.visible = false;
    }
  }

  hide() {
    this.active = false;
    this.root.visible = false;
  }
}
