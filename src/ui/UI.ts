import '../styles/ui.css';
import { Emitter } from '../core/Events';
import { ACHIEVEMENTS, UPGRADES, type UpgradeId } from '../game/meta';
import type { Save, Settings } from '../game/Save';
import type { DeathCause } from '../entities/Player';
import { formatInt } from '../core/math';
import { audio } from '../audio/AudioEngine';
import { dailySeed } from '../core/Random';

export type ScreenName = 'boot' | 'title' | 'howto' | 'settings' | 'upgrades' | 'logbook' | 'pause' | 'death' | 'victory' | 'exit' | 'none';

export interface UIEvents extends Record<string, unknown> {
  begin: void;
  dive: { daily: boolean };
  resume: void;
  restart: void;
  menu: void;
  endless: void;
  settings: Settings;
  buy: UpgradeId;
  resetSave: void;
  exit: void;
}

export interface HudState {
  depth: number;
  zoneName: string;
  zoneIndex: number;
  zoneProgress: number;
  hull: number;
  maxHull: number;
  oxygen: number;
  maxOxygen: number;
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
  depth: number;
  score: number;
  kills: number;
  plankton: number;
  pearls: number;
  time: number;
  zone: string;
  newBest: boolean;
  daily: boolean;
}

const DEATH_TEXT: Record<DeathCause, [string, string]> = {
  hull: ['Hull Breach', 'The capsule folded like foil. The sea came in all at once.'],
  oxygen: ['Asphyxiated', 'The scrubbers ran dry. It got very quiet.'],
  crushed: ['Crushed', 'Pressure always wins eventually.'],
};

const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8 54 20 32 32 10 20Z" fill="#f2fbff"/><path d="M10 20 32 32v24L10 44Z" fill="#a9c6d8"/><path d="M54 20 32 32v24l22-12Z" fill="#6f93ac"/><circle cx="32" cy="20" r="3.5" fill="#2ef2c8"/></svg>`;

const h = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

/**
 * DOM overlay: every menu screen plus the in-game HUD. The HUD caches the
 * last written values and only touches the DOM when something changed.
 */
export class UI {
  readonly events = new Emitter<UIEvents>();
  private root: HTMLElement;
  private screenEl: HTMLElement | null = null;
  current: ScreenName = 'none';
  private returnTo: ScreenName = 'title';
  private hud!: HTMLElement;
  private hudCache = new Map<string, string>();
  private els: Record<string, HTMLElement> = {};
  private darknessTimer = 0;
  private darknessTarget = 0;
  private hintTimer = 0;

