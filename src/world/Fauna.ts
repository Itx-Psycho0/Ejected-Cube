import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
} from 'three';
import { fishGeometry, merge } from './geometry';
import { patchSwim } from './shaderPatches';
import { Random } from '../core/Random';
import type { ThemeDef } from '../themes/themes';
import type { Atmosphere } from './Atmosphere';
import type { QualityPreset } from '../core/Quality';

interface Flock {
  x: number;
  y: number;
  z: number;
  vx: number;
  size: number;
  color: Color;
  offsets: Float32Array;
}

const PER = 12;

function birdGeometry(): BufferGeometry {
  const body = new ConeGeometry(0.8, 5, 5);
  body.rotateZ(-Math.PI / 2);
  const wingL = new BoxGeometry(2.4, 0.15, 6);
  wingL.translate(0, 0, 3);
  const wingR = new BoxGeometry(2.4, 0.15, 6);
  wingR.translate(0, 0, -3);
  return merge([body, wingL, wingR]);
}

function droneGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [new BoxGeometry(4, 1.4, 4)];
  for (const [x, z] of [
    [2.6, 2.6],
    [-2.6, 2.6],
    [2.6, -2.6],
    [-2.6, -2.6],
  ]) {
    const r = new CylinderGeometry(1.6, 1.6, 0.2, 12);
    r.translate(x, 0.8, z);
    parts.push(r);
  }
  return merge(parts);
}

/** Ambient life per world: fish, birds or drones, plus the abyss whale. */
export class Fauna {
  private meshes: Record<'fish' | 'birds' | 'drones', InstancedMesh>;
  private active: InstancedMesh | null = null;
  private flocks: Flock[] = [];
  private giant: Mesh;
  private giantX = 900;
  private rnd = new Random(31337);
  private dummy = new Object3D();
  private colors: number[] = [0xffffff];
  private flockKind: ThemeDef['props']['flock'] = 'none';
  private showGiant = false;

  constructor(scene: Scene, atmo: Atmosphere, quality: QualityPreset) {
    const n = Math.max(2, Math.round(8 * quality.density));
    const fishMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.6 });
    patchSwim(fishMat, atmo.shared.uTime, 9, 0.02, 'fish');
    const birdMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    birdMat.onBeforeCompile = (s) => {
      s.uniforms.uTime = atmo.shared.uTime;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = 0.0;
        #ifdef USE_INSTANCING
          ph = instanceMatrix[3].x * 0.2 + instanceMatrix[3].y * 0.3;
        #endif
        transformed.y += sin(uTime * 9.0 + ph) * abs(position.z) * 0.45;`,
      );
    };
    birdMat.customProgramCacheKey = () => 'bird';
    const droneMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.5 });
    const mk = (g: BufferGeometry, m: MeshStandardMaterial) => {
      const im = new InstancedMesh(g, m, n * PER);
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.instanceColor = new InstancedBufferAttribute(new Float32Array(n * PER * 3), 3);
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
      return im;
    };
    this.meshes = { fish: mk(fishGeometry(6, 1.3), fishMat), birds: mk(birdGeometry(), birdMat), drones: mk(droneGeometry(), droneMat) };
    for (let i = 0; i < n; i++) this.flocks.push(this.makeFlock(true));

    const gMat = new MeshStandardMaterial({ color: 0x0a1a24, roughness: 0.9 });
    patchSwim(gMat, atmo.shared.uTime, 0.9, 0.0016, 'giant');
    this.giant = new Mesh(fishGeometry(160, 26), gMat);
    this.giant.position.set(this.giantX, 40, -620);
    this.giant.rotation.y = Math.PI;
    scene.add(this.giant);
  }

  private makeFlock(initial: boolean): Flock {
    const r = this.rnd;
    const offsets = new Float32Array(PER * 4);
    for (let i = 0; i < PER; i++) {
      offsets[i * 4] = r.range(-22, 22);
      offsets[i * 4 + 1] = r.range(-10, 10);
      offsets[i * 4 + 2] = r.range(-14, 14);
      offsets[i * 4 + 3] = r.next() * 10;
    }
    const left = r.chance(0.7);
    const sky = this.flockKind !== 'fish';
    return {
      x: initial ? r.range(-600, 600) : left ? r.range(500, 900) : r.range(-900, -500),
      y: sky ? r.range(30, 120) : r.range(-85, 70),
      z: r.range(-320, -90),
      vx: left ? -r.range(25, 60) : r.range(15, 35),
      size: r.range(0.7, 1.4),
      color: new Color(r.pick(this.colors)),
      offsets,
    };
  }

  setTheme(t: ThemeDef) {
    this.flockKind = t.props.flock;
    this.colors = t.props.flockColors;
    this.showGiant = t.props.giant;
    for (const m of Object.values(this.meshes)) m.count = 0;
    this.active = t.props.flock === 'none' ? null : this.meshes[t.props.flock];
    for (let i = 0; i < this.flocks.length; i++) this.flocks[i] = this.makeFlock(true);
  }

  update(dt: number, time: number, scrollSpeed: number) {
    const m = this.active;
    if (m) {
      const d = this.dummy;
      let idx = 0;
      for (let s = 0; s < this.flocks.length; s++) {
        let f = this.flocks[s];
        f.x += (f.vx - scrollSpeed * 0.6) * dt;
        if (f.x < -1000 || f.x > 1000) f = this.flocks[s] = this.makeFlock(false);
        const dir = f.vx < 0 ? Math.PI : 0;
        for (let i = 0; i < PER; i++) {
          const o = f.offsets;
          const ph = o[i * 4 + 3];
          d.position.set(f.x + o[i * 4] + Math.sin(time * 0.7 + ph) * 3, f.y + o[i * 4 + 1] + Math.sin(time * 1.3 + ph) * 2, f.z + o[i * 4 + 2]);
          d.rotation.set(0, dir + Math.sin(time + ph) * 0.15, Math.sin(time * 1.3 + ph) * 0.1);
          d.scale.setScalar(f.size);
          d.updateMatrix();
          m.setMatrixAt(idx, d.matrix);
          m.setColorAt(idx, f.color);
          idx++;
        }
      }
      m.count = idx;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.giant.visible = this.showGiant;
    this.giantX -= (18 + scrollSpeed * 0.15) * dt;
    if (this.giantX < -1100) this.giantX = 1300;
    this.giant.position.x = this.giantX;
    this.giant.position.y = 40 + Math.sin(time * 0.1) * 30;
  }
}
