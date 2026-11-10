import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import type { ZoneDef } from '../game/zones';
import type { QualityPreset } from '../core/Quality';
import { damp } from '../core/math';
import { fx } from '../core/Random';

/** Numeric look parameters blended between zones. */
interface Look {
  fog: Color;
  waterTop: Color;
  sky: Color;
  ground: Color;
  sunColor: Color;
  accent: Color;
  fogDensity: number;
  ambient: number;
  sun: number;
  rays: number;
  caustics: number;
  snow: number;
  darkness: number;
}

const lookFrom = (z: ZoneDef): Look => ({
  fog: new Color(z.fog),
  waterTop: new Color(z.waterTop),
  sky: new Color(z.skyLight),
  ground: new Color(z.groundLight),
  sunColor: new Color(z.sunColor),
  accent: new Color(z.accent),
  fogDensity: z.fogDensity,
  ambient: z.ambient,
  sun: z.sun,
  rays: z.rays,
  caustics: z.caustics,
  snow: z.snow,
  darkness: z.darkness,
});

const SNOW_BOX = { x: 1100, y: 420, zMin: -520, zMax: 160 };

/**
 * Everything that makes the water feel like water: exponential fog, a
 * gradient water column, sunlight from above, drifting marine snow,
 * volumetric-looking god rays and, near the end, the surface itself.
 */
export class Atmosphere {
  readonly look: Look;
  private target: Look;
  private blendSpeed = 0.7;
  readonly fog: FogExp2;
  readonly hemi: HemisphereLight;
  readonly sun: DirectionalLight;
  private dome: Mesh<SphereGeometry, ShaderMaterial>;
  private snow: Points<BufferGeometry, ShaderMaterial>;
  private rays = new Group();
  private rayMats: ShaderMaterial[] = [];
  private surface: Mesh<PlaneGeometry, ShaderMaterial>;
  private scroll = 0;
  private rise = 0;
  /** World units above the playfield centre where the surface currently sits. */
  surfaceY = 4000;
  private time = 0;
  /** Shared uniforms other systems read (caustics on the seabed etc.). */
  readonly shared = {
    uTime: { value: 0 },
    uCaustics: { value: 0 },
    uSunColor: { value: new Color() },
  };

  constructor(
    private scene: Scene,
    zone: ZoneDef,
    private quality: QualityPreset,
  ) {
    this.look = lookFrom(zone);
    this.target = lookFrom(zone);
    this.fog = new FogExp2(this.look.fog.getHex(), this.look.fogDensity);
    scene.fog = this.fog;
    scene.background = this.look.fog.clone();

    this.hemi = new HemisphereLight(this.look.sky, this.look.ground, this.look.ambient);
    scene.add(this.hemi);

    this.sun = new DirectionalLight(this.look.sunColor, this.look.sun);
    this.sun.position.set(-120, 400, 160);
    this.sun.target.position.set(0, -100, -60);
    this.sun.castShadow = quality.shadows;
    const sc = this.sun.shadow.camera;
    sc.left = -420;
    sc.right = 420;
    sc.top = 260;
    sc.bottom = -260;
    sc.near = 10;
    sc.far = 900;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 1.5;
    scene.add(this.sun, this.sun.target);

    this.dome = this.makeDome();
    scene.add(this.dome);
    this.snow = this.makeSnow();
    scene.add(this.snow);
    this.makeRays();
    scene.add(this.rays);
    this.surface = this.makeSurface();
    scene.add(this.surface);
  }

