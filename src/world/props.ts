import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry, TorusGeometry, Vector3, IcosahedronGeometry } from 'three';
import { branchCoral, facet, limb, lumpySphere, merge, mergePainted, paint, tubeWormCluster, ventChimney } from './geometry';
import { Random } from '../core/Random';
import type { PropSet } from '../themes/themes';

/**
 * Procedural prop geometry for every world. Each set fills the same slots
 * so the ground system can swap worlds without caring what's inside:
 *   tall     - kelp, trees, pylons, bamboo, cacti (sways if the theme allows)
 *   cluster  - three mid-size props: corals, houses, bushes, crystals...
 *   stem/head- small ground cover drawn as two meshes sharing transforms
 *   rockA/B  - small and large rocks (or bricks, ice blocks)
 *   special  - optional landmark with a glow and a particle plume
 * Geometry carries baked vertex colours (white = take the instance tint).
 */

export interface PropGeometry {
  tall: BufferGeometry;
  tallScale: [number, number];
  cluster: [BufferGeometry, BufferGeometry, BufferGeometry];
  clusterScale: [number, number];
  stem: BufferGeometry;
  head: BufferGeometry;
  rockA: BufferGeometry;
  rockB: BufferGeometry;
  /** Multiplier on rock sizes (bricks and crates stay small). */
  rockScale?: number;
  special: BufferGeometry | null;
  specialGlow: BufferGeometry | null;
  /** Height of the special prop's plume origin. */
  specialTop: number;
  plume: 'smoke' | 'steam' | 'motes' | null;
}

const W = 0xffffff;
const TRUNK = 0x6b4f3a;
const rnd = new Random(4040);

const at = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

// ---------- shared shapes ----------

function rocks(): [BufferGeometry, BufferGeometry] {
  const a = paint(lumpySphere(1, 2, 0.35, 1.3, 1), W);
  const b = lumpySphere(1, 2, 0.5, 0.8, 7);
  b.scale(1.4, 0.7, 1);
  return [a, paint(b, W)];
}

function pine(levels = 4, snow = false): BufferGeometry {
  const parts: [BufferGeometry, number][] = [[at(new CylinderGeometry(1.2, 1.6, 12, 6), 0, 6, 0), TRUNK]];
  for (let i = 0; i < levels; i++) {
    const r = 11 - i * 2.2;
    parts.push([at(new ConeGeometry(r, 16, 8), 0, 14 + i * 9, 0), W]);
    if (snow) parts.push([at(new ConeGeometry(r * 0.55, 6, 8), 0, 19 + i * 9, 0), 0xffffff]);
  }
  return facet(mergePainted(parts));
}

function roundTree(): BufferGeometry {
  const canopy = lumpySphere(1, 2, 0.18, 1.6, 5);
  canopy.scale(13, 11, 13);
  canopy.translate(0, 30, 0);
  const canopy2 = lumpySphere(1, 2, 0.2, 1.4, 9);
  canopy2.scale(9, 8, 9);
  canopy2.translate(7, 38, 3);
  return mergePainted([
    [limb(new Vector3(0, 0, 0), new Vector3(1, 26, 0), 2, 1.4, 7), TRUNK],
    [canopy, W],
    [canopy2, W],
  ]);
}

function bush(): BufferGeometry {
  const parts: [BufferGeometry, number][] = [];
  for (let i = 0; i < 4; i++) {
    const s = lumpySphere(1, 1, 0.2, 2, i * 3);
    const r = rnd.range(3.5, 5.5);
    s.scale(r, r * 0.85, r);
    s.translate(rnd.range(-4, 4), r * 0.6, rnd.range(-3, 3));
    parts.push([s, W]);
  }
  return mergePainted(parts);
}

function house(roof: number, wall = W): BufferGeometry {
  const body = new BoxGeometry(12, 9, 10);
  body.translate(0, 4.5, 0);
  const r = new CylinderGeometry(0.01, 9.5, 6, 4, 1);
  r.rotateY(Math.PI / 4);
  r.scale(1.15, 1, 1);
  r.translate(0, 12, 0);
  const door = new BoxGeometry(2.6, 4.4, 0.4);
  door.translate(-2, 2.2, 5.1);
  const win = new BoxGeometry(2.6, 2.2, 0.4);
  win.translate(3, 5, 5.1);
  return facet(mergePainted([[body, wall], [r, roof], [door, 0x3a3a3a], [win, 0x9fd3ff]]));
}

