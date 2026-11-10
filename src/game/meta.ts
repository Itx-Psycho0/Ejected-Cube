import { BASE_STATS, type PlayerStats } from '../entities/Player';

export type UpgradeId = 'hull' | 'tank' | 'sonar' | 'cannon' | 'thrusters' | 'magnet' | 'lumen';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: (level: number) => string;
  costs: number[];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'hull', name: 'Reinforced Hull', desc: (l) => `Max hull ${100 + l * 15}`, costs: [4, 8, 14, 22, 32] },
  { id: 'tank', name: 'Oxygen Reserve', desc: (l) => `Max oxygen ${100 + l * 15}, drain −${l * 6}%`, costs: [4, 8, 14, 22, 32] },
  { id: 'sonar', name: 'Sonar Emitter', desc: (l) => `Shot damage +${l * 15}%`, costs: [5, 10, 16, 24, 34] },
  { id: 'cannon', name: 'Pulse Capacitor', desc: (l) => `Fire rate +${l * 10}%, ammo cap +${l * 10}`, costs: [5, 10, 16, 24, 34] },
  { id: 'thrusters', name: 'Burst Thrusters', desc: (l) => `Dash cooldown −${l * 12}%`, costs: [3, 7, 12, 18] },
  { id: 'magnet', name: 'Bio-Attractor', desc: (l) => (l ? `Always pull plankton within ${l * 30} m` : 'Pull nearby plankton'), costs: [6, 12, 20] },
  { id: 'lumen', name: 'Lumen Cells', desc: (l) => `Bioflare charges ${l * 20}% faster`, costs: [4, 9, 16] },
];

export type Upgrades = Record<UpgradeId, number>;
export const NO_UPGRADES: Upgrades = { hull: 0, tank: 0, sonar: 0, cannon: 0, thrusters: 0, magnet: 0, lumen: 0 };

export function statsFor(u: Upgrades): PlayerStats {
  const b = BASE_STATS;
  return {
    maxHull: b.maxHull + u.hull * 15,
    maxOxygen: b.maxOxygen + u.tank * 15,
    oxygenDrain: b.oxygenDrain * (1 - u.tank * 0.06),
    fireRate: b.fireRate * (1 + u.cannon * 0.1),
    damage: b.damage * (1 + u.sonar * 0.15),
    dashCooldown: b.dashCooldown * (1 - u.thrusters * 0.12),
    ammoRegen: b.ammoRegen * (1 + u.cannon * 0.1),
    maxAmmo: b.maxAmmo + u.cannon * 10,
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
  { id: 'ejected', name: 'Ejected', desc: 'Survive the station collapse and start your first ascent.' },
  { id: 'boss_warden', name: 'Vent Breaker', desc: 'Defeat the Thermal Warden.' },
  { id: 'boss_lantern', name: 'Lights Out', desc: 'Defeat The Lantern.' },
  { id: 'boss_chain', name: 'Broken Chain', desc: 'Defeat The Chain.' },
  { id: 'boss_kraken', name: 'Calamari', desc: 'Defeat the Kraken.' },
  { id: 'boss_leviathan', name: 'Leviathan Slayer', desc: 'Defeat the Leviathan.' },
  { id: 'surface', name: 'First Breath', desc: 'Reach the surface.' },
  { id: 'untouchable', name: 'Untouchable', desc: 'Defeat a boss without taking hull damage.' },
  { id: 'combo', name: 'Plankton Feast', desc: 'Reach a ×40 plankton combo.' },
  { id: 'pearls', name: 'Pearl Diver', desc: 'Collect 25 pearls in total.' },
  { id: 'dasher', name: 'Battering Ram', desc: 'Destroy 25 creatures by dashing through them.' },
  { id: 'flare', name: 'Supernova', desc: 'Destroy 8 creatures with a single Bioflare.' },
  { id: 'echo', name: 'Echolocation', desc: 'Reveal 60 hidden creatures with sonar pings.' },
  { id: 'deep_breath', name: 'Deep Breath', desc: 'Climb above 2,000 m in a single run.' },
  { id: 'daily', name: 'Daily Diver', desc: 'Finish a Daily Dive.' },
];
