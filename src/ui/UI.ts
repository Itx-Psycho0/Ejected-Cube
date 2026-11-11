import '../styles/ui.css';
import { Emitter } from '../core/Events';
import { ACHIEVEMENTS, UPGRADES, type UpgradeId } from '../game/meta';
import type { Save, Settings } from '../game/Save';
import type { DeathCause } from '../entities/Player';
import { formatInt } from '../core/math';
import { audio } from '../audio/AudioEngine';
import { dailySeed } from '../core/Random';
import { THEMES, THEME_IDS, type ThemeDef, type ThemeId } from '../themes/themes';
import { describe } from '../game/missions';
import { BOSS_EVERY, DIFFICULTY, levelDef, type Difficulty } from '../game/levels';
import { ACCENT_COLORS, HULL_COLORS, LIGHTS, PATTERNS, SHAPES, TRAILS, costOf, type Loadout } from '../game/cosmetics';
import { icon } from './icons';

export type ScreenName =
  | 'boot'
  | 'title'
  | 'howto'
  | 'settings'
  | 'hangar'
  | 'journey'
  | 'logbook'
  | 'pause'
  | 'death'
  | 'victory'
  | 'exit'
  | 'none';

export interface UIEvents extends Record<string, unknown> {
  begin: void;
  dive: { daily: boolean; level?: number };
  resume: void;
  restart: void;
  menu: void;
  continueRun: void;
  settings: Settings;
  buy: UpgradeId;
  loadout: { group: keyof Loadout; value: string | boolean };
  resetSave: void;
  exit: void;
  shuffle: void;
  story: void;
  tutorial: void;
  openHangar: void;
  closeHangar: void;
}

export interface HudState {
  distance: number;
  level: number;
  world: string;
  progress: number;
  hull: number;
  maxHull: number;
  light: number;
  maxLight: number;
  ammo: number;
  score: number;
  combo: number;
  lumen: number;
  dashReady: number;
  pingReady: number;
  shield: number;
  magnet: number;
  spread: number;
  torpedo: number;
  fps: number;
}

export interface RunSummary {
  cause?: DeathCause;
  level: number;
  distance: number;
  score: number;
  kills: number;
  sparks: number;
  shards: number;
  time: number;
  world: string;
  worlds: number;
  newBest: boolean;
  daily: boolean;
}

const DEATH_TEXT: Record<DeathCause, [string, string]> = {
  hull: ['Cube shattered', 'The Blot got a corner of you. Corners grow back.'],
  oxygen: ['Light went out', 'The cube ran dry. Sparks keep it glowing.'],
  crushed: ['Pressed flat', 'Somewhere a page closed on you.'],
};

const MARK = `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8 54 20 32 32 10 20Z" fill="var(--panel-solid)" stroke="var(--ink)" stroke-width="2"/><path d="M10 20 32 32v24L10 44Z" fill="var(--accent)" stroke="var(--ink)" stroke-width="2"/><path d="M54 20 32 32v24l22-12Z" fill="var(--accent2)" stroke="var(--ink)" stroke-width="2"/></svg>`;

const h = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * DOM overlay: every screen plus the HUD. Styling comes entirely from the
 * current world's CSS tokens, so the whole interface re-skins with the world.
 */
export class UI {
  readonly events = new Emitter<UIEvents>();
  readonly root: HTMLElement;
  private screenEl: HTMLElement | null = null;
  current: ScreenName = 'none';
  private returnTo: ScreenName = 'title';
  private hud!: HTMLElement;
  private hudCache = new Map<string, string>();
  private els: Record<string, HTMLElement> = {};
  private darknessTimer = 0;
  private darknessTarget = 0;
  private hintTimer = 0;
  /** Supplied by the game: the world currently on screen. */
  theme: ThemeDef = THEMES.abyss;
  private settingsTab = 'general';
  private hangarTab = 'paint';
  private logTab = 'ach';

