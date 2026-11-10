import { Vector2 } from 'three';
import { PodModel } from './PodModel';
import type { Input } from '../core/Input';
import { clamp, damp } from '../core/math';

export type DeathCause = 'hull' | 'oxygen' | 'crushed';

export interface PlayerStats {
  maxHull: number;
  maxOxygen: number;
  oxygenDrain: number;
  fireRate: number;
  damage: number;
  dashCooldown: number;
  ammoRegen: number;
  maxAmmo: number;
  magnetRadius: number;
}

export const BASE_STATS: PlayerStats = {
  maxHull: 100,
  maxOxygen: 100,
  oxygenDrain: 1.15,
  fireRate: 8,
  damage: 1,
  dashCooldown: 2.2,
  ammoRegen: 1.4,
  maxAmmo: 60,
  magnetRadius: 0,
};

export type PowerUp = 'shield' | 'magnet' | 'spread' | 'torpedo';
export const POWERUP_DURATION: Record<PowerUp, number> = { shield: 0, magnet: 12, spread: 10, torpedo: 10 };

/**
 * Pod flight model and survival resources. Physics is spring-damped toward
 * the aim point (mouse / touch) or driven directly by keys, then nudged by
 * the zone's ocean current.
 */
export class Player {
  readonly model = new PodModel();
  readonly pos = new Vector2(-60, 0);
  readonly vel = new Vector2();
  readonly radius = 12;
  stats: PlayerStats = { ...BASE_STATS };

  hull = 100;
  oxygen = 100;
  ammo = 40;
  lumen = 0;
  alive = true;
  deathCause: DeathCause = 'hull';

  invuln = 0;
  hitFlash = 0;
  dashTime = 0;
  dashCooldown = 0;
  private dashDir = new Vector2(1, 0);
  private ammoAcc = 0;
  shieldCharges = 0;
  shieldHit = 0;
  powerups: Record<Exclude<PowerUp, 'shield'>, number> = { magnet: 0, spread: 0, torpedo: 0 };
  /** Extra controls lock for cutscenes. */
  controllable = true;
  /** Seconds survived without taking damage (achievements, scoring). */
  cleanTime = 0;
  private target = new Vector2();
  private thrust = 0;

  reset(stats: PlayerStats) {
    this.stats = stats;
    this.hull = stats.maxHull;
    this.oxygen = stats.maxOxygen;
    this.ammo = Math.round(stats.maxAmmo * 0.7);
    this.lumen = 0;
    this.alive = true;
    this.invuln = 0;
    this.hitFlash = 0;
    this.dashTime = 0;
    this.dashCooldown = 0;
    this.shieldCharges = 0;
    this.shieldHit = 0;
    this.powerups = { magnet: 0, spread: 0, torpedo: 0 };
    this.cleanTime = 0;
    this.pos.set(-60, 0);
    this.vel.set(0, 0);
    this.target.copy(this.pos);
    this.model.root.position.set(this.pos.x, this.pos.y, 0);
    this.model.body.rotation.set(0, 0, 0);
  }

  get dashing() {
    return this.dashTime > 0;
  }

  /** Returns true if a dash started this frame. */
  tryDash(): boolean {
    if (this.dashCooldown > 0 || !this.alive || this.oxygen < 4) return false;
    this.dashTime = 0.28;
    this.dashCooldown = this.stats.dashCooldown;
    this.invuln = Math.max(this.invuln, 0.4);
    this.oxygen -= 4;
    if (this.vel.lengthSq() > 400) this.dashDir.copy(this.vel).normalize();
    else this.dashDir.set(1, 0);
    return true;
  }

