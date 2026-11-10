import type { QualityLevel } from './Quality';

/**
 * Watches the frame rate and steps quality down when the device can't keep up,
 * so slow laptops and phones stay playable without visiting the settings.
 */
export class QualityGovernor {
  private lowTime = 0;
  private cooldown = 4;
  enabled = true;

  constructor(private onDowngrade: (to: QualityLevel) => void) {}

  update(dt: number, fps: number, current: QualityLevel) {
    if (!this.enabled) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.lowTime = fps < 42 ? this.lowTime + dt : Math.max(0, this.lowTime - dt * 2);
    if (this.lowTime > 3) {
      this.lowTime = 0;
      this.cooldown = 6;
      if (current === 'high') this.onDowngrade('medium');
      else if (current === 'medium') this.onDowngrade('low');
      else this.enabled = false;
    }
  }
}
