import { PerspectiveCamera, Vector3 } from 'three';
import { damp } from '../core/math';
import { Noise } from '../core/noise';

const shakeNoise = new Noise(99);

/**
 * Trauma-based camera shake (shake = trauma^2), a gentle follow of the pod
 * for parallax, and a zoom channel for cinematic moments.
 */
export class CameraRig {
  trauma = 0;
  shakeScale = 1;
  private t = 0;
  private follow = new Vector3();
  readonly base = new Vector3(0, 6, 230);
  readonly look = new Vector3(0, -14, 0);
  zoom = 1;
  private zoomTarget = 1;
  /** Extra offset used by cutscenes (eject launch, surfacing). */
  readonly offset = new Vector3();

  constructor(private camera: PerspectiveCamera) {}

  addTrauma(v: number) {
    this.trauma = Math.min(1, this.trauma + v);
  }

  setZoom(z: number) {
    this.zoomTarget = z;
  }

  update(dt: number, px: number, py: number) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.1);
    this.zoom = damp(this.zoom, this.zoomTarget, 2, dt);
    this.follow.x = damp(this.follow.x, px * 0.12, 2, dt);
    this.follow.y = damp(this.follow.y, py * 0.18, 2, dt);
    const s = this.trauma * this.trauma * this.shakeScale;
    const sx = shakeNoise.noise2(this.t * 18, 1.3) * 9 * s;
    const sy = shakeNoise.noise2(this.t * 18, 7.1) * 9 * s;
    const rz = shakeNoise.noise2(this.t * 14, 3.7) * 0.04 * s;
    const c = this.camera;
    c.position.set(
      this.base.x + this.follow.x + sx + this.offset.x,
      this.base.y + this.follow.y + sy + this.offset.y,
      this.base.z / this.zoom + this.offset.z,
    );
    c.lookAt(this.look.x + this.follow.x * 0.6 + this.offset.x, this.look.y + this.follow.y * 0.6 + this.offset.y, this.look.z);
    c.rotation.z += rz;
  }
}
