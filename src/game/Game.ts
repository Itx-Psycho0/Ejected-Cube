import { SpeedLines } from '../fx/SpeedLines';
import { Scene, Vector2, Vector3 } from 'three';
import { Renderer } from '../core/Renderer';
import { Loop } from '../core/Loop';
import { Input } from '../core/Input';
import { QUALITY, detectQuality, type QualityLevel, type QualityPreset } from '../core/Quality';
import { QualityGovernor } from '../core/Governor';
import { Random, dailySeed } from '../core/Random';
import { clamp, damp, easeOutCubic } from '../core/math';
import { audio, BOSS_MOODS } from '../audio/AudioEngine';
import { Gates } from '../entities/Gates';
import { BlotEye, InkCorruption } from '../fx/InkFx';
import { Atmosphere } from '../world/Atmosphere';
import { Ground } from '../world/Ground';
import { Fauna } from '../world/Fauna';
import { Clouds } from '../world/Clouds';
import { Player, type PowerUp } from '../entities/Player';
import { Enemies, ENEMY_SPECS, type Enemy, type EnemyContext, type EnemyKind } from '../entities/Enemies';
import { Pickups, POWERUP_INFO, SPARK_NAME, type Pickup } from '../entities/Pickups';
import { createBoss, type Boss, type BossContext } from '../entities/bosses';
import { Particles } from '../fx/Particles';
import { Projectiles, segDist2 } from '../combat/Projectiles';
import { CameraRig } from '../fx/CameraRig';
import { Flash } from '../fx/Flash';
import { Telegraph } from '../fx/Telegraph';
import { Save, type Settings } from './Save';
import { ACHIEVEMENTS, UPGRADES, lumenGain, statsFor, type UpgradeId } from './meta';
import { BOSS_TABLE, DIFFICULTY, STORY_END_LEVEL, levelDef, type BossInfo, type LevelDef } from './levels';
import { describe, nextMission, type MissionKind } from './missions';
import { costOf, type Loadout } from './cosmetics';
import { THEMES, THEME_IDS, randomTheme, type ThemeDef, type ThemeId } from '../themes/themes';
import { MaterialStyler } from '../themes/MaterialStyler';
import { UI, type RunSummary } from '../ui/UI';
import { applyUiTheme } from '../ui/theme';
import { StoryPlayer } from '../ui/Story';

type Mode = 'boot' | 'story' | 'menu' | 'hangar' | 'intro' | 'play' | 'bossIntro' | 'boss' | 'transition' | 'dead' | 'ending' | 'victory';

interface Run {
  level: number;
  def: LevelDef;
  levelTime: number;
  startLevel: number;
  distance: number;
  score: number;
  kills: number;
  sparks: number;
  shards: number;
  combo: number;
  comboTimer: number;
  time: number;
  daily: boolean;
  bossHullAtStart: number;
  hurtThisLevel: boolean;
  dashKills: number;
  dodges: number;
  flares: number;
  boss: BossInfo | null;
  /** Has the Blot's eye already looked in on this level? */
  eyeDone: boolean;
  eyeAt: number;
  tauntDone: boolean;
  grazes: number;
  /** Ink surge: seconds left (0 = none), whether this level had one, when it hits. */
  surge: number;
  surgeDone: boolean;
  surgeAt: number;
  surgeKills: number;
  /** Has this boss's phase-two moment played? */
  rageShown: boolean;
  worlds: Set<ThemeId>;
  endingShown: boolean;
  tutorial: number; // -1 = not a tutorial, else the current step
  tutorialCount: number;
}

const BASE_SPEED = 150;
/** Lines the Blot says after each of its creatures falls. */
const VILLAIN_LINES = [
  'You took one of mine. I have so many more.',
  'Every page you cross, I have already touched.',
  'Your light is getting smaller, little cube.',
  'Come, then. Come to the last page.',
];
const FIRE_SPEED = 1050;

interface TutorialStep {
  title: string;
  text: (touch: boolean) => string;
  setup: (g: Game) => void;
  /** Runs every frame: respawn targets if the player missed them. */
  refill: (g: Game) => void;
  done: (g: Game) => boolean;
}

/**
 * Owns every system and runs the state machine:
 * boot -> story (first visit) -> menu <-> hangar
 * menu -> page turn -> intro -> play <-> boss -> page turn -> play ... -> ending -> victory
 *                                   \-> dead
 */
export class Game {
  readonly scene = new Scene();
  readonly renderer: Renderer;
  readonly input: Input;
  readonly save = new Save();
  readonly ui: UI;
  readonly loop: Loop;
  private quality: QualityPreset;
  private governor: QualityGovernor;
  private styler = new MaterialStyler();
  private atmo!: Atmosphere;
  private ground!: Ground;
  private fauna!: Fauna;
  private clouds!: Clouds;
  readonly player = new Player();
  private particles!: Particles;
  readonly projectiles!: Projectiles;
  readonly enemies!: Enemies;
  readonly pickups!: Pickups;
  private gates!: Gates;
  private eye!: BlotEye;
  private speedLines!: SpeedLines;
  /** Real seconds of slow motion left (boss kills). */
  private slowMo = 0;
  private heartbeat = 0;
  private ink: InkCorruption | null = null;
  private rig: CameraRig;
  private flash!: Flash;
  private telegraph!: Telegraph;
  boss: (Boss & { extras?: import('three').Object3D[] }) | null = null;
  theme: ThemeDef;

  mode: Mode = 'boot';
  paused = false;
  readonly bounds = new Vector2(180, 100);
  private scrollSpeed = 0;
  private modeTime = 0;
  private fireCd = 0;
  private damageFlash = 0;
  private hitStop = 0;
  private trailAcc = 0;
  private rnd = new Random();
  run!: Run;
  private hints = new Set<string>();
  private v3 = new Vector3();
  private enemyCtx!: EnemyContext;
  private bossCtx!: BossContext;
  private busy = false;
  private readonly coarse = matchMedia('(pointer: coarse)').matches;

