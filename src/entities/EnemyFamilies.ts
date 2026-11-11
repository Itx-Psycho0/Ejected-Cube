import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, OctahedronGeometry, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { limb, lumpySphere, merge } from '../world/geometry';
import type { EnemyVisual } from './EnemyModels';
import type { EnemyKind } from './Enemies';

/**
 * Sky and space looks for the six enemy roles. The behaviours are shared
 * with the sea creatures; only the bodies change with the world:
 *
 *   role         water         sky                space
 *   urchin       sea urchin    storm puff         spiked mine
 *   jelly        jellyfish     hot-air balloon    saucer drone
 *   mine         naval mine    barrage balloon    tether beacon
 *   lanternfish  lanternfish   dart               seeker
 *   puffer       pufferfish    pop balloon        reactor pod
 *   debris       wreckage      hailstone          asteroid
 */

const std = (color: number, o: Partial<{ rough: number; metal: number; emissive: number; ei: number; unlit: boolean }> = {}) =>
  new MeshStandardMaterial({
    color,
    roughness: o.rough ?? 0.7,
    metalness: o.metal ?? 0,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.ei ?? 0,
    toneMapped: !o.unlit,
  });

const glowMat = (color: number, ei = 3) => std(0x000000, { emissive: color, ei, unlit: true });

let geo: ReturnType<typeof buildGeo> | null = null;
function buildGeo() {
  const cloud = merge(
    [
      [0, 0, 0, 6],
      [5, -1, 1, 4.4],
      [-5, -0.5, -1, 4.8],
      [1, 3, 0, 4],
    ].map(([x, y, z, r]) => lumpySphere(r, 2, 0.12, 0.6, x).translate(x, y, z)),
  );
  const bolt = merge([
    limb(new Vector3(0, -3, 0), new Vector3(-2.4, -8, 0), 0.9, 0.7, 4),
    limb(new Vector3(-2.4, -8, 0), new Vector3(1, -9, 0), 0.7, 0.6, 4),
    limb(new Vector3(1, -9, 0), new Vector3(-1.4, -15, 0), 0.6, 0.05, 4),
  ]);
  const envelope = new SphereGeometry(8, 20, 14);
  envelope.scale(1, 1.2, 1);
  const stripes = merge([0, 1, 2, 3].map((i) => new TorusGeometry(7.6 - Math.abs(i - 1.5) * 1.6, 0.5, 6, 20).rotateX(Math.PI / 2).translate(0, (i - 1.5) * 4, 0)));
  const basket = merge([
    new BoxGeometry(3.6, 3, 3.6).translate(0, -15, 0),
    limb(new Vector3(-1.6, -13.5, 1.6), new Vector3(-4, -7, 3), 0.15, 0.15, 4),
    limb(new Vector3(1.6, -13.5, -1.6), new Vector3(4, -7, -3), 0.15, 0.15, 4),
    limb(new Vector3(1.6, -13.5, 1.6), new Vector3(4, -7, 3), 0.15, 0.15, 4),
    limb(new Vector3(-1.6, -13.5, -1.6), new Vector3(-4, -7, -3), 0.15, 0.15, 4),
  ]);
  const blimp = new SphereGeometry(7, 20, 14);
  blimp.scale(1.6, 0.85, 0.85);
  const blimpFins = merge([0, 1, 2].map((i) => new BoxGeometry(5, 4.6, 0.5).translate(-10, 0, 0).rotateX((i * Math.PI * 2) / 3 + Math.PI / 2)));
  const cable = new CylinderGeometry(0.25, 0.25, 1, 5, 1, true).translate(0, -0.5, 0);
  const dart = merge([
    new ConeGeometry(1.6, 11, 6).rotateZ(-Math.PI / 2),
    new BoxGeometry(5, 0.3, 9).translate(-2.5, 0, 0),
    new BoxGeometry(3, 3, 0.3).translate(-4.5, 1.4, 0),
  ]);
  const balloon = new SphereGeometry(6, 18, 14);
  balloon.scale(1, 1.12, 1);
  const knot = merge([new ConeGeometry(1.1, 1.8, 6).translate(0, -7.2, 0), limb(new Vector3(0, -8, 0), new Vector3(1, -14, 0), 0.12, 0.12, 4)]);
  const hail = lumpySphere(9, 2, 0.28, 0.35, 5);
  const hailShards = merge([0, 1, 2, 3, 4].map((i) => new ConeGeometry(2.4, 9, 5).rotateZ(i * 1.3).rotateY(i * 2).translate(Math.cos(i * 1.3) * 6, Math.sin(i * 1.3) * 6, Math.sin(i * 2.1) * 4)));

  // space
  const spikeMine = merge([
    new SphereGeometry(5.6, 16, 12),
    ...Array.from({ length: 14 }, (_, i) => {
      const d = new Vector3(Math.sin(i * 2.4) * Math.cos(i), Math.cos(i * 2.4), Math.sin(i * 2.4) * Math.sin(i)).normalize();
      return limb(d.clone().multiplyScalar(5), d.clone().multiplyScalar(11), 1, 0.2, 6);
    }),
  ]);
  const saucer = new SphereGeometry(9, 22, 10);
  saucer.scale(1, 0.32, 1);
  const saucerDome = new SphereGeometry(4.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.6, 0);
  const saucerGlow = new CylinderGeometry(5, 3.4, 1.4, 18).translate(0, -3, 0);
  const beacon = new OctahedronGeometry(7, 0);
  const beaconRing = new TorusGeometry(9, 0.6, 6, 24);
  const seeker = merge([new ConeGeometry(2, 10, 5).rotateZ(-Math.PI / 2), new BoxGeometry(4, 0.4, 8).translate(-3, 0, 0), new BoxGeometry(4, 5, 0.4).translate(-3.4, 0, 0)]);
  const seekerGlow = new SphereGeometry(1.5, 8, 6).translate(-5.4, 0, 0);
  const reactor = new SphereGeometry(6, 18, 14);
  const reactorBands = merge([0, 1, 2].map((i) => new TorusGeometry(6.1, 0.5, 6, 24).rotateX(i === 0 ? Math.PI / 2 : 0).rotateY(i === 2 ? Math.PI / 2 : 0)));
  const rock = lumpySphere(10, 2, 0.32, 0.3, 11);
  const panel = merge([new BoxGeometry(10, 0.3, 5).translate(11, 4, 0), limb(new Vector3(4, 3, 0), new Vector3(8, 4, 0), 0.3, 0.3, 4)]);
  return { cloud, bolt, envelope, stripes, basket, blimp, blimpFins, cable, dart, balloon, knot, hail, hailShards, spikeMine, saucer, saucerDome, saucerGlow, beacon, beaconRing, seeker, seekerGlow, reactor, reactorBands, rock, panel };
}
const G = () => (geo ??= buildGeo());

