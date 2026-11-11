import type { EnemyKind } from '../entities/Enemies';
import type { Family } from '../themes/themes';

export type BossKind = 'warden' | 'lantern' | 'chain' | 'kraken' | 'leviathan' | 'storm' | 'zeppelin' | 'dragon' | 'core' | 'dreadnought' | 'wyrm' | 'blot';
export type Difficulty = 'relaxed' | 'normal' | 'hard';

export interface BossInfo {
  kind: BossKind;
  name: string;
  title: string;
}

const B = (kind: BossKind, name: string, title: string): BossInfo => ({ kind, name, title });

/** The villain. Every fifth boss slot (level 15, 30...) is the Blot itself. */
export const THE_BLOT = B('blot', 'The Blot', 'The ink itself. Everything you have fought so far was a piece of it');

/** Bosses 1-4 are creatures of each world stained with the Blot's ink. */
export const BOSS_TABLE: Record<Family, BossInfo[]> = {
  water: [
    B('warden', 'Thermal Warden', 'A crab the size of a house, lit from inside'),
    B('lantern', 'The Lantern', 'It hunts by the light you carry'),
    B('chain', 'The Chain', 'Forty links, and every one of them can sting'),
    B('kraken', 'Kraken', 'Ten arms, all reaching for you'),
    THE_BLOT,
  ],
  sky: [
    B('storm', 'Thunderhead', 'Watch the marked lanes. Lightning follows'),
    B('zeppelin', 'Ironclad Airship', 'Guns, bombs and a very large nose'),
    B('dragon', 'Kite Dragon', 'A paper tail a hundred metres long'),
    B('storm', 'Thunderhead', 'It came back angrier'),
    THE_BLOT,
  ],
  space: [
    B('core', 'Sentinel Core', 'Its armour turns. Shoot the heart when it shows'),
    B('dreadnought', 'Dreadnought', 'Stay out of the main gun’s lane'),
    B('wyrm', 'Star Wyrm', 'It swims in vacuum'),
    B('core', 'Sentinel Core', 'More arms on the spiral this time'),
    THE_BLOT,
  ],
};

export interface LevelDef {
  n: number;
  /** Seconds of flying before the level gate (or boss). */
  duration: number;
  spawnRate: number;
  enemies: [EnemyKind, number][];
  enemyHp: number;
  enemyDamage: number;
  bulletSpeed: number;
  /** Multiplier on how fast flying burns energy. */
  drain: number;
  scroll: number;
  /** Chance a spawned creature is ink-stained (tougher, drops a shard). */
  eliteChance: number;
  /** Which of the five boss slots this level ends with, or -1. */
  bossSlot: number;
  bossDifficulty: number;
  checkpoint: boolean;
  /** Aimed shots per creature per second. */
  aimRate: number;
  /** Share of creatures that spawn on the player's line. */
  hunt: number;
  /** Creatures to destroy before the page turns (normal levels). */
  quota: number;
}

export const DIFFICULTY: Record<Difficulty, { damageTaken: number; spawn: number; drain: number; label: string; desc: string }> = {
  relaxed: { damageTaken: 0.6, spawn: 0.75, drain: 0.6, label: 'Relaxed', desc: 'Softer hits and fewer creatures.' },
  normal: { damageTaken: 1, spawn: 1, drain: 1, label: 'Normal', desc: 'The intended balance.' },
  hard: { damageTaken: 1.35, spawn: 1.25, drain: 1.2, label: 'Hard', desc: 'Heavier hits and busier worlds.' },
};

export const BOSS_EVERY = 3;
export const STORY_END_LEVEL = BOSS_EVERY * 5; // 15

/**
 * Difficulty curve. Level 1 is a gentle warm-up with two creature types;
 * a new type joins at levels 2, 3, 5 and 7. Everything ramps a little each
 * level, and the level after a boss eases off slightly (sawtooth).
 */
export function levelDef(n: number): LevelDef {
  const isBoss = n % BOSS_EVERY === 0;
  const cycle = Math.floor((n - 1) / STORY_END_LEVEL);
  const afterBoss = (n - 1) % BOSS_EVERY === 0 && n > 1 ? 0.9 : 1;
  const t = (n - 1) * afterBoss;
  const enemies: [EnemyKind, number][] = [
    ['urchin', 3],
    ['debris', 1.5],
  ];
  if (n >= 2) enemies.push(['jelly', 2.2]);
  if (n >= 3) enemies.push(['mine', 1.5]);
  if (n >= 5) enemies.push(['lanternfish', 1.8]);
  if (n >= 7) enemies.push(['puffer', 1.8]);
  return {
    n,
    duration: Math.min(64, 32 + n * 2),
    spawnRate: Math.min(3.8, 1.05 + t * 0.15),
    enemies,
    enemyHp: 1 + t * 0.11 + cycle * 0.5,
    enemyDamage: 1 + t * 0.07 + cycle * 0.25,
    drain: 1 + t * 0.09,
    bulletSpeed: Math.min(1.7, 0.95 + t * 0.035),
    scroll: Math.min(1.7, 1 + t * 0.04),
    eliteChance: n < 4 ? 0 : Math.min(0.35, (n - 3) * 0.04),
    bossSlot: isBoss ? (n / BOSS_EVERY - 1) % 5 : -1,
    bossDifficulty: 0.8 + ((n / BOSS_EVERY - 1) % 5) * 0.1 + cycle * 0.6,
    checkpoint: (n - 1) % BOSS_EVERY === 0,
    aimRate: Math.min(0.5, 0.24 + t * 0.024),
    hunt: Math.min(0.55, 0.35 + t * 0.02),
    quota: Math.round(Math.min(40, 8 + n * 2.2)),
  };
}