function flowers(): [BufferGeometry, BufferGeometry] {
  const stems: BufferGeometry[] = [];
  const heads: BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const x = rnd.range(-4, 4);
    const z = rnd.range(-4, 4);
    const h = rnd.range(3, 7);
    stems.push(limb(new Vector3(x, 0, z), new Vector3(x + rnd.range(-0.6, 0.6), h, z), 0.25, 0.18, 4));
    const head = new IcosahedronGeometry(0.9, 0);
    head.translate(x, h + 0.5, z);
    heads.push(head);
  }
  return [paint(merge(stems), W), paint(merge(heads), W)];
}

function grass(): [BufferGeometry, BufferGeometry] {
  const blades: BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const b = new ConeGeometry(0.5, rnd.range(3, 6), 3);
    b.translate(rnd.range(-3, 3), 2, rnd.range(-3, 3));
    b.rotateZ(rnd.range(-0.2, 0.2));
    blades.push(b);
  }
  const tips = new IcosahedronGeometry(0.01, 0);
  return [paint(merge(blades), W), paint(tips, W)];
}

function crystals(n = 6): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const h = rnd.range(6, 16);
    const c = new CylinderGeometry(0, rnd.range(1.4, 2.6), h, 5);
    c.translate(0, h / 2, 0);
    c.rotateZ(rnd.range(-0.5, 0.5));
    c.rotateX(rnd.range(-0.4, 0.4));
    c.translate(rnd.range(-3, 3), 0, rnd.range(-3, 3));
    parts.push(c);
  }
  return facet(paint(merge(parts), W));
}

function mushroom(): BufferGeometry {
  const cap = lumpySphere(1, 2, 0.08, 2, 4);
  cap.scale(8, 4.5, 8);
  cap.translate(0, 16, 0);
  const spots: [BufferGeometry, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spots.push([at(new SphereGeometry(1.1, 8, 6), Math.cos(a) * 5, 18.4, Math.sin(a) * 5), 0xfff6ee]);
  }
  return mergePainted([[limb(new Vector3(), new Vector3(0, 15, 0), 2.6, 2, 10), 0xf5e9dc], [cap, W], ...spots]);
}

function brickStack(w: number, h: number, d: number, studs = true): BufferGeometry {
  const parts: BufferGeometry[] = [at(new BoxGeometry(w, h, d), 0, h / 2, 0)];
  if (studs)
    for (let x = -w / 2 + 2; x < w / 2; x += 4)
      for (let z = -d / 2 + 2; z < d / 2; z += 4) parts.push(at(new CylinderGeometry(1.2, 1.2, 1, 10), x, h + 0.5, z));
  return merge(parts);
}

// ---------- per-world sets ----------

function abyss(): PropGeometry {
  const kelp: BufferGeometry[] = [];
  for (let k = 0; k < 2; k++) {
    const g = new PlaneGeometry(3.4, 70, 1, 18);
    g.translate(0, 35, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const x = p.getX(i) * (1 - y / 95);
      const a = y * 0.04 + k * Math.PI * 0.5;
      p.setXYZ(i, x * Math.cos(a), y, x * Math.sin(a));
    }
    g.computeVertexNormals();
    kelp.push(g);
  }
  const [tubes, plumes] = tubeWormCluster(31);
  const brain = lumpySphere(1, 3, 0.18, 4, 3);
  brain.scale(5, 3.2, 5);
  const [ra, rb] = rocks();
  const vent = ventChimney(41);
  return {
    tall: paint(merge(kelp), W),
    tallScale: [0.6, 1.25],
    cluster: [paint(branchCoral(11), W), paint(brain, W), paint(branchCoral(23, true), W)],
    clusterScale: [1, 2.4],
    stem: paint(tubes, W),
    head: paint(plumes, W),
    rockA: ra,
    rockB: rb,
    special: paint(vent, W),
    specialGlow: paint(new SphereGeometry(3.2, 10, 6), W),
    specialTop: vent.userData.height ?? 40,
    plume: 'smoke',
  };
}

