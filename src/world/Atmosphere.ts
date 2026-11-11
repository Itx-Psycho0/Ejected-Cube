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
  NormalBlending,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { ThemeDef } from '../themes/themes';
import type { QualityPreset } from '../core/Quality';
import { damp } from '../core/math';
import { fx } from '../core/Random';

interface Look {
  fog: Color;
  skyTop: Color;
  skyHorizon: Color;
  skyBottom: Color;
  sky: Color;
  ground: Color;
  sunColor: Color;
  fogDensity: number;
  ambient: number;
  sun: number;
  sunDisc: number;
  rays: number;
  caustics: number;
  aurora: number;
  darkness: number;
}

const lookFrom = (t: ThemeDef): Look => {
  const w = t.world;
  return {
    fog: new Color(w.fog),
    skyTop: new Color(w.skyTop),
    skyHorizon: new Color(w.skyHorizon),
    skyBottom: new Color(w.skyBottom),
    sky: new Color(w.skyLight),
    ground: new Color(w.groundLight),
    sunColor: new Color(w.sunColor),
    fogDensity: w.fogDensity,
    ambient: w.ambient,
    sun: w.sun,
    sunDisc: w.sunDisc,
    rays: w.rays,
    caustics: w.caustics,
    aurora: w.aurora,
    darkness: w.darkness,
  };
};

const BOX = { x: 1100, y: 420, zMin: -520, zMax: 160 };

/**
 * Sky, fog, light and air (or water). Blends smoothly between worlds,
 * or snaps instantly behind a page-turn transition.
 */
export class Atmosphere {
  readonly look: Look;
  private target: Look;
  readonly fog: FogExp2;
  readonly hemi: HemisphereLight;
  readonly sun: DirectionalLight;
  private dome: Mesh<SphereGeometry, ShaderMaterial>;
  private motes: Points<BufferGeometry, ShaderMaterial>;
  private rays = new Group();
  private rayMats: ShaderMaterial[] = [];
  private scroll = 0;
  private time = 0;
  readonly shared = {
    uTime: { value: 0 },
    uCaustics: { value: 0 },
    uSunColor: { value: new Color() },
  };

  constructor(
    private scene: Scene,
    theme: ThemeDef,
    private quality: QualityPreset,
  ) {
    this.look = lookFrom(theme);
    this.target = lookFrom(theme);
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
    this.motes = this.makeMotes();
    scene.add(this.motes);
    this.makeRays();
    scene.add(this.rays);
    this.setTheme(theme, true);
  }

