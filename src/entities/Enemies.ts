import { Color, Scene, Vector2, Vector3 } from 'three';
import type { LevelDef } from '../game/levels';

export type EnemyKind = 'urchin' | 'jelly' | 'mine' | 'lanternfish' | 'puffer' | 'debris';
import type { Particles } from '../fx/Particles';
import type { Projectiles } from '../combat/Projectiles';
import type { Player } from './Player';
import { makeDebris, makeJelly, makeLanternfish, makeMine, makePuffer, makeUrchin, type EnemyVisual } from './EnemyModels';
import { Random } from '../core/Random';
import { clamp, damp } from '../core/math';
import type { IUniform } from 'three';

export interface Enemy {
  active: boolean;
  kind: EnemyKind;
  visual: EnemyVisual;
  pos: Vector2;
  vel: Vector2;
  hp: number;
  maxHp: number;
  radius: number;
  contactDamage: number;
  score: number;
  age: number;
  phase: number;
  /** Generic state slot used by the behaviours (inflation, arming, etc.). */
  state: number;
  timer: number;
  anchorY: number;
  flash: number;
  revealed: number;
  stunned: number;
  scale: number;
}

interface Spec {
  hp: number;
  radius: number;
  contact: number;
  score: number;
  pool: number;
  color: number;
}

export const ENEMY_SPECS: Record<EnemyKind, Spec> = {
  urchin: { hp: 3, radius: 11, contact: 14, score: 120, pool: 16, color: 0xa070ff },
  jelly: { hp: 2, radius: 10, contact: 10, score: 100, pool: 16, color: 0x7ffcff },
  mine: { hp: 2, radius: 10, contact: 22, score: 150, pool: 10, color: 0xff6030 },
  lanternfish: { hp: 1, radius: 7, contact: 8, score: 80, pool: 30, color: 0x7ffcff },
  puffer: { hp: 3, radius: 9, contact: 12, score: 140, pool: 12, color: 0xffd166 },
  debris: { hp: 5, radius: 14, contact: 16, score: 160, pool: 12, color: 0xffaa44 },
};

export interface EnemyContext {
  player: Player;
  scrollSpeed: number;
  bounds: Vector2;
  darkness: number;
  floorAt: (x: number) => number;
  difficulty: number;
  onContact: (e: Enemy) => void;
  onExplosion: (x: number, y: number, radius: number, damage: number) => void;
  onKill: (e: Enemy, byPlayer: boolean) => void;
}

const REVEAL_COLOR = new Color(0xb48cff);

/**
 * All regular enemies: pooled meshes per species, behaviour state machines,
 * hit reactions, sonar reveal, and the spawn director that reads the
 * current zone's mix.
 */
export class Enemies {
  readonly list: Enemy[] = [];
  private spawnAcc = 0;
  private rnd = new Random(1);
  private v3 = new Vector3();
  private tmp = new Vector2();

  constructor(
    scene: Scene,
    private particles: Particles,
    private projectiles: Projectiles,
    uTime: IUniform<number>,
    accent: Color,
  ) {
    const factories: Record<EnemyKind, () => EnemyVisual> = {
      urchin: makeUrchin,
      jelly: () => makeJelly(uTime, accent),
      mine: makeMine,
      lanternfish: () => makeLanternfish(uTime),
      puffer: makePuffer,
      debris: makeDebris,
    };
    for (const kind of Object.keys(ENEMY_SPECS) as EnemyKind[]) {
      for (let i = 0; i < ENEMY_SPECS[kind].pool; i++) {
        const visual = factories[kind]();
        visual.root.visible = false;
        scene.add(visual.root);
        this.list.push({
          active: false,
          kind,
          visual,
          pos: new Vector2(),
          vel: new Vector2(),
          hp: 1,
          maxHp: 1,
          radius: 10,
          contactDamage: 10,
          score: 100,
          age: 0,
          phase: 0,
          state: 0,
          timer: 0,
          anchorY: 0,
          flash: 0,
          revealed: 0,
          stunned: 0,
          scale: 1,
        });
      }
    }
  }

