import { AdditiveBlending, Color, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, Scene, Vector2 } from 'three';

/**
 * Thin streaks rushing past between the camera and the playfield. Their
 * length and opacity follow the scroll speed, so faster levels feel faster,
 * and a boost (ink surge, drop) stretches them further.
 */
export class SpeedLines {
  private mesh: InstancedMesh;
  private mat: MeshBasicMaterial;
  private items: { x: number; y: number; z: number; v: number }[] = [];
  private dummy = new Object3D();
  private opacity = 0;
  /** Extra stretch on top of the scroll speed (0..1), decays by itself. */
  boost = 0;

  constructor(scene: Scene, count: number) {
    const geo = new PlaneGeometry(1, 0.2);
    geo.translate(0.5, 0, 0);
    this.mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    this.mesh = new InstancedMesh(geo, this.mat, count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    for (let i = 0; i < count; i++) this.items.push({ x: (Math.random() * 2 - 1) * 400, y: 0, z: 0, v: 0.7 + Math.random() * 0.6 });
    for (const it of this.items) this.respawn(it, new Vector2(300, 170), true);
    scene.add(this.mesh);
  }

  private respawn(it: { x: number; y: number; z: number; v: number }, b: Vector2, anywhere = false) {
    it.z = -40 + Math.random() * 150;
    // Closer streaks see a smaller slice of the world: keep them inside the view.
    const k = (230 - it.z) / 230;
    it.x = anywhere ? (Math.random() * 2 - 1) * b.x * k * 1.2 : b.x * k * 1.25 + Math.random() * 120;
    it.y = (Math.random() * 2 - 1) * b.y * k;
    it.v = 0.7 + Math.random() * 0.6;
  }

  setColor(hex: number) {
    this.mat.color.copy(new Color(hex)).lerp(new Color(0xffffff), 0.5);
  }

  update(dt: number, scroll: number, bounds: Vector2) {
    this.boost = Math.max(0, this.boost - dt * 0.6);
    const speed = scroll * (2.6 + this.boost * 2.5);
    const target = Math.min(0.17, Math.max(0, (scroll - 100) / 420)) + this.boost * 0.12;
    this.opacity += (target - this.opacity) * Math.min(1, dt * 3);
    this.mat.opacity = this.opacity;
    this.mesh.visible = this.opacity > 0.01;
    if (!this.mesh.visible) return;
    const d = this.dummy;
    const len = 20 + speed * 0.12;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      it.x -= speed * it.v * dt;
      const k = (230 - it.z) / 230;
      if (it.x < -bounds.x * k * 1.3 - len) this.respawn(it, bounds);
      d.position.set(it.x, it.y, it.z);
      d.scale.set(len * it.v, 1 + (1 - k) * 0.6, 1);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
