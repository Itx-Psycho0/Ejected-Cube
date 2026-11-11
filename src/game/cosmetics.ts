/** Hangar options for the cube. Everything is cosmetic. */

export interface Swatch {
  id: string;
  name: string;
  hex: string;
  cost: number;
}

export const HULL_COLORS: Swatch[] = [
  { id: 'signal', name: 'Signal orange', hex: '#e8792a', cost: 0 },
  { id: 'bone', name: 'Bone', hex: '#e9e4d8', cost: 0 },
  { id: 'fern', name: 'Fern', hex: '#4f7f52', cost: 0 },
  { id: 'harbor', name: 'Harbour blue', hex: '#2f5f8a', cost: 4 },
  { id: 'coral', name: 'Coral', hex: '#e86a5c', cost: 4 },
  { id: 'mustard', name: 'Mustard', hex: '#d9a521', cost: 4 },
  { id: 'plum', name: 'Plum', hex: '#6e3f6e', cost: 6 },
  { id: 'graphite', name: 'Graphite', hex: '#33363b', cost: 6 },
  { id: 'mint', name: 'Mint', hex: '#8fd3b8', cost: 6 },
  { id: 'rose', name: 'Rose quartz', hex: '#e9b3c2', cost: 8 },
  { id: 'teal', name: 'Deep teal', hex: '#1f6f6b', cost: 8 },
  { id: 'gold', name: 'Brass', hex: '#b8893a', cost: 12 },
];

export const ACCENT_COLORS: Swatch[] = [
  { id: 'ink', name: 'Ink', hex: '#1b1b1b', cost: 0 },
  { id: 'cream', name: 'Cream', hex: '#f2ead8', cost: 0 },
  { id: 'yellow', name: 'Hazard yellow', hex: '#f2c230', cost: 0 },
  { id: 'red', name: 'Red', hex: '#c8352c', cost: 3 },
  { id: 'sky', name: 'Sky', hex: '#7fb5e6', cost: 3 },
  { id: 'lime', name: 'Lime', hex: '#a6d65a', cost: 3 },
];

export interface Option {
  id: string;
  name: string;
  cost: number;
}

export const PATTERNS: Option[] = [
  { id: 'hazard', name: 'Hazard band', cost: 0 },
  { id: 'plain', name: 'Plain', cost: 0 },
  { id: 'stripe', name: 'Racing stripe', cost: 3 },
  { id: 'checker', name: 'Checker', cost: 5 },
  { id: 'panels', name: 'Panels', cost: 4 },
  { id: 'camo', name: 'Splotch', cost: 6 },
  { id: 'dots', name: 'Polka', cost: 5 },
];

export const SHAPES: Option[] = [
  { id: 'rounded', name: 'Rounded', cost: 0 },
  { id: 'sharp', name: 'Sharp', cost: 4 },
  { id: 'soft', name: 'Pebble', cost: 6 },
];

export const TRAILS: Option[] = [
  { id: 'bubbles', name: 'Bubbles', cost: 0 },
  { id: 'sparkle', name: 'Sparkle', cost: 4 },
  { id: 'confetti', name: 'Confetti', cost: 6 },
  { id: 'ink', name: 'Ink drops', cost: 6 },
  { id: 'none', name: 'Off', cost: 0 },
];

export const LIGHTS: Swatch[] = [
  { id: 'warm', name: 'Warm', hex: '#fff0d8', cost: 0 },
  { id: 'cool', name: 'Cool', hex: '#d8ecff', cost: 0 },
  { id: 'mint', name: 'Mint', hex: '#c8ffe8', cost: 3 },
  { id: 'rose', name: 'Rose', hex: '#ffd6e4', cost: 3 },
  { id: 'amber', name: 'Amber', hex: '#ffc477', cost: 3 },
];

export interface Loadout {
  color: string;
  accent: string;
  pattern: string;
  shape: string;
  trail: string;
  light: string;
  callsign: string;
  cage: boolean;
}

export const DEFAULT_LOADOUT: Loadout = {
  color: 'signal',
  accent: 'yellow',
  pattern: 'hazard',
  shape: 'rounded',
  trail: 'bubbles',
  light: 'warm',
  callsign: 'EC-07',
  cage: true,
};

export function costOf(group: string, id: string): number {
  const list: (Swatch | Option)[] =
    group === 'color' ? HULL_COLORS : group === 'accent' ? ACCENT_COLORS : group === 'pattern' ? PATTERNS : group === 'shape' ? SHAPES : group === 'trail' ? TRAILS : LIGHTS;
  return list.find((x) => x.id === id)?.cost ?? 0;
}

export const hexOf = (list: Swatch[], id: string) => list.find((x) => x.id === id)?.hex ?? list[0].hex;
