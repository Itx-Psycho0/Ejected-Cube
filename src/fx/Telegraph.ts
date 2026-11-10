import { AdditiveBlending, Mesh, PlaneGeometry, Scene, ShaderMaterial } from 'three';

interface Lane {
  mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  time: number;
  total: number;
}

/** Pulsing red danger zones shown before big boss attacks, so every hit is fair. */
export class Telegraph {
  private lanes: Lane[] = [];
  constructor(scene: Scene) {
    const geo = new PlaneGeometry(1, 1);
    for (let i = 0; i < 6; i++) {
      const mat = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uT: { value: 0 }, uFade: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uT, uFade; varying vec2 vUv;
          void main() {
            float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
            float border = 1.0 - smoothstep(0.0, 0.04, min(vUv.y, 1.0 - vUv.y));
            float stripes = step(0.5, fract((vUv.x * 18.0 + vUv.y * 2.0) - uT * 2.0));
            float pulse = 0.55 + 0.45 * sin(uT * 18.0);
            float a = (edge * 0.18 + stripes * edge * 0.12 + border * 0.7) * pulse * uFade;
            gl_FragColor = vec4(vec3(1.0, 0.18, 0.2) * a * 2.0, a);
          }`,
      });
      const mesh = new Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 12;
      scene.add(mesh);
      this.lanes.push({ mesh, time: 0, total: 0 });
    }
  }

  /** Show a warning rectangle centred at (x, y) for `seconds`. */
  show(x: number, y: number, w: number, h: number, seconds: number, rotation = 0) {
    const lane = this.lanes.find((l) => !l.mesh.visible) ?? this.lanes[0];
    lane.mesh.visible = true;
    lane.mesh.position.set(x, y, 2);
    lane.mesh.scale.set(w, h, 1);
    lane.mesh.rotation.z = rotation;
    lane.time = 0;
    lane.total = seconds;
  }

  update(dt: number) {
    for (const l of this.lanes) {
      if (!l.mesh.visible) continue;
      l.time += dt;
      const u = l.mesh.material.uniforms;
      u.uT.value = l.time;
      u.uFade.value = Math.min(1, l.time * 6) * (1 - Math.max(0, (l.time - l.total + 0.15) / 0.15));
      if (l.time >= l.total) l.mesh.visible = false;
    }
  }

  clear() {
    for (const l of this.lanes) l.mesh.visible = false;
  }
}
