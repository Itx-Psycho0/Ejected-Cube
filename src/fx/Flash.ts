import { Color, PointLight, Scene } from 'three';

/**
 * A single pooled point light used for explosion and flare flashes.
 * The scene keeps a constant light count so shaders never recompile mid-game.
 */
export class Flash {
  readonly light = new PointLight(0xffffff, 0, 420, 1.4);
  private energy = 0;
  private color = new Color();

  constructor(scene: Scene) {
    this.light.position.set(0, 0, 40);
    scene.add(this.light);
  }

  trigger(x: number, y: number, color: number, strength: number) {
    if (strength < this.energy * 0.6) return;
    this.energy = strength;
    this.light.position.set(x, y, 40);
    this.light.color.copy(this.color.setHex(color));
  }

  update(dt: number) {
    this.energy *= Math.exp(-dt * 7);
    this.light.intensity = this.energy * 60000;
  }
}
