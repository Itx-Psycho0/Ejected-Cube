import { DynamicDrawUsage, InstancedMesh, MeshStandardMaterial, Object3D, Scene } from 'three';
import { lumpySphere } from './geometry';
import { Random } from '../core/Random';
import type { ThemeDef } from '../themes/themes';

const PUFFS = 6;
const MAX = 16;

/** Background cloud banks: soft cumulus, or flat cut-outs for paper worlds. */
export class Clouds {
  private mesh: InstancedMesh;
  private mat: MeshStandardMaterial;
  private clouds: { x: number; y: number; z: number; s: number; speed: number; offsets: number[] }[] = [];
  private rnd = new Random(77);
  private dummy = new Object3D();
  private flat = false;
  private count = 0;

  constructor(scene: Scene) {
    this.mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true });
    this.mesh = new InstancedMesh(lumpySphere(1, 2, 0.15, 1.5, 3), this.mat, MAX * PUFFS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    for (let i = 0; i < MAX; i++) {
      const offsets: number[] = [];
      for (let p = 0; p < PUFFS; p++) offsets.push(this.rnd.range(-1.6, 1.6), this.rnd.range(-0.2, 0.5), this.rnd.range(-0.4, 0.4), this.rnd.range(0.55, 1.1));
      this.clouds.push({ x: this.rnd.range(-900, 900), y: 0, z: this.rnd.range(-520, -260), s: this.rnd.range(18, 36), speed: this.rnd.range(0.1, 0.3), offsets });
    }
  }

  setTheme(t: ThemeDef) {
    const c = t.props.clouds;
    this.count = Math.min(MAX, c.count);
    this.flat = c.flat;
    this.mat.color.setHex(c.color || 0xffffff);
    this.mat.opacity = c.opacity;
    for (const cl of this.clouds) cl.y = c.height + this.rnd.range(-25, 45);
  }

  update(dt: number, scroll: number) {
    let n = 0;
    const d = this.dummy;
    for (let i = 0; i < this.count; i++) {
      const cl = this.clouds[i];
      cl.x -= (scroll * cl.speed + 4) * dt;
      if (cl.x < -1000) cl.x += 2000;
      for (let p = 0; p < PUFFS; p++) {
        const o = cl.offsets;
        d.position.set(cl.x + o[p * 4] * cl.s, cl.y + o[p * 4 + 1] * cl.s, cl.z + o[p * 4 + 2] * cl.s);
        const r = cl.s * o[p * 4 + 3];
        d.scale.set(r, r * 0.7, this.flat ? r * 0.08 : r * 0.8);
        d.rotation.set(0, 0, 0);
        d.updateMatrix();
        this.mesh.setMatrixAt(n++, d.matrix);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
