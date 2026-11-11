import {
  Color,
  DataTexture,
  Material,
  Mesh,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  RedFormat,
} from 'three';
import type { MaterialStyle } from './themes';

function gradient(steps: number[]) {
  const data = new Uint8Array(steps.map((s) => Math.round(s * 255)));
  const t = new DataTexture(data, steps.length, 1, RedFormat);
  t.minFilter = t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

const TOON_RAMP = gradient([0.35, 0.68, 1]);
const FLAT_RAMP = gradient([0.62, 1]);

type Patchable = Material & {
  onBeforeCompile: Material['onBeforeCompile'];
  customProgramCacheKey: Material['customProgramCacheKey'];
};

/**
 * Restyles every PBR material in the scene for the current theme.
 * The original material is kept on `userData.baseMat`; styled variants
 * are cached per original, so shared materials stay shared and switching
 * back and forth never leaks.
 */
export class MaterialStyler {
  private cache = new WeakMap<Material, Map<MaterialStyle, Material>>();
  private live: [MeshStandardMaterial, MeshStandardMaterial | MeshToonMaterial][] = [];
  style: MaterialStyle = 'pbr';

  /**
   * Game code animates glow and fades on the original materials; mirror
   * those values onto the styled copies once per frame.
   */
  sync() {
    if (this.style === 'pbr') return;
    for (const [b, v] of this.live) {
      v.emissiveIntensity = b.emissiveIntensity;
      v.emissive.copy(b.emissive);
      v.opacity = b.opacity;
      v.visible = b.visible;
    }
  }

  setStyle(style: MaterialStyle, root: Object3D) {
    this.style = style;
    this.live = [];
    this.apply(root);
  }

  apply(root: Object3D) {
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const base = (m.userData.baseMat as Material | undefined) ?? m.material;
      if (!(base as MeshStandardMaterial).isMeshStandardMaterial) return;
      m.userData.baseMat = base;
      m.material = this.variant(base as MeshStandardMaterial);
    });
  }

  private variant(base: MeshStandardMaterial): Material {
    if (this.style === 'pbr') return base;
    let byStyle = this.cache.get(base);
    if (!byStyle) this.cache.set(base, (byStyle = new Map()));
    const hit = byStyle.get(this.style);
    if (hit) {
      this.track(base, hit);
      return hit;
    }
    const made = this.make(base);
    // Keep the shader patches (sway, swim, caustics) working on the new material.
    const p = made as Patchable;
    p.onBeforeCompile = base.onBeforeCompile;
    const key = base.customProgramCacheKey();
    p.customProgramCacheKey = () => `${key}|${this.style}`;
    byStyle.set(this.style, made);
    this.track(base, made);
    return made;
  }

  private track(base: MeshStandardMaterial, v: Material) {
    if (!this.live.some(([b]) => b === base)) this.live.push([base, v as MeshStandardMaterial]);
  }

  private make(b: MeshStandardMaterial): Material {
    if (this.style === 'toon' || this.style === 'flat') {
      const t = new MeshToonMaterial({
        color: b.color.clone(),
        map: b.map,
        gradientMap: this.style === 'toon' ? TOON_RAMP : FLAT_RAMP,
        emissive: b.emissive.clone(),
        emissiveIntensity: b.emissiveIntensity,
        emissiveMap: b.emissiveMap,
        normalMap: this.style === 'toon' ? null : b.normalMap,
        alphaMap: b.alphaMap,
        transparent: b.transparent,
        opacity: b.opacity,
        side: b.side,
        depthWrite: b.depthWrite,
        alphaTest: b.alphaTest,
        vertexColors: b.vertexColors,
        toneMapped: b.toneMapped,
      });
      if (this.style === 'flat') t.color.lerp(new Color(0xffffff), 0.06);
      return t;
    }
    const c = b.clone();
    if (this.style === 'plastic') {
      c.roughness = 0.28;
      c.metalness = 0;
      c.roughnessMap = null;
      c.normalScale.set(0.15, 0.15);
    } else if (this.style === 'clay') {
      c.roughness = 0.95;
      c.metalness = 0;
      c.roughnessMap = null;
      c.normalScale.set(0.6, 0.6);
    }
    return c;
  }
}