  constructor(private save: Save) {
    this.root = document.getElementById('ui')!;
    this.buildHud();
    this.root.addEventListener('pointerover', (e) => {
      if ((e.target as HTMLElement).closest('.btn, .tile')) audio.uiHover();
    });
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.btn, .tabs button, .toggle, .chip-btn, .sw-btn, .world-pick')) audio.uiClick();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && ['howto', 'settings', 'hangar', 'logbook', 'journey'].includes(this.current)) {
        e.stopPropagation();
        this.back();
      }
    });
  }

  private back() {
    if (this.current === 'hangar') this.events.emit('closeHangar', undefined);
    this.show(this.returnTo);
  }

  // ------------------------------------------------------------------ screens

  show(name: ScreenName) {
    this.screenEl?.remove();
    this.screenEl = null;
    this.current = name;
    if (name === 'none') return;
    const el = this.buildScreen(name);
    this.root.appendChild(el);
    this.screenEl = el;
    const first = el.querySelector<HTMLElement>('.btn.primary, .btn');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }

  refresh() {
    if (['title', 'hangar', 'journey', 'settings', 'logbook'].includes(this.current)) {
      const keepScroll = this.screenEl?.scrollTop ?? 0;
      const focusId = (document.activeElement as HTMLElement | null)?.dataset;
      this.show(this.current);
      if (this.screenEl) {
        // Re-renders after a click shouldn't replay the entrance animation.
        this.screenEl.classList.remove('enter');
        this.screenEl.scrollTop = keepScroll;
        void focusId;
      }
    }
  }

  private open(name: ScreenName) {
    if (this.current === 'title' || this.current === 'pause') this.returnTo = this.current;
    if (name === 'hangar') this.events.emit('openHangar', undefined);
    this.show(name);
  }

  setBootProgress(p: number, status: string) {
    const bar = document.querySelector<HTMLElement>('#boot .boot-bar i');
    const st = document.querySelector<HTMLElement>('#boot .status');
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    if (st) st.textContent = status;
  }

  bootReady() {
    const el = document.querySelector<HTMLElement>('#boot');
    if (!el) return;
    el.querySelector('.status')!.textContent = 'Ready';
    el.appendChild(h(`<div class="tap">${matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click or press any key'} to open the Atlas</div>`));
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', go);
      this.events.emit('begin', undefined);
    };
    el.addEventListener('click', go);
    window.addEventListener('keydown', go);
  }

  private buildScreen(name: ScreenName): HTMLElement {
    switch (name) {
      case 'boot':
        return h(`<section id="boot" class="screen">${MARK}<div class="label">The Atlas · Escape cube</div>
          <div class="boot-bar"><i></i></div><div class="status">Unfolding pages</div></section>`);
      case 'title':
        return this.titleScreen();
      case 'journey':
        return this.journeyScreen();
      case 'hangar':
        return this.hangarScreen();
      case 'howto':
        return this.howtoScreen();
      case 'settings':
        return this.settingsScreen();
      case 'logbook':
        return this.logbookScreen();
      case 'pause': {
        const el = h(`<section id="pause" class="screen veil enter">
          <div class="head"><div class="eyebrow">${esc(this.theme.name)}</div><h2>Paused</h2></div>
          <div class="panel" style="width:min(360px,100%);display:flex;flex-direction:column;gap:8px">
            <button class="btn primary" data-a="resume">Resume ${icon('play')}</button>
            <button class="btn" data-a="restart">Restart from checkpoint</button>
            <button class="btn" data-a="howto">How to play</button>
            <button class="btn" data-a="settings">Settings</button>
            <button class="btn ghost" data-a="menu">Leave to home</button>
          </div></section>`);
        el.addEventListener('click', (e) => {
          const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
          if (a === 'resume') this.events.emit('resume', undefined);
          else if (a === 'restart') this.events.emit('restart', undefined);
          else if (a === 'menu') this.events.emit('menu', undefined);
          else if (a) this.open(a as ScreenName);
        });
        return el;
      }
      case 'exit': {
        const el = h(`<section id="exit" class="screen veil enter">${MARK}
          <div class="head"><h2>See you on the next page</h2><p>Your progress is saved on this device. You can close this tab.</p></div>
          <button class="btn primary" data-a="back">Open the Atlas again</button></section>`);
        el.querySelector('[data-a=back]')!.addEventListener('click', () => this.show('title'));
        return el;
      }
      default:
        return h('<section class="screen"></section>');
    }
  }

  private checkpointLevel() {
    const hi = this.save.data.highestLevel;
    return Math.max(1, hi - ((hi - 1) % BOSS_EVERY));
  }

  private titleScreen() {
    const s = this.save.data;
    const t = this.theme;
    const cp = this.checkpointLevel();
    const today = String(dailySeed());
    const dailyBest = s.daily.date === today ? `best ${formatInt(s.daily.best)}` : 'new today';
    const el = h(`<section id="title" class="screen enter">
      <div class="home-left">
        <div class="wordmark"><div class="eyebrow">A journey through the Atlas</div>
          <h1>Ejected<span>Cube</span></h1>
          <p>The Blot is eating the pages. Fly the last cube of light home, one world at a time.</p></div>
        <button class="btn primary play" data-a="play" data-coach="play">${icon('play')}<span><b>${cp > 1 ? 'Continue' : 'Start the journey'}</b><small>Level ${cp} · a random world</small></span><small>${s.settings.lockTheme === 'random' ? '' : THEMES[s.settings.lockTheme].name}</small></button>
        <div class="tiles">
          <button class="btn tile" data-a="journey" data-coach="journey">${icon('journey')}Journey</button>
          <button class="btn tile" data-a="hangar" data-coach="hangar">${icon('hangar')}Hangar</button>
          <button class="btn tile" data-a="daily">${icon('missions')}Daily<small>${dailyBest}</small></button>
          <button class="btn tile" data-a="logbook">${icon('logbook')}Logbook</button>
          <button class="btn tile" data-a="settings">${icon('settings')}Settings</button>
          <button class="btn tile" data-a="howto">${icon('help')}How to play</button>
          <button class="btn tile" data-a="story">${icon('story')}Story</button>
          <button class="btn tile" data-a="exit">${icon('exit')}Exit</button>
        </div>
      </div>
      <div></div>
      <div class="home-right">
        <div class="card world-card" data-coach="world">
          <div class="label">This page</div><h3>${esc(t.name)}</h3><p>${esc(t.line)}</p>
          <div class="swatches">${t.swatches.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
          <button class="btn" data-a="shuffle" style="width:100%">Turn the page ${icon('shuffle')}</button>
        </div>
        <div class="card missions-card" data-coach="missions">
          <div class="label" style="margin-bottom:10px">Missions</div>
          <div class="missions">${s.missions
            .map(
              (m) => `<div class="mission"><span>${esc(describe(m))}</span><span class="reward">+${m.reward} ${icon('shard', 'icon')}</span>
              <span class="bar"><i style="width:${Math.min(100, (m.progress / m.target) * 100)}%"></i></span></div>`,
            )
            .join('')}</div>
        </div>
      </div>
      <div class="home-foot"><span>${icon('shard', 'icon')} <b>${s.shards}</b> shards</span><span>Best level <b>${s.best.level || '–'}</b></span><span>Best score <b>${formatInt(s.best.score)}</b></span><span>Worlds seen <b>${s.worldsSeen.length}/10</b></span></div>
    </section>`);
    el.querySelectorAll<SVGElement>('.reward .icon').forEach((i) => (i.style.cssText = 'width:14px;height:14px;vertical-align:-2px'));
    el.querySelectorAll<SVGElement>('.home-foot .icon').forEach((i) => (i.style.cssText = 'width:16px;height:16px;vertical-align:-3px'));
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'play') this.events.emit('dive', { daily: false, level: cp });
      else if (a === 'daily') this.events.emit('dive', { daily: true, level: 1 });
      else if (a === 'exit') this.events.emit('exit', undefined);
      else if (a === 'shuffle') this.events.emit('shuffle', undefined);
      else if (a === 'story') this.events.emit('story', undefined);
      else if (a) this.open(a as ScreenName);
    });
    return el;
  }

  private journeyScreen() {
    const s = this.save.data;
    const hi = s.highestLevel;
    const max = Math.max(24, Math.ceil((hi + 4) / 6) * 6);
    const nodes = Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      const d = levelDef(n);
      const cls = ['node', n <= hi ? 'reached' : '', d.boss ? 'boss' : '', d.checkpoint ? 'checkpoint' : ''].join(' ');
      const title = d.boss ? `Level ${n}: ${d.boss.name}` : `Level ${n}`;
      return `<button class="${cls}" data-n="${n}" title="${title}" ${d.checkpoint && n <= hi ? '' : 'disabled'}>${n}</button>`;
    }).join('');
    const el = h(`<section id="journey" class="screen veil enter">
      <div class="head"><div class="eyebrow">The journey</div><h2>Fifteen pages to the Engine</h2>
        <p>Every third level, the Blot takes shape as a boss. Start from any checkpoint you have reached. Each level opens on a random world.</p></div>
      <div class="panel" style="width:min(860px,100%)"><div class="path">${nodes}</div></div>
      <div class="legend"><span>Filled: checkpoint you can start from</span><span>Dashed ring: boss</span><span>Highest level: <b>${hi}</b></span></div>
      <button class="btn" data-a="back">Back</button></section>`);
    el.addEventListener('click', (e) => {
      const n = (e.target as HTMLElement).closest<HTMLElement>('[data-n]');
      if (n && !(n as HTMLButtonElement).disabled) this.events.emit('dive', { daily: false, level: Number(n.dataset.n) });
      if ((e.target as HTMLElement).closest('[data-a=back]')) this.back();
    });
    return el;
  }

  private hangarScreen() {
    const s = this.save.data;
    const l = s.loadout;
    const owned = (group: string, id: string) => costOf(group, id) === 0 || s.owned.includes(`${group}:${id}`);
    const cost = (group: string, id: string) => (owned(group, id) ? '' : `<span class="cost">${costOf(group, id)}</span>`);
    const swatches = (group: 'color' | 'accent' | 'light', list: { id: string; name: string; hex: string }[]) =>
      `<div class="swatch-grid">${list
        .map(
          (c) =>
            `<button class="sw-btn" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}" aria-pressed="${l[group] === c.id}" data-g="${group}" data-v="${c.id}">${cost(group, c.id)}</button>`,
        )
        .join('')}</div>`;
    const chips = (group: 'pattern' | 'shape' | 'trail', list: { id: string; name: string }[]) =>
      `<div class="chips">${list
        .map((c) => `<button class="chip-btn" aria-pressed="${l[group] === c.id}" data-g="${group}" data-v="${c.id}">${c.name}${cost(group, c.id)}</button>`)
        .join('')}</div>`;
    let body = '';
    if (this.hangarTab === 'paint')
      body = `<div class="label opt-title">Hull colour</div>${swatches('color', HULL_COLORS)}
        <div class="label opt-title">Accent</div>${swatches('accent', ACCENT_COLORS)}
        <div class="label opt-title">Pattern</div>${chips('pattern', PATTERNS)}
        <div class="label opt-title">Call sign</div><input class="text-input" id="callsign" maxlength="8" value="${esc(l.callsign)}" aria-label="Call sign">`;
    else if (this.hangarTab === 'build')
      body = `<div class="label opt-title">Shape</div>${chips('shape', SHAPES)}
        <div class="label opt-title">Floodlight</div>${swatches('light', LIGHTS)}
        <div class="label opt-title">Trail</div>${chips('trail', TRAILS)}
        <div class="field">Roll cage <button class="toggle" data-cage role="switch" aria-checked="${l.cage}" aria-label="Roll cage"></button></div>`;
    else
      body = `<div class="upgrades">${UPGRADES.map((u) => {
        const lvl = s.upgrades[u.id];
        const max = u.costs.length;
        const c = u.costs[lvl];
        const can = lvl < max && s.shards >= c;
        return `<div class="upg"><h3>${u.name}</h3><button class="btn ${can ? 'primary' : ''}" data-u="${u.id}" ${can ? '' : 'disabled'} style="padding:7px 12px">${lvl >= max ? 'Max' : `${c} ${icon('shard')}`}</button>
          <div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
          <p>${u.desc(lvl)}${lvl < max ? ` · next: ${u.desc(lvl + 1)}` : ''}</p></div>`;
      }).join('')}</div>`;
    const el = h(`<section id="hangar" class="screen enter">
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:10px">
          <h2 style="font-size:30px">Hangar</h2><span class="shard-count">${s.shards} ${icon('shard')}</span></div>
        <div class="tabs" role="tablist">
          <button role="tab" data-t="paint" aria-selected="${this.hangarTab === 'paint'}">Paint</button>
          <button role="tab" data-t="build" aria-selected="${this.hangarTab === 'build'}">Build</button>
          <button role="tab" data-t="upgrades" aria-selected="${this.hangarTab === 'upgrades'}">Upgrades</button>
        </div>
        ${body}
        <p class="muted" style="font-size:12px;margin:14px 0 0">Locked items show their price in shards. Find shards hidden in every world, and earn them from missions.</p>
        <div class="row" style="margin-top:14px;justify-content:flex-start"><button class="btn" data-a="back">Done</button></div>
      </div></section>`);
    el.querySelectorAll<SVGElement>('.shard-count .icon, .upg .icon').forEach((i) => (i.style.cssText = 'width:16px;height:16px'));
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const tab = t.closest<HTMLElement>('[data-t]')?.dataset.t;
      if (tab) {
        this.hangarTab = tab;
        this.refresh();
        return;
      }
      const opt = t.closest<HTMLElement>('[data-g]');
      if (opt) this.events.emit('loadout', { group: opt.dataset.g as keyof Loadout, value: opt.dataset.v! });
      if (t.closest('[data-cage]')) this.events.emit('loadout', { group: 'cage', value: !l.cage });
      const u = t.closest<HTMLElement>('[data-u]')?.dataset.u;
      if (u) this.events.emit('buy', u as UpgradeId);
      if (t.closest('[data-a=back]')) this.back();
    });
    el.querySelector<HTMLInputElement>('#callsign')?.addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).value.replace(/[^a-z0-9 \-.]/gi, '').slice(0, 8);
      this.events.emit('loadout', { group: 'callsign', value: v });
    });
    el.querySelector<HTMLInputElement>('#callsign')?.addEventListener('keydown', (e) => e.stopPropagation());
    return el;
  }

  private howtoScreen() {
    const el = h(`<section id="howto" class="screen veil enter">
      <div class="head"><div class="eyebrow">Field notes</div><h2>How to fly</h2></div>
      <div class="grid2">
        <div class="panel"><div class="keys">
          <kbd>Mouse</kbd><span>The cube follows your pointer</span>
          <kbd>WASD / Arrows</kbd><span>Fly with the keyboard</span>
          <kbd>Left click / Space</kbd><span>Hold to fire light bolts</span>
          <kbd>Right click / E</kbd><span>Pulse: reveals hidden creatures and shards</span>
          <kbd>Shift</kbd><span>Dash: a burst of speed you can ram creatures with</span>
          <kbd>Q</kbd><span>Bioflare when the flare ring is full: clears the screen</span>
          <kbd>Esc / P</kbd><span>Pause</span>
          <kbd>Touch</kbd><span>Drag anywhere to steer; fire is automatic</span>
        </div></div>
        <div class="panel" style="display:flex;flex-direction:column;gap:12px">
          <div class="tip"><i class="dot" style="background:var(--accent)"></i><span><b>Light fades.</b> Collect glowing sparks to keep the cube lit. Chain them for a combo.</span></div>
          <div class="tip"><i class="dot" style="background:var(--accent2)"></i><span><b>Hull</b> is your health. Repair kits patch it up.</span></div>
          <div class="tip"><i class="dot" style="background:var(--muted)"></i><span><b>Pulse charge</b> refills slowly by itself and from violet canisters.</span></div>
          <div class="tip"><i class="dot" style="background:var(--danger)"></i><span><b>Red lanes</b> warn you where a boss is about to strike.</span></div>
          <div class="tip"><i class="dot" style="background:var(--ink)"></i><span><b>Shards</b> hide on every page. Pulse to find them, then spend them in the hangar.</span></div>
        </div>
      </div>
      <div class="row"><button class="btn" data-a="tutorial">Play the tutorial</button><button class="btn primary" data-a="back">Back</button></div></section>`);
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'back') this.back();
      if (a === 'tutorial') this.events.emit('tutorial', undefined);
    });
    return el;
  }

  private settingsScreen() {
    const st = this.save.data.settings;
    const tab = this.settingsTab;
    let body = '';
    if (tab === 'general')
      body = `
        <label class="field" for="s-master">Master volume <input id="s-master" type="range" min="0" max="1" step="0.05" value="${st.master}"></label>
        <label class="field" for="s-music">Music <input id="s-music" type="range" min="0" max="1" step="0.05" value="${st.music}"></label>
        <label class="field" for="s-sfx">Effects <input id="s-sfx" type="range" min="0" max="1" step="0.05" value="${st.sfx}"></label>
        <label class="field" for="s-quality">Graphics quality <select id="s-quality">${(['auto', 'high', 'medium', 'low'] as const)
          .map((q) => `<option value="${q}" ${st.quality === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`)
          .join('')}</select></label>
        <label class="field" for="s-hud">HUD size <input id="s-hud" type="range" min="0.8" max="1.3" step="0.05" value="${st.hudScale}"></label>
        <div class="field">Screen shake <button class="toggle" data-k="shake" role="switch" aria-checked="${st.shake}" aria-label="Screen shake"></button></div>
        <div class="field">Reduced motion <button class="toggle" data-k="reducedMotion" role="switch" aria-checked="${st.reducedMotion}" aria-label="Reduced motion"></button></div>
        <div class="field">Show FPS <button class="toggle" data-k="showFps" role="switch" aria-checked="${st.showFps}" aria-label="Show FPS"></button></div>`;
    else if (tab === 'game')
      body = `
        <div class="field"><span>Difficulty<small>${DIFFICULTY[st.difficulty].desc}</small></span><span class="chips">${(['relaxed', 'normal', 'hard'] as Difficulty[])
          .map((d) => `<button class="chip-btn" data-diff="${d}" aria-pressed="${st.difficulty === d}">${DIFFICULTY[d].label}</button>`)
          .join('')}</span></div>
        <div class="field">Gameplay hints <button class="toggle" data-k="hints" role="switch" aria-checked="${st.hints}" aria-label="Gameplay hints"></button></div>
        <div class="field">Replay the tutorial <button class="btn" data-a="tutorial" style="padding:7px 12px">Play</button></div>
        <div class="field">Replay the story <button class="btn" data-a="story" style="padding:7px 12px">Watch</button></div>
        <div class="field">Erase all progress <span id="reset-zone"><button class="btn" id="s-reset" style="padding:7px 12px">Erase</button></span></div>`;
    else
      body = `
        <div class="field"><span>Worlds in rotation<small>Tap to include or leave out. Each level picks one at random.</small></span></div>
        <div class="world-picks">${THEME_IDS.map(
          (id) => `<button class="world-pick" data-w="${id}" aria-pressed="${st.themePool.includes(id)}"><i style="background:${THEMES[id].swatches[2]}"></i>${THEMES[id].name}</button>`,
        ).join('')}</div>
        <label class="field" for="s-lock">Always use one world <select id="s-lock"><option value="random">Random (recommended)</option>${THEME_IDS.map(
          (id) => `<option value="${id}" ${st.lockTheme === id ? 'selected' : ''}>${THEMES[id].name}</option>`,
        ).join('')}</select></label>
        <div class="field"><span>Interface follows the world<small>Colours and type change with every page.</small></span><button class="toggle" data-k="uiFollowsWorld" role="switch" aria-checked="${st.uiFollowsWorld}" aria-label="Interface follows the world"></button></div>`;
    const el = h(`<section id="settings" class="screen veil enter">
      <div class="head"><h2>Settings</h2></div>
      <div class="panel">
        <div class="tabs" role="tablist">
          <button role="tab" data-t="general" aria-selected="${tab === 'general'}">General</button>
          <button role="tab" data-t="game" aria-selected="${tab === 'game'}">Gameplay</button>
          <button role="tab" data-t="worlds" aria-selected="${tab === 'worlds'}">Worlds</button>
        </div>${body}</div>
      <button class="btn" data-a="back">Back</button></section>`);
    const emit = () => this.events.emit('settings', { ...st, themePool: [...st.themePool] });
    const range = (id: string, key: 'master' | 'music' | 'sfx' | 'hudScale') =>
      el.querySelector<HTMLInputElement>(id)?.addEventListener('input', (e) => {
        st[key] = Number((e.target as HTMLInputElement).value);
        emit();
      });
    range('#s-master', 'master');
    range('#s-music', 'music');
    range('#s-sfx', 'sfx');
    range('#s-hud', 'hudScale');
    el.querySelector<HTMLSelectElement>('#s-quality')?.addEventListener('change', (e) => {
      st.quality = (e.target as HTMLSelectElement).value as Settings['quality'];
      emit();
    });
    el.querySelector<HTMLSelectElement>('#s-lock')?.addEventListener('change', (e) => {
      st.lockTheme = (e.target as HTMLSelectElement).value as Settings['lockTheme'];
      emit();
    });
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const tb = t.closest<HTMLElement>('[data-t]')?.dataset.t;
      if (tb) {
        this.settingsTab = tb;
        this.refresh();
        return;
      }
      const k = t.closest<HTMLElement>('[data-k]');
      if (k) {
        const key = k.dataset.k as 'shake' | 'reducedMotion' | 'showFps' | 'hints' | 'uiFollowsWorld';
        st[key] = !st[key];
        k.setAttribute('aria-checked', String(st[key]));
        emit();
      }
      const d = t.closest<HTMLElement>('[data-diff]')?.dataset.diff;
      if (d) {
        st.difficulty = d as Difficulty;
        emit();
        this.refresh();
      }
      const w = t.closest<HTMLElement>('[data-w]')?.dataset.w as ThemeId | undefined;
      if (w) {
        const has = st.themePool.includes(w);
        if (has && st.themePool.length <= 2) {
          this.toast('Keep at least two', 'The journey needs at least two worlds to choose from.');
          return;
        }
        st.themePool = has ? st.themePool.filter((x) => x !== w) : [...st.themePool, w];
        emit();
        this.refresh();
      }
      const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'back') this.back();
      if (a === 'tutorial') this.events.emit('tutorial', undefined);
      if (a === 'story') this.events.emit('story', undefined);
      if (t.closest('#s-reset')) {
        const zone = el.querySelector('#reset-zone')!;
        zone.innerHTML = `<span class="confirm">Erase shards, upgrades and records? <button class="btn" id="s-yes" style="padding:6px 10px">Erase</button><button class="btn" id="s-no" style="padding:6px 10px">Keep</button></span>`;
      }
      if (t.closest('#s-yes')) {
        this.events.emit('resetSave', undefined);
        el.querySelector('#reset-zone')!.innerHTML = '<span class="muted">Progress erased</span>';
      }
      if (t.closest('#s-no')) this.refresh();
    });
    return el;
  }

  private logbookScreen() {
    const s = this.save.data;
    const st = s.stats;
    const tab = this.logTab;
    const body =
      tab === 'ach'
        ? `<div class="ach">${ACHIEVEMENTS.map((a) => `<div class="${s.achievements.includes(a.id) ? 'got' : ''}"><b>${a.name}</b>${a.desc}</div>`).join('')}</div>`
        : tab === 'worlds'
          ? `<div class="world-picks">${THEME_IDS.map(
              (id) => `<div class="world-pick" aria-pressed="${s.worldsSeen.includes(id)}"><i style="background:${THEMES[id].swatches[2]}"></i>${s.worldsSeen.includes(id) ? THEMES[id].name : 'Unvisited'}</div>`,
            ).join('')}</div>`
          : tab === 'rec'
            ? s.runs.length
              ? `<div style="overflow-x:auto"><table class="records"><thead><tr><th>#</th><th>Score</th><th>Level</th><th>Worlds</th><th>Date</th></tr></thead><tbody>${s.runs
                  .map((r, i) => `<tr><td>${i + 1}</td><td>${formatInt(r.score)}</td><td>${r.level}${r.daily ? ' · daily' : ''}</td><td>${r.worlds}</td><td>${r.date}</td></tr>`)
                  .join('')}</tbody></table></div>`
              : '<p class="muted">No runs yet. Your best ten will be listed here.</p>'
            : `<div class="statgrid">${[
                ['Runs', st.runs],
                ['Engine reached', st.victories],
                ['Creatures', st.kills],
                ['Bosses', st.bosses],
                ['Sparks', st.sparks],
                ['Shards found', st.shardsTotal],
                ['Dash rams', st.dashKills],
                ['Pulse reveals', st.reveals],
                ['Bioflares', st.flares],
                ['Minutes flown', Math.round(st.seconds / 60)],
              ]
                .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${formatInt(v as number)}</b></div>`)
                .join('')}</div>`;
    const el = h(`<section id="logbook" class="screen veil enter">
      <div class="head"><h2>Logbook</h2></div>
      <div class="panel" style="width:min(820px,100%)">
        <div class="tabs" role="tablist">
          <button role="tab" data-t="ach" aria-selected="${tab === 'ach'}">Achievements ${s.achievements.length}/${ACHIEVEMENTS.length}</button>
          <button role="tab" data-t="worlds" aria-selected="${tab === 'worlds'}">Worlds ${s.worldsSeen.length}/10</button>
          <button role="tab" data-t="rec" aria-selected="${tab === 'rec'}">Records</button>
          <button role="tab" data-t="stats" aria-selected="${tab === 'stats'}">Stats</button>
        </div>${body}</div>
      <button class="btn" data-a="back">Back</button></section>`);
    el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t;
      if (t) {
        this.logTab = t;
        this.refresh();
      }
      if ((e.target as HTMLElement).closest('[data-a=back]')) this.back();
    });
    return el;
  }

  showDeath(r: RunSummary) {
    this.show('none');
    const [title, flavour] = DEATH_TEXT[r.cause ?? 'hull'];
    const el = h(`<section id="death" class="screen veil enter">
      <div class="head"><div class="eyebrow">Level ${r.level} · ${esc(r.world)}</div><h2>${title}</h2><p>${flavour}</p>
      ${r.newBest ? '<span class="badge">New best score</span>' : ''}</div>
      ${this.summaryGrid(r)}
      <div class="row">
        <button class="btn primary" data-a="restart">${r.daily ? 'Retry the daily' : 'Try again'} ${icon('play')}</button>
        <button class="btn" data-a="hangar">Hangar <small>${this.save.data.shards} shards</small></button>
        <button class="btn" data-a="menu">Home</button>
      </div></section>`);
    this.mountResult(el, 'death');
  }

  showVictory(r: RunSummary) {
    this.show('none');
    const el = h(`<section id="victory" class="screen veil enter">
      <div class="head"><div class="eyebrow">Level ${r.level}</div><h2>The Engine turns again</h2>
      <p>The Atlas is whole, for now. The pages past fifteen are wilder, and the Blot is stronger there.</p>
      ${r.newBest ? '<span class="badge">New best score</span>' : ''}</div>
      ${this.summaryGrid(r)}
      <div class="row">
        <button class="btn primary" data-a="continue">Keep flying ${icon('play')}</button>
        <button class="btn" data-a="menu">Finish here</button>
      </div></section>`);
    this.mountResult(el, 'victory');
  }

  private summaryGrid(r: RunSummary) {
    const t = `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`;
    return `<div class="panel"><div class="statgrid">
      <div class="stat"><span>Score</span><b>${formatInt(r.score)}</b></div>
      <div class="stat"><span>Level</span><b>${r.level}</b></div>
      <div class="stat"><span>Distance</span><b>${formatInt(r.distance)} m</b></div>
      <div class="stat"><span>Worlds</span><b>${r.worlds}</b></div>
      <div class="stat"><span>Creatures</span><b>${r.kills}</b></div>
      <div class="stat"><span>Shards</span><b>+${r.shards}</b></div>
      <div class="stat"><span>Time</span><b>${t}</b></div></div></div>`;
  }

  private mountResult(el: HTMLElement, name: ScreenName) {
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'restart') this.events.emit('restart', undefined);
      else if (a === 'continue') this.events.emit('continueRun', undefined);
      else if (a === 'menu') this.events.emit('menu', undefined);
      else if (a === 'hangar') {
        this.returnTo = 'title';
        this.events.emit('menu', undefined);
        this.open('hangar');
      }
    });
    this.root.appendChild(el);
    this.screenEl = el;
    this.current = name;
    el.querySelector<HTMLElement>('.btn.primary')?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ coach marks

  /** First-visit guided tour of the home screen. */
  coachHome(onDone: () => void) {
    const steps: [string, string, string][] = [
      ['play', 'Start here', 'Every run opens on a random world. Levels get harder as you go, with a boss every third level.'],
      ['world', 'Turn the page', 'Preview another world. The whole interface changes with it.'],
      ['hangar', 'Make it yours', 'Paint the cube, change its shape and light, and buy upgrades with shards.'],
      ['missions', 'Missions', 'Three goals at a time. Finish one for shards and a new one takes its place.'],
      ['journey', 'Journey', 'Once you pass a boss, you can start later runs from that checkpoint.'],
    ];
    let i = 0;
    const spot = h('<div class="spot"></div>');
    const bubble = h('<div class="bubble"></div>');
    this.root.append(spot, bubble);
    const place = () => {
      let target: HTMLElement | null = null;
      while (i < steps.length && !(target = this.root.querySelector<HTMLElement>(`[data-coach="${steps[i][0]}"]`))?.offsetParent) i++;
      if (i >= steps.length || !target) return end();
      const r = target.getBoundingClientRect();
      Object.assign(spot.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
      const [, title, text] = steps[i];
      bubble.innerHTML = `<b>${title}</b>${text}<div class="row"><button class="btn ghost" data-skip>Skip tour</button><button class="btn primary" data-next>${i === steps.length - 1 ? 'Got it' : 'Next'}</button></div>`;
      const bw = Math.min(300, window.innerWidth * 0.8);
      const left = r.right + 16 + bw < window.innerWidth ? r.right + 16 : Math.max(12, r.left - bw - 16);
      const top = Math.min(window.innerHeight - 180, Math.max(12, r.top));
      const fits = r.right + 16 + bw < window.innerWidth || r.left - bw - 16 > 0;
      Object.assign(bubble.style, fits ? { left: `${left}px`, top: `${top}px` } : { left: `${Math.max(12, r.left)}px`, top: `${Math.min(window.innerHeight - 190, r.bottom + 14)}px` });
    };
    const end = () => {
      spot.remove();
      bubble.remove();
      onDone();
    };
    bubble.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-skip]')) return end();
      if ((e.target as HTMLElement).closest('[data-next]')) {
        i++;
        place();
      }
    });
    setTimeout(place, 650);
  }

  // ------------------------------------------------------------------ page turn

  /** A sheet of the next world's paper sweeps across; `mid` runs while the screen is covered. */
  pageTurn(next: ThemeDef, title: string, sub: string, mid: () => void): Promise<void> {
    return new Promise((resolve) => {
      const sheet = h(`<div id="page"><div style="text-align:center;padding:0 24px"><div class="label" style="color:${next.ui.muted}">${esc(sub)}</div>
        <h2 style="font-family:${next.ui.display};font-weight:${next.ui.titleWeight};color:${next.ui.ink}">${esc(title)}</h2>
        <p style="color:${next.ui.ink};font-family:${next.ui.body}">${esc(next.line)}</p></div></div>`);
      sheet.style.background = `linear-gradient(100deg, ${next.ui.panelSolid}, ${next.ui.bg})`;
      this.root.appendChild(sheet);
      audio.pageFlip();
      const fast = this.save.data.settings.reducedMotion;
      const a = sheet.animate([{ transform: 'translateX(110%) rotate(4deg)' }, { transform: 'translateX(0) rotate(0)' }], {
        duration: fast ? 10 : 520,
        easing: 'cubic-bezier(.6,0,.3,1)',
        fill: 'forwards',
      });
      a.onfinish = () => {
        mid();
        setTimeout(
          () => {
            sheet.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-115%) rotate(-5deg)' }], {
              duration: fast ? 10 : 560,
              easing: 'cubic-bezier(.6,0,.3,1)',
              fill: 'forwards',
            }).onfinish = () => {
              sheet.remove();
              resolve();
            };
          },
          fast ? 300 : 900,
        );
      };
    });
  }

  // ------------------------------------------------------------------ HUD

  private buildHud() {
    this.hud = h(`<div id="hud" style="opacity:0">
      <div id="darkness"></div><div id="vignette"></div><div class="popups"></div>
      <div class="hud-top">
        <div>
          <div class="hud-label">Distance</div>
          <div class="dist"><span data-h="dist">0</span><small>m</small></div>
          <div class="lvl-line"><span class="pill" data-h="lvl">Level 1</span><span class="lvl-prog"><i data-h="prog"></i></span></div>
        </div>
        <div class="meters">
          <div class="meter hull" data-h="hullm"><span class="hud-label">Hull</span><span class="track"><i data-h="hull"></i></span><b data-h="hulln">100</b></div>
          <div class="meter light" data-h="lightm"><span class="hud-label">Light</span><span class="track"><i data-h="light"></i></span><b data-h="lightn">100</b></div>
          <div class="hud-chips" data-h="chips"></div>
        </div>
      </div>
      <div></div>
      <div class="hud-bot">
        <div class="abilities">
          <div class="ability" data-h="dashA" title="Dash">${icon('dash')}<svg class="ring" width="58" height="58"><circle cx="29" cy="29" r="26" data-h="dashC"></circle></svg><kbd>Shift</kbd></div>
          <div class="ability" data-h="pingA" title="Pulse">${icon('pulse')}<svg class="ring" width="58" height="58"><circle cx="29" cy="29" r="26" data-h="pingC"></circle></svg><kbd>E</kbd></div>
          <div class="ability flare" data-h="flareA" title="Bioflare">${icon('flare')}<svg class="ring" width="58" height="58"><circle cx="29" cy="29" r="26" data-h="flareC"></circle></svg><kbd>Q</kbd></div>
        </div>
        <div class="ammo">
          <div class="combo" data-h="combo"></div>
          <div class="hud-label">Pulse charge</div>
          <div class="n" data-h="ammo">40</div>
          <div class="score">Score <b data-h="score">0</b></div>
        </div>
      </div>
      <div id="bossbar" hidden><div class="hud-label" data-h="bosstitle"></div><div class="name" data-h="bossname"></div><div class="track"><i data-h="bosshp"></i></div></div>
      <div class="center-card" data-h="card"></div>
      <div id="coach" hidden></div>
      <div id="hint" hidden></div>
      <div id="toasts"></div>
      <div id="fps" hidden></div>
      <div id="touch" hidden>
        <button data-t="dash" aria-label="Dash">Dash</button><button data-t="ping" aria-label="Pulse">Pulse</button>
        <button data-t="flare" aria-label="Bioflare">Flare</button><button data-t="fire" aria-label="Toggle auto fire">Fire</button>
      </div>
      <button id="pause-btn" aria-label="Pause" hidden>${icon('pause')}</button>
      <div id="fade"></div>
    </div>`);
    this.root.appendChild(this.hud);
    this.hud.querySelectorAll<HTMLElement>('[data-h]').forEach((e) => (this.els[e.dataset.h!] = e));
    for (const id of ['bossbar', 'hint', 'toasts', 'fps', 'vignette', 'darkness', 'fade', 'touch', 'coach']) this.els[id] = this.hud.querySelector('#' + id)!;
    this.els.popups = this.hud.querySelector('.popups')!;
    this.els.pauseBtn = this.hud.querySelector('#pause-btn')!;
  }

  bindTouch(press: (a: 'dash' | 'ping' | 'flare' | 'fire' | 'pause', down: boolean) => void) {
    this.els.touch.querySelectorAll<HTMLElement>('button').forEach((b) => {
      const a = b.dataset.t as 'dash' | 'ping' | 'flare' | 'fire';
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        press(a, true);
      });
      b.addEventListener('pointerup', () => press(a, false));
    });
    this.els.pauseBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      press('pause', true);
    });
  }

  setHudVisible(v: boolean, touch = false) {
    this.hud.style.opacity = v ? '1' : '0';
    this.hud.classList.toggle('touch', touch);
    this.els.touch.hidden = !(v && touch);
    this.els.pauseBtn.hidden = !(v && touch);
  }

  setHudScale(s: number) {
    document.documentElement.style.setProperty('--hud-scale', String(s));
  }

  private set(key: string, value: string, prop: 'text' | 'width' | 'dash' | 'class' = 'text') {
    if (this.hudCache.get(key + prop) === value) return;
    this.hudCache.set(key + prop, value);
    const el = this.els[key];
    if (!el) return;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'width') el.style.width = value;
    else if (prop === 'dash') el.style.strokeDashoffset = value;
    else el.setAttribute('class', value);
  }

  updateHud(s: HudState) {
    this.set('dist', formatInt(s.distance));
    this.set('lvl', `Level ${s.level} · ${s.world}`);
    this.set('prog', `${(s.progress * 100).toFixed(1)}%`, 'width');
    const hp = s.hull / s.maxHull;
    const li = s.light / s.maxLight;
    this.set('hull', `${(hp * 100).toFixed(1)}%`, 'width');
    this.set('hulln', String(Math.ceil(s.hull)));
    this.set('light', `${(li * 100).toFixed(1)}%`, 'width');
    this.set('lightn', String(Math.ceil(s.light)));
    this.set('hullm', `meter hull${hp < 0.3 ? ' warn' : ''}`, 'class');
    this.set('lightm', `meter light${li < 0.25 ? ' warn' : ''}`, 'class');
    this.set('ammo', String(s.ammo));
    this.set('score', formatInt(s.score));
    this.set('combo', s.combo > 1 ? `×${s.combo}` : '');
    const ring = (k: string, v: number) => this.set(k, String(163 * (1 - Math.max(0, Math.min(1, v)))), 'dash');
    ring('dashC', s.dashReady);
    ring('pingC', s.pingReady);
    ring('flareC', s.lumen);
    this.set('flareA', `ability flare${s.lumen >= 1 ? ' full' : ''}`, 'class');
    const chips: string[] = [];
    if (s.shield > 0) chips.push(`<span class="hud-chip">Shield ×${s.shield}</span>`);
    if (s.magnet > 0) chips.push(`<span class="hud-chip">Magnet ${Math.ceil(s.magnet)}s</span>`);
    if (s.spread > 0) chips.push(`<span class="hud-chip">Triple ${Math.ceil(s.spread)}s</span>`);
    if (s.torpedo > 0) chips.push(`<span class="hud-chip">Seekers ${Math.ceil(s.torpedo)}s</span>`);
    const chipHtml = chips.join('');
    if (this.hudCache.get('chips') !== chipHtml) {
      this.hudCache.set('chips', chipHtml);
      this.els.chips.innerHTML = chipHtml;
    }
    this.set('fps', `${Math.round(s.fps)} fps`);
  }

  showFps(v: boolean) {
    this.els.fps.hidden = !v;
  }

  bossBar(name: string | null, title = '', frac = 1) {
    this.els.bossbar.hidden = name === null;
    if (name === null) return;
    this.set('bossname', name);
    this.set('bosstitle', title);
    this.set('bosshp', `${(frac * 100).toFixed(1)}%`, 'width');
  }

  card(title: string, sub: string, eyebrow: string) {
    const el = this.els.card;
    el.className = 'center-card';
    el.innerHTML = `<div class="hud-label">${esc(eyebrow)}</div><h2>${esc(title)}</h2><p>${esc(sub)}</p>`;
    void el.offsetWidth;
    el.className = 'center-card show';
  }

  coach(step: { title: string; text: string; index: number; total: number } | null, onSkip?: () => void) {
    const el = this.els.coach;
    if (!step) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `<div class="hud-label" style="color:var(--accent);text-shadow:none">Tutorial · ${step.index + 1} of ${step.total}</div><h3>${esc(step.title)}</h3><p>${step.text}</p>
      <div class="steps">${Array.from({ length: step.total }, (_, i) => `<i class="${i <= step.index ? 'on' : ''}"></i>`).join('')}</div>
      <div class="coach-foot"><span></span><button data-skip>Skip tutorial</button></div>`;
    el.querySelector('[data-skip]')!.addEventListener('click', () => onSkip?.());
  }

  toast(title: string, desc: string) {
    const t = h(`<div class="toast"><b>${esc(title)}</b>${esc(desc)}</div>`);
    this.els.toasts.appendChild(t);
    setTimeout(() => t.remove(), 4600);
  }

  popup(text: string, x: number, y: number, color = 'var(--hud-ink)') {
    if (this.els.popups.childElementCount > 14) return;
    const p = h(`<div class="popup" style="left:${x}px;top:${y}px;color:${color}">${esc(text)}</div>`);
    this.els.popups.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }

  hint(text: string | null, seconds = 4) {
    const el = this.els.hint;
    if (!text) {
      el.hidden = true;
      return;
    }
    el.textContent = text;
    el.hidden = false;
    this.hintTimer = seconds;
  }

  vignette(damage: number, lowLight: boolean) {
    const a = Math.max(damage * 0.6, lowLight ? 0.22 + Math.sin(performance.now() * 0.006) * 0.12 : 0);
    const v = `inset 0 0 160px 40px rgba(${lowLight && damage < 0.1 ? '20,30,60' : '200,40,40'},${a.toFixed(2)})`;
    if (this.hudCache.get('vig') === v) return;
    this.hudCache.set('vig', v);
    this.els.vignette.style.boxShadow = v;
  }

  darken(amount: number, seconds: number) {
    this.darknessTarget = amount;
    this.darknessTimer = seconds;
  }

  fade(v: number) {
    this.els.fade.style.opacity = String(v);
  }

  tick(dt: number) {
    if (this.darknessTimer > 0) {
      this.darknessTimer -= dt;
      if (this.darknessTimer <= 0) this.darknessTarget = 0;
    }
    this.els.darkness.style.opacity = String(this.darknessTarget);
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.els.hint.hidden = true;
    }
  }

  clearOverlays() {
    this.darknessTarget = 0;
    this.darknessTimer = 0;
    this.els.darkness.style.opacity = '0';
    this.els.hint.hidden = true;
    this.coach(null);
    this.bossBar(null);
    this.els.card.className = 'center-card';
  }
}
