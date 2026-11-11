import { Vector2 } from 'three';
import { PodModel } from './PodModel';
import type { Input } from '../core/Input';
import { clamp, damp } from '../core/math';

export type DeathCause = 'hull' | 'oxygen' | 'crushed';

export interface PlayerStats {
  maxEnergy: number;
  /** Energy lost per second just by flying. */
  drain: number;
  fireRate: number;
  damage: number;
  dodgeCooldown: number;
  magnetRadius: number;
}

export const BASE_STATS: PlayerStats = {
  maxEnergy: 100,
  drain: 0.7,
  fireRate: 7,
  damage: 1,
  dodgeCooldown: 1.1,
  magnetRadius: 0,
};

export type PowerUp = 'shield' | 'magnet' | 'spread';

/**
 * Flight model. The craft eases toward the pointer (exponential follow), so
 * it always arrives smoothly, and its pitch and bank come from how far it
 * still has to travel. Shift throws it up or down in a quick barrel-roll dodge.
 */
export class Player {
  readonly model = new PodModel();
  readonly pos = new Vector2(-60, 0);
  readonly vel = new Vector2();
  readonly radius = 11;
  stats: PlayerStats = { ...BASE_STATS };

  energy = 100;
  lumen = 0;
  alive = true;
  deathCause: DeathCause = 'hull';

  invuln = 0;
  hitFlash = 0;
  dodgeTime = 0;
  dodgeCooldown = 0;
  private dodgeDir = 1;
  private dodgeOffset = 0;
  private roll = 0;
  shieldCharges = 0;
  shieldHit = 0;
  powerups: Record<Exclude<PowerUp, 'shield'>, number> = { magnet: 0, spread: 0 };
  controllable = true;
  private target = new Vector2();
  private thrust = 0;
  private prev = new Vector2();
  private time = 0;

  reset(stats: PlayerStats) {
    this.stats = stats;
    this.energy = stats.maxEnergy;
    this.lumen = 0;
    this.alive = true;
    this.invuln = 0;
    this.hitFlash = 0;
    this.dodgeTime = 0;
    this.dodgeCooldown = 0;
    this.dodgeOffset = 0;
    this.roll = 0;
    this.shieldCharges = 0;
    this.shieldHit = 0;
    this.powerups = { magnet: 0, spread: 0 };
    this.pos.set(-60, 0);
    this.vel.set(0, 0);
    this.target.copy(this.pos);
    this.prev.copy(this.pos);
    this.model.root.position.set(this.pos.x, this.pos.y, 0);
    this.model.root.rotation.set(0, 0, 0);
    this.model.body.rotation.set(0, 0, 0);
  }

  /** True while the dodge is active (also rams small creatures). */
  get dashing() {
    return this.dodgeTime > 0;
  }

  /** Quick vertical dodge. Goes toward the pointer if it is clearly above or below, else toward open space. */
  tryDodge(): boolean {
    if (this.dodgeCooldown > 0 || !this.alive) return false;
    const diff = this.target.y - this.pos.y;
    this.dodgeDir = Math.abs(diff) > 10 ? Math.sign(diff) : this.pos.y > 0 ? -1 : 1;
    this.dodgeTime = 0.26;
    this.dodgeCooldown = this.stats.dodgeCooldown;
    this.invuln = Math.max(this.invuln, 0.45);
    return true;
  }

