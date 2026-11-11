import { Effect } from 'postprocessing';

/**
 * Runs before bloom. A mirror-like highlight under a bright flash can exceed
 * the half-float range (Inf), and bloom's blur then smears it over the whole
 * screen, which tone mapping turns into a black frame. Clamping the scene
 * colour first (and dropping NaN) keeps every frame finite.
 */
const fragment = /* glsl */ `
float ecSafe(float v) {
  // NaN fails both comparisons and becomes 0; Inf clamps to the ceiling.
  return v < 32.0 ? (v > 0.0 ? v : 0.0) : (v >= 32.0 ? 32.0 : 0.0);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(ecSafe(inputColor.r), ecSafe(inputColor.g), ecSafe(inputColor.b), 1.0);
}
`;

export class SanitizeEffect extends Effect {
  constructor() {
    super('SanitizeEffect', fragment);
  }
}