  seed(seed: number) {
    this.rnd.reseed(seed);
  }

  spawn(kind: EnemyKind, x: number, y: number, hpMult = 1): Enemy | null {
    const e = this.list.find((en) => !en.active && en.kind === kind);
    if (!e) return null;
    const spec = ENEMY_SPECS[kind];
    e.active = true;
    e.pos.set(x, y);
    e.vel.set(0, 0);
    e.maxHp = e.hp = Math.ceil(spec.hp * hpMult);
    e.radius = spec.radius;
    e.contactDamage = spec.contact;
    e.score = spec.score;
    e.age = 0;
    e.phase = this.rnd.next() * 10;
    e.state = 0;
    e.timer = 0;
    e.anchorY = y;
    e.flash = 0;
    e.revealed = 0;
    e.stunned = 0;
    e.scale = 1;
    e.visual.root.visible = true;
    e.visual.root.rotation.set(0, 0, 0);
    e.visual.root.scale.setScalar(1);
    e.visual.root.position.set(x, y, 0);
    return e;
  }

  /** Spawn director: decides what appears and when. */
  direct(dt: number, level: LevelDef, progress: number, ctx: EnemyContext, allowed: boolean, spawnMult: number) {
    if (!allowed) return;
    // Sawtooth within a level: calm start, busier toward the gate.
    const rate = level.spawnRate * (0.75 + progress * 0.6) * spawnMult;
    this.spawnAcc += dt * rate;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1 + this.rnd.range(-0.25, 0.25);
      const kind = this.rnd.weighted(level.enemies);
      const hp = level.enemyHp;
      const b = ctx.bounds;
      const x = b.x + 40;
      switch (kind) {
        case 'lanternfish': {
          const n = this.rnd.int(3, 5);
          const y = this.rnd.range(-b.y * 0.6, b.y * 0.7);
          for (let i = 0; i < n; i++) this.spawn('lanternfish', x + i * 18, y + this.rnd.range(-20, 20), hp);
          break;
        }
        case 'mine': {
          const floor = ctx.floorAt(x);
          const y = clamp(this.rnd.range(floor + 50, b.y * 0.55), floor + 40, b.y * 0.6);
          this.spawn('mine', x, y, hp);
          break;
        }
        case 'debris':
          this.spawn('debris', this.rnd.range(0, b.x + 60), b.y + 40, hp);
          break;
        default:
          this.spawn(kind, x, this.rnd.range(-b.y * 0.7, b.y * 0.75), hp);
      }
    }
  }

  /** Apply damage; returns true if the enemy died. */
  hit(e: Enemy, dmg: number, ctx: EnemyContext, byPlayer = true): boolean {
    if (!e.active) return false;
    e.hp -= dmg;
    e.flash = 1;
    e.revealed = Math.max(e.revealed, 0.6);
    if (e.hp <= 0) {
      this.kill(e, ctx, byPlayer);
      return true;
    }
    return false;
  }

  kill(e: Enemy, ctx: EnemyContext, byPlayer: boolean) {
    if (!e.active) return;
    e.active = false;
    e.visual.root.visible = false;
    const spec = ENEMY_SPECS[e.kind];
    this.v3.set(e.pos.x, e.pos.y, 0);
    const big = e.kind === 'mine' || e.kind === 'debris';
    this.particles.explosion(this.v3, spec.color, big ? 1.3 : 0.7);
    if (e.kind === 'mine') ctx.onExplosion(e.pos.x, e.pos.y, 60, 22);
    if (e.kind === 'urchin') this.projectiles.radial('spike', e.pos.x, e.pos.y, 8, 90, e.phase, { radius: 1.6, damage: 0, life: 0.5 });
    ctx.onKill(e, byPlayer);
  }

  /** Sonar ping: reveal and stun everything within the ring. */
  reveal(x: number, y: number, radius: number): number {
    let n = 0;
    for (const e of this.list) {
      if (!e.active) continue;
      if (e.revealed < 4 && Math.hypot(e.pos.x - x, e.pos.y - y) < radius) {
        e.revealed = 5;
        n++;
        if (e.kind === 'jelly' || e.kind === 'lanternfish') e.stunned = 1.6;
      }
    }
    return n;
  }

  update(dt: number, ctx: EnemyContext) {
    const p = ctx.player;
    const b = ctx.bounds;
    for (const e of this.list) {
      if (!e.active) continue;
      e.age += dt;
      e.flash = Math.max(0, e.flash - dt * 6);
      e.revealed = Math.max(0, e.revealed - dt);
      e.stunned = Math.max(0, e.stunned - dt);
      const r = e.visual.root;
      const scroll = ctx.scrollSpeed;
      const stun = e.stunned > 0 ? 0.25 : 1;

      switch (e.kind) {
        case 'urchin':
          e.vel.set(-scroll * 0.95, Math.sin(e.age * 0.8 + e.phase) * 10);
          r.rotation.y += dt * 0.6;
          r.rotation.z += dt * 0.3;
          break;
        case 'jelly': {
          // Pulse-glide propulsion: a contraction kicks it upward, then it sinks.
          const cycle = (e.age * 0.9 + e.phase) % 1;
          const kick = cycle < 0.25 ? Math.sin((cycle / 0.25) * Math.PI) : 0;
          e.vel.x = -scroll * 0.8 + Math.sin(e.age * 0.5 + e.phase) * 12;
          e.vel.y = (kick * 70 - 14) * stun;
          const bell = e.visual.parts.bell;
          if (bell) bell.scale.set(1 - kick * 0.18, 1 + kick * 0.12, 1 - kick * 0.18);
          if (e.pos.y > b.y * 0.8) e.vel.y = -20;
          if (e.pos.y < ctx.floorAt(e.pos.x) + 30) e.vel.y = 40;
          r.rotation.z = Math.sin(e.age + e.phase) * 0.15;
          break;
        }
        case 'mine': {
          e.vel.set(-scroll, 0);
          e.pos.y = e.anchorY + Math.sin(e.age * 1.2 + e.phase) * 3;
          const chain = e.visual.parts.chain;
          if (chain) chain.scale.y = Math.max(1, e.pos.y - 7 - ctx.floorAt(e.pos.x) + 10);
          const dist = Math.hypot(p.pos.x - e.pos.x, p.pos.y - e.pos.y);
          if (e.state === 0 && dist < 70 && p.alive) {
            e.state = 1; // armed
            e.timer = 0.85;
          }
          if (e.state === 1) {
            e.timer -= dt;
            if (e.timer <= 0) {
              this.kill(e, ctx, false);
              continue;
            }
          }
          const blink = e.state === 1 ? Math.sin(e.age * 30) > 0 : Math.sin(e.age * 4) > 0.7;
          e.visual.glowMats[0].emissiveIntensity = blink ? 6 : 0.3;
          r.rotation.y += dt * 0.2;
          break;
        }
        case 'lanternfish': {
          // Swim in, then home on the pod with a limited turn rate.
          const desired = this.tmp.set(p.pos.x - e.pos.x, p.pos.y - e.pos.y);
          const dist = desired.length();
          const speed = 120 + ctx.difficulty * 15;
          if (e.state === 0) {
            e.vel.set(-scroll - 70, Math.sin(e.age * 3 + e.phase) * 20);
            if (dist < 260 && e.pos.x > p.pos.x) e.state = 1;
          } else if (p.alive && e.pos.x > p.pos.x - 20) {
            desired.setLength(speed);
            e.vel.lerp(desired, 1 - Math.exp(-1.8 * dt * stun));
          } else e.vel.x = damp(e.vel.x, -scroll - 140, 2, dt);
          r.rotation.z = Math.atan2(e.vel.y, -e.vel.x) * -1;
          r.rotation.y = Math.PI;
          break;
        }
        case 'puffer': {
          const dist = Math.hypot(p.pos.x - e.pos.x, p.pos.y - e.pos.y);
          if (e.state === 0) {
            e.vel.set(-scroll * 0.9 - 15, Math.sin(e.age + e.phase) * 14);
            if (dist < 110 && p.alive) e.state = 1;
          } else if (e.state === 1) {
            e.vel.multiplyScalar(Math.exp(-3 * dt));
            e.vel.x = damp(e.vel.x, -scroll * 0.9, 3, dt);
            e.scale = Math.min(2.3, e.scale + dt * 2.2);
            if (e.scale >= 2.3) {
              e.state = 2;
              this.projectiles.radial('spike', e.pos.x, e.pos.y, 12 + ctx.difficulty * 2, 150, e.phase, { radius: 2.2, damage: 10 });
              e.hp = 0;
              this.kill(e, ctx, false);
              continue;
            }
          }
          e.radius = 9 * e.scale;
          r.scale.setScalar(e.scale);
          r.rotation.y = Math.PI + Math.sin(e.age * 2) * 0.3;
          const fin = e.visual.parts.fin;
          if (fin) fin.rotation.y = Math.sin(e.age * 12) * 0.5;
          break;
        }
        case 'debris':
          e.vel.set(-scroll * 0.6 - 30, -70 - ctx.difficulty * 10);
          r.rotation.z += dt * (0.6 + (e.phase % 1));
          r.rotation.x += dt * 0.4;
          if (Math.random() < dt * 20) this.particles.bubbles(this.v3.set(e.pos.x, e.pos.y, 0), 1, 8, 1.6);
          break;
      }

      e.pos.addScaledVector(e.vel, dt);
      r.position.set(e.pos.x, e.pos.y, 0);
      if (e.kind !== 'puffer') r.scale.setScalar(1 + e.flash * 0.15);

      // Visibility: in dark zones only bioluminescence, the floodlight and a sonar ping give enemies away.
      const g = e.visual;
      for (let i = 0; i < g.glowMats.length; i++) {
        if (e.kind === 'mine') continue;
        const m = g.glowMats[i];
        const base = g.baseEmissive[i] * (0.4 + ctx.darkness * 0.6);
        m.emissiveIntensity = base + e.flash * 3 + e.revealed * 0.5;
        if (i === 0 && e.revealed > 0 && e.kind !== 'jelly') m.emissive.copy(REVEAL_COLOR);
      }

      // Contact with the pod.
      if (p.alive) {
        const dx = p.pos.x - e.pos.x;
        const dy = p.pos.y - e.pos.y;
        const rr = p.radius + e.radius;
        if (dx * dx + dy * dy < rr * rr) {
          if (p.dashing) this.hit(e, 99, ctx, true);
          else {
            ctx.onContact(e);
            this.kill(e, ctx, false);
          }
          continue;
        }
      }

      // Cull off-screen.
      if (e.pos.x < -b.x - 80 || e.pos.y < -b.y - 120 || e.pos.y > b.y + 140) {
        e.active = false;
        r.visible = false;
      }
    }
  }

  nearest(x: number, y: number, maxDist = 600): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxDist * maxDist;
    for (const e of this.list) {
      if (!e.active) continue;
      const d = (e.pos.x - x) ** 2 + (e.pos.y - y) ** 2;
      if (d < bd && e.pos.x > x - 10) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Bioflare / zone clear: destroy everything on screen. */
  killAll(ctx: EnemyContext, byPlayer: boolean) {
    for (const e of this.list) if (e.active) this.kill(e, ctx, byPlayer);
  }

  clear() {
    for (const e of this.list) {
      e.active = false;
      e.visual.root.visible = false;
    }
    this.spawnAcc = 0;
  }

  get activeCount() {
    let n = 0;
    for (const e of this.list) if (e.active) n++;
    return n;
  }
}
