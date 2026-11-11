import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  BoxGeometry,
  IUniform,
} from 'three';
import { fishGeometry, limb, lumpySphere, merge } from '../world/geometry';
import { getTextures } from '../world/textures';
import { patchSwim } from '../world/shaderPatches';
import { Random } from '../core/Random';

/**
 * Model factories for the six enemy species. Geometry is built once and
 * shared; each instance clones only the materials it animates.
 */

export interface EnemyVisual {
  root: Group;
  /** Materials whose emissive reacts to hits. */
  glowMats: MeshStandardMaterial[];
  baseEmissive: number[];
  parts: Record<string, Mesh | Group>;
}

/** One enemy slot with a body for each world family; `use` picks which one shows. */
export class FamilyVisual implements EnemyVisual {
  readonly root = new Group();
  glowMats: MeshStandardMaterial[] = [];
  baseEmissive: number[] = [];
  parts: Record<string, Mesh | Group> = {};
  constructor(private bodies: Record<'water' | 'sky' | 'space', EnemyVisual>) {
    for (const b of Object.values(bodies)) this.root.add(b.root);
    this.use('water');
  }
  use(family: 'water' | 'sky' | 'space') {
    for (const [k, b] of Object.entries(this.bodies)) b.root.visible = k === family;
    const b = this.bodies[family];
    this.glowMats = b.glowMats;
    this.baseEmissive = b.baseEmissive;
    this.parts = b.parts;
  }
}

let shared: ReturnType<typeof buildShared> | null = null;

function buildShared() {
  const tex = getTextures();
  const rnd = new Random(808);

  // --- urchin ---
  const spikes: BufferGeometry[] = [];
  for (let i = 0; i < 46; i++) {
    const dir = new Vector3(rnd.range(-1, 1), rnd.range(-1, 1), rnd.range(-1, 1)).normalize();
    spikes.push(limb(dir.clone().multiplyScalar(4), dir.clone().multiplyScalar(rnd.range(10, 15)), 0.6, 0.04, 5));
  }
  const urchinCore = lumpySphere(5.2, 3, 0.12, 0.8, 3);
  const urchinSpikes = merge(spikes);

  // --- jellyfish ---
  const bellProfile: Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = t * Math.PI * 0.55;
    bellProfile.push(new Vector2(Math.sin(a) * 9 * (1 + 0.12 * Math.sin(t * 18)), Math.cos(a) * 7));
  }
  for (let i = 8; i >= 0; i--) {
    const t = i / 8;
    bellProfile.push(new Vector2(Math.sin(t * Math.PI * 0.5) * 7.6, Math.cos(t * Math.PI * 0.5) * 5 - 0.6));
  }
  const jellyBell = new LatheGeometry(bellProfile, 28);
  const tentacle = new CylinderGeometry(0.22, 0.05, 30, 4, 20, true);
  tentacle.translate(0, -15, 0);
  const oralArm = new CylinderGeometry(0.9, 0.2, 18, 6, 14, true);
  oralArm.translate(0, -9, 0);

  // --- naval mine ---
  const mineBody = new SphereGeometry(7, 24, 16);
  const horns: BufferGeometry[] = [];
  const hornDirs = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0.7, 0.7, 0],
    [-0.7, 0.7, 0],
    [0, 0.7, 0.7],
    [0, 0.7, -0.7],
  ];
  for (const [x, y, z] of hornDirs) {
    const d = new Vector3(x, y, z).normalize();
    horns.push(limb(d.clone().multiplyScalar(6.3), d.clone().multiplyScalar(9.6), 0.9, 0.7, 8));
    const cap = new SphereGeometry(0.75, 8, 6);
    const p = d.clone().multiplyScalar(9.6);
    cap.translate(p.x, p.y, p.z);
    horns.push(cap);
  }
  const band = new TorusGeometry(7.05, 0.55, 8, 32);
  band.rotateX(Math.PI / 2);
  horns.push(band);
  const mineHorns = merge(horns);
  const chain = new CylinderGeometry(0.9, 0.9, 1, 6, 1, true);
  chain.translate(0, -0.5, 0);

  // --- lanternfish ---
  const lanternBody = fishGeometry(11, 2.4);
  const photophores: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const s = new SphereGeometry(0.42, 6, 4);
    s.translate(4.2 - i * 1.1, -1.5 + Math.sin(i * 0.6) * 0.2, 0.9);
    photophores.push(s);
  }
  const lure = new SphereGeometry(0.9, 8, 6);
  lure.translate(6.4, 1.2, 0.6);
  photophores.push(lure);
  const lanternLights = merge(photophores);
  const eye = new SphereGeometry(0.95, 10, 8);
  eye.translate(4.4, 0.5, 0.75);

  // --- pufferfish ---
  const pufferBody = lumpySphere(6, 3, 0.06, 1.2, 9);
  pufferBody.scale(1.15, 1, 1);
  const pSpikes: BufferGeometry[] = [];
  for (let i = 0; i < 60; i++) {
    const d = new Vector3(rnd.range(-1, 1), rnd.range(-1, 1), rnd.range(-1, 1)).normalize();
    pSpikes.push(limb(d.clone().multiplyScalar(5.6), d.clone().multiplyScalar(8), 0.35, 0.02, 4));
  }
  const pufferSpikes = merge(pSpikes);
  const fin = new ConeGeometry(2.4, 4, 4);
  fin.rotateZ(Math.PI / 2);
  fin.scale(1, 1, 0.2);
  fin.translate(-8, 0, 0);

  // --- station debris ---
  const debrisParts: BufferGeometry[] = [];
  const beam = new BoxGeometry(26, 2.2, 2.2);
  beam.rotateZ(0.3);
  debrisParts.push(beam);
  const plate = new BoxGeometry(14, 10, 1.2);
  plate.rotateY(0.4);
  plate.translate(2, 2, 0);
  debrisParts.push(plate);
  const pipe = new CylinderGeometry(1.8, 1.8, 18, 10, 1, true);
  pipe.rotateZ(1.2);
  pipe.translate(-3, -3, 2);
  debrisParts.push(pipe);
  const tank = new CylinderGeometry(4, 4, 8, 14);
  tank.rotateX(Math.PI / 2);
  tank.translate(-6, 4, -1);
  debrisParts.push(tank);
  const debris = merge(debrisParts);

  const rust = new MeshStandardMaterial({
    map: tex.rustColor,
    normalMap: tex.rustNormal,
    roughnessMap: tex.rustRough,
    metalness: 0.7,
    roughness: 1,
  });

  return {
    urchinCore,
    urchinSpikes,
    jellyBell,
    tentacle,
    oralArm,
    mineBody,
    mineHorns,
    chain,
    lanternBody,
    lanternLights,
    eye,
    pufferBody,
    pufferSpikes,
    fin,
    debris,
    rust,
    eyeMat: new MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.05, metalness: 0.3 }),
    urchinSpikeMat: new MeshStandardMaterial({ color: 0x2a1030, roughness: 0.45, metalness: 0.1, emissive: 0x3a1050, emissiveIntensity: 0.3 }),
    pufferSpikeMat: new MeshStandardMaterial({ color: 0xe8d9a8, roughness: 0.6 }),
    scales: tex.scalesNormal,
    chainTex: tex.chainAlpha,
  };
}

