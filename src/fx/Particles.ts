import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  NormalBlending,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { fx } from '../core/Random';

/**
 * GPU particle system. Each particle is written once into a ring buffer
 * (start, velocity, colour, timing) and its motion is evaluated entirely in
 * the vertex shader, so thousands of bubbles and sparks cost one draw call
 * and almost no CPU.
 */
class ParticleLayer {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private start: BufferAttribute;
  private vel: BufferAttribute;
  private color: BufferAttribute;
  private data: BufferAttribute;
  private extra: BufferAttribute;
  private cursor = 0;
  private dirtyFrom = Infinity;
  private dirtyTo = -1;
  private wrapped = false;

  constructor(
    readonly capacity: number,
    additive: boolean,
    uniforms: Record<string, { value: unknown }>,
  ) {
    const g = new BufferGeometry();
    const mk = (n: number) => {
      const a = new BufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.start = mk(3);
    this.vel = mk(3);
    this.color = mk(3);
    this.data = mk(4); // birth, life, size, drag
    this.extra = mk(3); // gravity, birthScroll, wobble
    // Park unused particles far in the past so they are invisible.
    for (let i = 0; i < capacity; i++) this.data.setXYZW(i, -999, 0.001, 0, 0);
    g.setAttribute('position', this.start);
    g.setAttribute('aVel', this.vel);
    g.setAttribute('aColor', this.color);
    g.setAttribute('aData', this.data);
    g.setAttribute('aExtra', this.extra);
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime, uScroll, uPixelRatio;
        attribute vec3 aVel; attribute vec3 aColor; attribute vec4 aData; attribute vec3 aExtra;
        varying vec3 vColor; varying float vT;
        void main() {
          float age = uTime - aData.x;
          float t = age / aData.y;
          if (t < 0.0 || t > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          float drag = aData.w;
          float k = drag > 0.0 ? (1.0 - exp(-drag * age)) / drag : age;
          vec3 p = position + aVel * k;
          p.y += aExtra.x * age * age * 0.5;
          p.x -= (uScroll - aExtra.y);
          p.x += sin(age * 7.0 + aData.x * 13.0) * aExtra.z;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aData.z * uPixelRatio * (240.0 / -mv.z) * (1.0 - t * 0.5);
          gl_Position = projectionMatrix * mv;
          vColor = aColor; vT = t;
        }`,
      fragmentShader: additive
        ? /* glsl */ `
        varying vec3 vColor; varying float vT;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = pow(1.0 - d * 2.0, 1.6) * (1.0 - vT);
          gl_FragColor = vec4(vColor * a, a);
        }`
        : /* glsl */ `
        varying vec3 vColor; varying float vT;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = (1.0 - d * 2.0) * (1.0 - vT) * smoothstep(0.0, 0.1, vT) * 0.6;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
  }

  emit(p: Vector3, v: Vector3, c: Color, time: number, life: number, size: number, drag: number, gravity: number, scroll: number, wobble: number) {
    const i = this.cursor;
    this.start.setXYZ(i, p.x, p.y, p.z);
    this.vel.setXYZ(i, v.x, v.y, v.z);
    this.color.setXYZ(i, c.r, c.g, c.b);
    this.data.setXYZW(i, time, life, size, drag);
    this.extra.setXYZ(i, gravity, scroll, wobble);
    this.dirtyFrom = Math.min(this.dirtyFrom, i);
    this.dirtyTo = Math.max(this.dirtyTo, i);
    this.cursor = (i + 1) % this.capacity;
    if (this.cursor === 0) this.wrapped = true;
  }

  flush() {
    if (this.dirtyTo < 0) return;
    const attrs = [this.start, this.vel, this.color, this.data, this.extra];
    for (const a of attrs) {
      a.clearUpdateRanges();
      if (this.wrapped) a.addUpdateRange(0, this.capacity * a.itemSize);
      else a.addUpdateRange(this.dirtyFrom * a.itemSize, (this.dirtyTo - this.dirtyFrom + 1) * a.itemSize);
      a.needsUpdate = true;
    }
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
    this.wrapped = false;
  }
}

export interface BurstOptions {
  count: number;
  color: number | Color;
  speed: number;
  size: number;
  life: number;
  drag?: number;
  gravity?: number;
  spread?: number;
  /** Additional random colour variation 0..1. */
  jitter?: number;
  smoke?: boolean;
  wobble?: number;
  dir?: Vector3;
}

export class Particles {
  private glow: ParticleLayer;
  private smoke: ParticleLayer;
  private uniforms = { uTime: { value: 0 }, uScroll: { value: 0 }, uPixelRatio: { value: 1 } };
  private p = new Vector3();
  private v = new Vector3();
  private c = new Color();
  private base = new Color();
  private time = 0;
  scroll = 0;