  private makeDome() {
    const mat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTop: { value: new Color() }, uBottom: { value: new Color() }, uSurface: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uBottom; uniform float uSurface;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 c = mix(uBottom, uTop, smoothstep(0.35, 0.95, h));
          c += vec3(0.6, 0.9, 1.0) * uSurface * smoothstep(0.7, 1.0, h);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const m = new Mesh(new SphereGeometry(2200, 32, 16), mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    return m;
  }

  private makeSnow() {
    const count = Math.floor(2600 * this.quality.density);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = fx.range(-SNOW_BOX.x / 2, SNOW_BOX.x / 2);
      pos[i * 3 + 1] = fx.range(-SNOW_BOX.y / 2, SNOW_BOX.y / 2);
      pos[i * 3 + 2] = fx.range(SNOW_BOX.zMin, SNOW_BOX.zMax);
      seed[i] = fx.next();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uScroll: { value: 0 },
        uRise: { value: 0 },
        uTime: this.shared.uTime,
        uOpacity: { value: 1 },
        uColor: { value: new Color(0xbfd8ee) },
        uPixelRatio: { value: Math.min(devicePixelRatio, this.quality.maxPixelRatio) },
        uBox: { value: [SNOW_BOX.x, SNOW_BOX.y] },
      },
      vertexShader: /* glsl */ `
        uniform float uScroll, uRise, uTime, uOpacity, uPixelRatio;
        uniform vec2 uBox;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float par = 0.55 + aSeed * 0.7;
          p.x = mod(p.x - uScroll * par + uBox.x * 0.5, uBox.x) - uBox.x * 0.5;
          p.y = mod(p.y - uRise * par - uTime * (1.5 + aSeed * 3.0) + uBox.y * 0.5, uBox.y) - uBox.y * 0.5;
          p.x += sin(uTime * 0.4 + aSeed * 40.0) * 3.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (0.8 + aSeed * 2.2) * uPixelRatio * (260.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          float near = smoothstep(18.0, 60.0, -mv.z);
          float far = 1.0 - smoothstep(350.0, 720.0, -mv.z);
          vAlpha = uOpacity * (0.25 + 0.75 * aSeed) * near * far;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(uColor, vAlpha * (1.0 - d * 2.0) * 0.55);
        }`,
    });
    const pts = new Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  private makeRays() {
    const n = this.quality.godRays ? 7 : 0;
    const geo = new PlaneGeometry(1, 1, 1, 1);
    geo.translate(0, -0.5, 0);
    for (let i = 0; i < n; i++) {
      const mat = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
        uniforms: {
          uTime: this.shared.uTime,
          uOpacity: { value: 0 },
          uSeed: { value: fx.next() },
          uColor: this.shared.uSunColor,
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uOpacity, uSeed; uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float edge = smoothstep(0.0, 0.45, vUv.x) * smoothstep(1.0, 0.55, vUv.x);
            float fall = pow(vUv.y, 1.8);
            float flick = 0.65 + 0.35 * sin(uTime * 0.5 + uSeed * 20.0) * sin(uTime * 0.21 + uSeed * 7.0);
            gl_FragColor = vec4(uColor, edge * fall * flick * uOpacity * 0.16);
          }`,
      });
      this.rayMats.push(mat);
      const m = new Mesh(geo, mat);
      m.scale.set(fx.range(40, 110), fx.range(500, 750), 1);
      m.position.set(fx.range(-600, 600), 330, fx.range(-380, -60));
      m.rotation.z = fx.range(0.18, 0.32);
      m.userData.speed = fx.range(0.25, 0.5);
      this.rays.add(m);
    }
  }

  private makeSurface() {
    const mat = new ShaderMaterial({
      fog: false,
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: this.shared.uTime, uScroll: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uScroll, uOpacity;
        varying vec2 vUv; varying vec3 vWorld;
        float wave(vec2 p) {
          return sin(p.x * 0.05 + uTime * 1.3) * sin(p.y * 0.07 - uTime * 0.9)
               + 0.5 * sin((p.x + p.y) * 0.11 + uTime * 2.1);
        }
        void main() {
          vec2 p = vWorld.xz + vec2(uScroll, 0.0);
          float w = wave(p) * 0.5 + 0.5;
          float sparkle = pow(max(0.0, sin(p.x * 0.31 + uTime * 3.0) * sin(p.y * 0.27 - uTime * 2.4)), 12.0);
          vec3 deep = vec3(0.18, 0.62, 0.72);
          vec3 bright = vec3(0.85, 1.0, 1.0);
          vec3 c = mix(deep, bright, w * 0.55) + sparkle * 1.6;
          float fade = 1.0 - smoothstep(500.0, 1400.0, length(vWorld.xz));
          gl_FragColor = vec4(c * 1.4, uOpacity * fade);
        }`,
    });
    const geo = new PlaneGeometry(3200, 3200, 1, 1);
    geo.rotateX(Math.PI / 2); // face downwards, seen from below
    const m = new Mesh(geo, mat);
    m.visible = false;
    m.renderOrder = -5;
    return m;
  }

  setZone(zone: ZoneDef, instant = false) {
    this.target = lookFrom(zone);
    if (instant) {
      const l = this.look;
      const t = this.target;
      l.fog.copy(t.fog);
      l.waterTop.copy(t.waterTop);
      l.sky.copy(t.sky);
      l.ground.copy(t.ground);
      l.sunColor.copy(t.sunColor);
      l.accent.copy(t.accent);
      l.fogDensity = t.fogDensity;
      l.ambient = t.ambient;
      l.sun = t.sun;
      l.rays = t.rays;
      l.caustics = t.caustics;
      l.snow = t.snow;
      l.darkness = t.darkness;
    }
  }

  /** `depth` in metres, used for the surface approach. */
  setDepth(depth: number) {
    // The surface plane starts descending into view during the final 150 m.
    this.surfaceY = depth < 160 ? 105 + depth * 4.5 : 4000;
  }

  update(dt: number, scrollSpeed: number, riseSpeed: number) {
    this.time += dt;
    this.scroll += scrollSpeed * dt;
    this.rise += riseSpeed * dt;
    const k = 1 - Math.exp(-this.blendSpeed * dt);
    const l = this.look;
    const t = this.target;
    l.fog.lerp(t.fog, k);
    l.waterTop.lerp(t.waterTop, k);
    l.sky.lerp(t.sky, k);
    l.ground.lerp(t.ground, k);
    l.sunColor.lerp(t.sunColor, k);
    l.accent.lerp(t.accent, k);
    l.fogDensity = damp(l.fogDensity, t.fogDensity, this.blendSpeed, dt);
    l.ambient = damp(l.ambient, t.ambient, this.blendSpeed, dt);
    l.sun = damp(l.sun, t.sun, this.blendSpeed, dt);
    l.rays = damp(l.rays, t.rays, this.blendSpeed, dt);
    l.caustics = damp(l.caustics, t.caustics, this.blendSpeed, dt);
    l.snow = damp(l.snow, t.snow, this.blendSpeed, dt);
    l.darkness = damp(l.darkness, t.darkness, this.blendSpeed, dt);

    const surfaceGlow = this.surfaceY < 600 ? 1 - (this.surfaceY - 105) / 500 : 0;

    this.fog.color.copy(l.fog);
    this.fog.density = l.fogDensity * (1 - surfaceGlow * 0.45);
    (this.scene.background as Color).copy(l.fog);
    this.hemi.color.copy(l.sky);
    this.hemi.groundColor.copy(l.ground);
    this.hemi.intensity = l.ambient + surfaceGlow * 0.6;
    this.sun.color.copy(l.sunColor);
    this.sun.intensity = l.sun + surfaceGlow * 1.5;

    const du = this.dome.material.uniforms;
    du.uTop.value.copy(l.waterTop);
    du.uBottom.value.copy(l.fog);
    du.uSurface.value = surfaceGlow;

    this.shared.uTime.value = this.time;
    this.shared.uCaustics.value = l.caustics + surfaceGlow * 0.5;
    this.shared.uSunColor.value.copy(l.sunColor);

    const su = this.snow.material.uniforms;
    su.uScroll.value = this.scroll;
    su.uRise.value = this.rise;
    su.uOpacity.value = 0.25 + l.snow * 0.75;

    for (const r of this.rays.children) {
      r.position.x -= scrollSpeed * dt * r.userData.speed;
      if (r.position.x < -700) r.position.x += 1400;
      r.position.y = Math.min(330, this.surfaceY + 40);
    }
    for (const m of this.rayMats) m.uniforms.uOpacity.value = l.rays + surfaceGlow;

    this.surface.visible = this.surfaceY < 1200;
    this.surface.position.y = this.surfaceY;
    this.surface.material.uniforms.uScroll.value = this.scroll;
    this.surface.material.uniforms.uOpacity.value = Math.min(1, surfaceGlow * 1.5);
  }

  get darkness() {
    return this.look.darkness;
  }

  applyQuality(q: QualityPreset) {
    this.quality = q;
    this.sun.castShadow = q.shadows;
    this.rays.visible = q.godRays;
    this.snow.material.uniforms.uPixelRatio.value = Math.min(devicePixelRatio, q.maxPixelRatio);
  }
}
