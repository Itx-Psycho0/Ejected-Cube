import type { BossKind } from '../../game/zones';
import type { Boss } from './Boss';
import { Warden } from './Warden';
import { Lantern } from './Lantern';
import { Chain } from './Chain';
import { Kraken } from './Kraken';
import { Leviathan } from './Leviathan';

export type { Boss, BossContext, HitCircle } from './Boss';

export function createBoss(kind: BossKind, difficulty: number): Boss & { extras?: import('three').Object3D[] } {
  switch (kind) {
    case 'warden':
      return new Warden(difficulty);
    case 'lantern':
      return new Lantern(difficulty);
    case 'chain':
      return new Chain(difficulty);
    case 'kraken':
      return new Kraken(difficulty);
    case 'leviathan':
      return new Leviathan(difficulty);
  }
}