  constructor(private save: Save) {
    this.root = document.getElementById('ui')!;
    this.buildHud();
    this.root.addEventListener('pointerover', (e) => {
      if ((e.target as HTMLElement).closest('.btn')) audio.uiHover();
    });
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.btn, .tabs button, .toggle')) audio.uiClick();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && ['howto', 'settings', 'upgrades', 'logbook'].includes(this.current)) {
        e.stopPropagation();
        this.show(this.returnTo);
      }
    });
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

  /** Open a sub-screen and remember where to return. */
  private open(name: ScreenName) {
    if (this.current === 'title' || this.current === 'pause') this.returnTo = this.current;
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
    el.querySelector('.status')!.textContent = 'Systems online';
    const tap = h(`<div class="tap">${matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click or press any key'} to wake the pod</div>`);
    el.appendChild(tap);
    const go = () => {
      window.removeEventListener('keydown', go);
      el.removeEventListener('pointerdown', go);
      this.events.emit('begin', undefined);
    };
    el.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
  }

  private buildScreen(name: ScreenName): HTMLElement {
    const s = this.save.data;
    switch (name) {
      case 'boot':
        return h(`<section id="boot" class="screen">${LOGO}
          <div class="eyebrow">Hadal Station Kestrel · Escape Capsule EC-07</div>
          <div class="boot-bar"><i></i></div><div class="status">Initialising</div></section>`);

      case 'title': {
        const today = dailySeed();
        const dailyBest = s.daily.date === String(today) ? `best ${formatInt(s.daily.best)}` : 'not yet played';
        const el = h(`<section id="title" class="screen">
          <div class="title-block">
            <div class="eyebrow">Abyssal Ascent</div>
            <h1>Ejected<span>Cube</span></h1>
            <div class="sub">6,000 metres down. One way up.</div>
          </div>
          <nav class="menu" aria-label="Main menu">
            <button class="btn primary" data-a="dive">Start the ascent <small>${s.stats.runs ? 'Dive #' + (s.stats.runs + 1) : 'New run'}</small></button>
            <button class="btn" data-a="daily">Daily dive <small>${dailyBest}</small></button>
            <button class="btn" data-a="upgrades">Upgrade bay <small>${s.pearls} pearls</small></button>
            <button class="btn" data-a="logbook">Logbook <small>${s.achievements.length}/${ACHIEVEMENTS.length}</small></button>
            <button class="btn" data-a="howto">How to play</button>
            <button class="btn" data-a="settings">Settings</button>
            <button class="btn danger" data-a="exit">Exit</button>
          </nav>
          <div class="title-foot">
            <span>Best depth <b>${s.best.depth >= 6000 ? 'n/a' : formatInt(s.best.depth) + ' m'}</b></span>
            <span>Best score <b>${formatInt(s.best.score)}</b></span>
            <span>Surfaced <b>${s.stats.victories}×</b></span>
          </div></section>`);
        el.addEventListener('click', (e) => {
          const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
          if (a === 'dive') this.events.emit('dive', { daily: false });
          else if (a === 'daily') this.events.emit('dive', { daily: true });
          else if (a === 'exit') this.events.emit('exit', undefined);
          else if (a) this.open(a as ScreenName);
        });
        return el;
      }

      case 'howto': {
        const el = h(`<section id="howto" class="screen dim">
          <div class="eyebrow">Operations manual</div><h2>How to survive</h2>
          <div class="grid2" style="width:min(900px,100%)">
            <div class="panel"><div class="keys">
              <kbd>Mouse</kbd><span>Steer the pod toward the cursor</span>
              <kbd>WASD / Arrows</kbd><span>Steer with the keyboard</span>
              <kbd>Left click / Space</kbd><span>Hold to fire sonar bolts</span>
              <kbd>Right click / E</kbd><span>Sonar ping: reveals hidden creatures and pearls, stuns jellies</span>
              <kbd>Shift</kbd><span>Dash: brief invulnerability, rams through small creatures</span>
              <kbd>Q</kbd><span>Bioflare when the lumen meter is full: clears the screen</span>
              <kbd>Esc / P</kbd><span>Pause</span>
              <kbd>Touch</kbd><span>Drag anywhere to steer (auto-fire). Buttons for dash, ping, flare</span>
            </div></div>
            <div class="panel" style="display:flex;flex-direction:column;gap:12px">
              <div class="tip"><i class="dot" style="background:#2ef2c8"></i><span><b>Oxygen drains constantly.</b> Collect glowing plankton to refill it. At zero, the hull starts failing.</span></div>
              <div class="tip"><i class="dot" style="background:#ff9a5a"></i><span><b>Hull</b> is your health. Orange crates repair it.</span></div>
              <div class="tip"><i class="dot" style="background:#b48cff"></i><span><b>Sonar ammo</b> regenerates slowly up to half. Violet canisters refill it.</span></div>
              <div class="tip"><i class="dot" style="background:#ffc35a"></i><span><b>Lumen</b> builds with plankton combos. Spend it on a Bioflare.</span></div>
              <div class="tip"><i class="dot" style="background:#fff4ee"></i><span><b>Pearls</b> hide in the dark. Ping to find them, then spend them in the upgrade bay.</span></div>
              <div class="tip"><i class="dot" style="background:#ff6b6b"></i><span><b>Red lanes</b> warn of a boss attack. Get out of them.</span></div>
            </div>
          </div>
          <button class="btn back" data-a="back">Back</button></section>`);
        el.querySelector('[data-a=back]')!.addEventListener('click', () => this.show(this.returnTo));
        return el;
      }

      case 'settings':
        return this.settingsScreen();
      case 'upgrades':
        return this.upgradesScreen();
      case 'logbook':
        return this.logbookScreen();

      case 'pause': {
        const el = h(`<section id="pause" class="screen dim">
          <div class="eyebrow">Systems holding</div><h2>Paused</h2>
          <nav class="menu" aria-label="Pause menu">
            <button class="btn primary" data-a="resume">Resume</button>
            <button class="btn" data-a="restart">Restart run</button>
            <button class="btn" data-a="howto">How to play</button>
            <button class="btn" data-a="settings">Settings</button>
            <button class="btn danger" data-a="menu">Abandon to main menu</button>
          </nav></section>`);
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
        const el = h(`<section id="exit" class="screen dim">${LOGO}
          <div class="eyebrow">Transmission ended</div><h2>Signal lost</h2>
          <p class="muted" style="max-width:46ch;text-align:center;margin:0">Progress is saved on this device. You can close this tab now.</p>
          <button class="btn primary" data-a="back">Reconnect</button></section>`);
        el.querySelector('[data-a=back]')!.addEventListener('click', () => this.show('title'));
        return el;
      }
      default:
        return h('<section class="screen"></section>');
    }
  }

  private settingsScreen() {
    const st = this.save.data.settings;
    const el = h(`<section id="settings" class="screen dim">
      <div class="eyebrow">Configuration</div><h2>Settings</h2>
      <div class="panel">
        <label class="field" for="s-master">Master volume <input id="s-master" type="range" min="0" max="1" step="0.05" value="${st.master}"></label>
        <label class="field" for="s-music">Music <input id="s-music" type="range" min="0" max="1" step="0.05" value="${st.music}"></label>
        <label class="field" for="s-sfx">Effects <input id="s-sfx" type="range" min="0" max="1" step="0.05" value="${st.sfx}"></label>
        <label class="field" for="s-quality">Graphics quality
          <select id="s-quality">
            ${(['auto', 'high', 'medium', 'low'] as const).map((q) => `<option value="${q}" ${st.quality === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}
          </select></label>
        <div class="field">Screen shake <button class="toggle" id="s-shake" role="switch" aria-checked="${st.shake}" aria-label="Screen shake"></button></div>
        <div class="field">Reduced motion <button class="toggle" id="s-motion" role="switch" aria-checked="${st.reducedMotion}" aria-label="Reduced motion"></button></div>
        <div class="field">Gameplay hints <button class="toggle" id="s-hints" role="switch" aria-checked="${st.hints}" aria-label="Gameplay hints"></button></div>
        <div class="field">Show FPS <button class="toggle" id="s-fps" role="switch" aria-checked="${st.showFps}" aria-label="Show FPS"></button></div>
        <div class="field">Erase all progress <span id="reset-zone"><button class="btn danger" id="s-reset" style="padding:8px 12px">Erase</button></span></div>
      </div>
      <button class="btn back" data-a="back">Back</button></section>`);
    const emit = () => {
      this.events.emit('settings', { ...st });
    };
    const range = (id: string, key: 'master' | 'music' | 'sfx') =>
      el.querySelector<HTMLInputElement>(id)!.addEventListener('input', (e) => {
        st[key] = Number((e.target as HTMLInputElement).value);
        emit();
      });
    range('#s-master', 'master');
    range('#s-music', 'music');
    range('#s-sfx', 'sfx');
    el.querySelector<HTMLSelectElement>('#s-quality')!.addEventListener('change', (e) => {
      st.quality = (e.target as HTMLSelectElement).value as Settings['quality'];
      emit();
    });
    const toggle = (id: string, key: 'shake' | 'reducedMotion' | 'showFps' | 'hints') =>
      el.querySelector<HTMLElement>(id)!.addEventListener('click', (e) => {
        st[key] = !st[key];
        (e.currentTarget as HTMLElement).setAttribute('aria-checked', String(st[key]));
        emit();
      });
    toggle('#s-shake', 'shake');
    toggle('#s-motion', 'reducedMotion');
    toggle('#s-fps', 'showFps');
    toggle('#s-hints', 'hints');
    el.querySelector('#s-reset')!.addEventListener('click', () => {
      const zone = el.querySelector('#reset-zone')!;
      zone.innerHTML = `<span class="confirm">Erase pearls, upgrades and records? <button class="btn danger" id="s-yes" style="padding:8px 12px">Yes, erase</button><button class="btn" id="s-no" style="padding:8px 12px">Keep</button></span>`;
      zone.querySelector('#s-yes')!.addEventListener('click', () => {
        this.events.emit('resetSave', undefined);
        zone.innerHTML = '<span class="muted">Progress erased</span>';
      });
      zone.querySelector('#s-no')!.addEventListener('click', () => this.show('settings'));
    });
    el.querySelector('[data-a=back]')!.addEventListener('click', () => this.show(this.returnTo));
    return el;
  }

  private upgradesScreen() {
    const s = this.save.data;
    const el = h(`<section id="upgrades" class="screen dim">
      <div class="eyebrow">Upgrade bay</div><h2>Refit the capsule</h2>
      <div class="pearl-count">${s.pearls} pearls</div>
      <div class="upgrades">${UPGRADES.map((u) => {
        const lvl = s.upgrades[u.id];
        const max = u.costs.length;
        const cost = u.costs[lvl];
        const can = lvl < max && s.pearls >= cost;
        return `<div class="upg"><h3>${u.name}</h3>
          <div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
          <p>${u.desc(lvl)}${lvl < max ? ` <br>Next: ${u.desc(lvl + 1)}` : ''}</p>
          <button class="btn ${can ? 'primary' : ''}" data-u="${u.id}" ${can ? '' : 'disabled'}>${lvl >= max ? 'Maxed' : `Buy <small>${cost} pearls</small>`}</button></div>`;
      }).join('')}</div>
      <button class="btn back" data-a="back">Back</button></section>`);
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-u]');
      if (b) {
        this.events.emit('buy', b.dataset.u as UpgradeId);
        this.show('upgrades');
      }
    });
    el.querySelector('[data-a=back]')!.addEventListener('click', () => this.show(this.returnTo));
    return el;
  }

  private logbookScreen(tab = 'ach') {
    const s = this.save.data;
    const st = s.stats;
    const body =
      tab === 'ach'
        ? `<div class="ach">${ACHIEVEMENTS.map((a) => `<div class="${s.achievements.includes(a.id) ? 'got' : ''}"><b>${a.name}</b>${a.desc}</div>`).join('')}</div>`
        : tab === 'rec'
          ? s.runs.length
            ? `<div style="overflow-x:auto"><table class="records"><thead><tr><th>#</th><th>Score</th><th>Depth</th><th>Result</th><th>Date</th></tr></thead><tbody>${s.runs
                .map(
                  (r, i) =>
                    `<tr><td>${i + 1}</td><td>${formatInt(r.score)}</td><td>${formatInt(r.depth)} m</td><td>${r.victory ? 'Surfaced' : 'Lost'}${r.daily ? ' · daily' : ''}</td><td>${r.date}</td></tr>`,
                )
                .join('')}</tbody></table></div>`
            : '<p class="muted">No dives logged yet. Your best ten runs will appear here.</p>'
          : `<div class="statgrid">${[
              ['Dives', st.runs],
              ['Surfaced', st.victories],
              ['Creatures', st.kills],
              ['Bosses', st.bosses],
              ['Plankton', st.plankton],
              ['Pearls found', st.pearlsTotal],
              ['Dash kills', st.dashKills],
              ['Sonar reveals', st.reveals],
              ['Time below', Math.round(st.seconds / 60) + ' min'],
            ]
              .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${typeof v === 'number' ? formatInt(v) : v}</b></div>`)
              .join('')}</div>`;
    const el = h(`<section id="logbook" class="screen dim">
      <div class="eyebrow">Captain's logbook</div><h2>Logbook</h2>
      <div class="tabs" role="tablist">
        <button role="tab" data-t="ach" aria-selected="${tab === 'ach'}">Achievements</button>
        <button role="tab" data-t="rec" aria-selected="${tab === 'rec'}">Records</button>
        <button role="tab" data-t="stats" aria-selected="${tab === 'stats'}">Stats</button>
      </div>
      <div class="panel" style="width:min(820px,100%)">${body}</div>
      <button class="btn back" data-a="back">Back</button></section>`);
    el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t;
      if (t) {
        this.screenEl?.remove();
        this.screenEl = this.logbookScreen(t);
        this.root.appendChild(this.screenEl);
      }
    });
    el.querySelector('[data-a=back]')!.addEventListener('click', () => this.show(this.returnTo));
    return el;
  }

  showDeath(r: RunSummary) {
    this.show('none');
    const [title, flavour] = DEATH_TEXT[r.cause ?? 'hull'];
    const el = h(`<section id="death" class="screen dim">
      <div class="eyebrow">Capsule lost · ${r.zone}</div><h2>${title}</h2>
      <p class="muted" style="margin:0;text-align:center">${flavour}</p>
      ${r.newBest ? '<span class="badge">New best score</span>' : ''}
      ${this.summaryGrid(r)}
      <nav class="row">
        <button class="btn primary" data-a="restart">${r.daily ? 'Retry daily dive' : 'Dive again'}</button>
        <button class="btn" data-a="upgrades">Upgrade bay <small>${this.save.data.pearls} pearls</small></button>
        <button class="btn" data-a="menu">Main menu</button>
      </nav></section>`);
    this.mountResult(el, 'death');
  }

  showVictory(r: RunSummary) {
    this.show('none');
    const el = h(`<section id="victory" class="screen dim">
      <div class="eyebrow">0 m · Surface</div><h2>You made it out</h2>
      <p class="muted" style="margin:0;text-align:center;max-width:56ch">Six kilometres of water above you, and now none. The capsule's beacon is broadcasting. Somebody will come.</p>
      ${r.newBest ? '<span class="badge">New best score</span>' : ''}
      ${this.summaryGrid(r)}
      <nav class="row">
        <button class="btn primary" data-a="endless">Dive again, harder <small>Endless +1</small></button>
        <button class="btn" data-a="upgrades">Upgrade bay</button>
        <button class="btn" data-a="menu">Main menu</button>
      </nav></section>`);
    this.mountResult(el, 'victory');
  }

  private summaryGrid(r: RunSummary) {
    const t = `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`;
    return `<div class="panel"><div class="statgrid">
      <div class="stat"><span>Score</span><b>${formatInt(r.score)}</b></div>
      <div class="stat"><span>Depth reached</span><b>${formatInt(r.depth)} m</b></div>
      <div class="stat"><span>Creatures</span><b>${r.kills}</b></div>
      <div class="stat"><span>Plankton</span><b>${r.plankton}</b></div>
      <div class="stat"><span>Pearls</span><b>+${r.pearls}</b></div>
      <div class="stat"><span>Time</span><b>${t}</b></div></div></div>`;
  }

  private mountResult(el: HTMLElement, name: ScreenName) {
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'restart') this.events.emit('restart', undefined);
      else if (a === 'endless') this.events.emit('endless', undefined);
      else if (a === 'menu') this.events.emit('menu', undefined);
      else if (a === 'upgrades') {
        this.returnTo = 'title';
        this.show('upgrades');
      }
    });
    this.root.appendChild(el);
    this.screenEl = el;
    this.current = name;
    el.querySelector<HTMLElement>('.btn.primary')?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ HUD

  private buildHud() {
    this.hud = h(`<div id="hud" style="opacity:0">
      <div id="darkness"></div><div id="vignette"></div><div class="popups"></div>
      <div class="hud-top">
        <div>
          <div class="lbl">Depth</div>
          <div class="depth"><span data-h="depth">6,000</span><small>m</small></div>
          <div class="zone-line"><span class="pill" data-h="zone">Hadal Trench · 1/5</span><span class="zone-prog"><i data-h="zprog"></i></span></div>
        </div>
        <div class="meters">
          <div class="meter hull" data-h="hullm"><span class="lbl">Hull</span><span class="bar"><i data-h="hull"></i></span><b data-h="hulln">100</b></div>
          <div class="meter o2" data-h="o2m"><span class="lbl">O₂</span><span class="bar"><i data-h="o2"></i></span><b data-h="o2n">100</b></div>
          <div class="chips" data-h="chips"></div>
        </div>
      </div>
      <div></div>
      <div class="hud-bot">
        <div class="abilities">
          <div class="ability" data-h="dashA"><svg width="56" height="56"><circle class="ready" cx="28" cy="28" r="26" data-h="dashC"></circle></svg>Dash<kbd>Shift</kbd></div>
          <div class="ability" data-h="pingA"><svg width="56" height="56"><circle class="ready" cx="28" cy="28" r="26" data-h="pingC"></circle></svg>Ping<kbd>E</kbd></div>
          <div class="ability flare" data-h="flareA"><svg width="56" height="56"><circle class="ready" cx="28" cy="28" r="26" data-h="flareC"></circle></svg>Flare<kbd>Q</kbd></div>
        </div>
        <div class="ammo">
          <div class="combo" data-h="combo"></div>
          <div class="lbl">Sonar charge</div>
          <div class="n" data-h="ammo">40</div>
          <div class="score">Score <b data-h="score">0</b></div>
        </div>
      </div>
      <div id="bossbar" hidden><div class="lbl" data-h="bosstitle"></div><div class="name" data-h="bossname"></div><div class="bar"><i data-h="bosshp"></i></div></div>
      <div class="center-card" data-h="card"></div>
      <div id="hint" hidden></div>
      <div id="toasts"></div>
      <div id="fps" hidden></div>
      <div id="touch" hidden>
        <button data-t="dash" aria-label="Dash">Dash</button><button data-t="ping" aria-label="Sonar ping">Ping</button>
        <button data-t="flare" aria-label="Bioflare">Flare</button><button data-t="fire" aria-label="Toggle auto fire">Fire</button>
      </div>
      <button id="pause-btn" aria-label="Pause" hidden>II</button>
      <div id="fade"></div>
    </div>`);
    this.root.appendChild(this.hud);
    this.hud.querySelectorAll<HTMLElement>('[data-h]').forEach((e) => (this.els[e.dataset.h!] = e));
    this.els.bossbar = this.hud.querySelector('#bossbar')!;
    this.els.hint = this.hud.querySelector('#hint')!;
    this.els.toasts = this.hud.querySelector('#toasts')!;
    this.els.fps = this.hud.querySelector('#fps')!;
    this.els.vignette = this.hud.querySelector('#vignette')!;
    this.els.darkness = this.hud.querySelector('#darkness')!;
    this.els.fade = this.hud.querySelector('#fade')!;
    this.els.popups = this.hud.querySelector('.popups')!;
    this.els.touch = this.hud.querySelector('#touch')!;
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
    this.els.touch.hidden = !(v && touch);
    this.els.pauseBtn.hidden = !(v && touch);
  }

  private set(key: string, value: string, prop: 'text' | 'width' | 'dash' | 'class' = 'text') {
    if (this.hudCache.get(key + prop) === value) return;
    this.hudCache.set(key + prop, value);
    const el = this.els[key];
    if (!el) return;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'width') el.style.width = value;
    else if (prop === 'dash') el.style.strokeDashoffset = value;
    else el.className = value;
  }

  updateHud(s: HudState) {
    this.set('depth', formatInt(Math.max(0, s.depth)));
    this.set('zone', `${s.zoneName} · ${s.zoneIndex + 1}/5`);
    this.set('zprog', `${(s.zoneProgress * 100).toFixed(1)}%`, 'width');
    const hp = s.hull / s.maxHull;
    const o2 = s.oxygen / s.maxOxygen;
    this.set('hull', `${(hp * 100).toFixed(1)}%`, 'width');
    this.set('hulln', String(Math.ceil(s.hull)));
    this.set('o2', `${(o2 * 100).toFixed(1)}%`, 'width');
    this.set('o2n', String(Math.ceil(s.oxygen)));
    this.set('hullm', `meter hull${hp < 0.3 ? ' warn' : ''}`, 'class');
    this.set('o2m', `meter o2${o2 < 0.25 ? ' warn' : ''}`, 'class');
    this.set('ammo', String(s.ammo));
    this.set('score', formatInt(s.score));
    this.set('combo', s.combo > 1 ? `×${s.combo} combo` : '');
    const ring = (k: string, v: number) => this.set(k, String(163 * (1 - Math.max(0, Math.min(1, v)))), 'dash');
    ring('dashC', s.dashReady);
    ring('pingC', s.pingReady);
    ring('flareC', s.lumen);
    this.set('flareA', `ability flare${s.lumen >= 1 ? ' full' : ''}`, 'class');
    const chips: string[] = [];
    if (s.shield > 0) chips.push(`<span class="chip" style="color:#2ef2c8">Shield ×${s.shield}</span>`);
    if (s.magnet > 0) chips.push(`<span class="chip" style="color:#6fd2ff">Magnet ${Math.ceil(s.magnet)}s</span>`);
    if (s.spread > 0) chips.push(`<span class="chip" style="color:#b48cff">Triple ${Math.ceil(s.spread)}s</span>`);
    if (s.torpedo > 0) chips.push(`<span class="chip" style="color:#ffb347">Torpedo ${Math.ceil(s.torpedo)}s</span>`);
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

  card(title: string, sub: string, boss = false) {
    const el = this.els.card;
    el.className = 'center-card';
    el.innerHTML = `<div class="eyebrow">${boss ? 'Warning · large contact' : 'Entering'}</div><h2>${title}</h2><p>${sub}</p>`;
    void el.offsetWidth;
    el.className = `center-card show${boss ? ' boss' : ''}`;
  }

  toast(title: string, desc: string) {
    const t = h(`<div class="toast"><b>${title}</b>${desc}</div>`);
    this.els.toasts.appendChild(t);
    setTimeout(() => t.remove(), 4600);
  }

  popup(text: string, x: number, y: number, color = '#fff') {
    if (this.els.popups.childElementCount > 14) return;
    const p = h(`<div class="popup" style="left:${x}px;top:${y}px;color:${color}">${text}</div>`);
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

  /** Red damage flash and a pulsing low-oxygen edge. */
  vignette(damage: number, lowOxygen: boolean) {
    const a = Math.max(damage * 0.7, lowOxygen ? 0.25 + Math.sin(performance.now() * 0.006) * 0.15 : 0);
    const color = lowOxygen && damage < 0.1 ? '46,180,255' : '255,30,40';
    const v = `inset 0 0 160px 40px rgba(${color},${a.toFixed(2)})`;
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
    this.bossBar(null);
    this.els.card.className = 'center-card';
  }
}
