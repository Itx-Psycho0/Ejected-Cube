import type { MusicMood } from '../audio/AudioEngine';

export type EnemyKind = 'urchin' | 'jelly' | 'mine' | 'lanternfish' | 'puffer' | 'debris';
export type BossKind = 'warden' | 'lantern' | 'chain' | 'kraken' | 'leviathan';

export interface ZoneDef {
  id: number;
  key: string;
  name: string;
  tagline: string;
  /** Depth in metres at the start and end of the zone. */
  depthStart: number;
  depthEnd: number;
  /** Seconds of travel at base speed before the boss appears. */
  duration: number;

  // --- look ---
  fog: number;
  fogDensity: number;
  waterTop: number;
  skyLight: number;
  groundLight: number;
  ambient: number;
  sun: number;
  sunColor: number;
  rays: number;
  caustics: number;
  snow: number;
  seabed: number;
  rock: number;
  accent: number;
  /** 0..1 how much the darkness hides enemies outside the floodlight. */
  darkness: number;

  // --- set dressing densities 0..1 ---
  kelp: number;
  coral: number;
  vents: number;
  fish: number;
  tubeWorms: number;

  // --- gameplay ---
  enemies: readonly (readonly [EnemyKind, number])[];
  /** Enemy spawns per second at the start of the zone (ramps up 60% by the end). */
  spawnRate: number;
  /** Strength of the horizontal current that pushes the pod. */
  current: number;
  boss: BossKind;
  bossName: string;
  bossTitle: string;
  mood: MusicMood;
}