function paper(): PropGeometry {
  const tree = facet(
    mergePainted([
      [at(new CylinderGeometry(1, 1.4, 10, 5), 0, 5, 0), TRUNK],
      [at(new ConeGeometry(10, 18, 5), 0, 18, 0), W],
      [at(new ConeGeometry(7.5, 14, 5), 0, 27, 0), W],
    ]),
  );
  tree.scale(1, 1, 0.35); // cut-out depth
  const hill = facet(paint(lumpySphere(1, 1, 0.1, 1, 2).scale(12, 7, 3), W));
  const windmill = facet(
    mergePainted([
      [at(new CylinderGeometry(2.4, 4, 18, 6), 0, 9, 0), 0xf2efe6],
      [at(new BoxGeometry(1, 22, 0.4), 0, 20, 4.2).rotateZ(0), W],
      [at(new BoxGeometry(22, 1, 0.4), 0, 20, 4.2), W],
    ]),
  );
  const [stem, head] = flowers();
  const [ra, rb] = rocks();
  return {
    tall: tree,
    tallScale: [0.8, 1.5],
    cluster: [facet(house(0xe4572e, 0xf2efe6)), hill, windmill],
    clusterScale: [0.9, 1.6],
    stem,
    head,
    rockA: facet(ra),
    rockB: facet(rb),
    special: null,
    specialGlow: null,
    specialTop: 0,
    plume: null,
  };
}