  update(dt: number, input: Input, bounds: Vector2, current: number, floorY: number) {
    // Timers
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    this.shieldHit = Math.max(0, this.shieldHit - dt * 3);
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    for (const k of Object.keys(this.powerups) as (keyof typeof this.powerups)[])
      this.powerups[k] = Math.max(0, this.powerups[k] - dt);
    if (this.alive) this.cleanTime += dt;

    // Ammo slowly regenerates so you are never fully disarmed.
    this.ammoAcc += dt * this.stats.ammoRegen;
    while (this.ammoAcc >= 1) {
      this.ammoAcc -= 1;
      if (this.ammo < this.stats.maxAmmo * 0.5) this.ammo++;
    }

    const minX = -bounds.x * 0.9;
    const maxX = bounds.x * 0.55;
    const minY = Math.max(-bounds.y * 0.86, floorY + this.radius + 2);
    const maxY = bounds.y * 0.84;

    if (this.alive && this.controllable) {
      if (input.device === 'keys') {
        const speed = 190;
        this.vel.x = damp(this.vel.x, input.axis.x * speed, 10, dt);
        this.vel.y = damp(this.vel.y, input.axis.y * speed, 10, dt);
      } else {
        this.target.set(input.aim.x * bounds.x * 1.05, input.aim.y * bounds.y * 1.05);
        this.target.x = clamp(this.target.x, minX, maxX);
        this.target.y = clamp(this.target.y, minY, maxY);
        // Critically damped spring toward the target.
        const k = 60;
        const c = 2 * Math.sqrt(k) * 1.05;
        this.vel.x += ((this.target.x - this.pos.x) * k - this.vel.x * c) * dt;
        this.vel.y += ((this.target.y - this.pos.y) * k - this.vel.y * c) * dt;
      }
      if (this.dashing) this.vel.addScaledVector(this.dashDir, 2200 * dt);
      // Ocean current pushes the pod backwards, with a slow vertical surge.
      this.vel.x -= current * 70 * dt;
      this.vel.y += Math.sin(performance.now() * 0.0007) * current * 20 * dt;
    } else if (!this.alive) {
      this.vel.y = damp(this.vel.y, -45, 1.5, dt);
      this.vel.x = damp(this.vel.x, -20, 1.5, dt);
    } else {
      this.vel.multiplyScalar(Math.exp(-3 * dt));
    }

    const maxSpeed = this.dashing ? 560 : 300;
    if (this.vel.lengthSq() > maxSpeed * maxSpeed) this.vel.setLength(maxSpeed);
    this.pos.addScaledVector(this.vel, dt);
    if (this.alive) {
      this.pos.x = clamp(this.pos.x, minX, maxX);
      this.pos.y = clamp(this.pos.y, minY, maxY);
    }

    // Visuals
    const m = this.model;
    m.root.position.set(this.pos.x, this.pos.y, 0);
    const tiltTarget = clamp(this.vel.y * 0.0035, -0.5, 0.5);
    const rollTarget = clamp(-this.vel.x * 0.0016, -0.35, 0.35);
    m.body.rotation.z = damp(m.body.rotation.z, this.alive ? tiltTarget : -0.9, 6, dt);
    m.body.rotation.x = damp(m.body.rotation.x, this.alive ? rollTarget : 0.6, 6, dt);
    const bob = Math.sin(performance.now() * 0.002) * 0.6;
    m.body.position.y = bob;
    if (this.hitFlash > 0) {
      m.body.position.x = (Math.random() - 0.5) * this.hitFlash * 3;
      m.body.position.z = (Math.random() - 0.5) * this.hitFlash * 3;
    } else {
      m.body.position.x = m.body.position.z = 0;
    }
    this.thrust = damp(this.thrust, Math.min(1, this.vel.length() / 250), 8, dt);
  }

  animate(dt: number, darkness: number) {
    this.model.animate(dt, {
      thrust: this.thrust,
      hitFlash: this.hitFlash,
      beam: this.alive ? 0.25 + darkness * 0.9 : 0.1,
      shieldHit: this.shieldHit,
      shieldOn: this.shieldCharges > 0,
      dashing: this.dashing,
    });
    // Flicker the invulnerability frames.
    this.model.body.visible = this.invuln <= 0 || this.dashing || Math.floor(this.invuln * 20) % 2 === 0;
  }

  /** Returns damage actually taken (0 if blocked). */
  damage(amount: number, cause: DeathCause = 'hull'): number {
    if (!this.alive || this.invuln > 0) return 0;
    if (this.shieldCharges > 0) {
      this.shieldCharges--;
      this.shieldHit = 1;
      this.invuln = 0.5;
      return 0;
    }
    this.hull -= amount;
    this.hitFlash = 1;
    this.invuln = 0.9;
    this.cleanTime = 0;
    if (this.hull <= 0) {
      this.hull = 0;
      this.alive = false;
      this.deathCause = cause;
    }
    return amount;
  }

  /** Oxygen drains constantly; at zero the hull starts failing. */
  breathe(dt: number, drainScale: number) {
    if (!this.alive) return;
    this.oxygen -= this.stats.oxygenDrain * drainScale * dt;
    if (this.oxygen <= 0) {
      this.oxygen = 0;
      this.hull -= 9 * dt;
      if (this.hull <= 0) {
        this.hull = 0;
        this.alive = false;
        this.deathCause = 'oxygen';
      }
    }
  }

  addOxygen(v: number) {
    this.oxygen = Math.min(this.stats.maxOxygen, this.oxygen + v);
  }
  repair(v: number) {
    this.hull = Math.min(this.stats.maxHull, this.hull + v);
  }
}