  update(dt: number, input: Input, bounds: Vector2, floorY: number) {
    this.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    this.shieldHit = Math.max(0, this.shieldHit - dt * 3);
    this.dodgeTime = Math.max(0, this.dodgeTime - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.powerups.magnet = Math.max(0, this.powerups.magnet - dt);
    this.powerups.spread = Math.max(0, this.powerups.spread - dt);

    const minX = -bounds.x * 0.9;
    const maxX = bounds.x * 0.5;
    const minY = Math.max(-bounds.y * 0.84, floorY + this.radius + 2);
    const maxY = bounds.y * 0.84;
    this.prev.copy(this.pos);

    if (this.alive && this.controllable) {
      this.target.set(clamp(input.aim.x * bounds.x * 1.05, minX, maxX), clamp(input.aim.y * bounds.y * 1.05, minY, maxY));
      // The dodge is an offset on top of the pointer: it snaps out, then eases back.
      const dodging = this.dodgeTime > 0;
      this.dodgeOffset = damp(this.dodgeOffset, dodging ? this.dodgeDir * 62 : 0, dodging ? 22 : 3.2, dt);
      const ty = clamp(this.target.y + this.dodgeOffset, minY, maxY);
      this.pos.x = damp(this.pos.x, this.target.x, 5.5, dt);
      this.pos.y = damp(this.pos.y, ty, dodging ? 20 : 7, dt);
    } else if (!this.alive) {
      this.vel.y = damp(this.vel.y, -60, 1.5, dt);
      this.vel.x = damp(this.vel.x, -25, 1.5, dt);
      this.pos.addScaledVector(this.vel, dt);
    }
    if (this.alive) {
      this.pos.x = clamp(this.pos.x, minX, maxX);
      this.pos.y = clamp(this.pos.y, minY, maxY);
      if (dt > 0) this.vel.set((this.pos.x - this.prev.x) / dt, (this.pos.y - this.prev.y) / dt);
    }

    // Pose: pitch follows climb rate, a little bank, a gentle idle bob, and a roll while dodging.
    const m = this.model;
    m.root.position.set(this.pos.x, this.pos.y, 0);
    const pitch = clamp(this.vel.y * 0.0042, -0.55, 0.55);
    this.roll = this.dodgeTime > 0 ? this.roll + dt * (Math.PI * 2) / 0.26 * this.dodgeDir : damp(this.roll % (Math.PI * 2), 0, 10, dt);
    m.body.rotation.z = damp(m.body.rotation.z, this.alive ? pitch : -0.9, 9, dt);
    m.body.rotation.x = damp(m.body.rotation.x, this.alive ? clamp(-this.vel.y * 0.0022, -0.3, 0.3) + this.roll : 0.6, 14, dt);
    m.body.position.y = Math.sin(this.time * 2.1) * 0.7;
    if (this.hitFlash > 0) {
      m.body.position.x = (Math.random() - 0.5) * this.hitFlash * 2.5;
      m.body.position.z = (Math.random() - 0.5) * this.hitFlash * 2.5;
    } else m.body.position.x = m.body.position.z = 0;
    this.thrust = damp(this.thrust, Math.min(1, this.vel.length() / 220), 6, dt);
  }

  animate(dt: number, beam: number) {
    this.model.animate(dt, {
      thrust: this.thrust,
      hitFlash: this.hitFlash,
      beam: this.alive ? beam : 0,
      shieldHit: this.shieldHit,
      shieldOn: this.shieldCharges > 0,
      dashing: this.dashing,
    });
    this.model.body.visible = this.invuln <= 0 || this.dashing || Math.floor(this.invuln * 16) % 2 === 0;
  }

  /** Returns damage actually taken (0 if blocked). */
  damage(amount: number): number {
    if (!this.alive || this.invuln > 0) return 0;
    if (this.shieldCharges > 0) {
      this.shieldCharges--;
      this.shieldHit = 1;
      this.invuln = 0.5;
      return 0;
    }
    this.energy -= amount;
    this.hitFlash = 1;
    this.invuln = 1;
    if (this.energy <= 0) {
      this.energy = 0;
      this.alive = false;
      this.deathCause = 'hull';
    }
    return amount;
  }

  /** Flying costs a little energy all the time; sparks give it back. */
  burn(dt: number, scale: number) {
    if (!this.alive) return;
    this.energy -= this.stats.drain * scale * dt;
    if (this.energy <= 0) {
      this.energy = 0;
      this.alive = false;
      this.deathCause = 'oxygen';
    }
  }

  addEnergy(v: number) {
    this.energy = Math.min(this.stats.maxEnergy, this.energy + v);
  }
}
