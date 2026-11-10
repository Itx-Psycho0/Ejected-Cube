import { Group, Mesh, MeshStandardMaterial, Vector2, Vector3 } from 'three';
import type { Player } from '../Player';
import type { Projectiles } from '../../combat/Projectiles';
import type { Particles } from '../../fx/Particles';
import type { Telegraph } from '../../fx/Telegraph';
import type { EnemyKind } from '../../game/zones';
import { damp } from '../../core/math';

export interface BossContext {
  player: Player;
  projectiles: Projectiles;
  particles: Particles;
  telegraph: Telegraph;
  bounds: Vector2;
  difficulty: number;
  floorAt: (x: number) => number;
  shake: (v: number) => void;
  sfx: (name: 'roar' | 'charge' | 'shoot' | 'slam') => void;
  spawnEnemy: (kind: EnemyKind, x: number, y: number) => void;
  /** 0..1 extra darkness (anglerfish flash, kraken ink). */
  darken: (amount: number, seconds: number) => void;
}

export interface HitCircle {
  x: number;
  y: number;
  r: number;
  /** Damage multiplier for shots that land here (armour < 1, weak spot > 1). */
  mult: number;
  /** Whether touching it hurts the pod. */
  harmful: boolean;
}

export type BossState = 'enter' | 'fight' | 'dying' | 'dead';
type Attack = (ctx: BossContext) => Generator<number, void, unknown>;

/**
 * Base class for zone bosses. Attacks are written as generator scripts that
 * `yield` seconds to wait, which keeps multi-step patterns readable:
 *
 *   *slam(ctx) { telegraph(); yield 0.8; doDamage(); yield 1.2; }
 */
export abstract class Boss {
  readonly root = new Group();
  readonly pos = new Vector2();
  readonly home = new Vector2();
  hp = 100;
  maxHp = 100;
  state: BossState = 'enter';
  phase2 = false;
  t = 0;
  flash = 0;
  hitboxes: HitCircle[] = [];
  protected glow: MeshStandardMaterial[] = [];
  protected glowBase: number[] = [];
  private script: Generator<number, void, unknown> | null = null;
  private wait = 0;
  private lastAttack = -1;
  protected attacks: Attack[] = [];
  protected idleBetween = 1.2;
  dyingTime = 0;
  abstract readonly name: string;
  protected v3 = new Vector3();

  constructor(baseHp: number, difficulty: number) {
    this.maxHp = this.hp = Math.round(baseHp * (1 + (difficulty - 1) * 0.6));
  }

  protected registerGlow(...mats: MeshStandardMaterial[]) {
    for (const m of mats) {
      this.glow.push(m);
      this.glowBase.push(m.emissiveIntensity);
    }
  }

  protected finalizeModel() {
    this.root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
  }

  /** Called once when the boss is added: start off-screen right. */
  enter(bounds: Vector2) {
    this.home.set(bounds.x * 0.6, 0);
    this.pos.set(bounds.x + 220, 0);
    this.root.position.set(this.pos.x, this.pos.y, 0);
  }

  hit(dmg: number) {
    if (this.state !== 'fight') return false;
    this.hp -= dmg;
    this.flash = 1;
    if (!this.phase2 && this.hp < this.maxHp * 0.5) {
      this.phase2 = true;
      this.onPhase2();
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dying';
      this.dyingTime = 0;
      this.script = null;
      return true;
    }
    return false;
  }

  protected onPhase2() {}

  /** Last frame delta, for generator scripts that move the boss. */
  protected dt = 0;

