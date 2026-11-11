import { Color, Scene, Vector2, Vector3 } from 'three';
import type { LevelDef } from '../game/levels';

export type EnemyKind = 'urchin' | 'jelly' | 'mine' | 'lanternfish' | 'puffer' | 'debris';
import type { Particles } from '../fx/Particles';
import type { Projectiles } from '../combat/Projectiles';
import type { Player } from './Player';
import { FamilyVisual, makeDebris, makeJelly, makeLanternfish, makeMine, makePuffer, makeUrchin, type EnemyVisual } from './EnemyModels';
import { makeSky, makeSpace } from './EnemyFamilies';
import type { Family } from '../themes/themes';
import { Random } from '../core/Random';
import { clamp, damp } from '../core/math';
import { Mesh, MeshBasicMaterial, SphereGeometry, type IUniform } from 'three';

/** Shared dark aura and red eye that mark ink-stained elites. */
const AURA_GEO = new SphereGeometry(1, 16, 12);
const AURA_MAT = new MeshBasicMaterial({ color: 0x0a0610, transparent: true, opacity: 0.32, depthWrite: false });
const EYE_MAT = new MeshBasicMaterial({ color: 0xff2a3a, toneMapped: false });

export interface Enemy {
  active: boolean;
  kind: EnemyKind;
  visual: FamilyVisual;
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
  /** Ink-stained: tougher, drips ink, drops a shard. */
  elite: boolean;
  grazed: boolean;
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
  urchin: { hp: 2, radius: 10, contact: 12, score: 120, pool: 16, color: 0xa070ff },
  jelly: { hp: 2, radius: 10, contact: 9, score: 100, pool: 16, color: 0x7ffcff },
  mine: { hp: 2, radius: 10, contact: 16, score: 150, pool: 10, color: 0xff6030 },
  lanternfish: { hp: 1, radius: 7, contact: 7, score: 80, pool: 30, color: 0x7ffcff },
  puffer: { hp: 2, radius: 9, contact: 10, score: 140, pool: 12, color: 0xffd166 },
  debris: { hp: 3, radius: 13, contact: 13, score: 160, pool: 12, color: 0xffaa44 },
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
        const visual = new FamilyVisual({ water: factories[kind](), sky: makeSky(kind, i), space: makeSpace(kind) });
        visual.root.visible = false;
        const spec = ENEMY_SPECS[kind];
        const aura = new Mesh(AURA_GEO, AURA_MAT);
        aura.scale.setScalar(spec.radius * 1.45);
        aura.name = 'aura';
        aura.visible = false;
        const eye = new Mesh(new SphereGeometry(1.4, 8, 6), EYE_MAT);
        eye.position.set(-spec.radius * 0.5, spec.radius * 0.3, spec.radius * 0.9);
        eye.name = 'inkEye';
        eye.visible = false;
        visual.root.add(aura, eye);
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
          elite: false,
          grazed: false,
        });
      }
    }
  }

  /** Show the bodies that belong to the current world. */
  setFamily(f: Family) {
    for (const e of this.list) e.visual.use(f);
  }

  seed(seed: number) {
    this.rnd.reseed(seed);
  }

  spawn(kind: EnemyKind, x: number, y: number, hpMult = 1, elite = false): Enemy | null {
    const e = this.list.find((en) => !en.active && en.kind === kind);
    if (!e) return null;
    const spec = ENEMY_SPECS[kind];
    e.active = true;
    e.pos.set(x, y);
    e.vel.set(0, 0);
    e.elite = elite;
    e.grazed = false;
    e.maxHp = e.hp = Math.ceil(spec.hp * hpMult * (elite ? 2.5 : 1));
    e.score = spec.score * (elite ? 2 : 1);
    const aura = e.visual.root.getObjectByName('aura');
    const inkEye = e.visual.root.getObjectByName('inkEye');
    if (aura) aura.visible = elite;
    if (inkEye) inkEye.visible = elite;
    e.radius = spec.radius;
    e.contactDamage = spec.contact;
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
      const elite = this.rnd.chance(level.eliteChance);
      const b = ctx.bounds;
      const x = b.x + 40;
      switch (kind) {
        case 'lanternfish': {
          const n = this.rnd.int(3, 5);
          const y = this.rnd.range(-b.y * 0.6, b.y * 0.7);
          for (let i = 0; i < n; i++) this.spawn('lanternfish', x + i * 18, y + this.rnd.range(-20, 20), hp, elite && i === 0);
          break;
        }
        case 'mine': {
          const floor = ctx.floorAt(x);
          const y = clamp(this.rnd.range(floor + 50, b.y * 0.55), floor + 40, b.y * 0.6);
          this.spawn('mine', x, y, hp, elite);
          break;
        }
        case 'debris':
          this.spawn('debris', this.rnd.range(0, b.x + 60), b.y + 40, hp, elite);
          break;
        default:
          this.spawn(kind, x, this.rnd.range(-b.y * 0.7, b.y * 0.75), hp, elite);
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
    if (e.kind === 'mine') ctx.onExplosion(e.pos.x, e.pos.y, 55, 16);
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
          if (e.state === 0 && dist < 60 && p.alive) {
            e.state = 1; // armed
            e.timer = 1.1;
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
          const speed = 95 + ctx.difficulty * 20;
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
              this.projectiles.radial('spike', e.pos.x, e.pos.y, 8 + Math.round(ctx.difficulty * 2), 120 * ctx.difficulty, e.phase, { radius: 2.2, damage: 8 });
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
          e.vel.set(-scroll * 0.6 - 30, -55 - ctx.difficulty * 10);
          r.rotation.z += dt * (0.6 + (e.phase % 1));
          r.rotation.x += dt * 0.4;
          if (Math.random() < dt * 20) this.particles.bubbles(this.v3.set(e.pos.x, e.pos.y, 0), 1, 8, 1.6);
          break;
      }

      e.pos.addScaledVector(e.vel, dt);
      r.position.set(e.pos.x, e.pos.y, 0);
      // Ease in from nothing so spawns never pop.
      const grow = Math.min(1, e.age * 4);
      if (e.elite && Math.random() < dt * 6) this.particles.burst(this.v3.set(e.pos.x, e.pos.y - e.radius * 0.6, 3), { count: 1, color: 0x0a0a10, speed: 6, size: 6, life: 1.1, drag: 1, gravity: -60, smoke: true });
      if (e.kind !== 'puffer') r.scale.setScalar((1 + e.flash * 0.15) * grow);

      const g = e.visual;
      for (let i = 0; i < g.glowMats.length; i++) {
        if (e.kind === 'mine') continue;
        g.glowMats[i].emissiveIntensity = g.baseEmissive[i] + e.flash * 2.5;
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
