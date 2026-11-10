import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  NormalBlending,
} from 'three';
import { noise } from '../core/noise';
import { Random } from '../core/Random';
import { smoothstep } from '../core/math';
import type { ZoneDef } from '../game/zones';
import type { QualityPreset } from '../core/Quality';
import type { Atmosphere } from './Atmosphere';
import { getTextures } from './textures';
import { patchCaustics, patchSway } from './shaderPatches';
import { branchCoral, lumpySphere, merge, tubeWormCluster, ventChimney } from './geometry';

const TILE_W = 640;
const Z_BACK = -560;
const Z_FRONT = 90;
const SEG_X = 84;
const SEG_Z = 60;
export const SEABED_Y = -118;
const TILES = 3;

/** Seabed height at a world x / z. Continuous, so tiles join seamlessly. */
export function seabedHeight(wx: number, z: number): number {
  const base = noise.fbm2(wx * 0.0035, z * 0.0042, 5) * 28;
  const dunes = Math.sin(wx * 0.021 + noise.noise2(wx * 0.003, z * 0.01) * 3) * 2.5;
  const back = smoothstep(-150, -540, z);
  const ridge = noise.ridged2(wx * 0.0024, z * 0.0055, 4) * 230 * back;
  const spires = Math.max(0, noise.noise2(wx * 0.006, 9.1) - 0.35) * 260 * back;
  const front = smoothstep(-20, Z_FRONT, z) * -40;
  return SEABED_Y + base + dunes + ridge + spires + front;
}

interface Tile {
  index: number;
  group: Group;
  terrain: Mesh<BufferGeometry, MeshStandardMaterial>;
  rocksA: InstancedMesh;
  rocksB: InstancedMesh;
  kelp: InstancedMesh;
  coral: InstancedMesh[];
  tubes: InstancedMesh;
  plumes: InstancedMesh;
  vents: InstancedMesh;
  ventGlow: InstancedMesh;
  smoke: Points<BufferGeometry, ShaderMaterial>;
  ventTops: number[];
}

const CORAL_COLORS = [0xff6f91, 0xff9a5a, 0xc77dff, 0xffd166, 0x5ee6c9, 0xff5470, 0xf7a1c4];

/**
 * Infinite scrolling seabed made of three recycled terrain tiles.
 * When a tile leaves the screen it is regenerated ahead of the camera using the
 * *current* zone's palette and set dressing, so zone changes roll in naturally.
 */
export class Seabed {
  readonly root = new Group();
  private tiles: Tile[] = [];
  private scroll = 0;
  private terrainMat: MeshStandardMaterial;
  private rockMat: MeshStandardMaterial;
  private kelpMat: MeshStandardMaterial;
  private coralMat: MeshStandardMaterial;
  private tubeMat: MeshStandardMaterial;
  private plumeMat: MeshStandardMaterial;
  private ventMat: MeshStandardMaterial;
  private ventGlowMat: MeshStandardMaterial;
  private smokeMat: ShaderMaterial;
  private zone: ZoneDef;
  private dummy = new Object3D();
  private rnd = new Random(5150);

