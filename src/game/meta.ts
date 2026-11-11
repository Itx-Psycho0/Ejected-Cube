import { BASE_STATS, type PlayerStats } from '../entities/Player';

export type UpgradeId = 'hull' | 'tank' | 'sonar' | 'cannon' | 'thrusters' | 'magnet' | 'lumen';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: (level: number) => string;
  costs: number[];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'hull', name: 'Bigger Core', desc: (l) => `Max energy ${100 + l * 15}`, costs: [4, 8, 14, 22, 32] },
  { id: 'tank', name: 'Efficient Engine', desc: (l) => `Energy burn −${l * 8}%`, costs: [4, 8, 14, 22, 32] },
  { id: 'sonar', name: 'Brighter Bolts', desc: (l) => `Shot damage +${l * 15}%`, costs: [5, 10, 16, 24, 34] },
  { id: 'cannon', name: 'Quick Trigger', desc: (l) => `Fire rate +${l * 10}%`, costs: [5, 10, 16, 24, 34] },
  { id: 'thrusters', name: 'Nimble Fins', desc: (l) => `Dodge recharges ${l * 12}% faster`, costs: [3, 7, 12, 18] },
  { id: 'magnet', name: 'Attractor', desc: (l) => (l ? `Always pull pickups within ${l * 30} m` : 'Pull nearby pickups'), costs: [6, 12, 20] },
  { id: 'lumen', name: 'Flare Cells', desc: (l) => `Flare charges ${l * 20}% faster`, costs: [4, 9, 16] },
];

export type Upgrades = Record<UpgradeId, number>;
export const NO_UPGRADES: Upgrades = { hull: 0, tank: 0, sonar: 0, cannon: 0, thrusters: 0, magnet: 0, lumen: 0 };

export function statsFor(u: Upgrades): PlayerStats {
  const b = BASE_STATS;
  return {
    maxEnergy: b.maxEnergy + u.hull * 15,
    drain: b.drain * (1 - u.tank * 0.08),
    fireRate: b.fireRate * (1 + u.cannon * 0.1),
    damage: b.damage * (1 + u.sonar * 0.15),
    dodgeCooldown: b.dodgeCooldown * (1 - u.thrusters * 0.12),
    magnetRadius: u.magnet * 30,
  };
}

export const lumenGain = (u: Upgrades) => 1 + u.lumen * 0.2;

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'ejected', name: 'Ejected', desc: 'Leave the Atlas Engine and fly your first page.' },
  { id: 'boss_first', name: 'Blot Breaker', desc: 'Defeat your first boss.' },
  { id: 'boss_water', name: 'Deep Trouble', desc: 'Defeat a boss underwater.' },
  { id: 'boss_sky', name: 'Clear Skies', desc: 'Defeat a boss in the sky.' },
  { id: 'boss_space', name: 'Star Struck', desc: 'Defeat a boss in space.' },
  { id: 'surface', name: 'Rewritten', desc: 'Return to the Atlas Engine (finish level 15).' },
  { id: 'untouchable', name: 'Untouchable', desc: 'Defeat a boss without taking damage.' },
  { id: 'combo', name: 'Bright Idea', desc: 'Reach a ×40 spark combo.' },
  { id: 'pearls', name: 'Shard Collector', desc: 'Collect 25 shards in total.' },
  { id: 'dasher', name: 'Battering Ram', desc: 'Ram 25 creatures with a dodge roll.' },
  { id: 'flare', name: 'Supernova', desc: 'Destroy 8 creatures with a single Bioflare.' },
  { id: 'echo', name: 'Close Shave', desc: 'Dodge 60 times.' },
  { id: 'deep_breath', name: 'Page Turner', desc: 'Visit every world.' },
  { id: 'daily', name: 'Daily Page', desc: 'Finish a Daily run.' },
  { id: 'tourist', name: 'Well Travelled', desc: 'Visit five different worlds in one run.' },
  { id: 'stylist', name: 'Personal Touch', desc: 'Buy something in the hangar.' },
];
