/**
 * requestAnimationFrame loop with clamped delta time.
 * Every simulation step receives seconds, so speed is identical at 30, 60 or 144 Hz.
 */
export class Loop {
  private last = 0;
  private raf = 0;
  private running = false;
  /** Global slow-motion multiplier (hit-stop, boss deaths). */
  timeScale = 1;
  elapsed = 0;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(private tick: (dt: number, rawDt: number) => void) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const raw = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    this.elapsed += raw;
    this.fpsAcc += raw;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    this.tick(raw * this.timeScale, raw);
  };
}
