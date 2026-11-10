import { AdditiveBlending, Color, DoubleSide, Mesh, RingGeometry, Scene, ShaderMaterial } from 'three';

/** Expanding sonar ring. While it travels, anything it passes is revealed. */
export class SonarPing {
  readonly mesh: Mesh<RingGeometry, ShaderMaterial>;
  radius = 0;
  active = false;
  readonly maxRadius = 520;
  private speed = 520;

  constructor(scene: Scene) {
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uFade: { value: 1 }, uColor: { value: new Color(0xb48cff) } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uFade; uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float band = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
          gl_FragColor = vec4(uColor * 2.0, band * uFade * 0.8);
        }`,
    });
    // uv.y runs across the ring width (inner -> outer), useful for a soft band.
    const geo = new RingGeometry(0.94, 1, 96, 1);
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setY(i, (r - 0.94) / 0.06);
    }
    this.mesh = new Mesh(geo, mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 11;
    scene.add(this.mesh);
  }

  start(x: number, y: number) {
    this.active = true;
    this.radius = 4;
    this.mesh.position.set(x, y, 0);
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (!this.active) return;
    this.radius += this.speed * dt;
    this.mesh.scale.setScalar(this.radius);
    this.mesh.material.uniforms.uFade.value = 1 - this.radius / this.maxRadius;
    if (this.radius >= this.maxRadius) {
      this.active = false;
      this.mesh.visible = false;
    }
  }
}