function tech(): PropGeometry {
  const pylon = mergePainted([
    [at(new BoxGeometry(5, 60, 5), 0, 30, 0), W],
    [at(new BoxGeometry(5.4, 1.2, 5.4), 0, 20, 0), 0xff6b1a],
    [at(new BoxGeometry(5.4, 1.2, 5.4), 0, 44, 0), 0xff6b1a],
    [at(new BoxGeometry(14, 2, 3), 0, 58, 0), W],
  ]);
  const crate = mergePainted([
    [at(new BoxGeometry(10, 10, 10), 0, 5, 0), W],
    [at(new BoxGeometry(10.4, 1, 10.4), 0, 9, 0), 0x2b2f33],
  ]);
  const dome = mergePainted([
    [at(new SphereGeometry(9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0), W],
    [at(new TorusGeometry(9, 0.6, 6, 24).rotateX(Math.PI / 2), 0, 0.5, 0), 0xff6b1a],
  ]);
  const tower = mergePainted([
    [at(new CylinderGeometry(3, 4, 30, 12), 0, 15, 0), W],
    [at(new SphereGeometry(5, 14, 10), 0, 32, 0), 0xdde2e6],
  ]);
  const bollard = paint(at(new CylinderGeometry(0.7, 0.9, 4, 8), 0, 2, 0), W);
  const light = paint(at(new SphereGeometry(0.9, 8, 6), 0, 4.6, 0), W);
  const ra = paint(at(new BoxGeometry(1.6, 1.2, 1.4), 0, 0.3, 0), W);
  const rb = paint(at(new BoxGeometry(2, 1, 1.4), 0, 0.3, 0), W);
  const beacon = mergePainted([
    [at(new CylinderGeometry(3, 4, 26, 6), 0, 13, 0), 0x2b2f33],
    [at(new TorusGeometry(5, 0.5, 6, 20).rotateX(Math.PI / 2), 0, 22, 0), 0xff6b1a],
  ]);
  return {
    tall: pylon,
    tallScale: [0.7, 1.3],
    cluster: [crate, dome, tower],
    clusterScale: [0.8, 1.4],
    stem: bollard,
    head: light,
    rockA: ra,
    rockB: rb,
    rockScale: 0.5,
    special: beacon,
    specialGlow: paint(new SphereGeometry(2.6, 10, 6), W),
    specialTop: 27,
    plume: 'motes',
  };
}

function sketch(): PropGeometry {
  const [stem, head] = flowers();
  const [ra, rb] = rocks();
  return {
    tall: pine(4),
    tallScale: [0.7, 1.3],
    cluster: [house(W), bush(), roundTree()],
    clusterScale: [0.9, 1.5],
    stem,
    head,
    rockA: ra,
    rockB: rb,
    special: null,
    specialGlow: null,
    specialTop: 0,
    plume: null,
  };
}

function summer(): PropGeometry {
  // Wooden utility pole with a crossbar: a staple of summer skylines.
  const pole = mergePainted([
    [at(new CylinderGeometry(0.9, 1.1, 60, 8), 0, 30, 0), 0x7a6a5a],
    [at(new BoxGeometry(14, 1.2, 1.2), 0, 54, 0), 0x6a5a4a],
    [at(new BoxGeometry(10, 1, 1), 0, 49, 0), 0x6a5a4a],
    [at(new CylinderGeometry(1.2, 1.2, 3, 8), 4, 57, 0), 0x4a5560],
  ]);
  const [stem, head] = grass();
  const [ra, rb] = rocks();
  return {
    tall: roundTree(),
    tallScale: [0.8, 1.4],
    cluster: [house(0xe85d4a), bush(), pole],
    clusterScale: [0.9, 1.3],
    stem,
    head,
    rockA: ra,
    rockB: rb,
    special: null,
    specialGlow: null,
    specialTop: 0,
    plume: null,
  };
}

function brick(): PropGeometry {
  const tree = mergePainted([
    [brickStack(4, 12, 4, false), 0x7a4a2a],
    [at(brickStack(16, 6, 16), 0, 12, 0), W],
    [at(brickStack(10, 6, 10), 0, 18, 0), W],
    [at(brickStack(6, 4, 6), 0, 24, 0), W],
  ]);
  const hut = mergePainted([
    [brickStack(16, 10, 12, false), W],
    [at(brickStack(18, 3, 14), 0, 10, 0), 0xd01012],
    [at(new BoxGeometry(3, 6, 0.6), -3, 3, 6.1), 0x1b1b1b],
    [at(new BoxGeometry(3.4, 3, 0.6), 4, 6, 6.1), 0x9fd3ff],
  ]);
  const flowerPot = mergePainted([
    [brickStack(4, 4, 4), 0x1b1b1b],
    [at(new CylinderGeometry(0.4, 0.4, 6, 6), 0, 7, 0), 0x237841],
    [at(brickStack(4, 2, 4), 0, 10, 0), W],
  ]);
  const block = brickStack(8, 4, 8);
  const stud = paint(brickStack(4, 1, 4), W);
  const tuft = paint(at(new IcosahedronGeometry(0.01, 0), 0, 0, 0), W);
  return {
    tall: tree,
    tallScale: [0.8, 1.3],
    cluster: [hut, flowerPot, paint(block, W)],
    clusterScale: [0.9, 1.4],
    stem: stud,
    head: tuft,
    rockA: paint(brickStack(4, 3, 2, true), W),
    rockB: paint(brickStack(8, 6, 6, true), W),
    rockScale: 0.28,
    special: null,
    specialGlow: null,
    specialTop: 0,
    plume: null,
  };
}

function clay(): PropGeometry {
  const blobTree = mergePainted([
    [limb(new Vector3(), new Vector3(0, 18, 0), 2.4, 1.8, 10), 0xc9a07a],
    [at(lumpySphere(1, 3, 0.12, 1.2, 4).scale(10, 9, 10), 0, 25, 0), W],
  ]);
  const [stem, head] = flowers();
  const [ra, rb] = rocks();
  return {
    tall: blobTree,
    tallScale: [0.8, 1.3],
    cluster: [mushroom(), bush(), paint(lumpySphere(1, 3, 0.25, 1.2, 8).scale(6, 3, 6), W)],
    clusterScale: [0.9, 1.6],
    stem,
    head,
    rockA: ra,
    rockB: rb,
    special: null,
    specialGlow: null,
    specialTop: 0,
    plume: null,
  };
}

function ink(): PropGeometry {
  const bamboo: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const x = rnd.range(-4, 4);
    const z = rnd.range(-4, 4);
    const h = rnd.range(40, 70);
    for (let s = 0; s < h; s += 8) {
      bamboo.push(at(new CylinderGeometry(0.9, 0.9, 7.4, 6), x, s + 3.7, z));
      bamboo.push(at(new CylinderGeometry(1.15, 1.15, 0.8, 6), x, s + 7.6, z));
    }
    const leaf = new ConeGeometry(1.2, 9, 3);
    leaf.scale(1, 1, 0.15);
    leaf.rotateZ(-1.1);
    leaf.translate(x + 4, h - 4, z);
    bamboo.push(leaf);
  }
  const pineFlat = branchCoral(57, true);
  pineFlat.scale(1.6, 1.4, 1.6);
  const [stem, head] = grass();
  const [ra, rb] = rocks();
  const stack = mergePainted([
    [at(lumpySphere(1, 1, 0.2, 1, 1).scale(6, 3, 5), 0, 2, 0), W],
    [at(lumpySphere(1, 1, 0.2, 1, 2).scale(4, 2.4, 4), 0.5, 6.5, 0), W],
    [at(lumpySphere(1, 1, 0.2, 1, 3).scale(2.6, 1.8, 2.6), -0.3, 10, 0), W],
  ]);
  return {
    tall: paint(merge(bamboo), W),
    tallScale: [0.7, 1.2],
    cluster: [paint(pineFlat, W), stack, bush()],
    clusterScale: [1, 1.8],
    stem,
    head,
    rockA: ra,
    rockB: rb,
    special: null,
    specialGlow: null,
    specialTop: 0,
    plume: null,
  };
}

