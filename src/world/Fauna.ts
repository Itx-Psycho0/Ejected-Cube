import { Color, DynamicDrawUsage, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Scene, InstancedBufferAttribute } from 'three';
import { fishGeometry } from './geometry';
import { patchSwim } from './shaderPatches';
import { Random } from '../core/Random';
import type { ZoneDef } from '../game/zones';
import type { Atmosphere } from './Atmosphere';
import type { QualityPreset } from '../core/Quality';
import { damp } from '../core/math';

interface School {
  x: number;
  y: number;
  z: number;
  vx: number;
  phase: number;
  size: number;
  color: Color;
  offsets: Float32Array;
}

const SCHOOL_COLORS = [0xc8d6e5, 0xffd166, 0x9ad1ff, 0xf6a6b2, 0xa8e6cf];
const PER_SCHOOL = 14;

/**
 * Ambient life that sells the setting but never touches gameplay:
 * fish schools in the upper zones and a whale-sized silhouette
 * cruising far in the background.
 */
export class Fauna {
  private fish: InstancedMesh;
  private schools: School[] = [];
  private giant: Mesh;
  private giantX = 900;
  private rnd = new Random(31337);
  private dummy = new Object3D();
  private amount = 0;
  private targetAmount = 0;

  constructor(scene: Scene, atmo: Atmosphere, quality: QualityPreset) {
    const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.6 });
    patchSwim(mat, atmo.shared.uTime, 9, 0.02, 'fish');
    const nSchools = Math.max(2, Math.round(9 * quality.density));
    this.fish = new InstancedMesh(fishGeometry(6, 1.3), mat, nSchools * PER_SCHOOL);
    this.fish.instanceMatrix.setUsage(DynamicDrawUsage);
    this.fish.instanceColor = new InstancedBufferAttribute(new Float32Array(nSchools * PER_SCHOOL * 3), 3);
    this.fish.frustumCulled = false;
    scene.add(this.fish);
    for (let i = 0; i < nSchools; i++) this.schools.push(this.makeSchool(true));

    const gMat = new MeshStandardMaterial({ color: 0x0a1a24, roughness: 0.9 });
    patchSwim(gMat, atmo.shared.uTime, 0.9, 0.0016, 'giant');
    this.giant = new Mesh(fishGeometry(160, 26), gMat);
    this.giant.position.set(this.giantX, 40, -620);
    this.giant.rotation.y = Math.PI;
    scene.add(this.giant);
  }

  private makeSchool(initial: boolean): School {
    const r = this.rnd;
    const offsets = new Float32Array(PER_SCHOOL * 4);
    for (let i = 0; i < PER_SCHOOL; i++) {
      offsets[i * 4] = r.range(-22, 22);
      offsets[i * 4 + 1] = r.range(-10, 10);
      offsets[i * 4 + 2] = r.range(-14, 14);
      offsets[i * 4 + 3] = r.next() * 10;
    }
    const goingLeft = r.chance(0.7);
    return {
      x: initial ? r.range(-600, 600) : goingLeft ? r.range(500, 900) : r.range(-900, -500),
      y: r.range(-85, 70),
      z: r.range(-320, -70),
      vx: goingLeft ? -r.range(25, 60) : r.range(15, 35),
      phase: r.next() * 10,
      size: r.range(0.7, 1.4),
      color: new Color(r.pick(SCHOOL_COLORS)),
      offsets,
    };
  }

  setZone(z: ZoneDef) {
    this.targetAmount = z.fish;
  }

  update(dt: number, time: number, scrollSpeed: number) {
    this.amount = damp(this.amount, this.targetAmount, 0.5, dt);
    const visibleSchools = Math.round(this.schools.length * this.amount);
    const d = this.dummy;
    let idx = 0;
    for (let s = 0; s < this.schools.length; s++) {
      let sc = this.schools[s];
      sc.x += (sc.vx - scrollSpeed * 0.6) * dt;
      if (sc.x < -1000 || sc.x > 1000) sc = this.schools[s] = this.makeSchool(false);
      if (s >= visibleSchools) continue;
      const dir = sc.vx < 0 ? Math.PI : 0;
      for (let i = 0; i < PER_SCHOOL; i++) {
        const o = sc.offsets;
        const ph = o[i * 4 + 3];
        d.position.set(
          sc.x + o[i * 4] + Math.sin(time * 0.7 + ph) * 3,
          sc.y + o[i * 4 + 1] + Math.sin(time * 1.3 + ph) * 2,
          sc.z + o[i * 4 + 2],
        );
        d.rotation.set(0, dir + Math.sin(time + ph) * 0.15, Math.sin(time * 1.3 + ph) * 0.1);
        d.scale.setScalar(sc.size);
        d.updateMatrix();
        this.fish.setMatrixAt(idx, d.matrix);
        this.fish.setColorAt(idx, sc.color);
        idx++;
      }
    }
    this.fish.count = idx;
    this.fish.instanceMatrix.needsUpdate = true;
    if (this.fish.instanceColor) this.fish.instanceColor.needsUpdate = true;

    this.giant.visible = this.amount > 0.3;
    this.giantX -= (18 + scrollSpeed * 0.15) * dt;
    if (this.giantX < -1100) this.giantX = 1300;
    this.giant.position.x = this.giantX;
    this.giant.position.y = 40 + Math.sin(time * 0.1) * 30;
  }
}
