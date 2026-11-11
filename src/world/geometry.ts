import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Noise } from '../core/noise';
import { Random } from '../core/Random';

const geoNoise = new Noise(777);

/** Merge several geometries (dropping mismatched attributes) into one draw call. */
export function merge(geos: BufferGeometry[]): BufferGeometry {
  const withColor = geos.every((g) => !!g.attributes.color);
  const keep = withColor ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
  const clean = geos.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (!keep.includes(k)) ng.deleteAttribute(k);
    if (!ng.attributes.uv) ng.setAttribute('uv', new Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
    return ng;
  });
  const out = mergeGeometries(clean, false);
  if (!out) throw new Error('merge failed');
  return out;
}

/** Noise-displaced sphere: rocks, coral heads, creature bodies. */
export function lumpySphere(radius: number, detail: number, amount: number, freq: number, seed = 0): BufferGeometry {
  let g: BufferGeometry = new IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = geoNoise.noise3(v.x * freq + seed, v.y * freq, v.z * freq) * 0.7 + geoNoise.noise3(v.x * freq * 3, v.y * freq * 3 + seed, v.z * freq * 3) * 0.3;
    v.multiplyScalar(1 + d * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // Spherical UVs so normal maps work.
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    uv[i * 2] = 0.5 + Math.atan2(v.z, v.x) / (2 * Math.PI);
    uv[i * 2 + 1] = 0.5 + Math.asin(v.y) / Math.PI;
  }
  g.setAttribute('uv', new (p.constructor as typeof import('three').BufferAttribute)(uv, 2));
  return g;
}

/** Place a cylinder between two points. */
export function limb(a: Vector3, b: Vector3, r0: number, r1: number, radial = 6): BufferGeometry {
  const len = a.distanceTo(b);
  const g = new CylinderGeometry(r1, r0, len, radial, 1, false);
  g.translate(0, len / 2, 0);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new Matrix4().compose(a, q, new Vector3(1, 1, 1)));
  return g;
}

/** Recursive branching coral. */
export function branchCoral(seed: number, flat = false): BufferGeometry {
  const rnd = new Random(seed);
  const parts: BufferGeometry[] = [];
  const grow = (from: Vector3, dir: Vector3, len: number, r: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len);
    parts.push(limb(from, to, r, r * 0.72, flat ? 5 : 6));
    if (depth === 0) {
      const tip = new SphereGeometry(r * 0.9, 6, 4);
      tip.translate(to.x, to.y, to.z);
      parts.push(tip);
      return;
    }
    const n = flat ? 2 : rnd.int(2, 3);
    for (let i = 0; i < n; i++) {
      const d = dir.clone();
      d.x += rnd.range(-0.7, 0.7);
      if (!flat) d.z += rnd.range(-0.7, 0.7);
      d.y += 0.35;
      d.normalize();
      grow(to, d, len * rnd.range(0.62, 0.8), r * 0.7, depth - 1);
    }
  };
  grow(new Vector3(), new Vector3(0, 1, 0), 9, 1.5, flat ? 5 : 4);
  return merge(parts);
}

/** Smoker chimney silhouette for hydrothermal vents. */
export function ventChimney(seed: number): BufferGeometry {
  const rnd = new Random(seed);
  const pts: Vector2[] = [];
  const h = rnd.range(28, 46);
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const r = (9 - t * 6.2) * (1 + geoNoise.noise2(t * 6, seed) * 0.35) + (i === 14 ? -0.6 : 0);
    pts.push(new Vector2(Math.max(1.2, r), t * h));
  }
  pts.push(new Vector2(0.01, h));
  const g = new LatheGeometry(pts, 12);
  g.userData.height = h;
  return g;
}

/** A cluster of tube worms; returns [tubes, plumes] sharing one transform. */
export function tubeWormCluster(seed: number): [BufferGeometry, BufferGeometry] {
  const rnd = new Random(seed);
  const tubes: BufferGeometry[] = [];
  const plumes: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const x = rnd.range(-4, 4);
    const z = rnd.range(-4, 4);
    const h = rnd.range(8, 20);
    const base = new Vector3(x, 0, z);
    const top = new Vector3(x + rnd.range(-1.5, 1.5), h, z + rnd.range(-1.5, 1.5));
    tubes.push(limb(base, top, 0.75, 0.6, 7));
    const p = new ConeGeometry(1.4, 3.2, 7, 1, true);
    p.rotateX(Math.PI);
    p.translate(top.x, top.y + 1.4, top.z);
    plumes.push(p);
  }
  return [merge(tubes), merge(plumes)];
}

/** Streamlined fish body, head pointing +x. */
export function fishGeometry(length = 6, girth = 1.4): BufferGeometry {
  const pts: Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new Vector2(Math.sin(t * Math.PI) * girth * (1 - t * 0.35), (t - 0.5) * length));
  }
  const body = new LatheGeometry(pts, 10);
  body.rotateZ(-Math.PI / 2); // lathe axis y -> x, head at +x
  body.scale(1, 1, 0.55);
  const tail = new ConeGeometry(girth * 0.9, length * 0.35, 4, 1);
  tail.rotateZ(Math.PI / 2);
  tail.scale(1, 1, 0.15);
  tail.translate(-length * 0.62, 0, 0);
  const fin = new ConeGeometry(girth * 0.5, length * 0.25, 3);
  fin.scale(1, 1, 0.12);
  fin.translate(0, girth * 0.9, 0);
  return merge([body, tail, fin]);
}

/** Bake a flat vertex colour into a geometry (multiplied by instance colour later). */
export function paint(g: BufferGeometry, hex: number): BufferGeometry {
  const c = new Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return g;
}

/** Merge parts that each carry a baked colour: [geometry, hex][] */
export function mergePainted(parts: [BufferGeometry, number][]): BufferGeometry {
  return merge(parts.map(([g, c]) => paint(g, c)));
}

/** Faceted look for paper / low-poly props. */
export function facet(g: BufferGeometry): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  return ng;
}