  constructor(canvas: HTMLCanvasElement) {
    const q = this.save.data.settings.quality;
    this.quality = QUALITY[q === 'auto' ? detectQuality() : q];
    this.renderer = new Renderer(canvas, this.scene, this.quality);
    this.input = new Input(canvas);
    this.ui = new UI(this.save);
    this.rig = new CameraRig(this.renderer.camera);
    this.governor = new QualityGovernor(
      (scale) => this.renderer.setRenderScale(scale),
      (to) => this.setQuality(to),
    );
    this.governor.enabled = q === 'auto';
    this.loop = new Loop((dt, raw) => this.frame(dt, raw));
    const s = this.save.data.settings;
    this.theme = THEMES[s.lockTheme === 'random' ? randomTheme(s.themePool) : s.lockTheme];
    applyUiTheme(s.uiFollowsWorld ? this.theme : THEMES.paper);
    this.ui.theme = this.theme;
    this.bindUi();
    // Resizing clears the canvas. Doing it between frames left a blank flash on
    // phones (address bar, fullscreen); now it happens right before a render.
    const onResize = () => (this.resizePending = true);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.mode === 'play' || this.mode === 'boss')) this.setPaused(true);
      if (audio.ctx) void (document.hidden ? audio.ctx.suspend() : audio.ctx.resume());
    });
  }

  // ------------------------------------------------------------------ boot

  async boot() {
    this.ui.show('boot');
    const step = async (p: number, label: string, fn: () => void) => {
      this.ui.setBootProgress(p, label);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      fn();
    };
    const t = this.theme;
    await step(0.1, 'Mixing the sky', () => {
      this.atmo = new Atmosphere(this.scene, t, this.quality);
    });
    await step(0.3, 'Folding hills', () => {
      this.ground = new Ground(this.scene, t, this.atmo, this.quality);
      this.fauna = new Fauna(this.scene, this.atmo, this.quality);
      this.clouds = new Clouds(this.scene);
    });
    await step(0.5, 'Charging the cube', () => {
      const pr = Math.min(devicePixelRatio, this.quality.maxPixelRatio);
      this.particles = new Particles(this.scene, this.quality.density, pr);
      (this as { projectiles: Projectiles }).projectiles = new Projectiles(this.scene);
      this.flash = new Flash(this.scene);
      this.telegraph = new Telegraph(this.scene);
      this.scene.add(this.player.model.root);
      this.player.model.applyLoadout(this.save.data.loadout);
    });
    await step(0.65, 'Spotting the Blot', () => {
      (this as { enemies: Enemies }).enemies = new Enemies(this.scene, this.particles, this.projectiles, this.atmo.shared.uTime, this.atmo.shared.uSunColor.value);
      (this as { pickups: Pickups }).pickups = new Pickups(this.scene);
      this.gates = new Gates(this.scene);
      this.eye = new BlotEye(this.scene);
      this.speedLines = new SpeedLines(this.scene, this.quality.level === 'low' ? 28 : this.quality.level === 'medium' ? 48 : 70);
      this.makeContexts();
    });
    await step(0.8, 'Inking the outlines', () => {
      this.applyTheme(t, true);
    });
    try {
      await this.renderer.warmup();
    } catch {
      /* optional */
    }
    this.ui.setBootProgress(1, 'Ready');
    this.applySettings(this.save.data.settings);
    this.enterMenu(true);
    this.loop.start();
    this.ui.bootReady();
  }

  private makeContexts() {
    this.enemyCtx = {
      player: this.player,
      scrollSpeed: 0,
      bounds: this.bounds,
      darkness: 0,
      floorAt: (x) => this.ground.floorAt(x),
      difficulty: 1,
      onContact: (e) => this.hurt(e.contactDamage * (this.run?.def.enemyDamage ?? 1)),
      onExplosion: (x, y, r, dmg) => this.explosion(x, y, r, dmg),
      onKill: (e, by) => this.onEnemyKilled(e, by),
    };
    this.bossCtx = {
      player: this.player,
      projectiles: this.projectiles,
      particles: this.particles,
      telegraph: this.telegraph,
      bounds: this.bounds,
      difficulty: 1,
      floorAt: (x) => this.ground.floorAt(x),
      shake: (v) => this.rig.addTrauma(v),
      sfx: (n) => {
        if (n === 'roar') audio.bossRoar();
        else if (n === 'charge') audio.bossCharge();
        else if (n === 'shoot') audio.enemyHit();
        else audio.explode(0.6);
      },
      spawnEnemy: (k: EnemyKind, x, y) => this.enemies.spawn(k, x, y, this.run.def.enemyHp, this.run.boss?.kind === 'blot'),
      // Dimming is capped so the screen never goes black.
      darken: (a, s) => this.ui.darken(Math.min(0.3, a), Math.min(2.5, s)),
    };
  }

  // ------------------------------------------------------------------ worlds

  /** Switch everything to a world. `instant` is used behind a page turn. */
  applyTheme(t: ThemeDef, instant: boolean) {
    this.theme = t;
    if (this.projectiles) this.projectiles.laserGlow = parseInt(t.ui.accent.slice(1), 16);
    this.speedLines?.setColor(parseInt(t.ui.accent.slice(1), 16));
    this.ui.theme = t;
    this.atmo.setTheme(t, instant);
    this.ground.setTheme(t);
    this.clouds.setTheme(t);
    this.fauna.setTheme(t);
    this.player.model.setKind(t.family);
    this.enemies.setFamily(t.family);
    this.pickups.setFamily(t.family);
    this.gates?.setFamily(t.family);
    this.styler.setStyle(t.material, this.scene);
    this.governor.hold();
    this.renderer.setTheme(t.fx, t.world.skyHorizon, instant);
    if (this.save.data.settings.uiFollowsWorld) applyUiTheme(t);
    audio.setMood(t.mood);
    audio.setAmbience(t.ambience);
    try {
      this.renderer.compile();
    } catch {
      /* compile is an optimisation */
    }
  }

  private pickTheme(): ThemeDef {
    const s = this.save.data.settings;
    if (s.lockTheme !== 'random') return THEMES[s.lockTheme];
    return THEMES[randomTheme(s.themePool, this.theme.id, () => this.rnd.next())];
  }

  private noteWorld(t: ThemeId) {
    const s = this.save.data;
    if (!s.worldsSeen.includes(t)) {
      s.worldsSeen.push(t);
      if (s.worldsSeen.length >= THEME_IDS.length) this.unlock('deep_breath');
    }
    if (this.run) {
      this.run.worlds.add(t);
      this.missionMax('worlds', this.run.worlds.size);
      if (this.run.worlds.size >= 5) this.unlock('tourist');
    }
  }

  // ------------------------------------------------------------------ UI wiring

  private bindUi() {
    const ui = this.ui;
    ui.events.on('begin', () => {
      audio.unlock();
      this.landscapeLock();
      this.applySettings(this.save.data.settings);
      if (!this.save.data.storySeen) this.playStory('intro');
      else this.toTitle();
    });
    ui.events.on('dive', ({ daily, level }) => {
      if (!daily && !this.save.data.tutorialDone) this.startRun(1, false, true);
      else this.startRun(level ?? 1, daily, false);
    });
    ui.events.on('resume', () => this.setPaused(false));
    ui.events.on('restart', () => {
      if (this.mode !== 'dead') this.commitRun(true);
      const daily = this.run?.daily ?? false;
      // Checkpoints: retry the level you were on. Classic and daily: from the top.
      const level = daily || this.save.data.settings.progress === 'classic' ? 1 : (this.run?.level ?? 1);
      this.startRun(level, daily, false);
    });
    ui.events.on('continueRun', () => {
      this.ui.show('none');
      this.levelComplete();
    });
    ui.events.on('menu', () => {
      if (['play', 'boss', 'transition', 'intro', 'victory'].includes(this.mode)) this.commitRun(true);
      this.enterMenu(false);
    });
    ui.events.on('settings', (s) => this.applySettings(s));
    ui.events.on('buy', (id) => this.buy(id));
    ui.events.on('loadout', ({ group, value }) => this.setLoadout(group, value));
    ui.events.on('resetSave', () => {
      this.save.reset();
      this.player.model.applyLoadout(this.save.data.loadout);
    });
    ui.events.on('shuffle', () => this.shuffleMenuWorld());
    ui.events.on('story', () => this.playStory('intro'));
    ui.events.on('tutorial', () => this.startRun(1, false, true));
    ui.events.on('openHangar', () => {
      this.mode = 'hangar';
      this.modeTime = 0;
    });
    ui.events.on('closeHangar', () => {
      this.mode = 'menu';
      this.player.model.root.rotation.set(0, 0, 0);
    });
    ui.events.on('exit', () => {
      this.ui.show('exit');
      audio.setPaused(true);
      try {
        window.close();
      } catch {
        /* browsers usually refuse; the exit screen covers it */
      }
    });
    ui.bindTouch((a, down) => {
      if (a === 'pause') {
        if (down) this.setPaused(!this.paused);
        return;
      }
      if (down) this.input.press(a);
      else this.input.release(a);
    });
  }

  /** On phones, go fullscreen and ask for landscape (works on Android; iOS shows the rotate screen instead). */
  private landscapeLock() {
    if (!matchMedia('(pointer: coarse)').matches) return;
    const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    const lock = () => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {});
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().then(lock, () => {});
    else void lock();
  }

  private playStory(kind: 'intro' | 'ending') {
    const prev = this.mode;
    this.mode = kind === 'intro' ? 'story' : 'ending';
    this.ui.show('none');
    this.ui.setHudVisible(false);
    audio.setMood({ root: 60, scale: [0, 2, 4, 7, 9], bpm: 66, density: 0.3, cutoff: 3000 });
    new StoryPlayer(this.ui.root, kind, () => {
      audio.setMood(this.theme.mood);
      if (kind === 'intro') {
        this.save.data.storySeen = true;
        this.save.write();
        if (prev === 'story' || prev === 'boot' || prev === 'menu') this.toTitle();
        else this.toTitle();
      } else {
        this.mode = 'victory';
        this.ui.showVictory(this.summary(false));
      }
    });
  }

  private toTitle() {
    this.mode = 'menu';
    audio.setMenu(true);
    this.ui.show('title');
    if (!this.save.data.coachDone) {
      this.ui.coachHome(() => {
        this.save.data.coachDone = true;
        this.save.write();
      });
    }
  }

  private shuffleMenuWorld() {
    if (this.busy) return;
    this.busy = true;
    const next = this.pickTheme();
    void this.ui
      .pageTurn(next, next.name, 'Turning the page', () => {
        this.applyTheme(next, true);
        this.noteWorld(next.id);
        this.ui.show('title');
      })
      .then(() => (this.busy = false));
  }

  private applySettings(s: Settings) {
    const prevFollow = this.save.data.settings.uiFollowsWorld;
    this.save.data.settings = s;
    this.save.write();
    audio.setVolumes(s.master, s.music, s.sfx, s.voice ?? 0.9);
    this.input.autoFire = s.autoFire !== false;
    audio.setStyle(s.musicStyle ?? 'fast');
    this.rig.shakeScale = s.shake && !s.reducedMotion ? 1 : 0;
    this.ui.showFps(s.showFps);
    this.ui.setHudScale(s.hudScale);
    this.governor.enabled = s.quality === 'auto';
    const level = s.quality === 'auto' ? this.quality.level : s.quality;
    if (level !== this.quality.level) this.setQuality(level);
    if (prevFollow !== s.uiFollowsWorld) applyUiTheme(s.uiFollowsWorld ? this.theme : THEMES.paper);
  }

  private setQuality(level: QualityLevel) {
    this.quality = QUALITY[level];
    this.renderer.applyQuality(this.quality);
    this.atmo?.applyQuality(this.quality);
    this.ground?.applyQuality(this.quality);
    this.particles?.setPixelRatio(Math.min(devicePixelRatio, this.quality.maxPixelRatio));
  }

  private buy(id: UpgradeId) {
    const def = UPGRADES.find((u) => u.id === id)!;
    const lvl = this.save.data.upgrades[id];
    const cost = def.costs[lvl];
    if (cost === undefined || this.save.data.shards < cost) return;
    this.save.data.shards -= cost;
    this.save.data.upgrades[id] = lvl + 1;
    this.save.write();
    audio.powerup();
    this.ui.refresh();
  }

  private setLoadout(group: keyof Loadout, value: string | boolean) {
    const s = this.save.data;
    if (typeof value === 'string' && group !== 'callsign') {
      const key = `${group}:${value}`;
      const cost = costOf(group, value);
      if (cost > 0 && !s.owned.includes(key)) {
        if (s.shards < cost) {
          this.ui.toast('Not enough shards', `That costs ${cost}. You have ${s.shards}.`);
          return;
        }
        s.shards -= cost;
        s.owned.push(key);
        this.unlock('stylist');
        audio.powerup();
      }
    }
    (s.loadout as unknown as Record<string, string | boolean>)[group] = value;
    this.save.write();
    this.player.model.applyLoadout(s.loadout);
    this.styler.apply(this.player.model.root);
    if (group !== 'callsign') this.ui.refresh();
  }

  private unlock(id: string) {
    if (this.save.unlock(id)) {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (a) this.ui.toast(a.name, a.desc);
      audio.chime();
    }
  }

  // ------------------------------------------------------------------ missions

  private missionAdd(kind: MissionKind, n = 1) {
    if (!this.run || this.run.tutorial >= 0) return;
    for (const m of this.save.data.missions) if (m.kind === kind && !m.single) m.progress += n;
    this.checkMissions();
  }

  private missionMax(kind: MissionKind, v: number) {
    if (!this.run || this.run.tutorial >= 0) return;
    for (const m of this.save.data.missions) if (m.kind === kind && m.single) m.progress = Math.max(m.progress, v);
    this.checkMissions();
  }

  private checkMissions() {
    const s = this.save.data;
    s.missions.forEach((m, i) => {
      if (m.progress < m.target) return;
      s.shards += m.reward;
      s.missionTiers[m.kind] = (s.missionTiers[m.kind] ?? 0) + 1;
      this.ui.toast('Mission complete', `${describe(m)}  ·  +${m.reward} shards`);
      audio.chime();
      s.missions[i] = nextMission(s.missions, s.missionTiers);
    });
  }

  // ------------------------------------------------------------------ flow

  private enterMenu(first: boolean) {
    this.mode = 'menu';
    audio.setMenu(true);
    audio.setIntensity(0);
    this.paused = false;
    this.modeTime = 0;
    this.input.enabled = true;
    this.loop.timeScale = 1;
    this.clearWorld();
    this.player.reset(statsFor(this.save.data.upgrades));
    this.player.pos.set(30, 0);
    this.player.controllable = false;
    this.ui.setHudVisible(false);
    this.ui.clearOverlays();
    this.ui.fade(0);
    audio.setBossMood(null);
    audio.cutMusic(false);
    audio.setPaused(false);
    audio.setEngine('off');
    if (!first) this.ui.show('title');
  }

  private clearWorld() {
    this.enemies?.clear();
    this.gates?.clear();
    this.eye?.hide();
    this.pickups?.clear();
    this.projectiles?.clearAll();
    this.telegraph?.clear();
    this.removeBoss();
  }

  startRun(level: number, daily: boolean, tutorial: boolean) {
    if (this.busy) return;
    this.busy = true;
    const seed = daily ? dailySeed() : (Math.random() * 2 ** 31) >>> 0;
    this.rnd.reseed(seed);
    this.enemies.seed(seed + 1);
    this.pickups.seed(seed + 2);
    const next = tutorial ? THEMES.paper : this.pickTheme();
    this.ui.show('none');
    void this.ui
      .pageTurn(next, tutorial ? 'Practice page' : `Level ${level}`, next.name, () => {
        this.clearWorld();
        this.run = {
          level,
          def: levelDef(level),
          levelTime: 0,
          startLevel: level,
          distance: 0,
          score: 0,
          kills: 0,
          sparks: 0,
          shards: 0,
          combo: 0,
          comboTimer: 0,
          time: 0,
          daily,
          bossHullAtStart: 0,
          hurtThisLevel: false,
          dashKills: 0,
          dodges: 0,
          flares: 0,
          boss: null,
          eyeDone: false,
          eyeAt: 0.3 + Math.random() * 0.4,
          tauntDone: false,
          grazes: 0,
          surge: 0,
          surgeDone: false,
          surgeAt: 0.4 + Math.random() * 0.25,
          surgeKills: 0,
          rageShown: false,
          worlds: new Set(),
          endingShown: level > STORY_END_LEVEL,
          tutorial: tutorial ? 0 : -1,
          tutorialCount: 0,
        };
        this.applyTheme(next, true);
        this.noteWorld(next.id);
        this.player.reset(statsFor(this.save.data.upgrades));
        this.player.pos.set(-this.bounds.x - 40, 0);
        this.player.controllable = false;
        this.rig.offset.set(0, 0, 0);
        this.rig.setZoom(1);
        this.fireCd = 0;
        audio.setEngine(next.family);
        if (!tutorial) {
          this.save.data.stats.runs++;
          this.noteProgress(level);
        }
        this.save.write();
        this.ui.clearOverlays();
        this.ui.fade(0);
        this.ui.setHudVisible(false);
        this.mode = 'intro';
        this.modeTime = 0;
        this.paused = false;
        audio.setMenu(false);
        audio.setIntensity(0);
        audio.cutMusic(false);
        audio.setBossMode(false);
      })
      .then(() => (this.busy = false));
  }

  private setPaused(p: boolean) {
    if (!['play', 'boss', 'bossIntro', 'transition', 'intro'].includes(this.mode)) return;
    this.paused = p;
    audio.setPaused(p);
    this.input.releaseAll();
    if (p) this.ui.show('pause');
    else this.ui.show('none');
  }

  // ------------------------------------------------------------------ frame

  private resizePending = false;

  private frame(dt: number, raw: number) {
    if (this.resizePending) {
      this.resizePending = false;
      this.renderer.resize();
    }
    this.input.update();
    if (this.input.consume('pause')) {
      if (this.paused && this.ui.current === 'pause') this.setPaused(false);
      else if (!this.paused) this.setPaused(true);
    }
    this.renderer.playfieldHalfSize(this.bounds);
    this.ui.tick(raw);
    // Phones held upright see the rotate screen; don't let the run continue under it.
    if (!this.paused && this.coarse && window.innerHeight > window.innerWidth && ['play', 'boss', 'bossIntro', 'intro'].includes(this.mode)) this.setPaused(true);
    this.governor.update(raw, this.loop.fps, this.quality.level);

    if (this.paused || this.mode === 'ending') {
      this.styler.sync();
      this.renderer.render(0);
      this.input.endFrame();
      return;
    }
    if (this.hitStop > 0) {
      this.hitStop -= raw;
      dt *= 0.05;
    } else if (this.slowMo > 0) {
      this.slowMo -= raw;
      dt *= 0.28;
    }
    this.modeTime += dt;
    switch (this.mode) {
      case 'boot':
      case 'story':
      case 'menu':
      case 'hangar':
      case 'victory':
        this.updateMenu(dt);
        break;
      case 'intro':
        this.updateIntro(dt);
        break;
      case 'play':
      case 'boss':
      case 'bossIntro':
      case 'transition':
        this.updatePlay(dt);
        break;
      case 'dead':
        this.updateDead(dt);
        break;
    }
    this.player.animate(dt, this.theme.beam);
    this.flash.update(dt);
    this.telegraph.update(dt);
    this.particles.update(dt, this.ground.worldScroll);
    this.speedLines?.update(dt, this.mode === 'menu' || this.mode === 'hangar' ? 0 : this.scrollSpeed, this.bounds);
    this.rig.update(dt, this.player.pos.x, this.player.pos.y);
    this.styler.sync();
    this.renderer.render(dt);
    this.input.endFrame();
  }

  private updateWorld(dt: number, speed: number) {
    this.scrollSpeed = damp(this.scrollSpeed, speed, 1.5, dt);
    this.atmo.update(dt, this.scrollSpeed);
    this.ground.update(dt, this.scrollSpeed);
    this.fauna.update(dt, this.modeTime, this.scrollSpeed);
    this.clouds.update(dt, this.scrollSpeed);
  }

  private updateMenu(dt: number) {
    const hangar = this.mode === 'hangar';
    this.updateWorld(dt, hangar ? 0 : 22);
    const p = this.player;
    const narrow = window.innerWidth < 760;
    const tx = hangar ? (narrow ? 0 : -this.bounds.x * 0.18) : narrow ? 0 : this.bounds.x * 0.08;
    const ty = hangar ? (narrow ? 30 : 4) : narrow ? 25 : 6;
    p.pos.set(damp(p.pos.x, tx, 3, dt), damp(p.pos.y, ty + Math.sin(this.modeTime * 1.1) * 3, 3, dt));
    p.model.root.position.set(p.pos.x, p.pos.y, 0);
    p.model.body.rotation.set(Math.sin(this.modeTime * 0.7) * 0.06, 0, Math.sin(this.modeTime * 0.9) * 0.05);
    if (hangar) p.model.root.rotation.y += dt * 0.45;
    else p.model.root.rotation.y = damp(p.model.root.rotation.y % (Math.PI * 2), Math.sin(this.modeTime * 0.3) * 0.25, 2, dt);
    this.rig.setZoom(hangar ? 2.3 : 1.15);
    this.rig.offset.set(hangar ? p.pos.x * 0.6 : 0, hangar ? p.pos.y * 0.5 : 0, 0);
    if (this.mode === 'menu') this.emitTrail(dt * 0.6);
  }

  private updateIntro(dt: number) {
    const def = this.run.def;
    this.updateWorld(dt, BASE_SPEED * def.scroll);
    const p = this.player;
    const k = easeOutCubic(clamp(this.modeTime / 1.3, 0, 1));
    p.pos.set(-this.bounds.x - 40 + (this.bounds.x - 20) * k, Math.sin(this.modeTime * 2) * 6);
    p.model.root.position.set(p.pos.x, p.pos.y, 0);
    p.model.root.rotation.set(0, 0, 0);
    this.emitTrail(dt * 2);
    if (this.modeTime > 1.35) {
      this.mode = 'play';
      this.modeTime = 0;
      p.controllable = true;
      this.ui.setHudVisible(true, this.input.isTouch);
      audio.zoneEnter();
      this.unlock('ejected');
      if (this.run.tutorial >= 0) this.tutorialStep(0);
      else {
        const t = this.theme;
        this.ui.levelSlam(def.n, t.name, def.bossSlot >= 0);
        audio.slam();
        if (def.n === 1 && this.save.data.settings.hints) this.ui.hint(this.input.isTouch ? 'Drag to steer. Your laser fires on its own.' : this.input.autoFire ? 'Move the mouse to fly. Your laser fires on its own.' : 'Move the mouse to fly. Hold left click or Space to fire.', 5);
      }
    }
  }

  private hintOnce(key: string, text: string, seconds = 5) {
    if (!this.save.data.settings.hints || this.hints.has(key) || this.run.tutorial >= 0) return;
    this.hints.add(key);
    this.ui.hint(text, seconds);
  }

  private updatePlay(dt: number) {
    const run = this.run;
    const def = run.def;
    const inBoss = this.mode === 'boss' || this.mode === 'bossIntro';
    const transition = this.mode === 'transition';
    if (this.mode === 'bossIntro') this.updateBossIntro(dt);
    const tut = run.tutorial >= 0;
    const diff = DIFFICULTY[this.save.data.settings.difficulty];
    run.time += dt;
    // The world stops scrolling for boss fights: the arena is the screen.
    this.updateWorld(dt, inBoss ? 0 : BASE_SPEED * def.scroll);
    run.distance += this.scrollSpeed * dt * 0.12;

    if (!inBoss && !transition && !tut) {
      run.levelTime += dt;
      if (run.levelTime >= def.duration) {
        if (def.bossSlot >= 0) this.startBoss();
        else this.levelComplete();
      }
    }

    const p = this.player;
    p.update(dt, this.input, this.bounds, this.ground.floorAt(p.pos.x));
    if (!tut && !transition && this.mode !== 'bossIntro') p.burn(dt, diff.drain * def.drain * (inBoss ? 0.5 : 1));
    if (tut) p.energy = Math.max(p.energy, 40);
    this.handleAbilities(dt);
    this.emitTrail(dt);
    audio.setThrust(Math.min(1, p.vel.length() / 220));

    this.enemyCtx.scrollSpeed = inBoss ? BASE_SPEED * 0.5 : this.scrollSpeed;
    this.enemyCtx.darkness = 0;
    this.enemyCtx.difficulty = def.bulletSpeed;
    const progress = clamp(run.levelTime / def.duration, 0, 1);
    this.enemies.direct(dt, def, progress, this.enemyCtx, !inBoss && !transition && !tut && progress < 0.96, diff.spawn * (run.surge > 0 ? 2.3 : 1));
    this.gates.direct(dt, run.level, this.bounds, !inBoss && !transition && !tut && progress < 0.9);
    this.gates.update(
      dt,
      this.scrollSpeed,
      this.bounds,
      p.pos.x,
      p.pos.y,
      p.radius,
      () => {
        if (p.dashing) return;
        this.hurt(14 * def.enemyDamage);
      },
      () => this.gatePassed(),
    );
    // The Blot looks in on later levels.
    if (!run.eyeDone && run.level >= 4 && !inBoss && !tut && progress > run.eyeAt) {
      run.eyeDone = true;
      if (Math.random() < 0.7) {
        this.eye.open(this.bounds.x * (0.2 + Math.random() * 0.4));
        audio.whisper();
        if (!run.tauntDone) {
          run.tauntDone = true;
          void audio.speak('blot-taunt');
        }
      }
    }
    this.eye.update(dt, p.pos.x, p.pos.y);
    // Ink surge: the Blot floods the page for a few seconds. Double score while it lasts.
    if (!run.surgeDone && run.level >= 4 && def.bossSlot < 0 && !inBoss && !tut && !transition && progress > run.surgeAt) {
      run.surgeDone = true;
      if (Math.random() < 0.8) this.startSurge();
    }
    if (run.surge > 0) {
      run.surge -= dt;
      this.ui.inkEdges(0.45 + Math.sin(run.time * 6) * 0.08);
      this.speedLines.boost = Math.max(this.speedLines.boost, 0.7);
      if (run.surge <= 0 || inBoss || transition) this.endSurge(true);
    }
    // Low energy: a heartbeat under the music.
    if (p.alive && !tut && p.energy < p.stats.maxEnergy * 0.2) {
      this.heartbeat -= dt;
      if (this.heartbeat <= 0) {
        this.heartbeat = 0.42 + (p.energy / p.stats.maxEnergy) * 2;
        audio.heartbeat();
      }
    }
    if (!tut) this.pickups.direct(dt, this.bounds, !transition, !inBoss && !transition, p.energy / p.stats.maxEnergy);

    this.updateCombat(dt, inBoss ? BASE_SPEED * 0.5 : this.scrollSpeed);

    if (run.combo > 0) {
      run.comboTimer -= dt;
      if (run.comboTimer <= 0) run.combo = 0;
    }

    if (tut) this.updateTutorial();
    else {
      const low = p.energy < p.stats.maxEnergy * 0.3;
      if (low) this.hintOnce('energy', `Energy low. Collect ${SPARK_NAME[this.theme.family]} to refill it.`);
      if (p.lumen >= 1) this.hintOnce('flare', this.input.isTouch ? 'Flare ready: tap FLARE to clear the screen.' : 'Flare ready: press Q to clear the screen.');
      if (run.time > 10) this.hintOnce('dodge', this.input.isTouch ? 'Tap DODGE to roll out of the way.' : 'Press Shift to roll up or down, out of the way.', 5);
      if (p.energy < p.stats.maxEnergy * 0.18) audio.alarm();
    }
    if (!p.alive) this.onDeath();
    this.pushHud();
  }

  private emitTrail(dt: number) {
    const style = this.save.data.loadout.trail;
    if (style === 'none') return;
    this.trailAcc += dt * 30;
    while (this.trailAcc >= 1) {
      this.trailAcc -= 1;
      const port = this.player.model.exhaustPorts[Math.random() < 0.5 ? 0 : 1];
      port.getWorldPosition(this.v3);
      switch (style) {
        case 'bubbles':
          this.particles.bubbles(this.v3, 1, 1.5, 1.6);
          break;
        case 'sparkle':
          this.particles.burst(this.v3, { count: 1, color: 0xffd98a, speed: 20, size: 3, life: 0.6, drag: 3, spread: 1.5 });
          break;
        case 'confetti':
          this.particles.burst(this.v3, { count: 1, color: [0xe4572e, 0xf3a712, 0x2f8fe8, 0x4f8a3c][Math.floor(Math.random() * 4)], speed: 25, size: 3.4, life: 1.1, drag: 2, gravity: -20, smoke: true });
          break;
        case 'ink':
          this.particles.burst(this.v3, { count: 1, color: 0x15151a, speed: 10, size: 4, life: 1, drag: 2, gravity: -40, smoke: true });
          break;
      }
    }
  }

  private handleAbilities(dt: number) {
    const p = this.player;
    const input = this.input;
    this.fireCd -= dt;
    if (!p.alive || !p.controllable) return;

    if (input.isHeld('fire') && this.fireCd <= 0) {
      this.fireCd = 1 / p.stats.fireRate;
      p.model.muzzle.getWorldPosition(this.v3);
      const dmg = p.stats.damage;
      if (p.powerups.spread > 0) {
        for (const a of [-0.14, 0, 0.14]) this.projectiles.fire('bolt', this.v3.x, this.v3.y, Math.cos(a) * FIRE_SPEED, Math.sin(a) * FIRE_SPEED, dmg);
      } else this.projectiles.fire('bolt', this.v3.x, this.v3.y, FIRE_SPEED, 0, dmg);
      audio.shoot();
    }
    if (input.consume('dash') && p.tryDodge()) {
      audio.dash();
      this.run.dodges++;
      this.save.data.stats.reveals++;
      this.missionAdd('reveal');
      if (this.save.data.stats.reveals >= 60) this.unlock('echo');
      this.particles.burst(this.v3.set(p.pos.x, p.pos.y, 0), { count: 14, color: 0xffffff, speed: 70, size: 5, life: 0.35, drag: 4 });
    }
    if (input.consume('flare') && p.lumen >= 1) this.bioflare();
  }

  private bioflare() {
    const p = this.player;
    p.lumen = 0;
    this.run.flares++;
    this.save.data.stats.flares++;
    this.missionAdd('flare');
    audio.flare();
    this.flash.trigger(p.pos.x, p.pos.y, 0xfff4d0, 4);
    this.ui.fade(0.75);
    setTimeout(() => this.ui.fade(0), 120);
    this.rig.addTrauma(0.6);
    this.v3.set(p.pos.x, p.pos.y, 0);
    this.particles.burst(this.v3, { count: 160, color: 0xffe6a0, speed: 420, size: 9, life: 1.2, drag: 2, jitter: 0.6 });
    const before = this.run.kills;
    this.enemies.killAll(this.enemyCtx, true);
    if (this.run.kills - before >= 8) this.unlock('flare');
    this.projectiles.clearBullets();
    if (this.boss && this.boss.state === 'fight') this.damageBoss(this.boss.maxHp * 0.08, p.pos.x, p.pos.y);
  }

  private updateCombat(dt: number, pickupSpeed = this.scrollSpeed) {
    const p = this.player;
    this.projectiles.update(dt, this.bounds, () => null);
    this.enemies.update(dt, this.enemyCtx);

    // Player shots vs creatures and the boss (swept, so fast bolts never tunnel).
    for (const s of this.projectiles.shots.items) {
      if (!s.active) continue;
      let consumed = false;
      for (const e of this.enemies.list) {
        if (!e.active) continue;
        const r = e.radius + 3;
        if (segDist2(s.prev.x, s.prev.y, s.pos.x, s.pos.y, e.pos.x, e.pos.y) < r * r) {
          this.enemies.hit(e, s.damage, this.enemyCtx, true);
          this.particles.burst(this.v3.set(s.pos.x, s.pos.y, 0), { count: 5, color: 0xfff2c8, speed: 80, size: 4, life: 0.3 });
          audio.enemyHit();
          consumed = true;
          break;
        }
      }
      if (!consumed && this.boss && this.boss.state === 'fight') {
        for (const h of this.boss.hitboxes) {
          if (segDist2(s.prev.x, s.prev.y, s.pos.x, s.pos.y, h.x, h.y) < (h.r + 2) ** 2) {
            this.damageBoss(s.damage * h.mult, s.pos.x, s.pos.y);
            consumed = true;
            break;
          }
        }
      }
      if (consumed) s.active = false;
    }

    // Hostile bullets vs the craft. The hit circle is smaller than the model, which feels fair.
    if (p.alive) {
      for (const b of this.projectiles.bullets.items) {
        if (!b.active || b.damage <= 0) continue;
        const r = b.radius + p.radius * 0.6;
        const d2 = (b.pos.x - p.pos.x) ** 2 + (b.pos.y - p.pos.y) ** 2;
        if (d2 < r * r) {
          b.active = false;
          this.hurt(b.damage);
        } else if (!b.grazed && d2 < (r + 16) ** 2) {
          b.grazed = true;
          this.graze(b.pos.x, b.pos.y);
        }
      }
    }

    if (this.boss) {
      this.boss.update(dt, this.bossCtx);
      this.ui.bossBar(this.boss.name, this.run.boss?.title ?? '', this.boss.hp / this.boss.maxHp);
      if (p.alive && this.boss.state === 'fight') {
        for (const hb of this.boss.hitboxes) {
          if (!hb.harmful) continue;
          const r = hb.r + p.radius * 0.7;
          if ((hb.x - p.pos.x) ** 2 + (hb.y - p.pos.y) ** 2 < r * r) {
            this.hurt(15);
            break;
          }
        }
      }
      if (this.boss.phase2 && !this.run.rageShown && this.boss.state === 'fight') {
        // Phase two: the ink boils over.
        this.run.rageShown = true;
        this.hitStop = 0.35;
        this.rig.addTrauma(0.7);
        this.renderer.aberration = 1;
        this.flash.trigger(this.boss.pos.x, this.boss.pos.y, 0xff3a3a, 1.2);
        this.ui.banner('Enraged', 'the ink boils over', 'danger', 1.8);
        audio.bossRoar();
        audio.setIntensity(1);
      }
      if (this.boss.state === 'dead') this.onBossDefeated();
    }

    // Near misses with creatures count too.
    if (p.alive && !p.dashing) {
      for (const e of this.enemies.list) {
        if (!e.active || e.grazed) continue;
        const rr = e.radius + p.radius + 16;
        if ((e.pos.x - p.pos.x) ** 2 + (e.pos.y - p.pos.y) ** 2 < rr * rr && e.pos.x < p.pos.x) {
          e.grazed = true;
          this.graze(e.pos.x, e.pos.y);
        }
      }
    }
    if (this.ink && this.boss) this.ink.update(dt, this.boss.t, this.boss.hitboxes, this.particles, this.boss.phase2);

    const magnet = Math.max(p.powerups.magnet > 0 ? 170 : 0, p.stats.magnetRadius);
    this.pickups.update(dt, pickupSpeed, this.bounds, p.pos.x, p.pos.y, magnet, p.radius + 8, (it) => this.collect(it));
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
    this.ui.vignette(this.damageFlash, p.energy < p.stats.maxEnergy * 0.18 && p.alive);
  }

  /** Near miss: a little score and flare charge for flying close. */
  private graze(x: number, y: number) {
    const run = this.run;
    if (!run || this.player.invuln > 0) return;
    run.grazes++;
    run.score += 25 * Math.max(1, run.level);
    this.player.lumen = Math.min(1, this.player.lumen + 0.03);
    audio.graze();
    this.popupAt((x + this.player.pos.x) / 2, (y + this.player.pos.y) / 2 + 10, 'Close!');
  }

  private gatePassed() {
    const run = this.run;
    run.score += 150 * Math.max(1, run.level);
    run.combo++;
    run.comboTimer = 1.8;
    this.player.lumen = Math.min(1, this.player.lumen + 0.05);
    this.player.addEnergy(4);
    audio.gatePass();
    this.popupAt(this.player.pos.x + 20, this.player.pos.y + 16, 'Clean!');
  }

  private damageBoss(amount: number, x: number, y: number) {
    const b = this.boss!;
    const died = b.hit(amount);
    this.particles.burst(this.v3.set(x, y, 0), { count: 8, color: 0xffb070, speed: 120, size: 5, life: 0.35 });
    audio.enemyHit();
    if (died) {
      // The killing blow: a beat of freeze, then slow motion, a white flash and a title.
      this.hitStop = 0.25;
      this.slowMo = 1.5;
      this.rig.addTrauma(1);
      this.flash.trigger(b.pos.x, b.pos.y, 0xffffff, 1.5);
      this.renderer.aberration = 1;
      this.ui.banner(this.run.boss?.kind === 'blot' ? 'The ink breaks' : 'Page restored', `${this.run.boss?.name ?? 'The boss'} falls`, 'win', 2.4);
      audio.explode(2);
      audio.bossRoar();
      audio.victoryHit();
      this.projectiles.clearBullets();
      this.telegraph.clear();
    }
  }

  private startSurge() {
    const run = this.run;
    run.surge = 7;
    run.surgeKills = 0;
    this.ui.banner('Ink surge', 'double score · hold the line', 'ink', 2);
    audio.alarm();
    audio.whisper();
    audio.setIntensity(1);
    this.rig.addTrauma(0.3);
    this.renderer.aberration = 0.6;
    if (!this.eye.isOpen) this.eye.open(this.bounds.x * 0.3);
  }

  private endSurge(survived: boolean) {
    const run = this.run;
    if (!run || run.surge <= 0) {
      this.ui.inkEdges(0);
      return;
    }
    run.surge = 0;
    this.ui.inkEdges(0);
    audio.setIntensity(0);
    if (survived && this.player.alive && this.mode === 'play') {
      const bonus = 400 * Math.max(1, run.level) + run.surgeKills * 50;
      run.score += bonus;
      this.ui.banner('Surge cleared', `+${bonus.toLocaleString()}`, 'win', 1.6);
      audio.comboMilestone();
    }
  }

  private hurt(amount: number) {
    const p = this.player;
    const hadShield = p.shieldCharges > 0;
    const dealt = p.damage(amount * DIFFICULTY[this.save.data.settings.difficulty].damageTaken);
    if (dealt > 0) {
      this.run.hurtThisLevel = true;
      this.damageFlash = 1;
      this.rig.addTrauma(0.35);
      this.hitStop = 0.05;
      this.renderer.aberration = 0.7;
      audio.hit();
      this.particles.burst(this.v3.set(p.pos.x, p.pos.y, 0), { count: 14, color: 0xffa060, speed: 120, size: 5, life: 0.5 });
      this.run.combo = 0;
    } else if (hadShield && p.shieldHit > 0.9) {
      audio.shieldHit();
      this.rig.addTrauma(0.12);
    }
  }

  private explosion(x: number, y: number, radius: number, damage: number) {
    this.flash.trigger(x, y, 0xff8a3a, 1.6);
    this.rig.addTrauma(0.4);
    audio.explode(1.2);
    const p = this.player;
    if (Math.hypot(p.pos.x - x, p.pos.y - y) < radius + p.radius) this.hurt(damage * (this.run?.def.enemyDamage ?? 1));
    for (const e of this.enemies.list) {
      if (e.active && Math.hypot(e.pos.x - x, e.pos.y - y) < radius + e.radius) this.enemies.hit(e, 5, this.enemyCtx, true);
    }
  }

  private onEnemyKilled(e: Enemy, byPlayer: boolean) {
    if (!byPlayer) return;
    const run = this.run;
    run.kills++;
    run.tutorialCount++;
    const pts = Math.round(ENEMY_SPECS[e.kind].score * (1 + (Math.max(1, run.level) - 1) * 0.08) * (run.surge > 0 ? 2 : 1));
    run.score += pts;
    if (run.surge > 0) run.surgeKills++;
    this.player.lumen = Math.min(1, this.player.lumen + 0.035 * lumenGain(this.save.data.upgrades));
    if (this.player.dashing) {
      run.dashKills++;
      this.save.data.stats.dashKills++;
      this.missionAdd('dash');
      if (this.save.data.stats.dashKills >= 25) this.unlock('dasher');
      this.popupAt(e.pos.x, e.pos.y, 'Ram!');
    } else this.popupAt(e.pos.x, e.pos.y, `+${pts}`);
    this.save.data.stats.kills++;
    this.missionAdd('kills');
    if (e.elite) {
      this.pickups.spawn(Math.random() < 0.6 ? 'shard' : 'repair', e.pos.x, e.pos.y);
      this.particles.burst(this.v3.set(e.pos.x, e.pos.y, 2), { count: 20, color: 0x0a0a12, speed: 120, size: 9, life: 1.2, drag: 2, smoke: true });
    }
  }

  private collect(it: Pickup) {
    const p = this.player;
    const run = this.run;
    this.v3.set(it.pos.x, it.pos.y, 0);
    switch (it.kind) {
      case 'spark': {
        run.combo = run.comboTimer > 0 ? run.combo + 1 : 1;
        run.comboTimer = 1.6;
        if (run.combo % 10 === 0) audio.comboMilestone();
        if (run.combo >= 40) this.unlock('combo');
        this.missionMax('combo', run.combo);
        run.sparks++;
        run.tutorialCount++;
        p.addEnergy(1.5);
        p.lumen = Math.min(1, p.lumen + 0.024 * (1 + run.combo * 0.04) * lumenGain(this.save.data.upgrades));
        run.score += 10 * run.combo;
        audio.pickup(run.combo);
        this.missionAdd('sparks');
        this.particles.burst(this.v3, { count: 6, color: 0xfff2b0, speed: 55, size: 5, life: 0.4 });
        break;
      }
      case 'repair':
        p.addEnergy(30);
        audio.powerup();
        this.popupAt(it.pos.x, it.pos.y, '+30 energy');
        break;
      case 'shard':
        run.shards++;
        run.score += 500;
        audio.chime();
        this.popupAt(it.pos.x, it.pos.y, 'Shard!');
        this.missionAdd('shards');
        this.particles.burst(this.v3, { count: 24, color: 0xf0e0ff, speed: 110, size: 6, life: 0.8 });
        break;
      default: {
        const kind = it.kind as PowerUp;
        if (kind === 'shield') p.shieldCharges = 2;
        else p.powerups[kind] = 10;
        audio.powerup();
        this.save.data.stats.powerups++;
        this.missionAdd('powerups');
        this.popupAt(it.pos.x, it.pos.y, POWERUP_INFO[kind].label);
      }
    }
  }

  private popupAt(x: number, y: number, text: string) {
    this.v3.set(x, y, 0).project(this.renderer.camera);
    this.ui.popup(text, ((this.v3.x + 1) / 2) * window.innerWidth, ((1 - this.v3.y) / 2) * window.innerHeight);
  }

  // ------------------------------------------------------------------ levels & bosses

  /**
   * Boss entrance in three beats: WARNING (music cuts, siren, creatures
   * scatter, scrolling stops), then the roll-in (letterbox, name card,
   * stinger, the boss glides into place), then the fight and its music.
   */
  private endWarning?: () => void;

  private startBoss() {
    const final = this.run.def.bossSlot === 4;
    const info = final ? BOSS_TABLE.water[4] : BOSS_TABLE[this.theme.family][this.run.def.bossSlot];
    this.run.boss = info;
    this.mode = 'bossIntro';
    this.modeTime = 0;
    this.bossIntroStage = 0;
    audio.cutMusic(true);
    audio.siren();
    void audio.speak(final ? 'warn-final' : Math.random() < 0.5 ? 'warn-1' : 'warn-2');
    this.endWarning = this.ui.bossWarning(final);
    this.rig.addTrauma(0.25);
    this.governor.hold(6);
    audio.preloadVoice([`boss-${info.kind}`, 'victory', 'blot-defeat']);
  }

  private bossIntroStage = 0;

  private updateBossIntro(_dt: number) {
    const info = this.run.boss!;
    const t = this.modeTime;
    if (this.bossIntroStage === 0 && t > 2.3) {
      this.bossIntroStage = 1;
      this.endWarning?.();
      this.endWarning = undefined;
      // Whatever is still on screen bursts into ink as the boss arrives.
      for (const e of this.enemies.list)
        if (e.active) this.particles.burst(this.v3.set(e.pos.x, e.pos.y, 2), { count: 14, color: 0x0a0a12, speed: 90, size: 8, life: 0.9, drag: 2, smoke: true });
      this.enemies.clear();
      this.gates.clear();
      this.projectiles.clearBullets();
      this.boss = createBoss(info.kind, this.run.def.bossDifficulty);
      this.scene.add(this.boss.root);
      for (const x of this.boss.extras ?? []) this.scene.add(x);
      this.styler.apply(this.boss.root);
      for (const x of this.boss.extras ?? []) this.styler.apply(x);
      this.boss.enter(this.bounds);
      const slot = this.run.def.bossSlot;
      this.ink = new InkCorruption(this.boss.root, info.kind === 'blot' ? 1 : (slot + 1) / 4, this.boss.hitboxes[0]?.r ?? 30);
      const b = this.boss as { onPhase2Taunt?: (() => void) | null };
      if ('onPhase2Taunt' in b) b.onPhase2Taunt = () => void audio.speak('blot-taunt');
      this.run.bossHullAtStart = this.player.energy;
      this.player.addEnergy(20);
      this.ui.bossIntro(info.name, info.title, 2.4);
      audio.stinger(info.kind === 'blot');
      void audio.speak(`boss-${info.kind}`);
      this.rig.addTrauma(0.6);
      this.rig.setZoom(1.06);
      try {
        this.renderer.compile();
      } catch {
        /* optional */
      }
    }
    if (this.bossIntroStage === 1 && t > 3.4) {
      this.bossIntroStage = 2;
      audio.cutMusic(false);
      audio.setBossMood(info.kind === 'blot' ? BOSS_MOODS.blot : BOSS_MOODS[this.theme.family]);
      audio.bossRoar();
    }
    if (this.bossIntroStage === 2 && t > 4.8) {
      this.rig.setZoom(1);
      this.mode = 'boss';
    }
  }

  private removeBoss() {
    this.endWarning?.();
    this.endWarning = undefined;
    if (!this.boss) return;
    this.ink?.dispose();
    this.ink = null;
    this.scene.remove(this.boss.root);
    for (const x of this.boss.extras ?? []) this.scene.remove(x);
    this.boss = null;
    this.ui.bossBar(null);
  }

  private onBossDefeated() {
    const run = this.run;
    run.score += 5000 * Math.ceil(run.level / 3);
    run.shards += 3;
    this.player.addEnergy(50);
    this.save.data.stats.bosses++;
    this.missionAdd('bosses');
    this.unlock('boss_first');
    this.unlock('boss_' + this.theme.family);
    if (this.player.energy >= run.bossHullAtStart) this.unlock('untouchable');
    const slot = run.def.bossSlot;
    const wasBlot = run.boss?.kind === 'blot';
    this.removeBoss();
    audio.setBossMood(null);
    audio.setIntensity(0);
    void audio.speak(wasBlot ? 'blot-defeat' : 'victory');
    this.popupAt(0, 0, '+3 shards');
    if (run.level >= STORY_END_LEVEL && !run.endingShown) {
      run.endingShown = true;
      this.save.data.stats.victories++;
      this.unlock('surface');
      this.lastBankedShards = run.shards;
      this.lastTime = run.time;
      this.prevBest = this.save.data.best.score;
      this.bank();
      this.ui.setHudVisible(false);
      this.playStory('ending');
      return;
    }
    this.levelComplete(slot >= 0 && slot < 4 ? slot : -1);
  }

  /** Gate reached: bank progress, turn the page to the next level and world. */
  /** Remember where the journey is, for Continue (Checkpoints) and the Classic best. */
  private noteProgress(level: number) {
    const run = this.run;
    if (!run || run.daily || run.tutorial >= 0) return;
    const s = this.save.data;
    if (s.settings.progress === 'classic') s.classicBest = Math.max(s.classicBest ?? 0, level);
    else s.resumeLevel = level;
    this.save.write();
  }

  private levelComplete(villain = -1) {
    const run = this.run;
    if (!run.hurtThisLevel) this.missionAdd('clean');
    run.score += 1000 * run.level;
    run.level++;
    run.def = levelDef(run.level);
    run.levelTime = 0;
    run.hurtThisLevel = false;
    this.missionMax('level', run.level);
    if (run.level > this.save.data.highestLevel) this.save.data.highestLevel = run.level;
    this.noteProgress(run.level);
    this.save.write();
    this.mode = 'transition';
    this.projectiles.clearBullets();
    this.telegraph.clear();
    // The last page of each journey is always the Blot's own world.
    const next = run.def.bossSlot === 4 ? THEMES.ink : this.pickTheme();
    run.eyeDone = false;
    run.eyeAt = 0.3 + Math.random() * 0.4;
    run.surgeDone = false;
    run.surgeAt = 0.4 + Math.random() * 0.25;
    run.rageShown = false;
    this.endSurge(false);
    // The Blot speaks over the page you just saved, then the page turns.
    const before = villain >= 0 ? this.ui.villainLine(VILLAIN_LINES[villain], audio.speak(`blot-${villain + 1}`), 3.2) : Promise.resolve();
    void before
      .then(() =>
        this.mode !== 'transition'
          ? undefined
          : this.ui.pageTurn(next, `Level ${run.level}`, run.def.bossSlot === 4 ? 'The last page' : run.def.bossSlot >= 0 ? 'Boss level' : next.name, () => {
        this.enemies.clear();
        this.pickups.clear();
        this.applyTheme(next, true);
        this.noteWorld(next.id);
        audio.setEngine(next.family);
        this.player.addEnergy(15);
        this.ui.setHudVisible(true, this.input.isTouch);
      }))
      .then(() => {
        if (this.mode !== 'transition') return;
        this.mode = 'play';
        this.modeTime = 0;
        audio.zoneEnter();
        this.ui.levelSlam(run.level, next.name, run.def.bossSlot >= 0);
        audio.slam();
        this.speedLines.boost = 1;
      });
  }

  // ------------------------------------------------------------------ tutorial

  /**
   * Each step keeps its targets topped up (`refill` runs every frame), so
   * missing the first batch never leaves the player with nothing to do.
   */
  private tutorialSteps: TutorialStep[] = [
    {
      title: 'Fly',
      text: (t) => (t ? 'Drag anywhere to steer. Fly through 5 of the glowing pickups.' : 'Your craft glides to the mouse pointer. Fly through 5 of the glowing pickups.'),
      setup: (g) => {
        g.run.tutorialCount = 0;
      },
      refill: (g) => {
        if (g.pickups.countActive('spark') === 0) g.pickups.spawnPattern(g.bounds.x * 0.55, g.bounds);
      },
      done: (g) => g.run.tutorialCount >= 5,
    },
    {
      title: 'Fire',
      text: (t) => (t || this.input.autoFire ? 'Your laser fires on its own. Line up and destroy 3 targets.' : 'Hold left click or Space to fire. Destroy 3 targets.'),
      setup: (g) => {
        g.run.tutorialCount = 0;
      },
      refill: (g) => {
        if (g.enemies.activeCount === 0) for (let i = 0; i < 3; i++) g.enemies.spawn('urchin', g.bounds.x + 30 + i * 50, (i - 1) * 38, 1);
      },
      done: (g) => g.run.tutorialCount >= 3,
    },
    {
      title: 'Dodge',
      text: (t) => (t ? 'Tap DODGE to roll up or down. Nothing can hit you while you roll. Dodge twice.' : 'Press Shift to roll up or down, toward your pointer. Nothing can hit you while you roll. Dodge twice.'),
      setup: (g) => {
        g.run.dodges = 0;
      },
      refill: (g) => {
        if (g.enemies.activeCount === 0) g.enemies.spawn('debris', g.bounds.x * 0.7, g.bounds.y + 30, 1);
      },
      done: (g) => g.run.dodges >= 2,
    },
    {
      title: 'Flare',
      text: (t) => (t ? 'Pickups charge your flare ring. It is full: tap FLARE to clear the swarm.' : 'Pickups charge your flare ring. It is full: press Q to clear the swarm.'),
      setup: (g) => {
        g.run.flares = 0;
      },
      refill: (g) => {
        g.player.lumen = 1;
        if (g.enemies.activeCount < 3) for (let i = 0; i < 4; i++) g.enemies.spawn('lanternfish', g.bounds.x + 20 + i * 18, (i - 1.5) * 24, 1);
      },
      done: (g) => g.run.flares >= 1,
    },
  ];

  private tutorialStep(i: number) {
    this.run.tutorial = i;
    this.modeTime = 0;
    const s = this.tutorialSteps[i];
    s.setup(this);
    this.ui.coach({ title: s.title, text: s.text(this.input.isTouch), index: i, total: this.tutorialSteps.length }, () => this.finishTutorial());
  }

  private updateTutorial() {
    const i = this.run.tutorial;
    const s = this.tutorialSteps[i];
    if (!s) return;
    s.refill(this);
    if (s.done(this)) {
      audio.chime();
      if (i + 1 < this.tutorialSteps.length) this.tutorialStep(i + 1);
      else this.finishTutorial();
    }
  }

  private finishTutorial() {
    if (this.run.tutorial < 0) return;
    this.ui.coach(null);
    this.save.data.tutorialDone = true;
    this.save.write();
    this.ui.toast('Tutorial complete', 'The first real page is next. Good luck.');
    this.run.tutorial = -1;
    this.run.level = 0;
    this.run.startLevel = 1;
    this.save.data.stats.runs++;
    this.levelComplete();
  }

  // ------------------------------------------------------------------ endings

  private deathShown = false;

  private onDeath() {
    if (this.mode === 'dead') return;
    this.mode = 'dead';
    this.deathShown = false;
    this.modeTime = 0;
    this.loop.timeScale = 0.35;
    this.endSurge(false);
    this.ui.banner('The light flickers', 'the ink closes in', 'ink', 1.2);
    audio.setIntensity(0);
    audio.death();
    audio.setEngine('off');
    audio.setBossMood(null);
    audio.cutMusic(false);
    this.rig.addTrauma(0.8);
    this.v3.set(this.player.pos.x, this.player.pos.y, 0);
    this.particles.explosion(this.v3, 0xff9a5a, 1.6);
  }

  private updateDead(dt: number) {
    this.updateWorld(dt, BASE_SPEED * 0.2);
    if (!this.deathShown) this.ui.inkEdges(Math.min(1, this.modeTime / 1.1));
    this.player.update(dt, this.input, this.bounds, -999);
    this.updateCombat(dt);
    // Once per death: after Retry the page turn is still running in 'dead' mode,
    // and checking the screen instead of a flag showed (and banked) it twice.
    if (this.modeTime > 1.1 && !this.deathShown) {
      this.deathShown = true;
      this.loop.timeScale = 1;
      this.ui.setHudVisible(false);
      this.save.data.stats.deaths++;
      if (this.run.daily) this.unlock('daily');
      const summary = this.commitRun(false);
      this.ui.showDeath(summary);
      this.ui.inkEdges(0);
    }
  }

  /** Move run earnings into the save (once). */
  private bank() {
    const run = this.run;
    const s = this.save.data;
    s.shards += run.shards;
    s.stats.shardsTotal += run.shards;
    s.stats.sparks += run.sparks;
    s.stats.seconds += run.time;
    if (s.stats.shardsTotal >= 25) this.unlock('pearls');
    run.shards = 0;
    run.sparks = 0;
    run.time = 0;
    this.save.write();
  }

  private summary(cause: boolean): RunSummary {
    const run = this.run;
    return {
      cause: cause ? this.player.deathCause : undefined,
      level: run.level,
      distance: run.distance,
      score: run.score,
      kills: run.kills,
      sparks: run.sparks,
      shards: this.lastBankedShards,
      time: this.lastTime,
      world: this.theme.name,
      worlds: run.worlds.size,
      newBest: run.score > this.prevBest && run.score > 0,
      daily: run.daily,
    };
  }

  private lastBankedShards = 0;
  private lastTime = 0;
  private prevBest = 0;

  private commitRun(abandoned: boolean): RunSummary {
    const run = this.run;
    const s = this.save.data;
    this.lastBankedShards = run.shards;
    this.lastTime = run.time;
    this.prevBest = s.best.score;
    if (run.tutorial >= 0) {
      run.tutorial = -1;
      this.ui.coach(null);
    }
    this.bank();
    if (!abandoned) {
      this.save.recordRun({ score: run.score, level: run.level, daily: run.daily, date: new Date().toISOString().slice(0, 10), worlds: run.worlds.size });
      if (run.daily) {
        const today = String(dailySeed());
        if (s.daily.date !== today) s.daily = { date: today, best: 0 };
        s.daily.best = Math.max(s.daily.best, run.score);
      }
    }
    this.save.write();
    return this.summary(true);
  }

  private pushHud() {
    const p = this.player;
    const run = this.run;
    this.ui.updateHud({
      distance: run.distance,
      level: Math.max(1, run.level),
      world: run.tutorial >= 0 ? 'Practice page' : this.theme.name,
      progress: this.mode === 'boss' ? 1 : clamp(run.levelTime / run.def.duration, 0, 1),
      energy: p.energy,
      maxEnergy: p.stats.maxEnergy,
      score: run.score,
      combo: run.combo,
      lumen: p.lumen,
      dodgeReady: 1 - p.dodgeCooldown / p.stats.dodgeCooldown,
      shield: p.shieldCharges,
      magnet: p.powerups.magnet,
      spread: p.powerups.spread,
      fps: this.loop.fps,
    });
  }

  // ------------------------------------------------------------------ dev helpers

  /** Jump to the end of a given level (dev + automated screenshots). */
  debugLevel(n: number, toBoss = true) {
    if (this.mode !== 'play') return;
    this.run.level = n;
    this.run.def = levelDef(n);
    this.run.levelTime = toBoss ? this.run.def.duration : 0;
  }

  debugTheme(id: ThemeId) {
    this.applyTheme(THEMES[id], true);
    this.noteWorld(id);
    if (this.mode === 'menu') this.ui.show('title');
  }
}
