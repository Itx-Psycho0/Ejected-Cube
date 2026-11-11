import type { ThemeDef } from '../themes/themes';

/** Push a world's interface tokens into CSS custom properties. */
export function applyUiTheme(t: ThemeDef) {
  const u = t.ui;
  const r = document.documentElement;
  const set = (k: string, v: string) => r.style.setProperty(k, v);
  set('--bg', u.bg);
  set('--panel', u.panel);
  set('--panel-solid', u.panelSolid);
  set('--ink', u.ink);
  set('--muted', u.muted);
  set('--accent', u.accent);
  set('--accent-ink', u.accentInk);
  set('--accent2', u.accent2);
  set('--line', u.line);
  set('--danger', u.danger);
  set('--good', u.good);
  set('--radius', u.radius);
  set('--border', u.border);
  set('--shadow', u.shadow);
  set('--display', u.display);
  set('--body', u.body);
  set('--numeric', u.numeric);
  set('--label-case', u.labelCase);
  set('--label-track', u.labelTracking);
  set('--title-weight', String(u.titleWeight));
  set('--hud-ink', u.hudInk);
  set('--hud-shadow', u.hudShadow);
  r.dataset.panel = u.panelStyle;
  r.dataset.world = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', u.bg);
}