  update(dt: number, ctx: BossContext) {
    this.dt = dt;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    for (let i = 0; i < this.glow.length; i++) this.glow[i].emissiveIntensity = this.glowBase[i] + this.flash * 2.5;

    if (this.state === 'enter') {
      this.pos.x = damp(this.pos.x, this.home.x, 1.4, dt);
      this.pos.y = damp(this.pos.y, this.home.y, 1.4, dt);
      if (Math.abs(this.pos.x - this.home.x) < 4) {
        this.state = 'fight';
        this.wait = 0.8;
      }
    } else if (this.state === 'fight') {
      this.runScript(dt, ctx);
    } else if (this.state === 'dying') {
      this.dyingTime += dt;
      this.pos.y -= dt * 12;
      if (Math.random() < dt * 14) {
        const h = this.hitboxes[Math.floor(Math.random() * this.hitboxes.length)];
        if (h) ctx.particles.explosion(this.v3.set(h.x + (Math.random() - 0.5) * h.r, h.y + (Math.random() - 0.5) * h.r, 0), 0xffaa66, 0.8);
        ctx.shake(0.15);
      }
      if (this.dyingTime > 2.6) {
        this.state = 'dead';
        this.root.visible = false;
      }
    }
    this.animate(dt, ctx);
    this.root.position.set(this.pos.x, this.pos.y, this.root.position.z);
    this.updateHitboxes();
  }

  private runScript(dt: number, ctx: BossContext) {
    if (this.wait > 0) {
      this.wait -= dt * (this.phase2 ? 1.3 : 1);
      return;
    }
    if (!this.script) {
      let i = Math.floor(Math.random() * this.attacks.length);
      if (i === this.lastAttack && this.attacks.length > 1) i = (i + 1) % this.attacks.length;
      this.lastAttack = i;
      this.script = this.attacks[i].call(this, ctx);
    }
    const r = this.script.next();
    if (r.done) {
      this.script = null;
      this.wait = this.idleBetween * (this.phase2 ? 0.65 : 1);
    } else this.wait = r.value;
  }

  protected abstract animate(dt: number, ctx: BossContext): void;
  protected abstract updateHitboxes(): void;

  /** Aim helper: unit vector from a point to the pod. */
  protected aim(ctx: BossContext, x: number, y: number) {
    const dx = ctx.player.pos.x - x;
    const dy = ctx.player.pos.y - y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }
}

/**
 * Body segments that follow a head along its recorded path, used by the
 * siphonophore and the leviathan. Sampling by arc length keeps spacing even
 * at any speed.
 */
export class SegmentTrail {
  private hist: number[] = [];
  readonly points: Vector2[];
  constructor(
    readonly count: number,
    readonly spacing: number,
  ) {
    this.points = Array.from({ length: count }, () => new Vector2());
  }
  reset(x: number, y: number, dirX = 1) {
    this.hist = [];
    for (let i = 0; i < this.count * this.spacing; i += 2) this.hist.push(x + i * dirX, y);
    for (const p of this.points) p.set(x, y);
  }
  push(x: number, y: number) {
    const lx = this.hist[0];
    const ly = this.hist[1];
    if (lx === undefined || Math.hypot(x - lx, y - ly) > 1.5) this.hist.unshift(x, y);
    const maxLen = (this.count + 2) * this.spacing * 2;
    if (this.hist.length > maxLen) this.hist.length = maxLen;
    // Walk the polyline and drop a point every `spacing` units.
    let seg = 0;
    let acc = 0;
    let target = this.spacing;
    this.points[0]?.set(x, y);
    let pi = 1;
    while (pi < this.count && seg + 3 < this.hist.length) {
      const ax = this.hist[seg];
      const ay = this.hist[seg + 1];
      const bx = this.hist[seg + 2];
      const by = this.hist[seg + 3];
      const l = Math.hypot(bx - ax, by - ay);
      if (acc + l >= target) {
        const f = (target - acc) / (l || 1);
        this.points[pi++].set(ax + (bx - ax) * f, ay + (by - ay) * f);
        target += this.spacing;
      } else {
        acc += l;
        seg += 2;
      }
    }
    for (; pi < this.count; pi++) this.points[pi].copy(this.points[pi - 1]);
  }
}