  private makeDome() {
    const mat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new Color() },
        uHorizon: { value: new Color() },
        uBottom: { value: new Color() },
        uSun: { value: new Color() },
        uSunDir: { value: new Vector3(-0.35, 0.2, -1).normalize() },
        uSunDisc: { value: 0 },
        uAurora: { value: 0 },
        uTime: this.shared.uTime,
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uBottom, uSun, uSunDir;
        uniform float uSunDisc, uAurora, uTime;
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 c = y > 0.0 ? mix(uHorizon, uTop, smoothstep(0.0, 0.55, y)) : mix(uHorizon, uBottom, smoothstep(0.0, 0.25, -y));
          if (uSunDisc > -0.5) {
            float d = dot(vDir, uSunDir);
            c += uSun * smoothstep(0.9975, 0.999, d) * 1.4;
            c += uSun * pow(max(d, 0.0), 24.0) * 0.35;
          }
          if (uAurora > 0.0) {
            float band = sin(vDir.x * 6.0 + uTime * 0.15 + sin(vDir.x * 13.0 - uTime * 0.2) * 0.6);
            float curtain = smoothstep(0.12, 0.3, y) * smoothstep(0.75, 0.35, y);
            float wave = pow(0.5 + 0.5 * band, 3.0) * curtain;
            vec3 aur = mix(vec3(0.25, 0.95, 0.6), vec3(0.55, 0.4, 1.0), smoothstep(0.25, 0.6, y));
            c += aur * wave * uAurora * 0.75;
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const m = new Mesh(new SphereGeometry(2200, 32, 16), mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    return m;
  }

  private makeMotes() {
    const count = Math.floor(2600 * this.quality.density);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = fx.range(-BOX.x / 2, BOX.x / 2);
      pos[i * 3 + 1] = fx.range(-BOX.y / 2, BOX.y / 2);
      pos[i * 3 + 2] = fx.range(BOX.zMin, BOX.zMax);
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
        uTime: this.shared.uTime,
        uOpacity: { value: 1 },
        uColor: { value: new Color() },
        uSize: { value: 1 },
        uFall: { value: 4 },
        uDrift: { value: 0 },
        uSquare: { value: 0 },
        uPixelRatio: { value: Math.min(devicePixelRatio, this.quality.maxPixelRatio) },
        uBox: { value: [BOX.x, BOX.y] },
      },
      vertexShader: /* glsl */ `
        uniform float uScroll, uTime, uOpacity, uPixelRatio, uSize, uFall, uDrift;
        uniform vec2 uBox;
        attribute float aSeed;
        varying float vAlpha;
        varying float vRot;
        void main() {
          vec3 p = position;
          float par = 0.55 + aSeed * 0.7;
          p.x = mod(p.x - uScroll * par + uDrift * uTime * par + uBox.x * 0.5, uBox.x) - uBox.x * 0.5;
          p.y = mod(p.y - uTime * uFall * (0.6 + aSeed) + uBox.y * 0.5, uBox.y) - uBox.y * 0.5;
          p.x += sin(uTime * 0.4 + aSeed * 40.0) * 3.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (0.8 + aSeed * 2.2) * uSize * uPixelRatio * (260.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          float near = smoothstep(18.0, 60.0, -mv.z);
          float far = 1.0 - smoothstep(350.0, 720.0, -mv.z);
          vAlpha = uOpacity * (0.25 + 0.75 * aSeed) * near * far;
          vRot = aSeed * 6.28 + uTime * (aSeed - 0.5);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uSquare;
        varying float vAlpha;
        varying float vRot;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float a;
          if (uSquare > 0.5) {
            float s = sin(vRot), c = cos(vRot);
            q = mat2(c, -s, s, c) * q;
            a = step(abs(q.x), 0.32) * step(abs(q.y), 0.2);
          } else {
            float d = length(q);
            if (d > 0.5) discard;
            a = 1.0 - d * 2.0;
          }
          if (a <= 0.0) discard;
          gl_FragColor = vec4(uColor, vAlpha * a * 0.6);
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
        uniforms: { uTime: this.shared.uTime, uOpacity: { value: 0 }, uSeed: { value: fx.next() }, uColor: this.shared.uSunColor },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
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

  setTheme(theme: ThemeDef, instant = false) {
    this.target = lookFrom(theme);
    const mu = this.motes.material.uniforms;
    const p = theme.particles;
    mu.uColor.value.setHex(p.color);
    mu.uSize.value = p.size;
    mu.uFall.value = p.fall;
    mu.uDrift.value = p.drift;
    mu.uSquare.value = p.square ? 1 : 0;
    mu.uOpacity.value = p.opacity;
    this.motes.material.blending = p.additive ? AdditiveBlending : NormalBlending;
    this.motes.material.needsUpdate = true;
    if (instant) {
      const l = this.look;
      const t = this.target;
      for (const k of ['fog', 'skyTop', 'skyHorizon', 'skyBottom', 'sky', 'ground', 'sunColor'] as const) l[k].copy(t[k]);
      for (const k of ['fogDensity', 'ambient', 'sun', 'sunDisc', 'rays', 'caustics', 'aurora', 'darkness'] as const) l[k] = t[k];
      this.update(0, 0);
    }
  }

  update(dt: number, scrollSpeed: number) {
    this.time += dt;
    this.scroll += scrollSpeed * dt;
    const k = 1 - Math.exp(-0.9 * dt);
    const l = this.look;
    const t = this.target;
    for (const key of ['fog', 'skyTop', 'skyHorizon', 'skyBottom', 'sky', 'ground', 'sunColor'] as const) l[key].lerp(t[key], k);
    for (const key of ['fogDensity', 'ambient', 'sun', 'rays', 'caustics', 'aurora', 'darkness'] as const) l[key] = damp(l[key], t[key], 0.9, dt);
    l.sunDisc = t.sunDisc;

    this.fog.color.copy(l.fog);
    this.fog.density = l.fogDensity;
    (this.scene.background as Color).copy(l.fog);
    this.hemi.color.copy(l.sky);
    this.hemi.groundColor.copy(l.ground);
    this.hemi.intensity = l.ambient;
    this.sun.color.copy(l.sunColor);
    this.sun.intensity = l.sun;

    const du = this.dome.material.uniforms;
    du.uTop.value.copy(l.skyTop);
    du.uHorizon.value.copy(l.skyHorizon);
    du.uBottom.value.copy(l.skyBottom);
    du.uSun.value.copy(l.sunColor);
    du.uSunDisc.value = l.sunDisc;
    du.uSunDir.value.set(-0.35, Math.max(0.02, l.sunDisc), -1).normalize();
    du.uAurora.value = l.aurora;

    this.shared.uTime.value = this.time;
    this.shared.uCaustics.value = l.caustics;
    this.shared.uSunColor.value.copy(l.sunColor);
    this.motes.material.uniforms.uScroll.value = this.scroll;

    for (const r of this.rays.children) {
      r.position.x -= scrollSpeed * dt * r.userData.speed;
      if (r.position.x < -700) r.position.x += 1400;
    }
    for (const m of this.rayMats) m.uniforms.uOpacity.value = l.rays;
  }

  get darkness() {
    return this.look.darkness;
  }

  applyQuality(q: QualityPreset) {
    this.quality = q;
    this.sun.castShadow = q.shadows;
    this.rays.visible = q.godRays;
    this.motes.material.uniforms.uPixelRatio.value = Math.min(devicePixelRatio, q.maxPixelRatio);
  }
}
