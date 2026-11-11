import type { EnemyKind } from '../entities/Enemies';
import type { Family } from '../themes/themes';

export type BossKind = 'warden' | 'lantern' | 'chain' | 'kraken' | 'leviathan' | 'storm' | 'zeppelin' | 'dragon' | 'core' | 'dreadnought' | 'wyrm';
export type Difficulty = 'relaxed' | 'normal' | 'hard';

export interface BossInfo {
  kind: BossKind;
  name: string;
  title: string;
}

const B = (kind: BossKind, name: string, title: string): BossInfo => ({ kind, name, title });

/** The Blot takes a shape that suits the world it is in. Five boss slots per journey. */
export const BOSS_TABLE: Record<Family, BossInfo[]> = {
  water: [
    B('warden', 'Thermal Warden', 'A crab the size of a house, lit from inside'),
    B('lantern', 'The Lantern', 'It hunts by the light you carry'),
    B('chain', 'The Chain', 'Forty links, and every one of them can sting'),
    B('kraken', 'Kraken', 'Ten arms, all reaching for you'),
    B('leviathan', 'Leviathan', 'The first stain. The one that tore the Atlas'),
  ],
  sky: [
    B('storm', 'Thunderhead', 'Watch the marked lanes. Lightning follows'),
    B('zeppelin', 'Ironclad Airship', 'Guns, bombs and a very large nose'),
    B('dragon', 'Kite Dragon', 'A paper tail a hundred metres long'),
    B('storm', 'Thunderhead', 'It came back angrier'),
    B('zeppelin', 'Ironclad Airship', 'Refitted. Reloaded'),
  ],
  space: [
    B('core', 'Sentinel Core', 'Its armour turns. Shoot the heart when it shows'),
    B('dreadnought', 'Dreadnought', 'Stay out of the main gun’s lane'),
    B('wyrm', 'Star Wyrm', 'It swims in vacuum'),
    B('core', 'Sentinel Core', 'More arms on the spiral this time'),
    B('dreadnought', 'Dreadnought', 'The flagship'),
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
  /** Which of the five boss slots this level ends with, or -1. */
  bossSlot: number;
  bossDifficulty: number;
  checkpoint: boolean;
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
    duration: Math.min(80, 40 + n * 2.5),
    spawnRate: Math.min(2.6, 0.42 + t * 0.11),
    enemies,
    enemyHp: 1 + t * 0.11 + cycle * 0.5,
    enemyDamage: 1 + t * 0.07 + cycle * 0.25,
    drain: 1 + t * 0.09,
    bulletSpeed: Math.min(1.6, 0.85 + t * 0.03),
    scroll: Math.min(1.5, 1 + t * 0.03),
    bossSlot: isBoss ? (n / BOSS_EVERY - 1) % 5 : -1,
    bossDifficulty: 0.8 + ((n / BOSS_EVERY - 1) % 5) * 0.1 + cycle * 0.6,
    checkpoint: (n - 1) % BOSS_EVERY === 0,
  };
}
