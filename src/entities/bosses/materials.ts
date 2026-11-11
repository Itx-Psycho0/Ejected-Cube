import { CanvasTexture, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { Noise } from '../../core/noise';
import { getTextures } from '../../world/textures';

let cracks: CanvasTexture | null = null;

/** Glowing magma veins: thin bright lines where ridged noise peaks. */
export function crackTexture() {
  if (cracks) return cracks;
  const n = new Noise(66);
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = 1 - Math.abs(n.noise2((x / size) * 6, (y / size) * 6, 6));
      const v2 = 1 - Math.abs(n.noise2((x / size) * 14 + 3, (y / size) * 14, 14));
      const line = Math.pow(Math.max(v, v2 * 0.8), 14);
      const i = (y * size + x) * 4;
      img.data[i] = 255 * Math.min(1, line * 1.4);
      img.data[i + 1] = 140 * line;
      img.data[i + 2] = 40 * line;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  cracks = new CanvasTexture(c);
  cracks.wrapS = cracks.wrapT = RepeatWrapping;
  cracks.colorSpace = SRGBColorSpace;
  return cracks;
}

export function fleshMaterial(color: number, opts: { emissive?: number; emissiveIntensity?: number; wet?: boolean } = {}) {
  const tex = getTextures();
  if (opts.wet)
    return new MeshPhysicalMaterial({
      color,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.25,
      normalMap: tex.scalesNormal,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0,
    });
  return new MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.05,
    normalMap: tex.rockNormal,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

export function glowMaterial(color: number, intensity = 4) {
  return new MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, toneMapped: false });
}

export function toothMaterial() {
  return new MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.25, metalness: 0.05 });
}

export function eyeMaterial() {
  return new MeshPhysicalMaterial({ color: 0x050505, roughness: 0.2, clearcoat: 1, metalness: 0.2 });
}
