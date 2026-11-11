import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  AdditiveBlending,
  Object3D,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
} from 'three';
import { noise } from '../core/noise';
import { Random } from '../core/Random';
import { smoothstep } from '../core/math';
import type { QualityPreset } from '../core/Quality';
import type { ThemeDef } from '../themes/themes';
import type { Atmosphere } from './Atmosphere';
import { groundNormal, getTextures } from './textures';
import { patchCaustics, patchSway } from './shaderPatches';
import { propGeometry, type PropGeometry } from './props';

const TILE_W = 640;
const Z_BACK = -560;
const Z_FRONT = 90;
const SEG_X = 84;
const SEG_Z = 60;
export const GROUND_Y = -118;
const TILES = 3;

/** Terrain shape, set per theme. */
const shape = { hills: 1, ridges: 1 };

/** Ground height at a world x / z. Continuous across tiles. */
export function groundHeight(wx: number, z: number): number {
  const base = noise.fbm2(wx * 0.0035, z * 0.0042, 5) * 28 * shape.hills;
  const dunes = Math.sin(wx * 0.021 + noise.noise2(wx * 0.003, z * 0.01) * 3) * 2.5 * shape.hills;
  const back = smoothstep(-150, -540, z);
  const ridge = noise.ridged2(wx * 0.0024, z * 0.0055, 4) * 230 * back * shape.ridges;
  const spires = Math.max(0, noise.noise2(wx * 0.006, 9.1) - 0.35) * 260 * back * shape.ridges;
  const front = smoothstep(-20, Z_FRONT, z) * -40;
  return GROUND_Y + base + dunes + ridge + spires + front;
}

interface Tile {
  index: number;
  group: Group;
  terrain: Mesh<BufferGeometry, MeshStandardMaterial>;
  tall: InstancedMesh;
  cluster: InstancedMesh[];
  stem: InstancedMesh;
  head: InstancedMesh;
  rockA: InstancedMesh;
  rockB: InstancedMesh;
  special: InstancedMesh;
  glow: InstancedMesh;
  plume: Points<BufferGeometry, ShaderMaterial>;
  tops: number[];
}

/**
 * Infinite scrolling ground made of three recycled tiles, dressed with the
 * current world's props. `setTheme` rebuilds every tile at once (the swap
 * happens behind the page-turn transition).
 */
export class Ground {
  readonly root = new Group();
  private tiles: Tile[] = [];
  private scroll = 0;
  private terrainMat: MeshStandardMaterial;
  private propMat: MeshStandardMaterial;
  private swayMat: MeshStandardMaterial;
  private headMat: MeshStandardMaterial;
  private glowMat: MeshStandardMaterial;
  private plumeMat: ShaderMaterial;
  private sway = { value: 1 };
  private theme: ThemeDef;
  private geo: PropGeometry;
  private dummy = new Object3D();
  private rnd = new Random(5150);
  private color = new Color();