const MINOR_PENTA = [0, 3, 5, 7, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MAJOR_PENTA = [0, 2, 4, 7, 9];

export const ZONES: readonly ZoneDef[] = [
  {
    id: 0,
    key: 'hadal',
    name: 'Hadal Trench',
    tagline: 'Nothing lives this deep. Something does anyway.',
    depthStart: 6000,
    depthEnd: 4000,
    duration: 70,
    fog: 0x061226,
    fogDensity: 0.0029,
    waterTop: 0x030b18,
    skyLight: 0x6a8ab8,
    groundLight: 0x050505,
    ambient: 1.15,
    sun: 0.35,
    sunColor: 0x4a6a9a,
    rays: 0,
    caustics: 0,
    snow: 1,
    seabed: 0x5e5a56,
    rock: 0x4e4a48,
    accent: 0xff7a2e,
    darkness: 1,
    kelp: 0,
    coral: 0,
    vents: 1,
    fish: 0,
    tubeWorms: 1,
    enemies: [
      ['debris', 3],
      ['urchin', 2],
      ['mine', 1.2],
    ],
    spawnRate: 0.75,
    current: 0,
    boss: 'warden',
    bossName: 'Thermal Warden',
    bossTitle: 'A crab the size of a submarine guards the vents',
    mood: { root: 49, scale: PHRYGIAN, bpm: 56, density: 0.18, cutoff: 650 },
  },
  {
    id: 1,
    key: 'abyssal',
    name: 'Abyssal Plain',
    tagline: 'Endless silt. Lights in the dark are never friendly.',
    depthStart: 4000,
    depthEnd: 2000,
    duration: 75,
    fog: 0x081c34,
    fogDensity: 0.0026,
    waterTop: 0x061733,
    skyLight: 0x6f9ad4,
    groundLight: 0x06070a,
    ambient: 1.2,
    sun: 0.45,
    sunColor: 0x5a80b8,
    rays: 0,
    caustics: 0,
    snow: 0.9,
    seabed: 0x605e68,
    rock: 0x4e4c58,
    accent: 0x2ef2c8,
    darkness: 0.85,
    kelp: 0.15,
    coral: 0,
    vents: 0.25,
    fish: 0,
    tubeWorms: 0.4,
    enemies: [
      ['urchin', 3],
      ['mine', 2],
      ['jelly', 1.2],
      ['lanternfish', 1],
    ],
    spawnRate: 0.95,
    current: 0,
    boss: 'lantern',
    bossName: 'The Lantern',
    bossTitle: 'Follow the light. Everyone who did is inside it',
    mood: { root: 55, scale: MINOR_PENTA, bpm: 62, density: 0.25, cutoff: 800 },
  },
  {
    id: 2,
    key: 'midnight',
    name: 'Midnight Zone',
    tagline: 'Every living thing here makes its own light.',
    depthStart: 2000,
    depthEnd: 1000,
    duration: 80,
    fog: 0x15123f,
    fogDensity: 0.0024,
    waterTop: 0x1a1250,
    skyLight: 0xa08cf0,
    groundLight: 0x0a0614,
    ambient: 1.25,
    sun: 0.55,
    sunColor: 0x8a78ff,
    rays: 0.05,
    caustics: 0,
    snow: 0.7,
    seabed: 0x5e5480,
    rock: 0x4c446c,
    accent: 0xb48cff,
    darkness: 0.65,
    kelp: 0.35,
    coral: 0.1,
    vents: 0,
    fish: 0.15,
    tubeWorms: 0.2,
    enemies: [
      ['jelly', 4],
      ['lanternfish', 3],
      ['urchin', 1],
      ['puffer', 0.6],
    ],
    spawnRate: 1.1,
    current: 0.25,
    boss: 'chain',
    bossName: 'The Chain',
    bossTitle: 'Forty metres of colony organism, and every link can sting',
    mood: { root: 58, scale: DORIAN, bpm: 68, density: 0.35, cutoff: 1100 },
  },
  {
    id: 3,
    key: 'twilight',
    name: 'Twilight Zone',
    tagline: 'The first sunlight in six kilometres. Do not get sentimental.',
    depthStart: 1000,
    depthEnd: 200,
    duration: 85,
    fog: 0x0f3456,
    fogDensity: 0.0022,
    waterTop: 0x1f5a8a,
    skyLight: 0x8ac0f0,
    groundLight: 0x0c1418,
    ambient: 1.15,
    sun: 1.0,
    sunColor: 0x9cc8ff,
    rays: 0.55,
    caustics: 0.2,
    snow: 0.45,
    seabed: 0x6e7e88,
    rock: 0x5a6870,
    accent: 0x6fd2ff,
    darkness: 0.35,
    kelp: 0.7,
    coral: 0.35,
    vents: 0,
    fish: 0.55,
    tubeWorms: 0,
    enemies: [
      ['lanternfish', 3],
      ['puffer', 2],
      ['jelly', 2],
      ['mine', 1.4],
    ],
    spawnRate: 1.25,
    current: 0.55,
    boss: 'kraken',
    bossName: 'Kraken',
    bossTitle: 'Eight arms, two hearts, and a grudge',
    mood: { root: 62, scale: DORIAN, bpm: 74, density: 0.45, cutoff: 1700 },
  },
  {
    id: 4,
    key: 'sunlit',
    name: 'Sunlit Shelf',
    tagline: 'Two hundred metres to air. Something big does not want you to leave.',
    depthStart: 200,
    depthEnd: 40,
    duration: 90,
    fog: 0x10627e,
    fogDensity: 0.0021,
    waterTop: 0x4fc3d8,
    skyLight: 0xbff0ff,
    groundLight: 0x2a3a2a,
    ambient: 1.0,
    sun: 2.4,
    sunColor: 0xfff1d0,
    rays: 1,
    caustics: 1,
    snow: 0.25,
    seabed: 0xc2b38a,
    rock: 0x7a7468,
    accent: 0xffc35a,
    darkness: 0,
    kelp: 1,
    coral: 1,
    vents: 0,
    fish: 1,
    tubeWorms: 0,
    enemies: [
      ['puffer', 3],
      ['lanternfish', 2],
      ['mine', 2],
      ['debris', 1],
      ['jelly', 1],
    ],
    spawnRate: 1.4,
    current: 0.8,
    boss: 'leviathan',
    bossName: 'Leviathan',
    bossTitle: 'The station was built to study it. It remembers',
    mood: { root: 65, scale: LYDIAN, bpm: 82, density: 0.55, cutoff: 2600 },
  },
];

export const SURFACE_MOOD: MusicMood = { root: 65, scale: MAJOR_PENTA, bpm: 70, density: 0.5, cutoff: 5000 };
export const MENU_MOOD: MusicMood = { root: 52, scale: MINOR_PENTA, bpm: 52, density: 0.2, cutoff: 700 };

export function depthAt(zone: ZoneDef, progress: number) {
  return zone.depthStart + (zone.depthEnd - zone.depthStart) * progress;
}
