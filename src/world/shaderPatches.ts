import type { Material, IUniform } from 'three';

/**
 * Small onBeforeCompile patches that add underwater behaviour to the
 * standard PBR materials, so everything keeps proper lighting and fog.
 */

const CAUSTIC_FN = /* glsl */ `
  uniform float uTime;
  uniform float uCaustics;
  uniform vec3 uSunColor;
  varying vec3 vCWorld;
  varying float vCUp;
  float causticPattern(vec2 p, float t) {
    vec2 q = p;
    float v = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      q = vec2(q.x + sin(q.y * 1.7 + t * 0.9 + fi), q.y + sin(q.x * 1.3 - t * 0.7 + fi * 2.0));
      v += abs(sin(q.x) * sin(q.y));
    }
    v /= 3.0;
    return pow(1.0 - v, 7.0);
  }
`;

interface SharedUniforms {
  uTime: IUniform<number>;
  uCaustics: IUniform<number>;
  uSunColor: IUniform;
}

/** Projects animated sunlight caustics onto upward-facing surfaces. */
export function patchCaustics(mat: Material, shared: SharedUniforms) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = shared.uTime;
    s.uniforms.uCaustics = shared.uCaustics;
    s.uniforms.uSunColor = shared.uSunColor;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCWorld;\nvarying float vCUp;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 cw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cw = instanceMatrix * cw;
        #endif
        cw = modelMatrix * cw;
        vCWorld = cw.xyz;
        vCUp = normalize(mat3(modelMatrix) * objectNormal).y;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CAUSTIC_FN)
      .replace(
        '#include <fog_fragment>',
        `if (uCaustics > 0.001) {
          float c = causticPattern(vCWorld.xz * 0.045, uTime * 0.8);
          c += 0.5 * causticPattern(vCWorld.xz * 0.09 + 3.0, uTime * 1.1);
          gl_FragColor.rgb += uSunColor * c * uCaustics * 0.32 * smoothstep(-0.1, 0.9, vCUp);
        }
        #include <fog_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'caustics';
}

/**
 * Bends geometry with a travelling sine wave that grows with height,
 * used for kelp, sea fans and tube-worm plumes. Instances get their own phase.
 */
export function patchSway(mat: Material, uTime: IUniform<number>, amount: number, key: string, also?: SharedUniforms) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    if (also) {
      s.uniforms.uCaustics = also.uCaustics;
      s.uniforms.uSunColor = also.uSunColor;
    }
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float phase = 0.0;
        #ifdef USE_INSTANCING
          phase = instanceMatrix[3].x * 0.05 + instanceMatrix[3].z * 0.03;
        #endif
        float hgt = max(0.0, position.y);
        float bend = pow(hgt * 0.04, 1.5) * ${amount.toFixed(3)};
        transformed.x += sin(uTime * 1.1 + phase + hgt * 0.06) * bend;
        transformed.z += cos(uTime * 0.8 + phase * 1.3 + hgt * 0.05) * bend * 0.5;`,
      );
  };
  mat.customProgramCacheKey = () => 'sway-' + key;
}

/** Tail-wag swimming motion along +x (head) for fish-like meshes. */
export function patchSwim(mat: Material, uTime: IUniform<number>, freq: number, amp: number, key: string) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = 0.0;
        #ifdef USE_INSTANCING
          ph = instanceMatrix[3].y * 0.3 + instanceMatrix[3].z * 0.17;
        #endif
        float tail = clamp(-position.x, 0.0, 100.0);
        transformed.z += sin(uTime * ${freq.toFixed(2)} + ph - position.x * 0.6) * tail * tail * ${amp.toFixed(4)};`,
      );
  };
  mat.customProgramCacheKey = () => 'swim-' + key;
}
