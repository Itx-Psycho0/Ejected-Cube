import { Scene, Vector2, Vector3 } from 'three';
import { Renderer } from '../core/Renderer';
import { Loop } from '../core/Loop';
import { Input } from '../core/Input';
import { QUALITY, detectQuality, type QualityLevel, type QualityPreset } from '../core/Quality';
import { QualityGovernor } from '../core/Governor';
import { Random, dailySeed } from '../core/Random';
import { clamp, damp, easeOutCubic } from '../core/math';
import { audio } from '../audio/AudioEngine';
import { Atmosphere } from '../world/Atmosphere';
import { Seabed } from '../world/Seabed';
import { Fauna } from '../world/Fauna';
import { Station } from '../world/Station';
import { Player, type PowerUp } from '../entities/Player';
import { Enemies, ENEMY_SPECS, type Enemy, type EnemyContext } from '../entities/Enemies';
import { Pickups, POWERUP_INFO, type Pickup } from '../entities/Pickups';
import { createBoss, type Boss, type BossContext } from '../entities/bosses';
import { Particles } from '../fx/Particles';
import { Projectiles, type Shot } from '../combat/Projectiles';
import { SonarPing } from '../fx/SonarPing';
import { CameraRig } from '../fx/CameraRig';
import { Flash } from '../fx/Flash';
import { Telegraph } from '../fx/Telegraph';
import { ZONES, MENU_MOOD, SURFACE_MOOD, depthAt, type ZoneDef, type EnemyKind } from './zones';
import { Save, type Settings } from './Save';
import { ACHIEVEMENTS, UPGRADES, lumenGain, statsFor, type UpgradeId } from './meta';
import { UI, type RunSummary } from '../ui/UI';

type Mode = 'boot' | 'menu' | 'intro' | 'play' | 'boss' | 'transition' | 'surfacing' | 'dead' | 'victory';

interface Run {
  zone: number;
  zoneTime: number;
  depth: number;
  score: number;
  kills: number;
  plankton: number;
  pearls: number;
  combo: number;
  comboTimer: number;
  bestCombo: number;
  time: number;
  daily: boolean;
  difficulty: number;
  bossHullAtStart: number;
  dashKills: number;
  reveals: number;
  lastDepthScore: number;
}

const BASE_SPEED = 82;
const FIRE_SPEED = 640;
const PING_COOLDOWN = 7;

/**
 * Owns every system and runs the state machine:
 * boot -> menu -> intro (ejection) -> play <-> boss -> transition -> ... -> surfacing -> victory
 *                                       \-> dead
 */
export class Game {
  readonly scene = new Scene();
  readonly renderer: Renderer;
  readonly input: Input;
  readonly save = new Save();
  readonly ui: UI;
  private loop: Loop;
  private quality: QualityPreset;
  private governor: QualityGovernor;
  private atmo!: Atmosphere;
  private seabed!: Seabed;
  private fauna!: Fauna;
  private station!: Station;
  readonly player = new Player();
  private particles!: Particles;
  private projectiles!: Projectiles;
  private enemies!: Enemies;
  private pickups!: Pickups;
  private ping!: SonarPing;
  private rig: CameraRig;
  private flash!: Flash;
  private telegraph!: Telegraph;
  boss: (Boss & { extras?: import('three').Object3D[] }) | null = null;

  mode: Mode = 'boot';
  paused = false;
  private bounds = new Vector2(180, 100);
  private scrollSpeed = 0;
  private modeTime = 0;
  private fireCd = 0;
  private torpedoCd = 0;
  private pingCd = 0;
  private damageFlash = 0;
  private hitStop = 0;
  private rnd = new Random();
  private run!: Run;
  private hints = new Set<string>();
  private v3 = new Vector3();
  private enemyCtx!: EnemyContext;
  private bossCtx!: BossContext;
  private endlessLevel = 0;