function mesa(): PropGeometry {
  const arm = (x: number, y: number, dir: number) => [
    [limb(new Vector3(x, y, 0), new Vector3(x + dir * 6, y + 1, 0), 2.2, 2.2, 10), W] as [BufferGeometry, number],
    [limb(new Vector3(x + dir * 6, y + 1, 0), new Vector3(x + dir * 6, y + 12, 0), 2.2, 2, 10), W] as [BufferGeometry, number],
    [at(new SphereGeometry(2, 10, 6), x + dir * 6, y + 12, 0), W] as [BufferGeometry, number],
  ];
  const cactus = mergePainted([
    [limb(new Vector3(), new Vector3(0, 34, 0), 3, 2.8, 12), W],
    [at(new SphereGeometry(2.8, 12, 8), 0, 34, 0), W],
    ...arm(0, 14, 1),
    ...arm(0, 20, -1),
  ]);
  const barrel = paint(lumpySphere(1, 2, 0.06, 4, 2).scale(4, 5, 4).translate(0, 4, 0), W);
  const dry = paint(branchCoral(77), W);
  dry.scale(0.6, 0.7, 0.6);
  const [stem, head] = grass();
  const [ra, rb] = rocks();
  rb.scale(1.4, 1.8, 1.2);
  return {
    tall: cactus,
    tallScale: [0.7, 1.3],
    cluster: [barrel, dry, paint(lumpySphere(1, 2, 0.3, 1, 4).scale(5, 3, 4), W)],
    clusterScale: [0.9, 1.6],
    stem,
    head,
    rockA: ra,
    rockB: rb,
    special: null,
    specialGlow: null,
    specialTop: 0,
    plume: null,
  };
}

function glacier(): PropGeometry {
  const [ra, rb] = rocks();
  const mound = paint(lumpySphere(1, 2, 0.1, 1, 6).scale(8, 4, 7), W);
  const spire = crystals(4);
  spire.scale(1.6, 2.6, 1.6);
  const geyser = mergePainted([[at(lumpySphere(1, 2, 0.15, 1, 3).scale(6, 3, 6), 0, 1, 0), 0xb9d7e6]]);
  return {
    tall: pine(4, true),
    tallScale: [0.7, 1.3],
    cluster: [crystals(6), mound, spire],
    clusterScale: [0.9, 1.6],
    stem: crystals(3).scale(0.25, 0.25, 0.25),
    head: paint(new IcosahedronGeometry(0.01, 0), W),
    rockA: ra,
    rockB: rb,
    special: geyser,
    specialGlow: paint(new SphereGeometry(2.2, 10, 6), W),
    specialTop: 4,
    plume: 'steam',
  };
}

const builders: Record<PropSet, () => PropGeometry> = {
  abyss,
  paper,
  tech,
  sketch,
  summer,
  brick,
  clay,
  ink,
  mesa,
  glacier,
};

const cache = new Map<PropSet, PropGeometry>();
export function propGeometry(set: PropSet): PropGeometry {
  let g = cache.get(set);
  if (!g) cache.set(set, (g = builders[set]()));
  return g;
}
