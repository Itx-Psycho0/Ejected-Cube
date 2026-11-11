import type { EnemyKind } from '../entities/Enemies';

export type BossKind = 'warden' | 'lantern' | 'chain' | 'kraken' | 'leviathan';
export type Difficulty = 'relaxed' | 'normal' | 'hard';

export interface BossInfo {
  kind: BossKind;
  name: string;
  title: string;
}

/** The Blot takes a different shape in every chapter. */
export const BOSSES: BossInfo[] = [
  { kind: 'warden', name: 'Thermal Warden', title: 'The Blot poured itself into a crab and set it on fire' },
  { kind: 'lantern', name: 'The Lantern', title: 'It hunts by the light you carry' },
  { kind: 'chain', name: 'The Chain', title: 'Forty links of ink, and every one of them can sting' },
  { kind: 'kraken', name: 'Kraken', title: 'Ten arms of spilled ink, all reaching for you' },
  { kind: 'leviathan', name: 'Leviathan', title: 'The first stain. The one that tore the Atlas' },
];

export interface LevelDef {
  n: number;
  /** Seconds of travel before the level gate (or boss). */
  duration: number;
  spawnRate: number;
  enemies: [EnemyKind, number][];
  /** Multipliers applied to enemies and hazards. */
  enemyHp: number;
  enemyDamage: number;
  bulletSpeed: number;
  scroll: number;
  current: number;
  boss: BossInfo | null;
  /** Boss strength (cycles harder after the fifth). */
  bossDifficulty: number;
  /** Is this a checkpoint you can start a later run from? */
  checkpoint: boolean;
}

export const DIFFICULTY: Record<Difficulty, { damageTaken: number; spawn: number; drain: number; label: string; desc: string }> = {
  relaxed: { damageTaken: 0.6, spawn: 0.8, drain: 0.7, label: 'Relaxed', desc: 'Softer hits, fewer creatures. For enjoying the worlds.' },
  normal: { damageTaken: 1, spawn: 1, drain: 1, label: 'Normal', desc: 'The intended balance.' },
  hard: { damageTaken: 1.35, spawn: 1.2, drain: 1.15, label: 'Hard', desc: 'Heavier hits and busier skies.' },
};

/** Boss every third level. The level after a boss starts a little easier (sawtooth curve). */
export const BOSS_EVERY = 3;
export const STORY_END_LEVEL = BOSS_EVERY * BOSSES.length; // 15

export function levelDef(n: number): LevelDef {
  const isBoss = n % BOSS_EVERY === 0;
  const bossIndex = isBoss ? (n / BOSS_EVERY - 1) % BOSSES.length : -1;
  const cycle = Math.floor((n - 1) / STORY_END_LEVEL);
  // Linear ramp across levels, minus a small dip right after each boss.
  const afterBoss = (n - 1) % BOSS_EVERY === 0 && n > 1 ? 0.92 : 1;
  const t = (n - 1) * afterBoss;
  const enemies: [EnemyKind, number][] = [
    ['urchin', 3],
    ['debris', 2],
  ];
  if (n >= 2) enemies.push(['mine', 1.6]);
  if (n >= 4) enemies.push(['jelly', 2.4]);
  if (n >= 5) enemies.push(['lanternfish', 2.2]);
  if (n >= 7) enemies.push(['puffer', 2]);
  return {
    n,
    duration: Math.min(95, 52 + n * 2.5),
    spawnRate: Math.min(2.4, 0.65 + t * 0.085),
    enemies,
    enemyHp: 1 + t * 0.07 + cycle * 0.5,
    enemyDamage: 1 + t * 0.035 + cycle * 0.2,
    bulletSpeed: Math.min(1.6, 1 + t * 0.025),
    scroll: Math.min(1.5, 1 + t * 0.03),
    current: n < 4 ? 0 : Math.min(0.8, (n - 3) * 0.06),
    boss: bossIndex >= 0 ? BOSSES[bossIndex] : null,
    bossDifficulty: 1 + cycle * 0.6 + (bossIndex >= 0 ? bossIndex * 0.08 : 0),
    checkpoint: (n - 1) % BOSS_EVERY === 0,
  };
}