  constructor(canvas: HTMLCanvasElement) {
    const q = this.save.data.settings.quality;
    this.quality = QUALITY[q === 'auto' ? detectQuality() : q];
    this.renderer = new Renderer(canvas, this.scene, this.quality);
    this.input = new Input(canvas);
    this.ui = new UI(this.save);
    this.rig = new CameraRig(this.renderer.camera);
    this.governor = new QualityGovernor((to) => this.setQuality(to));
    this.governor.enabled = q === 'auto';
    this.loop = new Loop((dt, raw) => this.frame(dt, raw));
    this.bindUi();
    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.mode === 'play' || this.mode === 'boss')) this.setPaused(true);
      audio.ctx && (document.hidden ? void audio.ctx.suspend() : void audio.ctx.resume());
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
    const zone = ZONES[0];
    await step(0.1, 'Pressurising cabin', () => {
      this.atmo = new Atmosphere(this.scene, zone, this.quality);
    });
    await step(0.3, 'Mapping the trench', () => {
      this.seabed = new Seabed(this.scene, zone, this.atmo, this.quality);
      this.fauna = new Fauna(this.scene, this.atmo, this.quality);
      this.station = new Station();
      this.scene.add(this.station.root);
    });
    await step(0.5, 'Charging sonar', () => {
      const pr = Math.min(devicePixelRatio, this.quality.maxPixelRatio);
      this.particles = new Particles(this.scene, this.quality.density, pr);
      this.projectiles = new Projectiles(this.scene);
      this.ping = new SonarPing(this.scene);
      this.flash = new Flash(this.scene);
      this.telegraph = new Telegraph(this.scene);
      this.scene.add(this.player.model.root);
    });
    await step(0.65, 'Listening for contacts', () => {
      this.enemies = new Enemies(this.scene, this.particles, this.projectiles, this.atmo.shared.uTime, this.atmo.look.accent);
      this.pickups = new Pickups(this.scene);
      this.makeContexts();
    });
    await step(0.8, 'Compiling shaders', () => {});
    try {
      await this.renderer.warmup();
    } catch {
      /* compileAsync is optional */
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
      darkness: 1,
      floorAt: (x) => this.seabed.floorAt(x),
      difficulty: 1,
      onContact: (e) => this.hurt(e.contactDamage, 'hull'),
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
      floorAt: (x) => this.seabed.floorAt(x),
      shake: (v) => this.rig.addTrauma(v),
      sfx: (n) => {
        if (n === 'roar') audio.bossRoar();
        else if (n === 'charge') audio.bossCharge();
        else if (n === 'shoot') audio.enemyHit();
        else audio.explode(0.6);
      },
      spawnEnemy: (k: EnemyKind, x, y) => this.enemies.spawn(k, x, y, this.run.difficulty),
      darken: (a, s) => this.ui.darken(a, s),
    };
  }

  // ------------------------------------------------------------------ UI wiring

  private bindUi() {
    const ui = this.ui;
    ui.events.on('begin', () => {
      audio.unlock();
      this.applySettings(this.save.data.settings);
      audio.setMood(MENU_MOOD);
      ui.show('title');
    });
    ui.events.on('dive', ({ daily }) => this.startRun(daily, 0));
    ui.events.on('resume', () => this.setPaused(false));
    ui.events.on('restart', () => {
      this.commitRun(false, true);
      this.startRun(this.run?.daily ?? false, this.endlessLevel);
    });
    ui.events.on('endless', () => this.startRun(false, this.endlessLevel + 1));
    ui.events.on('menu', () => {
      if (this.mode === 'play' || this.mode === 'boss' || this.mode === 'transition') this.commitRun(false, true);
      this.enterMenu(false);
    });
    ui.events.on('settings', (s) => this.applySettings(s));
    ui.events.on('buy', (id) => this.buy(id));
    ui.events.on('resetSave', () => this.save.reset());
    ui.events.on('exit', () => {
      this.ui.show('exit');
      audio.setPaused(true);
      try {
        window.close();
      } catch {
        /* most browsers refuse; the exit screen covers it */
      }
    });
    ui.bindTouch((a, down) => {
      if (a === 'pause') {
        if (down) this.setPaused(!this.paused);
        return;
      }
      if (a === 'fire') {
        if (down) this.input.autoFire = !this.input.autoFire;
        return;
      }
      if (down) this.input.press(a);
      else this.input.release(a);
    });
  }

  private applySettings(s: Settings) {
    this.save.data.settings = s;
    this.save.write();
    audio.setVolumes(s.master, s.music, s.sfx);
    this.rig.shakeScale = s.shake && !s.reducedMotion ? 1 : 0;
    this.ui.showFps(s.showFps);
    this.governor.enabled = s.quality === 'auto';
    const level = s.quality === 'auto' ? this.quality.level : s.quality;
    if (level !== this.quality.level) this.setQuality(level);
  }

  private setQuality(level: QualityLevel) {
    this.quality = QUALITY[level];
    this.renderer.applyQuality(this.quality);
    this.atmo?.applyQuality(this.quality);
    this.seabed?.applyQuality(this.quality);
    this.particles?.setPixelRatio(Math.min(devicePixelRatio, this.quality.maxPixelRatio));
  }

  private buy(id: UpgradeId) {
    const def = UPGRADES.find((u) => u.id === id)!;
    const lvl = this.save.data.upgrades[id];
    const cost = def.costs[lvl];
    if (cost === undefined || this.save.data.pearls < cost) return;
    this.save.data.pearls -= cost;
    this.save.data.upgrades[id] = lvl + 1;
    this.save.write();
    audio.powerup();
  }

  private unlock(id: string) {
    if (this.save.unlock(id)) {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (a) this.ui.toast(a.name, a.desc);
      audio.powerup();
    }
  }

  // ------------------------------------------------------------------ flow

  private enterMenu(first: boolean) {
    this.mode = 'menu';
    this.paused = false;
    this.modeTime = 0;
    this.input.enabled = true;
    this.clearWorld();
    this.atmo.setZone(ZONES[0], true);
    this.seabed.setZone(ZONES[0]);
    this.fauna.setZone(ZONES[0]);
    this.atmo.setDepth(6000);
    this.station.reset();
    this.player.reset(statsFor(this.save.data.upgrades));
    this.player.pos.set(this.station.dock.x + 4, this.station.dock.y);
    this.player.controllable = false;
    this.ui.setHudVisible(false);
    this.ui.clearOverlays();
    this.ui.fade(0);
    audio.setBossMode(false);
    audio.setMood(MENU_MOOD);
    audio.setPaused(false);
    if (!first) this.ui.show('title');
  }

  private clearWorld() {
    this.enemies?.clear();
    this.pickups?.clear();
    this.projectiles?.clearAll();
    this.telegraph?.clear();
    if (this.boss) this.removeBoss();
  }

  startRun(daily: boolean, endless: number) {
    this.endlessLevel = endless;
    const seed = daily ? dailySeed() : (Math.random() * 2 ** 31) >>> 0;
    this.rnd.reseed(seed);
    this.enemies.seed(seed + 1);
    this.pickups.seed(seed + 2);
    this.clearWorld();
    this.run = {
      zone: 0,
      zoneTime: 0,
      depth: ZONES[0].depthStart,
      score: 0,
      kills: 0,
      plankton: 0,
      pearls: 0,
      combo: 0,
      comboTimer: 0,
      bestCombo: 0,
      time: 0,
      daily,
      difficulty: 1 + endless * 0.6,
      bossHullAtStart: 0,
      dashKills: 0,
      reveals: 0,
      lastDepthScore: ZONES[0].depthStart,
    };
    this.enemyCtx.difficulty = this.bossCtx.difficulty = this.run.difficulty;
    this.atmo.setZone(ZONES[0], true);
    this.seabed.setZone(ZONES[0]);
    this.fauna.setZone(ZONES[0]);
    this.station.reset();
    this.player.reset(statsFor(this.save.data.upgrades));
    this.player.pos.set(this.station.dock.x + 4, this.station.dock.y);
    this.player.controllable = false;
    this.fireCd = this.torpedoCd = this.pingCd = 0;
    this.save.data.stats.runs++;
    this.save.write();
    this.ui.show('none');
    this.ui.clearOverlays();
    this.ui.fade(0);
    this.ui.setHudVisible(false);
    this.mode = 'intro';
    this.modeTime = 0;
    this.paused = false;
    audio.setMood(ZONES[0].mood);
    audio.setBossMode(false);
  }

  private setPaused(p: boolean) {
    if (!['play', 'boss', 'transition', 'surfacing'].includes(this.mode)) return;
    this.paused = p;
    audio.setPaused(p);
    this.input.releaseAll();
    if (p) this.ui.show('pause');
    else this.ui.show('none');
  }

  private get zone(): ZoneDef {
    return ZONES[Math.min(this.run.zone, ZONES.length - 1)];
  }

  // ------------------------------------------------------------------ frame

  private frame(dt: number, raw: number) {
    this.input.update();
    if (this.input.consume('pause')) {
      if (this.paused && this.ui.current === 'pause') this.setPaused(false);
      else if (!this.paused) this.setPaused(true);
    }
    this.renderer.playfieldHalfSize(this.bounds);
    this.ui.tick(raw);
    this.governor.update(raw, this.loop.fps, this.quality.level);

    if (this.paused) {
      this.renderer.render(0);
      this.input.endFrame();
      return;
    }

    // Hit-stop: freeze gameplay for a few frames on big impacts.
    if (this.hitStop > 0) {
      this.hitStop -= raw;
      dt *= 0.05;
    }

    this.modeTime += dt;
    switch (this.mode) {
      case 'menu':
        this.updateMenu(dt);
        break;
      case 'intro':
        this.updateIntro(dt);
        break;
      case 'play':
      case 'boss':
        this.updatePlay(dt);
        break;
      case 'transition':
        this.updateTransition(dt);
        break;
      case 'surfacing':
        this.updateSurfacing(dt);
        break;
      case 'dead':
        this.updateDead(dt);
        break;
      case 'victory':
        this.updateWorld(dt, 10);
        break;
    }

    this.player.animate(dt, this.atmo.darkness);
    this.flash.update(dt);
    this.telegraph.update(dt);
    this.particles.update(dt, this.seabed.worldScroll);
    this.rig.update(dt, this.player.pos.x, this.player.pos.y);
    this.renderer.render(dt);
    this.input.endFrame();
  }

  /** Background systems that run in every mode. */
  private updateWorld(dt: number, speed: number) {
    this.scrollSpeed = damp(this.scrollSpeed, speed, 1.5, dt);
    this.atmo.update(dt, this.scrollSpeed, this.mode === 'menu' ? 4 : 18 + this.scrollSpeed * 0.1);
    this.seabed.update(dt, this.scrollSpeed);
    this.fauna.update(dt, this.modeTime, this.scrollSpeed);
    this.station.root.position.x -= this.scrollSpeed * dt;
    this.station.root.visible = this.station.root.position.x > -900;
  }

  private updateMenu(dt: number) {
    this.updateWorld(dt, 0);
    this.station.update(dt, 0);
    // Camera frames the docked capsule on the right side of the screen.
    this.rig.offset.set(this.station.dock.x - 62 + Math.sin(this.modeTime * 0.15) * 8, this.station.dock.y + 16, -105);
    this.player.update(dt, this.input, this.bounds, 0, -999);
    this.player.pos.set(this.station.dock.x + 4, this.station.dock.y + Math.sin(this.modeTime * 1.2) * 1.2);
    this.player.model.root.position.set(this.player.pos.x, this.player.pos.y, 0);
  }

  private updateIntro(dt: number) {
    const t = this.modeTime;
    const st = this.station;
    this.updateWorld(dt, t < 2.6 ? 0 : BASE_SPEED * 0.6);
    st.update(dt, 1);
    // 0-2.6 s: alarms, explosions across the station. 2.6 s: launch.
    if (t < 2.6) {
      this.rig.offset.set(st.dock.x + 40, st.dock.y + 22, -95);
      if (Math.random() < dt * 5) {
        const h = st.hotspots[Math.floor(Math.random() * st.hotspots.length)];
        this.v3.set(h.x + st.root.position.x + (Math.random() - 0.5) * 60, h.y + (Math.random() - 0.5) * 20, h.z + 10);
        this.particles.explosion(this.v3, 0xff8a3a, 1.2);
        this.flash.trigger(this.v3.x, this.v3.y, 0xff8a3a, 1.2);
        this.rig.addTrauma(0.35);
        audio.explode(1);
      }
      if (Math.random() < dt * 2) audio.alarm();
      this.player.pos.set(st.dock.x + 4 + Math.sin(t * 40) * 0.4, st.dock.y);
      this.player.model.root.position.set(this.player.pos.x, this.player.pos.y, 0);
      if (t > 0.1 && t - dt <= 0.1) this.ui.hint('Hull integrity failing. Launching escape capsule.', 2.4);
    } else {
      if (t - dt < 2.6) {
        audio.launch();
        this.rig.addTrauma(0.8);
        this.player.vel.set(520, 60);
        this.v3.set(st.dock.x + 10, st.dock.y, 0);
        this.particles.bubbles(this.v3, 80, 14, 3);
        this.particles.burst(this.v3, { count: 40, color: 0xffffff, speed: 200, size: 10, life: 0.6, dir: new Vector3(-1, 0, 0) });
        st.collapse = 1;
      }
      // Ease the camera from the station close-up to the gameplay framing.
      const k = easeOutCubic(clamp((t - 2.6) / 1.6, 0, 1));
      this.rig.offset.set((st.dock.x + 40) * (1 - k), (st.dock.y + 22) * (1 - k), -95 * (1 - k));
      this.player.vel.multiplyScalar(Math.exp(-2.2 * dt));
      this.player.pos.addScaledVector(this.player.vel, dt);
      this.player.model.root.position.set(this.player.pos.x, this.player.pos.y, 0);
      this.particles.bubbles(this.v3.set(this.player.pos.x - 16, this.player.pos.y, 0), 2, 3, 2);
      if (t > 4.4) {
        this.rig.offset.set(0, 0, 0);
        this.mode = 'play';
        this.modeTime = 0;
        this.player.controllable = true;
        this.ui.setHudVisible(true, this.input.isTouch);
        this.ui.card(this.zone.name, `${this.zone.tagline}  ·  ${this.zone.depthStart.toLocaleString('en-US')} m`);
        audio.zoneEnter();
        this.unlock('ejected');
        this.firstRunHints();
      }
    }
  }

  private firstRunHints() {
    if (!this.save.data.settings.hints) return;
    this.hints.clear();
    const touch = this.input.isTouch;
    this.ui.hint(touch ? 'Drag to steer. Auto-fire is on.' : 'Move with the mouse. Hold left click or Space to fire.', 5);
  }

  private hintOnce(key: string, text: string, seconds = 5) {
    if (!this.save.data.settings.hints || this.hints.has(key)) return;
    this.hints.add(key);
    this.ui.hint(text, seconds);
  }

  private updatePlay(dt: number) {
    const run = this.run;
    const zone = this.zone;
    const inBoss = this.mode === 'boss';
    run.time += dt;
    const speed = inBoss ? BASE_SPEED * 0.3 : BASE_SPEED * (1 + run.zone * 0.08) * (1 + (run.difficulty - 1) * 0.15);
    this.updateWorld(dt, speed);
    this.station.update(dt, 1);

    // Progress through the zone.
    if (!inBoss) {
      run.zoneTime += dt;
      const progress = clamp(run.zoneTime / zone.duration, 0, 1);
      run.depth = depthAt(zone, progress);
      if (progress >= 1) this.startBoss();
    }
    this.atmo.setDepth(run.depth);
    if (run.lastDepthScore - run.depth >= 10) {
      run.score += Math.floor((run.lastDepthScore - run.depth) / 10) * 5;
      run.lastDepthScore = run.depth;
    }

    // Player and resources.
    const floor = this.seabed.floorAt(this.player.pos.x);
    this.player.update(dt, this.input, this.bounds, zone.current, floor);
    this.player.breathe(dt, inBoss ? 0.6 : 1);
    if (this.player.pos.y - this.player.radius < floor + 4 && this.player.alive) this.hurt(6, 'crushed');
    this.handleAbilities(dt);

    // Ambient bubbles from the thrusters.
    if (Math.random() < dt * 30) {
      const port = this.player.model.exhaustPorts[Math.random() < 0.5 ? 0 : 1];
      port.getWorldPosition(this.v3);
      this.particles.bubbles(this.v3, 1, 1.5, 1.6);
    }

    // Spawning.
    this.enemyCtx.scrollSpeed = this.scrollSpeed;
    this.enemyCtx.darkness = this.atmo.darkness;
    const progress = clamp(run.zoneTime / zone.duration, 0, 1);
    this.enemies.direct(dt, zone, progress, this.enemyCtx, !inBoss && progress < 0.97);
    const p = this.player;
    this.pickups.direct(
      dt,
      this.bounds,
      true,
      { ammo: p.ammo / p.stats.maxAmmo, hull: p.hull / p.stats.maxHull, oxygen: p.oxygen / p.stats.maxOxygen },
      inBoss ? 0 : 0.6,
    );

    this.updateCombat(dt);

    // Combo decay.
    if (run.combo > 0) {
      run.comboTimer -= dt;
      if (run.comboTimer <= 0) run.combo = 0;
    }

    // Hints that react to the situation.
    if (p.oxygen < p.stats.maxOxygen * 0.35) this.hintOnce('o2', 'Oxygen low. Collect the glowing plankton.');
    if (p.lumen >= 1) this.hintOnce('flare', this.input.isTouch ? 'Lumen full: tap FLARE to clear the screen.' : 'Lumen full: press Q to unleash a Bioflare.');
    if (run.time > 14 && zone.darkness > 0.5) this.hintOnce('ping', this.input.isTouch ? 'Tap PING to reveal hidden creatures and pearls.' : 'Press E or right-click to ping. It reveals hidden creatures and pearls.', 6);
    if (p.hull < p.stats.maxHull * 0.35) this.hintOnce('hull', 'Hull damaged. Orange crates repair it.');
    if (p.oxygen < p.stats.maxOxygen * 0.2) audio.alarm();

    if (!p.alive) this.onDeath();
    this.pushHud();
  }

  private handleAbilities(dt: number) {
    const p = this.player;
    const input = this.input;
    this.fireCd -= dt;
    this.torpedoCd -= dt;
    this.pingCd = Math.max(0, this.pingCd - dt);
    if (!p.alive || !p.controllable) return;

    if (input.isHeld('fire') && this.fireCd <= 0) {
      if (p.ammo > 0) {
        this.fireCd = 1 / p.stats.fireRate;
        p.ammo--;
        p.model.muzzle.getWorldPosition(this.v3);
        const dmg = p.stats.damage;
        if (p.powerups.spread > 0) {
          for (const a of [-0.14, 0, 0.14]) this.projectiles.fire('bolt', this.v3.x, this.v3.y, Math.cos(a) * FIRE_SPEED, Math.sin(a) * FIRE_SPEED, dmg);
        } else this.projectiles.fire('bolt', this.v3.x, this.v3.y, FIRE_SPEED, 0, dmg);
        this.particles.burst(this.v3, { count: 3, color: 0x7ffff0, speed: 40, size: 5, life: 0.2, dir: new Vector3(1, 0, 0) });
        audio.shoot();
      } else {
        this.fireCd = 0.3;
        this.hintOnce('ammo', 'Out of sonar charge. It recharges slowly, or grab a violet canister.', 3);
      }
    }
    if (p.powerups.torpedo > 0 && this.torpedoCd <= 0) {
      this.torpedoCd = 0.55;
      this.projectiles.fire('torpedo', p.pos.x + 10, p.pos.y - 8, 220, -40, p.stats.damage * 3);
      audio.torpedo();
    }
    if (input.consume('dash') && p.tryDash()) {
      audio.dash();
      this.particles.bubbles(this.v3.set(p.pos.x - 10, p.pos.y, 0), 26, 8, 2.6);
      this.rig.addTrauma(0.15);
    }
    if (input.consume('ping')) {
      if (this.pingCd <= 0) {
        this.pingCd = PING_COOLDOWN;
        this.ping.start(p.pos.x, p.pos.y);
        audio.ping();
      }
    }
    if (input.consume('flare') && p.lumen >= 1) this.bioflare();
  }

  private bioflare() {
    const p = this.player;
    p.lumen = 0;
    audio.flare();
    this.flash.trigger(p.pos.x, p.pos.y, 0xfff4d0, 4);
    this.ui.fade(0.8);
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

  private updateCombat(dt: number) {
    const p = this.player;
    // Sonar ping reveals as the ring expands.
    if (this.ping.active) {
      this.ping.update(dt);
      const n = this.enemies.reveal(this.ping.mesh.position.x, this.ping.mesh.position.y, this.ping.radius);
      this.run.reveals += n;
      this.pickups.reveal(this.ping.mesh.position.x, this.ping.mesh.position.y, this.ping.radius);
    }

    this.projectiles.update(dt, this.bounds, (s: Shot) => {
      const target = this.boss?.state === 'fight' ? this.boss.pos : this.enemies.nearest(s.pos.x, s.pos.y)?.pos;
      return target ?? null;
    });
    this.enemies.update(dt, this.enemyCtx);

    // Player shots vs enemies and boss.
    for (const s of this.projectiles.shots.items) {
      if (!s.active) continue;
      let consumed = false;
      for (const e of this.enemies.list) {
        if (!e.active) continue;
        const r = e.radius + 3;
        if ((e.pos.x - s.pos.x) ** 2 + (e.pos.y - s.pos.y) ** 2 < r * r) {
          this.enemies.hit(e, s.damage, this.enemyCtx, true);
          this.particles.burst(this.v3.set(s.pos.x, s.pos.y, 0), { count: 6, color: 0x7ffff0, speed: 90, size: 4, life: 0.3 });
          audio.enemyHit();
          consumed = true;
          break;
        }
      }
      if (!consumed && this.boss && this.boss.state === 'fight') {
        for (const h of this.boss.hitboxes) {
          if ((h.x - s.pos.x) ** 2 + (h.y - s.pos.y) ** 2 < (h.r + 2) ** 2) {
            this.damageBoss(s.damage * h.mult, s.pos.x, s.pos.y);
            consumed = true;
            break;
          }
        }
      }
      if (consumed) s.active = false;
    }

    // Hostile bullets vs the pod.
    if (p.alive) {
      for (const b of this.projectiles.bullets.items) {
        if (!b.active || b.damage <= 0) continue;
        const r = b.radius + p.radius * 0.72;
        if ((b.pos.x - p.pos.x) ** 2 + (b.pos.y - p.pos.y) ** 2 < r * r) {
          b.active = false;
          if (b.kind === 'ink') this.ui.darken(0.5, 1.5);
          this.hurt(b.damage, 'hull');
        }
      }
    }

    // Boss.
    if (this.boss) {
      this.boss.update(dt, this.bossCtx);
      this.ui.bossBar(this.boss.name, this.zone.bossTitle, this.boss.hp / this.boss.maxHp);
      if (p.alive && this.boss.state === 'fight') {
        for (const h of this.boss.hitboxes) {
          if (!h.harmful) continue;
          const r = h.r + p.radius * 0.8;
          if ((h.x - p.pos.x) ** 2 + (h.y - p.pos.y) ** 2 < r * r) {
            this.hurt(20, 'hull');
            p.vel.x -= 300;
            break;
          }
        }
      }
      if (this.boss.state === 'dead') this.onBossDefeated();
    }

    // Pickups.
    const magnet = Math.max(p.powerups.magnet > 0 ? 170 : 0, p.stats.magnetRadius);
    this.pickups.update(dt, this.scrollSpeed, this.bounds, p.pos.x, p.pos.y, magnet, p.radius + 9, (it) => this.collect(it));

    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
    this.ui.vignette(this.damageFlash, p.oxygen < p.stats.maxOxygen * 0.2 && p.alive);
  }

  private damageBoss(amount: number, x: number, y: number) {
    const b = this.boss!;
    const died = b.hit(amount);
    this.particles.burst(this.v3.set(x, y, 0), { count: 8, color: 0xffb070, speed: 120, size: 5, life: 0.35 });
    audio.enemyHit();
    if (died) {
      this.hitStop = 0.25;
      this.rig.addTrauma(1);
      audio.explode(2);
      audio.bossRoar();
      this.projectiles.clearBullets();
      this.telegraph.clear();
    }
  }

  private hurt(amount: number, cause: 'hull' | 'oxygen' | 'crushed') {
    const p = this.player;
    const hadShield = p.shieldCharges > 0;
    const dealt = p.damage(amount, cause);
    if (dealt > 0) {
      this.damageFlash = 1;
      this.rig.addTrauma(0.45);
      this.hitStop = 0.06;
      this.renderer.aberration = 1;
      audio.hit();
      this.particles.burst(this.v3.set(p.pos.x, p.pos.y, 0), { count: 18, color: 0xffa060, speed: 140, size: 5, life: 0.5 });
      this.run.combo = 0;
    } else if (hadShield && p.shieldHit > 0.9) {
      audio.shieldHit();
      this.rig.addTrauma(0.15);
    }
  }

  private explosion(x: number, y: number, radius: number, damage: number) {
    this.flash.trigger(x, y, 0xff8a3a, 1.6);
    this.rig.addTrauma(0.4);
    audio.explode(1.2);
    const p = this.player;
    if (Math.hypot(p.pos.x - x, p.pos.y - y) < radius + p.radius) this.hurt(damage, 'hull');
    // Chain reactions: blasts damage other creatures.
    for (const e of this.enemies.list) {
      if (e.active && Math.hypot(e.pos.x - x, e.pos.y - y) < radius + e.radius) this.enemies.hit(e, 5, this.enemyCtx, true);
    }
  }

  private onEnemyKilled(e: Enemy, byPlayer: boolean) {
    if (!byPlayer) return;
    const run = this.run;
    run.kills++;
    const pts = Math.round(ENEMY_SPECS[e.kind].score * (1 + (run.difficulty - 1) * 0.25));
    run.score += pts;
    this.player.lumen = Math.min(1, this.player.lumen + 0.035 * lumenGain(this.save.data.upgrades));
    if (this.player.dashing) {
      run.dashKills++;
      this.popupAt(e.pos.x, e.pos.y, 'RAM!', '#ffc35a');
    } else this.popupAt(e.pos.x, e.pos.y, `+${pts}`, '#e3eef8');
    this.save.data.stats.kills++;
  }

  private collect(it: Pickup) {
    const p = this.player;
    const run = this.run;
    this.v3.set(it.pos.x, it.pos.y, 0);
    switch (it.kind) {
      case 'plankton': {
        run.combo = run.comboTimer > 0 ? run.combo + 1 : 1;
        run.comboTimer = 1.5;
        run.bestCombo = Math.max(run.bestCombo, run.combo);
        if (run.combo >= 40) this.unlock('combo');
        run.plankton++;
        p.addOxygen(5.5);
        p.lumen = Math.min(1, p.lumen + 0.022 * (1 + run.combo * 0.04) * lumenGain(this.save.data.upgrades));
        run.score += 10 * run.combo;
        audio.pickup(run.combo);
        this.particles.burst(this.v3, { count: 8, color: 0x2ef2c8, speed: 60, size: 5, life: 0.4 });
        break;
      }
      case 'ammo':
        p.ammo = Math.min(p.stats.maxAmmo, p.ammo + 22);
        audio.ammo();
        this.popupAt(it.pos.x, it.pos.y, '+22 sonar', '#b48cff');
        break;
      case 'repair':
        p.repair(30);
        audio.powerup();
        this.popupAt(it.pos.x, it.pos.y, '+30 hull', '#ff9a5a');
        break;
      case 'pearl':
        run.pearls++;
        run.score += 500;
        audio.powerup();
        this.popupAt(it.pos.x, it.pos.y, 'Pearl', '#fff4ee');
        this.particles.burst(this.v3, { count: 30, color: 0xfff0f6, speed: 120, size: 6, life: 0.8 });
        break;
      default: {
        const kind = it.kind as PowerUp;
        if (kind === 'shield') p.shieldCharges = 3;
        else p.powerups[kind] = 10;
        audio.powerup();
        this.popupAt(it.pos.x, it.pos.y, POWERUP_INFO[kind].label, '#' + POWERUP_INFO[kind].color.toString(16).padStart(6, '0'));
      }
    }
  }

  private popupAt(x: number, y: number, text: string, color: string) {
    this.v3.set(x, y, 0).project(this.renderer.camera);
    this.ui.popup(text, ((this.v3.x + 1) / 2) * window.innerWidth, ((1 - this.v3.y) / 2) * window.innerHeight, color);
  }

  // ------------------------------------------------------------------ bosses & zones

  private startBoss() {
    const zone = this.zone;
    this.mode = 'boss';
    this.boss = createBoss(zone.boss, this.run.difficulty);
    this.scene.add(this.boss.root);
    for (const x of this.boss.extras ?? []) this.scene.add(x);
    this.boss.enter(this.bounds);
    this.run.bossHullAtStart = this.player.hull;
    this.ui.card(zone.bossName, zone.bossTitle, true);
    audio.bossRoar();
    audio.setBossMode(true);
    this.rig.addTrauma(0.5);
    this.renderer.compile();
  }

  private removeBoss() {
    if (!this.boss) return;
    this.scene.remove(this.boss.root);
    for (const x of this.boss.extras ?? []) this.scene.remove(x);
    this.boss = null;
    this.ui.bossBar(null);
  }

  private onBossDefeated() {
    const zone = this.zone;
    const run = this.run;
    run.score += 5000 * (run.zone + 1);
    run.pearls += 3;
    this.player.repair(30);
    this.player.addOxygen(40);
    this.save.data.stats.bosses++;
    this.unlock('boss_' + zone.boss);
    if (this.player.hull >= run.bossHullAtStart) this.unlock('untouchable');
    this.removeBoss();
    audio.setBossMode(false);
    this.popupAt(0, 0, '+3 pearls', '#fff4ee');
    if (run.zone + 1 >= ZONES.length) {
      this.mode = 'surfacing';
      this.modeTime = 0;
      this.player.controllable = false;
      audio.setMood(SURFACE_MOOD);
      this.ui.bossBar(null);
      return;
    }
    this.mode = 'transition';
    this.modeTime = 0;
    this.zoneAdvanced = false;
  }

  private updateTransition(dt: number) {
    // A short breather while the water changes colour around you.
    this.updateWorld(dt, BASE_SPEED * 1.6);
    this.player.update(dt, this.input, this.bounds, 0, this.seabed.floorAt(this.player.pos.x));
    this.handleAbilities(dt);
    this.updateCombat(dt);
    this.pushHud();
    if (this.modeTime > 0.6 && !this.zoneAdvanced) {
      this.zoneAdvanced = true;
      this.run.zone++;
      this.run.zoneTime = 0;
      const z = this.zone;
      this.atmo.setZone(z);
      this.seabed.setZone(z);
      this.fauna.setZone(z);
      audio.setMood(z.mood);
      audio.zoneEnter();
      this.ui.card(z.name, `${z.tagline}  ·  ${z.depthStart.toLocaleString('en-US')} m`);
      if (this.run.zone === 2 && this.run.depth <= 2000) this.unlock('deep_breath');
    }
    if (this.modeTime > 3.2) {
      this.mode = 'play';
      this.modeTime = 0;
    }
  }

  private zoneAdvanced = false;

  private updateSurfacing(dt: number) {
    const run = this.run;
    const t = this.modeTime;
    run.depth = Math.max(0, damp(run.depth, -20, 0.9, dt));
    this.atmo.setDepth(run.depth);
    this.updateWorld(dt, BASE_SPEED * 0.8);
    this.updateCombat(dt);
    const p = this.player;
    p.update(dt, this.input, this.bounds, 0, -999);
    p.pos.x = damp(p.pos.x, 0, 1.2, dt);
    p.pos.y = damp(p.pos.y, 40 + t * 30, 1.2, dt);
    p.model.root.position.set(p.pos.x, p.pos.y, 0);
    this.rig.setZoom(1 + Math.min(0.35, t * 0.08));
    if (Math.random() < dt * 40) this.particles.bubbles(this.v3.set(p.pos.x + (Math.random() - 0.5) * 30, p.pos.y - 10, 0), 2, 6, 2.5);
    this.pushHud();
    if (t > 3.2 && t - dt <= 3.2) audio.surface();
    if (t > 3.2) this.ui.fade(Math.min(1, (t - 3.2) / 0.8));
    if (t > 4.4) this.onVictory();
  }

  private onVictory() {
    this.mode = 'victory';
    this.modeTime = 0;
    this.rig.setZoom(1);
    this.ui.setHudVisible(false);
    this.save.data.stats.victories++;
    this.unlock('surface');
    if (this.run.daily) this.unlock('daily');
    const summary = this.commitRun(true, false);
    setTimeout(() => this.ui.fade(0), 400);
    this.ui.showVictory(summary);
  }

  private onDeath() {
    if (this.mode === 'dead') return;
    this.mode = 'dead';
    this.modeTime = 0;
    this.loop.timeScale = 0.35;
    audio.death();
    audio.setBossMode(false);
    this.rig.addTrauma(0.8);
    this.v3.set(this.player.pos.x, this.player.pos.y, 0);
    this.particles.explosion(this.v3, 0xff9a5a, 1.6);
    this.particles.bubbles(this.v3, 60, 12, 3);
  }

  private updateDead(dt: number) {
    this.updateWorld(dt, BASE_SPEED * 0.2);
    this.player.update(dt, this.input, this.bounds, 0, -999);
    this.updateCombat(dt);
    if (Math.random() < dt * 20) this.particles.bubbles(this.v3.set(this.player.pos.x, this.player.pos.y, 0), 2, 6, 2);
    if (this.modeTime > 1.1 && this.ui.current !== 'death') {
      this.loop.timeScale = 1;
      this.ui.setHudVisible(false);
      this.save.data.stats.deaths++;
      if (this.run.daily) this.unlock('daily');
      this.ui.showDeath(this.commitRun(false, false));
    }
  }

  /** Bank pearls and stats, record the run. Returns the summary for the result screen. */
  private commitRun(victory: boolean, abandoned: boolean): RunSummary {
    const run = this.run;
    const s = this.save.data;
    s.pearls += run.pearls;
    s.stats.pearlsTotal += run.pearls;
    s.stats.plankton += run.plankton;
    s.stats.dashKills += run.dashKills;
    s.stats.reveals += run.reveals;
    s.stats.seconds += run.time;
    if (s.stats.pearlsTotal >= 25) this.unlock('pearls');
    if (s.stats.dashKills >= 25) this.unlock('dasher');
    if (s.stats.reveals >= 60) this.unlock('echo');
    if (run.depth <= 2000) this.unlock('deep_breath');
    const prevBest = s.best.score;
    const depth = Math.max(0, Math.round(run.depth));
    if (!abandoned) {
      this.save.recordRun({ score: run.score, depth, zone: run.zone, daily: run.daily, date: new Date().toISOString().slice(0, 10), victory });
      if (run.daily) {
        const today = String(dailySeed());
        if (s.daily.date !== today) s.daily = { date: today, best: 0 };
        s.daily.best = Math.max(s.daily.best, run.score);
      }
    }
    this.save.write();
    // Pearls are banked once; zero them so a later commit can't double count.
    const pearls = run.pearls;
    run.pearls = 0;
    return {
      cause: this.player.deathCause,
      depth,
      score: run.score,
      kills: run.kills,
      plankton: run.plankton,
      pearls,
      time: run.time,
      zone: this.zone.name,
      newBest: !abandoned && run.score > prevBest && run.score > 0,
      daily: run.daily,
    };
  }

  private pushHud() {
    const p = this.player;
    const run = this.run;
    this.ui.updateHud({
      depth: run.depth,
      zoneName: this.zone.name,
      zoneIndex: Math.min(run.zone, 4),
      zoneProgress: this.mode === 'boss' ? 1 : clamp(run.zoneTime / this.zone.duration, 0, 1),
      hull: p.hull,
      maxHull: p.stats.maxHull,
      oxygen: p.oxygen,
      maxOxygen: p.stats.maxOxygen,
      ammo: p.ammo,
      score: run.score,
      combo: run.combo,
      lumen: p.lumen,
      dashReady: 1 - p.dashCooldown / p.stats.dashCooldown,
      pingReady: 1 - this.pingCd / PING_COOLDOWN,
      shield: p.shieldCharges,
      magnet: p.powerups.magnet,
      spread: p.powerups.spread,
      torpedo: p.powerups.torpedo,
      fps: this.loop.fps,
    });
  }

  // ------------------------------------------------------------------ debug

  /** Dev-only helpers used by automated screenshots and manual testing. */
  debugJump(zone: number, boss: boolean) {
    if (this.mode !== 'play') return;
    this.run.zone = zone;
    this.run.zoneTime = boss ? this.zone.duration : 0;
    const z = this.zone;
    this.atmo.setZone(z, true);
    this.seabed.setZone(z);
    this.fauna.setZone(z);
    audio.setMood(z.mood);
  }
}
