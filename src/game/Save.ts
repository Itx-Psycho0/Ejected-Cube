import { NO_UPGRADES, type Upgrades } from './meta';
import type { QualityLevel } from '../core/Quality';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  quality: 'auto' | QualityLevel;
  shake: boolean;
  reducedMotion: boolean;
  showFps: boolean;
  hints: boolean;
}

export interface RunRecord {
  score: number;
  depth: number;
  zone: number;
  daily: boolean;
  date: string;
  victory: boolean;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  pearls: number;
  upgrades: Upgrades;
  achievements: string[];
  stats: {
    runs: number;
    deaths: number;
    kills: number;
    bosses: number;
    victories: number;
    pearlsTotal: number;
    plankton: number;
    dashKills: number;
    reveals: number;
    seconds: number;
  };
  best: { score: number; depth: number };
  runs: RunRecord[];
  daily: { date: string; best: number };
  tutorialSeen: boolean;
}

const KEY = 'ejected-cube:save:v1';

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  quality: 'auto',
  shake: true,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  showFps: false,
  hints: true,
};

function fresh(): SaveData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    pearls: 0,
    upgrades: { ...NO_UPGRADES },
    achievements: [],
    stats: { runs: 0, deaths: 0, kills: 0, bosses: 0, victories: 0, pearlsTotal: 0, plankton: 0, dashKills: 0, reveals: 0, seconds: 0 },
    best: { score: 0, depth: 6000 },
    runs: [],
    daily: { date: '', best: 0 },
    tutorialSeen: false,
  };
}

/**
 * Persistent progress in localStorage. Every access is guarded: private
 * windows and blocked storage simply fall back to an in-memory save.
 */
export class Save {
  data: SaveData;

  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        const f = fresh();
        this.data = {
          ...f,
          ...parsed,
          settings: { ...f.settings, ...parsed.settings },
          upgrades: { ...f.upgrades, ...parsed.upgrades },
          stats: { ...f.stats, ...parsed.stats },
          best: { ...f.best, ...parsed.best },
          daily: { ...f.daily, ...parsed.daily },
        };
      }
    } catch {
      /* storage unavailable: keep the fresh save */
    }
  }

  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore quota / privacy mode */
    }
  }

  /** Returns true the first time an achievement is unlocked. */
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
    if (r.depth < this.data.best.depth) this.data.best.depth = r.depth;
    this.write();
  }

  reset() {
    const settings = this.data.settings;
    this.data = fresh();
    this.data.settings = settings;
    this.write();
  }
}