type Glow = [MeshStandardMaterial, number];
function pack(root: Group, glows: Glow[], parts: Record<string, Mesh | Group> = {}): EnemyVisual {
  root.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  return { root, glowMats: glows.map((g) => g[0]), baseEmissive: glows.map((g) => g[1]), parts };
}
const mesh = (g: BufferGeometry, m: MeshStandardMaterial) => new Mesh(g, m);
const BALLOON_COLORS = [0xe4572e, 0xf3a712, 0x2f8fe8, 0x4f8a3c, 0xc77dff];

export function makeSky(kind: EnemyKind, index: number): EnemyVisual {
  const g = G();
  const root = new Group();
  switch (kind) {
    case 'urchin': {
      const body = std(0x4a4f5c, { rough: 1, emissive: 0x20242e, ei: 0.3 });
      const bolt = glowMat(0xffd84a, 3);
      root.add(mesh(g.cloud, body), mesh(g.bolt, bolt));
      return pack(root, [[body, 0.3]]);
    }
    case 'jelly': {
      const col = BALLOON_COLORS[index % BALLOON_COLORS.length];
      const env = std(col, { rough: 0.6, emissive: col, ei: 0.15 });
      const bell = mesh(g.envelope, env);
      bell.position.y = 6;
      const stripes = mesh(g.stripes, std(0xfff6e6, { rough: 0.6 }));
      stripes.position.y = 6;
      const basket = mesh(g.basket, std(0x8a5a32, { rough: 0.9 }));
      basket.position.y = 6;
      root.add(bell, stripes, basket);
      return pack(root, [[env, 0.15]], { bell });
    }
    case 'mine': {
      const light = glowMat(0xff2a2a, 3);
      const lamp = mesh(new SphereGeometry(1, 10, 8), light);
      lamp.position.set(0, 6.6, 0);
      const skin = std(0x8f979e, { rough: 0.5, metal: 0.3 });
      const chain = mesh(g.cable, std(0x2a2a2a, { rough: 0.8 }));
      chain.position.y = -6;
      root.add(mesh(g.blimp, skin), mesh(g.blimpFins, std(0x5f676e)), lamp, chain);
      const v = pack(root, [[light, 3]], { chain, light: lamp });
      chain.castShadow = false;
      return v;
    }
    case 'lanternfish': {
      const body = std(0xd9412e, { rough: 0.5, emissive: 0x601008, ei: 0.3 });
      const m = mesh(g.dart, body);
      m.rotation.y = Math.PI; // behaviour code flips fish to face left
      root.add(m);
      return pack(root, [[body, 0.3]]);
    }
    case 'puffer': {
      const col = BALLOON_COLORS[(index + 2) % BALLOON_COLORS.length];
      const body = std(col, { rough: 0.25, emissive: col, ei: 0.12 });
      root.add(mesh(g.balloon, body), mesh(g.knot, std(0x3a3a3a)));
      return pack(root, [[body, 0.12]]);
    }
    default: {
      const ice = std(0xdff1fa, { rough: 0.25, metal: 0.1, emissive: 0x6fb6d8, ei: 0.25 });
      root.add(mesh(g.hail, ice), mesh(g.hailShards, ice));
      return pack(root, [[ice, 0.25]]);
    }
  }
}

