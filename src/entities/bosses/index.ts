import type { BossKind } from '../../game/levels';
import type { Object3D } from 'three';
import type { Boss } from './Boss';
import { Warden } from './Warden';
import { Lantern } from './Lantern';
import { Chain, CHAIN_SKINS } from './Chain';
import { Kraken } from './Kraken';
import { Leviathan } from './Leviathan';
import { Storm, Zeppelin } from './SkyBosses';
import { Core, Dreadnought } from './SpaceBosses';

export type { Boss, BossContext, HitCircle } from './Boss';

export function createBoss(kind: BossKind, difficulty: number): Boss & { extras?: Object3D[] } {
  switch (kind) {
    case 'warden':
      return new Warden(difficulty);
    case 'lantern':
      return new Lantern(difficulty);
    case 'chain':
      return new Chain(difficulty, CHAIN_SKINS.water);
    case 'kraken':
      return new Kraken(difficulty);
    case 'leviathan':
      return new Leviathan(difficulty);
    case 'storm':
      return new Storm(difficulty);
    case 'zeppelin':
      return new Zeppelin(difficulty);
    case 'dragon':
      return new Chain(difficulty, CHAIN_SKINS.sky);
    case 'core':
      return new Core(difficulty);
    case 'dreadnought':
      return new Dreadnought(difficulty);
    case 'wyrm':
      return new Chain(difficulty, CHAIN_SKINS.space);
  }
}
