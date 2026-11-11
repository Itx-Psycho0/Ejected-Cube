import type { QualityLevel } from './Quality';

/**
 * Keeps the frame rate smooth with dynamic resolution: when frames get slow
 * the render scale drops a step, and it creeps back up when there is headroom.
 * Only if the lowest scale still can't hold does it lower the quality preset.
 */
export class QualityGovernor {
  enabled = true;
  /** Multiplier on the preset's pixel ratio, 0.55..1. */
  scale = 1;
  private slow = 0;
  private fast = 0;
  private settle = 3;

  constructor(
    private onScale: (scale: number) => void,
    private onDowngrade: (to: QualityLevel) => void,
  ) {}

  /** Call after anything that causes a one-off hitch (world swap, boss spawn). */
  hold(seconds = 2.5) {
    this.settle = Math.max(this.settle, seconds);
    this.slow = 0;
  }

  update(dt: number, fps: number, current: QualityLevel) {
    if (!this.enabled) return;
    if (this.settle > 0) {
      this.settle -= dt;
      return;
    }
    if (fps < 50) {
      this.slow += dt;
      this.fast = 0;
    } else if (fps > 57) {
      this.fast += dt;
      this.slow = Math.max(0, this.slow - dt);
    } else this.fast = 0;

    if (this.slow > 1.2) {
      this.slow = 0;
      if (this.scale > 0.56) {
        this.scale = Math.max(0.55, this.scale - (fps < 35 ? 0.2 : 0.1));
        this.onScale(this.scale);
        this.settle = 1;
      } else if (current !== 'low') {
        this.scale = 0.8;
        this.onDowngrade(current === 'high' ? 'medium' : 'low');
        this.settle = 3;
      }
    } else if (this.fast > 6 && this.scale < 1) {
      this.fast = 0;
      this.scale = Math.min(1, this.scale + 0.05);
      this.onScale(this.scale);
      this.settle = 1;
    }
  }
}