  constructor(
    scene: Scene,
    zone: ZoneDef,
    atmo: Atmosphere,
    private quality: QualityPreset,
  ) {
    this.zone = zone;
    const tex = getTextures();
    const shared = atmo.shared;

    this.terrainMat = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      roughnessMap: tex.sandRough,
      normalMap: tex.sandNormal,
      metalness: 0,
    });
    this.terrainMat.normalScale.set(0.9, 0.9);
    patchCaustics(this.terrainMat, shared);

    this.rockMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, normalMap: tex.rockNormal, metalness: 0.05 });
    this.rockMat.normalScale.set(1.4, 1.4);
    patchCaustics(this.rockMat, shared);

    this.kelpMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, side: DoubleSide });
    patchSway(this.kelpMat, shared.uTime, 2.6, 'kelp');
    this.coralMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, normalMap: tex.rockNormal });
    patchSway(this.coralMat, shared.uTime, 0.25, 'coral');
    this.tubeMat = new MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.55 });
    this.plumeMat = new MeshStandardMaterial({ color: 0xd8182f, roughness: 0.4, emissive: 0x6a0010, emissiveIntensity: 0.8 });
    patchSway(this.plumeMat, shared.uTime, 0.8, 'plume');
    this.ventMat = new MeshStandardMaterial({ color: 0x241a16, roughness: 0.95, normalMap: tex.rockNormal, emissive: 0x2a0800 });
    this.ventGlowMat = new MeshStandardMaterial({ color: 0x000000, emissive: 0xff6a1a, emissiveIntensity: 4, toneMapped: false });
    this.smokeMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      uniforms: { uTime: shared.uTime, uPixelRatio: { value: Math.min(devicePixelRatio, quality.maxPixelRatio) } },
      vertexShader: /* glsl */ `
        uniform float uTime, uPixelRatio;
        attribute float aSeed;
        varying float vLife;
        void main() {
          float life = fract(uTime * (0.12 + aSeed * 0.05) + aSeed);
          vec3 p = position;
          p.y += life * 140.0;
          p.x += sin(life * 6.0 + aSeed * 20.0) * life * 14.0 - life * 30.0;
          p.z += cos(life * 5.0 + aSeed * 11.0) * life * 8.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (6.0 + life * 46.0) * uPixelRatio * (220.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vLife = life;
        }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = (1.0 - d * 2.0) * (1.0 - vLife) * smoothstep(0.0, 0.08, vLife) * 0.5;
          vec3 hot = vec3(1.0, 0.45, 0.15) * (1.0 - smoothstep(0.0, 0.15, vLife)) * 2.0;
          gl_FragColor = vec4(vec3(0.05, 0.045, 0.04) + hot, a);
        }`,
    });

    const rockGeoA = lumpySphere(1, 2, 0.35, 1.3, 1);
    const rockGeoB = lumpySphere(1, 2, 0.5, 0.8, 7);
    rockGeoB.scale(1.4, 0.7, 1);
    const kelpGeo = this.kelpGeometry();
    const coralGeos = [branchCoral(11), lumpySphere(1, 3, 0.18, 4, 3).scale(5, 3.2, 5), branchCoral(23, true)];
    const [tubeGeo, plumeGeo] = tubeWormCluster(31);
    const ventGeo = ventChimney(41);
    const glowGeo = new SphereGeometry(3.2, 10, 6);

    const d = quality.density;
    for (let i = 0; i < TILES; i++) {
      const group = new Group();
      const terrain = new Mesh(this.terrainGeometry(), this.terrainMat);
      terrain.receiveShadow = true;
      group.add(terrain);
      const inst = (geo: BufferGeometry, mat: MeshStandardMaterial, max: number, colors = false) => {
        const m = new InstancedMesh(geo, mat, Math.max(1, Math.ceil(max * d)));
        m.instanceMatrix.setUsage(DynamicDrawUsage);
        if (colors) m.instanceColor = new (m.instanceMatrix.constructor as typeof import('three').InstancedBufferAttribute)(new Float32Array(m.count * 3), 3);
        m.count = 0;
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
        return m;
      };
      const smokeGeo = new BufferGeometry();
      const sCount = Math.ceil(160 * d);
      smokeGeo.setAttribute('position', new BufferAttribute(new Float32Array(sCount * 3), 3));
      const seeds = new Float32Array(sCount);
      for (let s = 0; s < sCount; s++) seeds[s] = Math.random();
      smokeGeo.setAttribute('aSeed', new BufferAttribute(seeds, 1));
      const smoke = new Points(smokeGeo, this.smokeMat);
      smoke.frustumCulled = false;
      group.add(smoke);

      const tile: Tile = {
        index: i,
        group,
        terrain,
        rocksA: inst(rockGeoA, this.rockMat, 60, true),
        rocksB: inst(rockGeoB, this.rockMat, 26, true),
        kelp: inst(kelpGeo, this.kelpMat, 110, true),
        coral: coralGeos.map((g) => inst(g, this.coralMat, 34, true)),
        tubes: inst(tubeGeo, this.tubeMat, 26),
        plumes: inst(plumeGeo, this.plumeMat, 26),
        vents: inst(ventGeo, this.ventMat, 3),
        ventGlow: inst(glowGeo, this.ventGlowMat, 3),
        smoke,
        ventTops: [],
      };
      tile.kelp.castShadow = false;
      this.tiles.push(tile);
      this.root.add(group);
      this.generate(tile);
    }
    scene.add(this.root);
  }

  private kelpGeometry(): BufferGeometry {
    // Two crossed ribbons with a slight twist, pivot at the base.
    const parts: BufferGeometry[] = [];
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
      parts.push(g);
    }
    return merge(parts);
  }

  private terrainGeometry(): BufferGeometry {
    const g = new PlaneGeometry(TILE_W, Z_FRONT - Z_BACK, SEG_X, SEG_Z);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, (Z_FRONT + Z_BACK) / 2);
    g.setAttribute('color', new BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    return g;
  }

  setZone(zone: ZoneDef) {
    this.zone = zone;
  }

  /** Rebuild a tile's heights, colours and props for its world slot. */
  private generate(tile: Tile) {
    const z = this.zone;
    const wx0 = tile.index * TILE_W;
    const geo = tile.terrain.geometry;
    const p = geo.attributes.position;
    const col = geo.attributes.color as BufferAttribute;
    const uv = geo.attributes.uv as BufferAttribute;
    const sand = new Color(z.seabed);
    const rock = new Color(z.rock);
    const c = new Color();
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i);
      const lz = p.getZ(i);
      const wx = wx0 + lx;
      const h = seabedHeight(wx, lz);
      p.setY(i, h);
      uv.setXY(i, wx / 70, lz / 70);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const slope = 1 - nrm.getY(i);
      const h = p.getY(i);
      const rockiness = smoothstep(0.12, 0.38, slope) + smoothstep(-40, 40, h) * 0.6;
      const ao = 0.55 + 0.45 * smoothstep(-160, -90, h);
      const v = 0.85 + noise.noise2((wx0 + p.getX(i)) * 0.05, p.getZ(i) * 0.05) * 0.15;
      c.copy(sand).lerp(rock, Math.min(1, rockiness)).multiplyScalar(ao * v);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    p.needsUpdate = true;
    col.needsUpdate = true;
    uv.needsUpdate = true;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();

    const rnd = this.rnd;
    const dm = this.dummy;
    const place = (mesh: InstancedMesh, n: number, zMin: number, zMax: number, s0: number, s1: number, sink = 0.2, colors?: number[], yScale = 1) => {
      const count = Math.min(mesh.instanceMatrix.count, Math.round(n));
      for (let k = 0; k < count; k++) {
        const lx = rnd.range(-TILE_W / 2, TILE_W / 2);
        const lz = rnd.range(zMin, zMax);
        const s = rnd.range(s0, s1);
        const y = seabedHeight(wx0 + lx, lz);
        dm.position.set(lx, y - s * sink, lz);
        dm.rotation.set(rnd.range(-0.15, 0.15), rnd.range(0, Math.PI * 2), rnd.range(-0.15, 0.15));
        dm.scale.set(s, s * yScale * rnd.range(0.8, 1.2), s);
        dm.updateMatrix();
        mesh.setMatrixAt(k, dm.matrix);
        if (colors && mesh.instanceColor) mesh.setColorAt(k, c.setHex(rnd.pick(colors)).multiplyScalar(rnd.range(0.7, 1.1)));
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      return count;
    };

    const d = this.quality.density;
    const rockCols = [z.rock, z.seabed, z.rock];
    place(tile.rocksA, 60 * d, -480, -30, 2, 14, 0.35, rockCols);
    place(tile.rocksB, 22 * d, -520, -160, 14, 48, 0.4, rockCols);
    place(tile.kelp, 90 * d * z.kelp, -380, -50, 0.6, 1.25, 0, [0x6f8a32, 0x8a9a36, 0x557a38, 0x9a7a34]);
    tile.coral.forEach((m, i) => place(m, 22 * d * z.coral, -330, -60, i === 1 ? 0.8 : 1.2, i === 1 ? 1.8 : 2.6, 0.1, CORAL_COLORS));
    const nWorms = place(tile.tubes, 26 * d * z.tubeWorms, -360, -40, 0.9, 1.8, 0);
    for (let k = 0; k < nWorms; k++) {
      tile.tubes.getMatrixAt(k, m4);
      tile.plumes.setMatrixAt(k, m4);
    }
    tile.plumes.count = nWorms;
    tile.plumes.instanceMatrix.needsUpdate = true;
    tile.plumes.computeBoundingSphere();

    const nVents = z.vents > 0 ? Math.round(rnd.range(1, 3) * z.vents) : 0;
    tile.ventTops = [];
    for (let k = 0; k < nVents; k++) {
      const lx = rnd.range(-TILE_W / 2 + 40, TILE_W / 2 - 40);
      const lz = rnd.range(-260, -70);
      const s = rnd.range(0.9, 1.5);
      const y = seabedHeight(wx0 + lx, lz) - 2;
      dm.position.set(lx, y, lz);
      dm.rotation.set(0, rnd.range(0, 6), 0);
      dm.scale.setScalar(s);
      dm.updateMatrix();
      tile.vents.setMatrixAt(k, dm.matrix);
      const top = y + 40 * s;
      dm.position.set(lx, top, lz);
      dm.scale.set(s, s * 0.5, s);
      dm.updateMatrix();
      tile.ventGlow.setMatrixAt(k, dm.matrix);
      tile.ventTops.push(lx, top, lz);
    }
    tile.vents.count = tile.ventGlow.count = nVents;
    tile.vents.instanceMatrix.needsUpdate = tile.ventGlow.instanceMatrix.needsUpdate = true;
    tile.vents.computeBoundingSphere();
    tile.ventGlow.computeBoundingSphere();

    // Smoke particles emitted from vent tops.
    const sp = tile.smoke.geometry.attributes.position as BufferAttribute;
    for (let s = 0; s < sp.count; s++) {
      if (nVents === 0) {
        sp.setXYZ(s, 0, -9999, 0);
        continue;
      }
      const v = s % nVents;
      sp.setXYZ(s, tile.ventTops[v * 3] + rnd.range(-2, 2), tile.ventTops[v * 3 + 1], tile.ventTops[v * 3 + 2] + rnd.range(-2, 2));
    }
    sp.needsUpdate = true;
    tile.smoke.visible = nVents > 0;
  }

  update(dt: number, speed: number) {
    this.scroll += speed * dt;
    for (const t of this.tiles) {
      t.group.position.x = t.index * TILE_W - this.scroll - TILE_W * 0.5;
      if (t.group.position.x < -TILE_W * 1.6) {
        t.index += TILES;
        this.generate(t);
        t.group.position.x = t.index * TILE_W - this.scroll - TILE_W * 0.5;
      }
    }
  }

  /** Seabed height under a gameplay x (z = 0 plane), for collisions with the floor. */
  floorAt(x: number) {
    return seabedHeight(x + this.scroll + TILE_W * 0.5, 0);
  }

  get worldScroll() {
    return this.scroll;
  }

  applyQuality(q: QualityPreset) {
    this.quality = q;
    this.smokeMat.uniforms.uPixelRatio.value = Math.min(devicePixelRatio, q.maxPixelRatio);
  }
}

const m4 = new Matrix4();