export function makeSpace(kind: EnemyKind): EnemyVisual {
  const g = G();
  const root = new Group();
  const hull = () => std(0x7d8590, { rough: 0.4, metal: 0.8 });
  switch (kind) {
    case 'urchin': {
      const body = std(0x4a4f5a, { rough: 0.45, metal: 0.8, emissive: 0xff3020, ei: 0.2 });
      const eye = glowMat(0xff3a2a, 3);
      const lamp = mesh(new SphereGeometry(1.6, 10, 8), eye);
      lamp.position.z = 5;
      root.add(mesh(g.spikeMine, body), lamp);
      return pack(root, [[body, 0.2]]);
    }
    case 'jelly': {
      const under = glowMat(0x6ff6ff, 2.5);
      const bell = new Group();
      bell.add(mesh(g.saucer, hull()), mesh(g.saucerDome, std(0x9fd8ff, { rough: 0.1, metal: 0.2, emissive: 0x2a6a8a, ei: 0.6 })), mesh(g.saucerGlow, under));
      root.add(bell);
      return pack(root, [[under, 2.5]], { bell });
    }
    case 'mine': {
      const light = glowMat(0xff3a2a, 3);
      const core = mesh(new SphereGeometry(2.6, 12, 10), light);
      const frame = std(0x565c66, { rough: 0.4, metal: 0.85 });
      const chain = mesh(g.cable, glowMat(0xff5a3a, 1.6));
      chain.position.y = -6;
      const ring = mesh(g.beaconRing, frame);
      const oct = mesh(g.beacon, new MeshStandardMaterial({ color: 0x565c66, metalness: 0.85, roughness: 0.4, wireframe: true }));
      root.add(oct, ring, core, chain);
      const v = pack(root, [[light, 3]], { chain, light: core });
      chain.castShadow = false;
      return v;
    }
    case 'lanternfish': {
      const body = std(0xcfd4da, { rough: 0.35, metal: 0.7 });
      const jet = glowMat(0xffa23a, 4);
      const grp = new Group();
      grp.add(mesh(g.seeker, body), mesh(g.seekerGlow, jet));
      grp.rotation.y = Math.PI;
      root.add(grp);
      return pack(root, [[jet, 4]]);
    }
    case 'puffer': {
      const core = std(0x1a2a1a, { rough: 0.3, metal: 0.4, emissive: 0x7dff5a, ei: 0.9 });
      root.add(mesh(g.reactor, core), mesh(g.reactorBands, hull()));
      return pack(root, [[core, 0.9]]);
    }
    default: {
      const rock = std(0x6a6a74, { rough: 0.95 });
      root.add(mesh(g.rock, rock), mesh(g.panel, std(0x2a4a9a, { rough: 0.3, metal: 0.6, emissive: 0x10204a, ei: 0.4 })));
      return pack(root, [[rock, 0]]);
    }
  }
}