  constructor(scene: Scene, density: number, pixelRatio: number) {
    this.uniforms.uPixelRatio.value = pixelRatio;
    this.glow = new ParticleLayer(Math.round(7000 * Math.max(0.5, density)), true, this.uniforms);
    this.smoke = new ParticleLayer(Math.round(2000 * Math.max(0.5, density)), false, this.uniforms);
    scene.add(this.glow.points, this.smoke.points);
  }

  burst(pos: Vector3, o: BurstOptions) {
    const layer = o.smoke ? this.smoke : this.glow;
    if (typeof o.color === 'number') this.base.setHex(o.color);
    else this.base.copy(o.color);
    for (let i = 0; i < o.count; i++) {
      this.p.copy(pos);
      if (o.spread) this.p.add(this.v.set(fx.range(-1, 1), fx.range(-1, 1), fx.range(-1, 1)).multiplyScalar(o.spread));
      if (o.dir) {
        this.v.copy(o.dir).multiplyScalar(o.speed * fx.range(0.6, 1.2));
        this.v.x += fx.range(-1, 1) * o.speed * 0.25;
        this.v.y += fx.range(-1, 1) * o.speed * 0.25;
      } else {
        this.v.set(fx.range(-1, 1), fx.range(-1, 1), fx.range(-1, 1)).normalize().multiplyScalar(o.speed * fx.range(0.3, 1));
      }
      this.c.copy(this.base);
      if (o.jitter) this.c.offsetHSL(fx.range(-0.05, 0.05) * o.jitter, 0, fx.range(-0.2, 0.2) * o.jitter);
      layer.emit(
        this.p,
        this.v,
        this.c,
        this.time,
        o.life * fx.range(0.7, 1.15),
        o.size * fx.range(0.6, 1.3),
        o.drag ?? 2,
        o.gravity ?? 0,
        this.scroll,
        o.wobble ?? 0,
      );
    }
  }

  /** Rising bubbles. */
  bubbles(pos: Vector3, count: number, spread = 4, size = 2.2) {
    this.burst(pos, { count, color: 0xcfefff, speed: 18, size, life: 1.8, drag: 3, gravity: 26, spread, wobble: 1.2 });
  }

  /** Big layered explosion: flash core, sparks, debris, smoke and bubbles. */
  explosion(pos: Vector3, color: number, scale = 1) {
    this.burst(pos, { count: Math.round(14 * scale), color: 0xffffff, speed: 40 * scale, size: 30 * scale, life: 0.35, drag: 6 });
    this.burst(pos, { count: Math.round(50 * scale), color, speed: 160 * scale, size: 7, life: 0.9, drag: 3.5, jitter: 1 });
    this.burst(pos, { count: Math.round(22 * scale), color: 0x2a2622, speed: 60 * scale, size: 22 * scale, life: 2.2, drag: 2, gravity: 8, smoke: true, spread: 4 * scale });
    this.bubbles(pos, Math.round(30 * scale), 8 * scale, 2.6);
  }

  update(dt: number, scroll: number) {
    this.time += dt;
    this.scroll = scroll;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uScroll.value = scroll;
    this.glow.flush();
    this.smoke.flush();
  }

  setPixelRatio(pr: number) {
    this.uniforms.uPixelRatio.value = pr;
  }
}