function S() {
  return (shared ??= buildShared());
}

const glow = (m: MeshStandardMaterial): [MeshStandardMaterial, number] => [m, m.emissiveIntensity];

function visual(root: Group, glowing: [MeshStandardMaterial, number][], parts: Record<string, Mesh | Group> = {}): EnemyVisual {
  root.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  return { root, glowMats: glowing.map((g) => g[0]), baseEmissive: glowing.map((g) => g[1]), parts };
}

export function makeUrchin(): EnemyVisual {
  const s = S();
  const root = new Group();
  const coreMat = new MeshStandardMaterial({ color: 0x3b1a4a, roughness: 0.6, normalMap: s.scales, emissive: 0x7a30ff, emissiveIntensity: 0.12 });
  root.add(new Mesh(s.urchinCore, coreMat), new Mesh(s.urchinSpikes, s.urchinSpikeMat));
  return visual(root, [glow(coreMat)]);
}

export function makeJelly(uTime: IUniform<number>, accent: Color): EnemyVisual {
  const s = S();
  const root = new Group();
  const bellMat = new MeshPhysicalMaterial({
    color: accent.clone().lerp(new Color(0xffffff), 0.5),
    emissive: accent,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    metalness: 0,
    transparent: true,
    opacity: 0.55,
    side: DoubleSide,
    depthWrite: false,
    clearcoat: 1,
  });
  const bell = new Mesh(s.jellyBell, bellMat);
  root.add(bell);
  const core = new Mesh(
    new SphereGeometry(3.2, 12, 8),
    new MeshStandardMaterial({ color: 0x000000, emissive: accent, emissiveIntensity: 2.5, toneMapped: false }),
  );
  core.position.y = 1.5;
  root.add(core);
  const phase = { value: Math.random() * 10 };
  const dangle = (mat: Material, amt: number, key: string) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.uniforms.uPhase = phase;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uPhase;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float dn = max(0.0, -position.y);
          transformed.x += sin(uTime * 2.2 + uPhase - dn * 0.18) * dn * ${amt.toFixed(3)} + dn * dn * 0.012;
          transformed.z += cos(uTime * 1.7 + uPhase - dn * 0.15) * dn * ${(amt * 0.6).toFixed(3)};`,
        );
    };
    mat.customProgramCacheKey = () => key;
  };
  const tentMat = new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.2, transparent: true, opacity: 0.7, depthWrite: false });
  dangle(tentMat, 0.12, 'jelly-tent');
  const armMat = new MeshStandardMaterial({ color: 0xffd8f0, emissive: accent, emissiveIntensity: 0.6, transparent: true, opacity: 0.8, side: DoubleSide, depthWrite: false });
  dangle(armMat, 0.08, 'jelly-arm');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const t = new Mesh(s.tentacle, tentMat);
    t.position.set(Math.cos(a) * 7.4, 0, Math.sin(a) * 7.4);
    t.scale.y = 0.7 + (i % 3) * 0.2;
    root.add(t);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const arm = new Mesh(s.oralArm, armMat);
    arm.position.set(Math.cos(a) * 2, 0, Math.sin(a) * 2);
    root.add(arm);
  }
  return visual(root, [glow(bellMat as unknown as MeshStandardMaterial), glow(core.material)], { bell });
}

export function makeMine(): EnemyVisual {
  const s = S();
  const root = new Group();
  const body = new Mesh(s.mineBody, s.rust);
  const horns = new Mesh(s.mineHorns, s.rust);
  const lightMat = new MeshStandardMaterial({ color: 0x000000, emissive: 0xff1a1a, emissiveIntensity: 3, toneMapped: false });
  const light = new Mesh(new SphereGeometry(1.1, 10, 8), lightMat);
  light.position.set(0, 7.2, 0);
  const chainTex = s.chainTex.clone();
  chainTex.repeat.set(1, 20);
  const chainMat = new MeshStandardMaterial({ color: 0x6a6460, metalness: 0.8, roughness: 0.5, alphaMap: chainTex, alphaTest: 0.5, side: DoubleSide });
  const chain = new Mesh(s.chain, chainMat);
  chain.position.y = -7;
  root.add(body, horns, light, chain);
  const v = visual(root, [glow(lightMat)], { chain, light });
  chain.castShadow = false;
  return v;
}

export function makeLanternfish(uTime: IUniform<number>): EnemyVisual {
  const s = S();
  const root = new Group();
  const bodyMat = new MeshStandardMaterial({ color: 0x1a2430, metalness: 0.75, roughness: 0.3, normalMap: s.scales, emissive: 0x0a3a40, emissiveIntensity: 0.15 });
  patchSwim(bodyMat, uTime, 14, 0.012, 'lantern');
  const lightMat = new MeshStandardMaterial({ color: 0x000000, emissive: 0x7ffcff, emissiveIntensity: 4, toneMapped: false });
  const body = new Mesh(s.lanternBody, bodyMat);
  const lights = new Mesh(s.lanternLights, lightMat);
  const eye = new Mesh(s.eye, s.eyeMat);
  root.add(body, lights, eye);
  return visual(root, [glow(bodyMat), glow(lightMat)]);
}

export function makePuffer(): EnemyVisual {
  const s = S();
  const root = new Group();
  const bodyMat = new MeshStandardMaterial({ color: 0xc9a65a, roughness: 0.55, normalMap: s.scales, emissive: 0x402000, emissiveIntensity: 0.15 });
  const body = new Mesh(s.pufferBody, bodyMat);
  const spikes = new Mesh(s.pufferSpikes, s.pufferSpikeMat);
  const eye = new Mesh(new SphereGeometry(1.3, 10, 8), s.eyeMat);
  eye.position.set(5, 1.5, 3.6);
  const fin = new Mesh(s.fin, bodyMat);
  root.add(body, spikes, eye, fin);
  return visual(root, [glow(bodyMat)], { spikes, fin });
}

export function makeDebris(): EnemyVisual {
  const s = S();
  const root = new Group();
  const hull = new Mesh(s.debris, s.rust);
  const lampMat = new MeshStandardMaterial({ color: 0x000000, emissive: 0xffaa22, emissiveIntensity: 3, toneMapped: false });
  const lamp = new Mesh(new SphereGeometry(1, 8, 6), lampMat);
  lamp.position.set(6, 6, 1);
  root.add(hull, lamp);
  return visual(root, [glow(lampMat)]);
}
