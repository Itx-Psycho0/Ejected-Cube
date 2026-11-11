import { NO_UPGRADES, type Upgrades } from './meta';
import type { QualityLevel } from '../core/Quality';
import type { Difficulty } from './levels';
import type { ThemeId } from '../themes/themes';
import { THEME_IDS } from '../themes/themes';
import { starterMissions, type Mission, type MissionKind } from './missions';
import { DEFAULT_LOADOUT, type Loadout } from './cosmetics';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  quality: 'auto' | QualityLevel;
  shake: boolean;
  reducedMotion: boolean;
  showFps: boolean;
  hints: boolean;
  difficulty: Difficulty;
  /** Worlds that can appear when the game picks one at random. */
  themePool: ThemeId[];
  /** 'random', or one world to always use. */
  lockTheme: 'random' | ThemeId;
  /** Interface follows the current world, or stays on one look. */
  uiFollowsWorld: boolean;
  hudScale: number;
  control: 'follow' | 'keys';
  voice: number;
}

export interface RunRecord {
  score: number;
  level: number;
  daily: boolean;
  date: string;
  worlds: number;
}

export interface SaveData {
  version: 2;
  settings: Settings;
  shards: number;
  upgrades: Upgrades;
  achievements: string[];
  stats: {
    runs: number;
    deaths: number;
    kills: number;
    bosses: number;
    victories: number;
    shardsTotal: number;
    sparks: number;
    dashKills: number;
    reveals: number;
    seconds: number;
    flares: number;
    powerups: number;
  };
  best: { score: number; level: number };
  /** Highest level ever reached; unlocks checkpoints. */
  highestLevel: number;
  runs: RunRecord[];
  daily: { date: string; best: number };
  missions: Mission[];
  missionTiers: Partial<Record<MissionKind, number>>;
  owned: string[];
  loadout: Loadout;
  worldsSeen: ThemeId[];
  /** Bumped when new worlds are added, so they join existing rotation pools. */
  worldsVersion: number;
  storySeen: boolean;
  tutorialDone: boolean;
  coachDone: boolean;
}

const KEY = 'ejected-cube:save:v2';
const OLD_KEY = 'ejected-cube:save:v1';

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  quality: 'auto',
  shake: true,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  showFps: false,
  hints: true,
  difficulty: 'normal',
  themePool: [...THEME_IDS],
  lockTheme: 'random',
  uiFollowsWorld: true,
  hudScale: 1,
  control: 'follow',
  voice: 0.9,
};

function fresh(): SaveData {
  return {
    version: 2,
    settings: { ...DEFAULT_SETTINGS, themePool: [...THEME_IDS] },
    shards: 0,
    upgrades: { ...NO_UPGRADES },
    achievements: [],
    stats: { runs: 0, deaths: 0, kills: 0, bosses: 0, victories: 0, shardsTotal: 0, sparks: 0, dashKills: 0, reveals: 0, seconds: 0, flares: 0, powerups: 0 },
    best: { score: 0, level: 0 },
    highestLevel: 1,
    runs: [],
    daily: { date: '', best: 0 },
    missions: starterMissions(),
    missionTiers: {},
    owned: [],
    loadout: { ...DEFAULT_LOADOUT },
    worldsSeen: [],
    worldsVersion: 3,
    storySeen: false,
    tutorialDone: false,
    coachDone: false,
  };
}

function read(key: string) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Persistent progress in localStorage, with an in-memory fallback. */
export class Save {
  data: SaveData;

  constructor() {
    const f = fresh();
    const p = read(KEY) as Partial<SaveData> | null;
    if (p) {
      this.data = {
        ...f,
        ...p,
        settings: { ...f.settings, ...p.settings },
        upgrades: { ...f.upgrades, ...p.upgrades },
        stats: { ...f.stats, ...p.stats },
        best: { ...f.best, ...p.best },
        daily: { ...f.daily, ...p.daily },
        loadout: { ...f.loadout, ...p.loadout },
        missions: p.missions?.length === 3 ? p.missions : f.missions,
      };
      if (!this.data.settings.themePool?.length) this.data.settings.themePool = [...THEME_IDS];
      if ((p.worldsVersion ?? 1) < 3) {
        for (const id of ['orbit', 'autumn', 'ember', 'lagoon', 'nebula'] as ThemeId[]) if (!this.data.settings.themePool.includes(id)) this.data.settings.themePool.push(id);
        this.data.worldsVersion = 3;
        // The controls changed in this version, so offer the tutorial again.
        this.data.tutorialDone = false;
      }
    } else {
      this.data = f;
      // Carry pearls and upgrades over from the first version of the game.
      const old = read(OLD_KEY) as { pearls?: number; upgrades?: Upgrades } | null;
      if (old) {
        this.data.shards = old.pearls ?? 0;
        this.data.upgrades = { ...f.upgrades, ...old.upgrades };
        this.data.storySeen = false;
      }
    }
  }

  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore quota / privacy mode */
    }
  }

  unlock(id: string): boolean {
    if (this.data.achievements.includes(id)) return false;
    this.data.achievements.push(id);
    this.write();
    return true;
  }

  recordRun(r: RunRecord) {
    this.data.runs.push(r);
    this.data.runs.sort((a, b) => b.score - a.score);
    this.data.runs = this.data.runs.slice(0, 10);
    if (r.score > this.data.best.score) this.data.best.score = r.score;
    if (r.level > this.data.best.level) this.data.best.level = r.level;
    this.write();
  }

  reset() {
    const settings = this.data.settings;
    this.data = fresh();
    this.data.settings = settings;
    this.data.storySeen = true;
    this.write();
  }
}
