import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { getTextures } from './textures';
import { limb, merge } from './geometry';
import { Random } from '../core/Random';

/**
 * Hadal Station Kestrel: the research base the game starts in. Habitat
 * modules with lit windows, a central node, truss legs and the launch tube
 * the escape capsule fires out of. During the intro it fails: lights
 * flicker, modules sag and explosions ripple across it.
 */
export class Station {
  readonly root = new Group();
  private modules: Group[] = [];
  private windowMat: MeshStandardMaterial;
  private alarmMat: MeshStandardMaterial;
  /** Where the capsule sits before launch, in world space. */
  readonly dock = new Vector3(-135, -42, 0);
  private t = 0;
  collapse = 0;
  readonly hotspots: Vector3[] = [];

  constructor() {
    const tex = getTextures();
    const hull = new MeshStandardMaterial({
      color: 0xb8c0c4,
      map: tex.rustColor,
      normalMap: tex.rustNormal,
      roughnessMap: tex.rustRough,
      metalness: 0.75,
      roughness: 1,
    });
    const dark = new MeshStandardMaterial({ color: 0x2a3034, metalness: 0.8, roughness: 0.5 });
    this.windowMat = new MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 3.2, toneMapped: false });
    this.alarmMat = new MeshStandardMaterial({ color: 0x000000, emissive: 0xff2030, emissiveIntensity: 0, toneMapped: false });

    const rnd = new Random(12);
    const addModule = (x: number, y: number, z: number, len: number, r: number, rotZ: number) => {
      const g = new Group();
      g.position.set(x, y, z);
      g.rotation.z = rotZ;
      const body = new Mesh(new CylinderGeometry(r, r, len, 28, 1), hull);
      body.rotation.z = Math.PI / 2;
      g.add(body);
      for (const s of [-1, 1]) {
        const cap = new Mesh(new SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hull);
        cap.rotation.z = (-s * Math.PI) / 2;
        cap.position.x = (s * len) / 2;
        g.add(cap);
        const ring = new Mesh(new TorusGeometry(r * 1.02, 0.9, 8, 28), dark);
        ring.rotation.y = Math.PI / 2;
        ring.position.x = (s * len) / 2 - s * 2;
        g.add(ring);
      }
      // Ribs along the module.
      for (let i = 1; i < 5; i++) {
        const rib = new Mesh(new TorusGeometry(r * 1.01, 0.5, 6, 28), dark);
        rib.rotation.y = Math.PI / 2;
        rib.position.x = -len / 2 + (i * len) / 5;
        g.add(rib);
      }
      // Lit portholes on the camera-facing side.
      const n = Math.floor(len / 9);
      const win = new InstancedMesh(new CylinderGeometry(1.5, 1.5, 0.6, 12), this.windowMat, n);
      const d = new Object3D();
      for (let i = 0; i < n; i++) {
        d.position.set(-len / 2 + 6 + i * 9, rnd.range(-1, 2), r * 0.98);
        d.rotation.set(Math.PI / 2, 0, 0);
        d.updateMatrix();
        win.setMatrixAt(i, d.matrix);
      }
      g.add(win);
      const alarm = new Mesh(new SphereGeometry(1.6, 10, 8), this.alarmMat);
      alarm.position.set(len * 0.3, r + 1, 0);
      g.add(alarm);
      this.root.add(g);
      this.modules.push(g);
      this.hotspots.push(new Vector3(x, y, z));
      return g;
    };

    addModule(-250, -30, -60, 120, 14, 0.05);
    addModule(-300, 30, -120, 90, 12, -0.08);
    addModule(-210, -70, -150, 80, 10, 0.12);

    // Central sphere node with a crown of antennae.
    const node = new Mesh(new SphereGeometry(26, 32, 20), hull);
    node.position.set(-190, -20, -40);
    this.root.add(node);
    this.hotspots.push(node.position.clone());
    const antenna = merge([
      limb(new Vector3(-190, 4, -40), new Vector3(-196, 60, -40), 1.2, 0.5),
      limb(new Vector3(-180, 2, -40), new Vector3(-170, 44, -50), 0.9, 0.4),
    ]);
    this.root.add(new Mesh(antenna, dark));

    // Truss legs down to the seabed.
    const truss = [];
    for (const [x, z] of [
      [-280, -40],
      [-220, -60],
      [-170, -20],
      [-320, -110],
    ]) {
      truss.push(limb(new Vector3(x, -40, z), new Vector3(x - 8, -150, z + 6), 2.2, 2.6, 8));
      truss.push(limb(new Vector3(x - 4, -95, z + 3), new Vector3(x + 22, -60, z), 1, 1, 6));
    }
    this.root.add(new Mesh(merge(truss), dark));

    // Launch tube aimed right, with a flared mouth where the capsule sits.
    const tube = new Mesh(new CylinderGeometry(14, 14, 50, 24, 1, true), dark);
    tube.material.side = 2;
    tube.rotation.z = Math.PI / 2;
    tube.position.set(this.dock.x - 18, this.dock.y, 0);
    const mouth = new Mesh(new TorusGeometry(14.5, 2.4, 10, 28), hull);
    mouth.rotation.y = Math.PI / 2;
    mouth.position.set(this.dock.x + 7, this.dock.y, 0);
    const hatch = new Mesh(new BoxGeometry(2, 30, 30), dark);
    hatch.position.set(this.dock.x + 10, this.dock.y + 22, 0);
    hatch.rotation.z = -0.9;
    this.root.add(tube, mouth, hatch);
    // Launch-tube guide lights.
    const guides = new InstancedMesh(new SphereGeometry(0.9, 8, 6), this.alarmMat, 8);
    const d = new Object3D();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      d.position.set(this.dock.x + 8, this.dock.y + Math.sin(a) * 15.5, Math.cos(a) * 15.5);
      d.updateMatrix();
      guides.setMatrixAt(i, d.matrix);
    }
    this.root.add(guides);

    this.root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  /** `alarm` 0..1 drives flashing alarms and flickering windows. */
  update(dt: number, alarm: number) {
    this.t += dt;
    const flick = alarm > 0 ? (Math.random() < 0.15 * alarm ? 0.2 : 1) : 1;
    this.windowMat.emissiveIntensity = 3.2 * flick * (1 - this.collapse * 0.7);
    this.alarmMat.emissiveIntensity = alarm > 0 ? (Math.sin(this.t * 9) > 0 ? 8 : 0.4) : 2 + Math.sin(this.t * 2) * 1.5;
    this.modules.forEach((m, i) => {
      m.rotation.x = Math.sin(this.t * 0.7 + i) * 0.01 * alarm;
      m.position.y -= this.collapse * dt * (6 + i * 3);
      m.rotation.z += this.collapse * dt * 0.02 * (i % 2 ? 1 : -1);
    });
  }

  reset() {
    this.collapse = 0;
    this.root.position.set(0, 0, 0);
    this.root.visible = true;
    const ys = [-30, 30, -70];
    const rz = [0.05, -0.08, 0.12];
    this.modules.forEach((m, i) => {
      m.position.y = ys[i];
      m.rotation.set(0, 0, rz[i]);
    });
  }
}
