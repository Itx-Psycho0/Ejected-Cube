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
  low: { level: 'low', maxPixelRatio: 1, msaa: 0, bloom: true, bloomScale: 0.35, shadows: false, shadowMapSize: 512, chromatic: false, density: 0.4, godRays: false },
  medium: { level: 'medium', maxPixelRatio: 1.25, msaa: 0, bloom: true, bloomScale: 0.5, shadows: false, shadowMapSize: 1024, chromatic: true, density: 0.65, godRays: true },
  high: { level: 'high', maxPixelRatio: 1.75, msaa: 2, bloom: true, bloomScale: 0.5, shadows: true, shadowMapSize: 1024, chromatic: true, density: 0.9, godRays: true },
};

/** Best-guess starting preset from the device, refined later by the FPS governor. */
export function detectQuality(): QualityLevel {
  // Core count says little about the GPU, so start in the middle and let
  // the governor's dynamic resolution find what the device can hold.
  return matchMedia('(pointer: coarse)').matches ? 'low' : 'medium';
}