  constructor(
    scene: Scene,
    theme: ThemeDef,
    atmo: Atmosphere,
    private quality: QualityPreset,
  ) {
    this.theme = theme;
    this.geo = propGeometry(theme.id);
    const tex = getTextures();
    const shared = atmo.shared;

    this.terrainMat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, roughnessMap: tex.sandRough, normalMap: tex.sandNormal, metalness: 0 });
    patchCaustics(this.terrainMat, shared);
    this.propMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, normalMap: tex.rockNormal, metalness: 0.02 });
    patchCaustics(this.propMat, shared);
    this.swayMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: DoubleSide });
    patchSway(this.swayMat, shared.uTime, this.sway, 'ground', shared);
    this.headMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0x000000 });
    patchSway(this.headMat, shared.uTime, this.sway, 'heads');
    this.glowMat = new MeshStandardMaterial({ color: 0x000000, emissive: 0xff6a1a, emissiveIntensity: 4, toneMapped: false });
    this.plumeMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      uniforms: {
        uTime: shared.uTime,
        uPixelRatio: { value: Math.min(devicePixelRatio, quality.maxPixelRatio) },
        uColor: { value: new Color(0x0d0b0a) },
        uHot: { value: new Color(0xff7326) },
        uSize: { value: 1 },
        uRise: { value: 140 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime, uPixelRatio, uSize, uRise;
        attribute float aSeed;
        varying float vLife;
        void main() {
          float life = fract(uTime * (0.12 + aSeed * 0.05) + aSeed);
          vec3 p = position;
          p.y += life * uRise;
          p.x += sin(life * 6.0 + aSeed * 20.0) * life * 14.0 - life * 30.0;
          p.z += cos(life * 5.0 + aSeed * 11.0) * life * 8.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (6.0 + life * 46.0) * uSize * uPixelRatio * (220.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vLife = life;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor, uHot;
        varying float vLife;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = (1.0 - d * 2.0) * (1.0 - vLife) * smoothstep(0.0, 0.08, vLife) * 0.5;
          vec3 hot = uHot * (1.0 - smoothstep(0.0, 0.15, vLife)) * 2.0;
          gl_FragColor = vec4(uColor + hot, a);
        }`,
    });

    const d = quality.density;
    for (let i = 0; i < TILES; i++) {
      const group = new Group();
      const terrain = new Mesh(this.terrainGeometry(), this.terrainMat);
      terrain.receiveShadow = true;
      group.add(terrain);
      const inst = (geo: BufferGeometry, mat: MeshStandardMaterial, max: number) => {
        const n = Math.max(1, Math.ceil(max * d));
        const m = new InstancedMesh(geo, mat, n);
        m.instanceMatrix.setUsage(DynamicDrawUsage);
        m.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
        m.count = 0;
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
        return m;
      };
      const plumeGeo = new BufferGeometry();
      const sCount = Math.ceil(160 * d);
      plumeGeo.setAttribute('position', new BufferAttribute(new Float32Array(sCount * 3), 3));
      const seeds = new Float32Array(sCount);
      for (let s = 0; s < sCount; s++) seeds[s] = Math.random();
      plumeGeo.setAttribute('aSeed', new BufferAttribute(seeds, 1));
      const plume = new Points(plumeGeo, this.plumeMat);
      plume.frustumCulled = false;
      group.add(plume);
      const g = this.geo;
      const tile: Tile = {
        index: i,
        group,
        terrain,
        tall: inst(g.tall, this.swayMat, 90),
        cluster: g.cluster.map((cg) => inst(cg, this.propMat, 30)),
        stem: inst(g.stem, this.swayMat, 40),
        head: inst(g.head, this.headMat, 40),
        rockA: inst(g.rockA, this.propMat, 60),
        rockB: inst(g.rockB, this.propMat, 24),
        special: inst(g.special ?? g.rockA, this.propMat, 3),
        glow: inst(g.specialGlow ?? g.rockA, this.glowMat, 3),
        plume,
        tops: [],
      };
      tile.tall.castShadow = false;
      tile.stem.castShadow = tile.head.castShadow = false;
      this.tiles.push(tile);
      this.root.add(group);
    }
    this.setTheme(theme);
    scene.add(this.root);
  }

  private terrainGeometry(): BufferGeometry {
    const g = new PlaneGeometry(TILE_W, Z_FRONT - Z_BACK, SEG_X, SEG_Z);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, (Z_FRONT + Z_BACK) / 2);
    g.setAttribute('color', new BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    return g;
  }

  /** Swap the whole ground to a new world. */
  setTheme(theme: ThemeDef) {
    this.theme = theme;
    const w = theme.world;
    shape.hills = w.hills;
    shape.ridges = w.ridges;
    this.geo = propGeometry(theme.id);
    const g = this.geo;
    this.terrainMat.normalMap = groundNormal(w.groundTexture);
    this.terrainMat.roughness = w.groundRoughness;
    this.terrainMat.metalness = w.groundTexture === 'tiles' ? 0.15 : 0;
    this.terrainMat.normalScale.set(w.groundTexture === 'studs' ? 1.4 : 0.9, w.groundTexture === 'studs' ? 1.4 : 0.9);
    this.terrainMat.needsUpdate = true;
    this.sway.value = theme.props.sway;
    this.glowMat.emissive.setHex(theme.props.special);
    const u = this.plumeMat.uniforms;
    if (g.plume === 'smoke') {
      u.uColor.value.setHex(0x0d0b0a);
      u.uHot.value.setHex(0xff7326);
      u.uSize.value = 1;
      u.uRise.value = 140;
      this.plumeMat.blending = NormalBlending;
    } else if (g.plume === 'steam') {
      u.uColor.value.setHex(0xe8f4fa);
      u.uHot.value.setHex(0x000000);
      u.uSize.value = 1.1;
      u.uRise.value = 120;
      this.plumeMat.blending = NormalBlending;
    } else {
      u.uColor.value.setHex(0xff6b1a);
      u.uHot.value.setHex(0x000000);
      u.uSize.value = 0.25;
      u.uRise.value = 90;
      this.plumeMat.blending = AdditiveBlending;
    }
    this.plumeMat.needsUpdate = true;
    for (const t of this.tiles) {
      t.tall.geometry = g.tall;
      t.cluster.forEach((m, i) => (m.geometry = g.cluster[i]));
      t.stem.geometry = g.stem;
      t.head.geometry = g.head;
      t.rockA.geometry = g.rockA;
      t.rockB.geometry = g.rockB;
      if (g.special) t.special.geometry = g.special;
      if (g.specialGlow) t.glow.geometry = g.specialGlow;
      this.generate(t);
    }
  }

  private generate(tile: Tile) {
    const th = this.theme;
    const w = th.world;
    const pr = th.props;
    const wx0 = tile.index * TILE_W;
    const geo = tile.terrain.geometry;
    const p = geo.attributes.position;
    const col = geo.attributes.color as BufferAttribute;
    const uv = geo.attributes.uv as BufferAttribute;
    const base = new Color(w.ground);
    const alt = new Color(w.groundAlt);
    const c = this.color;
    const uvScale = w.groundTexture === 'studs' ? 24 : w.groundTexture === 'tiles' ? 40 : 70;
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i);
      const lz = p.getZ(i);
      p.setY(i, groundHeight(wx0 + lx, lz));
      uv.setXY(i, (wx0 + lx) / uvScale, lz / uvScale);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const slope = 1 - nrm.getY(i);
      const h = p.getY(i);
      const altness = smoothstep(0.12, 0.38, slope) + smoothstep(-40, 40, h) * 0.6;
      const ao = 0.62 + 0.38 * smoothstep(-160, -90, h);
      const v = 0.88 + noise.noise2((wx0 + p.getX(i)) * 0.05, p.getZ(i) * 0.05) * 0.12;
      c.copy(base).lerp(alt, Math.min(1, altness)).multiplyScalar(ao * v);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    p.needsUpdate = col.needsUpdate = uv.needsUpdate = true;
    geo.computeBoundingSphere();

    const rnd = this.rnd;
    const dm = this.dummy;
    const d = this.quality.density;
    const place = (mesh: InstancedMesh, n: number, zMin: number, zMax: number, s0: number, s1: number, sink: number, colors: number[]) => {
      const count = Math.min(mesh.instanceMatrix.count, Math.round(n));
      for (let k = 0; k < count; k++) {
        const lx = rnd.range(-TILE_W / 2, TILE_W / 2);
        const lz = rnd.range(zMin, zMax);
        const s = rnd.range(s0, s1);
        dm.position.set(lx, groundHeight(wx0 + lx, lz) - s * sink, lz);
        dm.rotation.set(rnd.range(-0.08, 0.08), rnd.range(0, Math.PI * 2), rnd.range(-0.08, 0.08));
        dm.scale.set(s, s * rnd.range(0.85, 1.15), s);
        dm.updateMatrix();
        mesh.setMatrixAt(k, dm.matrix);
        mesh.setColorAt(k, c.setHex(rnd.pick(colors)).multiplyScalar(rnd.range(0.85, 1.08)));
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      return count;
    };
    const g = this.geo;
    const den = pr.density;
    const rs = g.rockScale ?? 1;
    place(tile.rockA, 60 * d * den.rocks, -480, -30, 2 * rs, 14 * rs, 0.35, pr.rock);
    place(tile.rockB, 22 * d * den.rocks, -520, -160, 14 * rs, 48 * rs, 0.4, pr.rock);
    place(tile.tall, 90 * d * den.tall, -400, -50, g.tallScale[0], g.tallScale[1], 0, pr.tall);
    tile.cluster.forEach((m) => place(m, 26 * d * den.cluster, -340, -60, g.clusterScale[0], g.clusterScale[1], 0.05, pr.cluster));
    const n = place(tile.stem, 40 * d * den.small, -340, -40, 0.9, 1.8, 0, [pr.small[0]]);
    for (let k = 0; k < n; k++) {
      tile.stem.getMatrixAt(k, m4);
      tile.head.setMatrixAt(k, m4);
      tile.head.setColorAt(k, c.setHex(pr.small[1]));
    }
    tile.head.count = n;
    tile.head.instanceMatrix.needsUpdate = true;
    if (tile.head.instanceColor) tile.head.instanceColor.needsUpdate = true;
    tile.head.computeBoundingSphere();

    const nSpecial = g.special && den.special > 0 ? Math.round(rnd.range(1, 3) * den.special) : 0;
    tile.tops = [];
    for (let k = 0; k < nSpecial; k++) {
      const lx = rnd.range(-TILE_W / 2 + 40, TILE_W / 2 - 40);
      const lz = rnd.range(-260, -70);
      const s = rnd.range(0.9, 1.4);
      const y = groundHeight(wx0 + lx, lz) - 2;
      dm.position.set(lx, y, lz);
      dm.rotation.set(0, rnd.range(0, 6), 0);
      dm.scale.setScalar(s);
      dm.updateMatrix();
      tile.special.setMatrixAt(k, dm.matrix);
      tile.special.setColorAt(k, c.setHex(pr.rock[0]));
      const top = y + g.specialTop * s;
      dm.position.set(lx, top, lz);
      dm.scale.set(s, s * 0.5, s);
      dm.updateMatrix();
      tile.glow.setMatrixAt(k, dm.matrix);
      tile.tops.push(lx, top, lz);
    }
    tile.special.count = tile.glow.count = nSpecial;
    tile.special.instanceMatrix.needsUpdate = tile.glow.instanceMatrix.needsUpdate = true;
    if (tile.special.instanceColor) tile.special.instanceColor.needsUpdate = true;
    tile.special.computeBoundingSphere();
    tile.glow.computeBoundingSphere();

    const sp = tile.plume.geometry.attributes.position as BufferAttribute;
    for (let s = 0; s < sp.count; s++) {
      if (nSpecial === 0) {
        sp.setXYZ(s, 0, -9999, 0);
        continue;
      }
      const v = s % nSpecial;
      sp.setXYZ(s, tile.tops[v * 3] + rnd.range(-2, 2), tile.tops[v * 3 + 1], tile.tops[v * 3 + 2] + rnd.range(-2, 2));
    }
    sp.needsUpdate = true;
    tile.plume.visible = nSpecial > 0;
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

  floorAt(x: number) {
    return groundHeight(x + this.scroll + TILE_W * 0.5, 0);
  }

  get worldScroll() {
    return this.scroll;
  }

  applyQuality(q: QualityPreset) {
    this.quality = q;
    this.plumeMat.uniforms.uPixelRatio.value = Math.min(devicePixelRatio, q.maxPixelRatio);
  }
}

const m4 = new Matrix4();
