import {

  HalfFloatType,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';
import {
  BloomEffect,
  BlendFunction,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { QualityPreset } from './Quality';

/**
 * Owns the WebGL renderer and the post-processing chain.
 * All screen effects are merged into one EffectPass (one fullscreen draw).
 */
export class Renderer {
  readonly gl: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  private composer: EffectComposer;
  private bloom!: BloomEffect;
  private chromatic!: ChromaticAberrationEffect;
  private vignette!: VignetteEffect;
  private effectPass!: EffectPass;
  private preset: QualityPreset;
  private caOffset = new Vector2();
  /** 0..1 chromatic aberration pulse, decays every frame. */
  aberration = 0;

  constructor(
    canvas: HTMLCanvasElement,
    readonly scene: Scene,
    preset: QualityPreset,
  ) {
    this.preset = preset;
    this.gl = new WebGLRenderer({
      canvas,
      antialias: false, // MSAA is handled by the composer
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = NoToneMapping; // tone mapping happens in the effect pass
    this.gl.shadowMap.type = PCFSoftShadowMap;
    this.gl.info.autoReset = false;

    this.camera = new PerspectiveCamera(48, 1, 1, 2600);
    this.camera.position.set(0, 0, 230);

    this.composer = new EffectComposer(this.gl, { frameBufferType: HalfFloatType, multisampling: preset.msaa });
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.buildEffects();
    this.resize();
  }

  private buildEffects() {
    if (this.effectPass) {
      this.composer.removePass(this.effectPass);
      this.effectPass.dispose();
    }
    const p = this.preset;
    this.bloom = new BloomEffect({
      intensity: 1.35,
      luminanceThreshold: 0.62,
      luminanceSmoothing: 0.25,
      mipmapBlur: true,
      radius: 0.72,
      resolutionScale: p.bloomScale,
    });
    this.chromatic = new ChromaticAberrationEffect({
      offset: this.caOffset,
      radialModulation: true,
      modulationOffset: 0.25,
    });
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.72 });
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    noise.blendMode.opacity.value = 0.07;
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });

    const effects = [p.bloom ? this.bloom : null, p.chromatic ? this.chromatic : null, this.vignette, noise, tone].filter(
      (e): e is NonNullable<typeof e> => e !== null,
    );
    this.effectPass = new EffectPass(this.camera, ...effects);
    this.composer.addPass(this.effectPass);
  }

  applyQuality(preset: QualityPreset) {
    const msaaChanged = preset.msaa !== this.preset.msaa;
    this.preset = preset;
    if (msaaChanged) this.composer.multisampling = preset.msaa;
    this.gl.shadowMap.enabled = preset.shadows;
    this.buildEffects();
    this.resize();
  }

  setBloomIntensity(v: number) {
    this.bloom.intensity = v;
  }

  setVignette(darkness: number) {
    this.vignette.darkness = darkness;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio);
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the playfield readable on portrait phones by widening the FOV.
    this.camera.fov = this.camera.aspect < 1 ? 62 : 48;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number) {
    this.aberration = Math.max(0, this.aberration - dt * 2.2);
    const a = 0.0006 + this.aberration * 0.006;
    this.caOffset.set(a, a * 0.6);
    this.gl.info.reset();
    this.composer.render(dt);
  }

  /** Synchronously compile materials that were just added (e.g. a boss). */
  compile() {
    this.gl.compile(this.scene, this.camera);
  }

  /** Compile all shaders up front so the first explosion doesn't hitch. */
  async warmup() {
    await this.gl.compileAsync(this.scene, this.camera);
  }

  /** Visible half extents of the z = 0 gameplay plane. */
  playfieldHalfSize(out: Vector2): Vector2 {
    const dist = this.camera.position.z;
    const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * dist;
    return out.set(halfH * this.camera.aspect, halfH);
  }

  get drawCalls() {
    return this.gl.info.render.calls;
  }
}

