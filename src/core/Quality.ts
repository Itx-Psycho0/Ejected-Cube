export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset {
  level: QualityLevel;
  /** Upper bound for devicePixelRatio. */
  maxPixelRatio: number;
  /** MSAA samples used by the post-processing composer (0 = off). */
  msaa: number;
  bloom: boolean;
  /** Bloom is rendered at this fraction of the screen resolution. */
  bloomScale: number;
  shadows: boolean;
  shadowMapSize: number;
  chromatic: boolean;
  /** Multiplier applied to every particle / instance budget. */
  density: number;
  godRays: boolean;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  low: {
    level: 'low',
    maxPixelRatio: 1,
    msaa: 0,
    bloom: true,
    bloomScale: 0.35,
    shadows: false,
    shadowMapSize: 512,
    chromatic: false,
    density: 0.45,
    godRays: false,
  },
  medium: {
    level: 'medium',
    maxPixelRatio: 1.5,
    msaa: 2,
    bloom: true,
    bloomScale: 0.5,
    shadows: false,
    shadowMapSize: 1024,
    chromatic: true,
    density: 0.75,
    godRays: true,
  },
  high: {
    level: 'high',
    maxPixelRatio: 2,
    msaa: 4,
    bloom: true,
    bloomScale: 0.5,
    shadows: true,
    shadowMapSize: 2048,
    chromatic: true,
    density: 1,
    godRays: true,
  },
};

/** Best-guess starting preset from the device, refined later by the FPS governor. */
export function detectQuality(): QualityLevel {
  const mobile = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mobile) return cores >= 8 ? 'medium' : 'low';
  return cores >= 8 ? 'high' : 'medium';
}
