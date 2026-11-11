import type { MusicMood } from '../audio/AudioEngine';

/**
 * A theme is one "page" of the Atlas: a complete look for the world,
 * the creatures, the post-processing and the interface. Gameplay never
 * reads anything in here except `world.darkness`.
 */

export type ThemeId = 'abyss' | 'paper' | 'tech' | 'sketch' | 'summer' | 'brick' | 'clay' | 'ink' | 'mesa' | 'glacier';
export type MaterialStyle = 'pbr' | 'toon' | 'flat' | 'plastic' | 'clay';
export type PropSet = ThemeId;
export type GroundTexture = 'sand' | 'paper' | 'tiles' | 'studs' | 'snow' | 'clay';
export type PanelStyle = 'glass' | 'paper' | 'card' | 'chunky' | 'line';

export interface ThemeWorld {
  fog: number;
  fogDensity: number;
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  sunColor: number;
  sun: number;
  /** Elevation of the visible sun disc, 0 = horizon. -1 hides it. */
  sunDisc: number;
  skyLight: number;
  groundLight: number;
  ambient: number;
  rays: number;
  caustics: number;
  aurora: number;
  /** 0..1: how much the dark hides creatures (floodlight + pulse matter). */
  darkness: number;
  ground: number;
  groundAlt: number;
  groundTexture: GroundTexture;
  groundRoughness: number;
  /** Terrain shape multipliers. */
  hills: number;
  ridges: number;
}

export interface ThemeProps {
  /** Colours picked at random for each prop slot. */
  tall: number[];
  cluster: number[];
  small: [number, number];
  rock: number[];
  special: number;
  density: { tall: number; cluster: number; small: number; rocks: number; special: number };
  sway: number;
  clouds: { count: number; color: number; opacity: number; flat: boolean; height: number };
  flock: 'fish' | 'birds' | 'drones' | 'none';
  flockColors: number[];
  giant: boolean;
}

export interface ThemeParticles {
  color: number;
  size: number;
  /** Units per second downward (negative rises). */
  fall: number;
  drift: number;
  square: boolean;
  additive: boolean;
  opacity: number;
}

export interface ThemeFx {
  bloom: number;
  bloomThreshold: number;
  outline: number;
  outlineColor: number;
  posterize: number;
  hatch: number;
  paper: number;
  ink: number;
  saturation: number;
  contrast: number;
  vignette: number;
  grain: number;
  chromatic: boolean;
}

export interface ThemeUi {
  bg: string;
  panel: string;
  panelSolid: string;
  ink: string;
  muted: string;
  accent: string;
  accentInk: string;
  accent2: string;
  line: string;
  danger: string;
  good: string;
  radius: string;
  border: string;
  shadow: string;
  display: string;
  body: string;
  numeric: string;
  panelStyle: PanelStyle;
  /** Letter case + tracking for labels. */
  labelCase: 'uppercase' | 'none';
  labelTracking: string;
  titleWeight: number;
  /** HUD text sits on the 3D world, so it needs its own contrast colour. */
  hudInk: string;
  hudShadow: string;
}

export interface ThemeDef {
  id: ThemeId;
  name: string;
  /** One line of story for the world's title card. */
  line: string;
  material: MaterialStyle;
  world: ThemeWorld;
  props: ThemeProps;
  particles: ThemeParticles;
  fx: ThemeFx;
  ui: ThemeUi;
  mood: MusicMood;
  /** Lowpass on the ambience bed (low = underwater, high = open air). */
  ambience: number;
  /** Floodlight visibility 0..1. */
  beam: number;
  swatches: string[];
}

const PENTA = [0, 2, 4, 7, 9];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const HIRAJOSHI = [0, 2, 3, 7, 8];

const body = "'Nunito Sans Variable', 'Segoe UI', system-ui, sans-serif";

export const THEMES: Record<ThemeId, ThemeDef> = {
  abyss: {
    id: 'abyss',
    name: 'Abyssal Trench',
    line: 'Six kilometres of black water. Things down here make their own light.',
    material: 'pbr',
    world: {
      fog: 0x061226,
      fogDensity: 0.0029,
      skyTop: 0x0d2a44,
      skyHorizon: 0x061428,
      skyBottom: 0x030a14,
      sunColor: 0x5a80b8,
      sun: 0.45,
      sunDisc: -1,
      skyLight: 0x6a8ab8,
      groundLight: 0x050505,
      ambient: 1.15,
      rays: 0.15,
      caustics: 0,
      aurora: 0,
      darkness: 1,
      ground: 0x5e5a56,
      groundAlt: 0x4e4a48,
      groundTexture: 'sand',
      groundRoughness: 1,
      hills: 1,
      ridges: 1,
    },
    props: {
      tall: [0x6f8a32, 0x8a9a36, 0x557a38],
      cluster: [0xff6f91, 0xff9a5a, 0xc77dff, 0xffd166, 0x5ee6c9],
      small: [0xe8e2d4, 0xd8182f],
      rock: [0x4e4a48, 0x5e5a56],
      special: 0xff6a1a,
      density: { tall: 0.25, cluster: 0.2, small: 1, rocks: 1, special: 1 },
      sway: 2.6,
      clouds: { count: 0, color: 0, opacity: 0, flat: false, height: 0 },
      flock: 'fish',
      flockColors: [0xc8d6e5, 0x9ad1ff, 0xffd166],
      giant: true,
    },
    particles: { color: 0xbfd8ee, size: 1, fall: 4, drift: 0, square: false, additive: true, opacity: 1 },
    fx: { bloom: 1.3, bloomThreshold: 0.62, outline: 0, outlineColor: 0x000000, posterize: 0, hatch: 0, paper: 0, ink: 0, saturation: 1, contrast: 1, vignette: 0.72, grain: 0.07, chromatic: true },
    ui: {
      bg: '#06121f',
      panel: 'rgba(10, 30, 44, 0.72)',
      panelSolid: '#0c2232',
      ink: '#dfeae6',
      muted: '#8fa8a4',
      accent: '#7fd1b9',
      accentInk: '#06121f',
      accent2: '#e8b06a',
      line: 'rgba(143, 200, 190, 0.22)',
      danger: '#ef8a7a',
      good: '#7fd1b9',
      radius: '10px',
      border: '1px',
      shadow: '0 24px 60px rgba(0,0,0,.4)',
      display: "'Bricolage Grotesque Variable', 'Segoe UI', sans-serif",
      body,
      numeric: "'IBM Plex Mono', ui-monospace, monospace",
      panelStyle: 'glass',
      labelCase: 'uppercase',
      labelTracking: '0.16em',
      titleWeight: 800,
      hudInk: '#eef6f3',
      hudShadow: '0 1px 3px rgba(0,0,0,.7)',
    },
    mood: { root: 52, scale: PHRYGIAN, bpm: 58, density: 0.2, cutoff: 750 },
    ambience: 380,
    beam: 1,
    swatches: ['#061226', '#0d2a44', '#7fd1b9', '#e8b06a', '#ff9a5a'],
  },

  paper: {
    id: 'paper',
    name: 'Paper Sky',
    line: 'Folded hills and cut-out clouds. Mind the creases.',
    material: 'flat',
    world: {
      fog: 0xe9dcc6,
      fogDensity: 0.0016,
      skyTop: 0x8fbfe0,
      skyHorizon: 0xf2d9b8,
      skyBottom: 0xe9dcc6,
      sunColor: 0xfff1d8,
      sun: 2.2,
      sunDisc: 0.18,
      skyLight: 0xfff6e8,
      groundLight: 0x8a9a70,
      ambient: 1.4,
      rays: 0,
      caustics: 0,
      aurora: 0,
      darkness: 0,
      ground: 0xb9c98f,
      groundAlt: 0x8fa26a,
      groundTexture: 'paper',
      groundRoughness: 1,
      hills: 1.3,
      ridges: 0.7,
    },
    props: {
      tall: [0x5c8a4a, 0x7aa35a, 0x3f6e46],
      cluster: [0xe4572e, 0xf3a712, 0x29335c, 0x669bbc, 0xf2efe6],
      small: [0x5c8a4a, 0xe4572e],
      rock: [0xc9b79c, 0xb3a184],
      special: 0xf3a712,
      density: { tall: 0.6, cluster: 0.5, small: 0.6, rocks: 0.5, special: 0 },
      sway: 0.25,
      clouds: { count: 14, color: 0xfbf7ee, opacity: 1, flat: true, height: 70 },
      flock: 'birds',
      flockColors: [0xf2efe6, 0xe4572e],
      giant: false,
    },
    particles: { color: 0xf2efe6, size: 2.2, fall: 6, drift: -8, square: true, additive: false, opacity: 0.7 },
    fx: { bloom: 0.25, bloomThreshold: 0.9, outline: 0.55, outlineColor: 0x29335c, posterize: 0, hatch: 0, paper: 0.8, ink: 0, saturation: 0.95, contrast: 1.02, vignette: 0.35, grain: 0.03, chromatic: false },
    ui: {
      bg: '#e5d9c3',
      panel: 'rgba(243, 236, 222, 0.94)',
      panelSolid: '#f3ecde',
      ink: '#29335c',
      muted: '#6b6f86',
      accent: '#e4572e',
      accentInk: '#fffaf2',
      accent2: '#f3a712',
      line: 'rgba(41, 51, 92, 0.22)',
      danger: '#c23b22',
      good: '#4f8a3c',
      radius: '4px',
      border: '1.5px',
      shadow: '3px 4px 0 rgba(41,51,92,.18)',
      display: "'Patrick Hand', 'Comic Sans MS', cursive",
      body,
      numeric: "'Patrick Hand', cursive",
      panelStyle: 'paper',
      labelCase: 'none',
      labelTracking: '0.02em',
      titleWeight: 400,
      hudInk: '#29335c',
      hudShadow: '0 1px 0 rgba(255,250,240,.9)',
    },
    mood: { root: 65, scale: PENTA, bpm: 84, density: 0.45, cutoff: 4200 },
    ambience: 2400,
    beam: 0,
    swatches: ['#e5d9c3', '#8fbfe0', '#e4572e', '#f3a712', '#29335c'],
  },

  tech: {
    id: 'tech',
    name: 'Clean Room',
    line: 'A laboratory the size of a continent. Everything here was built to be measured.',
    material: 'pbr',
    world: {
      fog: 0xdfe3e6,
      fogDensity: 0.0019,
      skyTop: 0xc7cdd2,
      skyHorizon: 0xeef0f1,
      skyBottom: 0xdfe3e6,
      sunColor: 0xffffff,
      sun: 1.8,
      sunDisc: -1,
      skyLight: 0xffffff,
      groundLight: 0x9aa0a6,
      ambient: 1.2,
      rays: 0,
      caustics: 0,
      aurora: 0,
      darkness: 0,
      ground: 0xe4e7ea,
      groundAlt: 0xb9bfc5,
      groundTexture: 'tiles',
      groundRoughness: 0.45,
      hills: 0.25,
      ridges: 1.1,
    },
    props: {
      tall: [0xf2f3f4, 0xd5d9dd],
      cluster: [0xf2f3f4, 0x2b2f33, 0xd5d9dd],
      small: [0x8a9096, 0xff6b1a],
      rock: [0xcfd4d8, 0xb9bfc5],
      special: 0xff6b1a,
      density: { tall: 0.55, cluster: 0.45, small: 0.5, rocks: 0.6, special: 1 },
      sway: 0,
      clouds: { count: 0, color: 0, opacity: 0, flat: false, height: 0 },
      flock: 'drones',
      flockColors: [0x2b2f33, 0xf2f3f4],
      giant: false,
    },
    particles: { color: 0xff8a3a, size: 1.3, fall: -3, drift: 0, square: true, additive: true, opacity: 0.6 },
    fx: { bloom: 0.8, bloomThreshold: 0.85, outline: 0.15, outlineColor: 0x5a6068, posterize: 0, hatch: 0, paper: 0, ink: 0, saturation: 0.9, contrast: 1.05, vignette: 0.3, grain: 0.03, chromatic: false },
    ui: {
      bg: '#e9ecee',
      panel: 'rgba(250, 251, 252, 0.8)',
      panelSolid: '#fafbfc',
      ink: '#1f2328',
      muted: '#6a737d',
      accent: '#ff6b1a',
      accentInk: '#ffffff',
      accent2: '#2b2f33',
      line: 'rgba(31, 35, 40, 0.14)',
      danger: '#d1242f',
      good: '#1a7f37',
      radius: '2px',
      border: '1px',
      shadow: '0 1px 2px rgba(0,0,0,.06), 0 12px 32px rgba(0,0,0,.08)',
      display: "'Sora Variable', 'Segoe UI', sans-serif",
      body: "'Sora Variable', 'Segoe UI', sans-serif",
      numeric: "'IBM Plex Mono', ui-monospace, monospace",
      panelStyle: 'glass',
      labelCase: 'uppercase',
      labelTracking: '0.14em',
      titleWeight: 600,
      hudInk: '#1f2328',
      hudShadow: '0 1px 0 rgba(255,255,255,.8)',
    },
    mood: { root: 55, scale: LYDIAN, bpm: 96, density: 0.55, cutoff: 3200 },
    ambience: 1800,
    beam: 0,
    swatches: ['#e9ecee', '#fafbfc', '#ff6b1a', '#2b2f33', '#9aa0a6'],
  },

  sketch: {
    id: 'sketch',
    name: 'Sketchbook',
    line: 'An unfinished page. Everything is still being drawn, including you.',
    material: 'toon',
    world: {
      fog: 0xf7f5ef,
      fogDensity: 0.0017,
      skyTop: 0xf7f5ef,
      skyHorizon: 0xf7f5ef,
      skyBottom: 0xf7f5ef,
      sunColor: 0xffffff,
      sun: 2.2,
      sunDisc: -1,
      skyLight: 0xffffff,
      groundLight: 0x777777,
      ambient: 1.1,
      rays: 0,
      caustics: 0,
      aurora: 0,
      darkness: 0,
      ground: 0xeeeeee,
      groundAlt: 0xcccccc,
      groundTexture: 'paper',
      groundRoughness: 1,
      hills: 1.1,
      ridges: 1,
    },
    props: {
      tall: [0xdddddd, 0xeeeeee],
      cluster: [0xdddddd, 0xbbbbbb, 0xeeeeee],
      small: [0xcccccc, 0x2f6fde],
      rock: [0xcfcfcf, 0xb5b5b5],
      special: 0x2f6fde,
      density: { tall: 0.6, cluster: 0.45, small: 0.5, rocks: 0.6, special: 0 },
      sway: 0.3,
      clouds: { count: 10, color: 0xffffff, opacity: 1, flat: false, height: 70 },
      flock: 'birds',
      flockColors: [0x444444],
      giant: false,
    },
    particles: { color: 0x555566, size: 0.9, fall: 3, drift: -4, square: true, additive: false, opacity: 0.35 },
    fx: { bloom: 0, bloomThreshold: 1, outline: 1, outlineColor: 0x22223a, posterize: 0, hatch: 1, paper: 0.6, ink: 0, saturation: 1, contrast: 1, vignette: 0.15, grain: 0.02, chromatic: false },
    ui: {
      bg: '#f7f5ef',
      panel: 'rgba(251, 250, 245, 0.96)',
      panelSolid: '#fbfaf5',
      ink: '#22223a',
      muted: '#6d6d80',
      accent: '#2f6fde',
      accentInk: '#ffffff',
      accent2: '#22223a',
      line: 'rgba(34, 34, 58, 0.55)',
      danger: '#c8352c',
      good: '#2e7d4f',
      radius: '0px',
      border: '1.5px',
      shadow: 'none',
      display: "'Architects Daughter', 'Comic Sans MS', cursive",
      body: "'Architects Daughter', 'Comic Sans MS', cursive",
      numeric: "'Architects Daughter', cursive",
      panelStyle: 'line',
      labelCase: 'none',
      labelTracking: '0.02em',
      titleWeight: 400,
      hudInk: '#22223a',
      hudShadow: 'none',
    },
    mood: { root: 62, scale: MAJOR, bpm: 72, density: 0.35, cutoff: 3600 },
    ambience: 2600,
    beam: 0,
    swatches: ['#fbfaf5', '#22223a', '#2f6fde', '#cccccc', '#6d6d80'],
  },

  summer: {
    id: 'summer',
    name: 'Summer Sky',
    line: 'Cicadas, power lines and clouds taller than mountains. A good day to fly.',
    material: 'toon',
    world: {
      fog: 0xcfeaff,
      fogDensity: 0.0012,
      skyTop: 0x2f8fe8,
      skyHorizon: 0xc6e8ff,
      skyBottom: 0xcfeaff,
      sunColor: 0xfff4dc,
      sun: 2.6,
      sunDisc: 0.32,
      skyLight: 0xdff2ff,
      groundLight: 0x5a8a3a,
      ambient: 1.35,
      rays: 0.25,
      caustics: 0,
      aurora: 0,
      darkness: 0,
      ground: 0x79c25e,
      groundAlt: 0x5aa24a,
      groundTexture: 'clay',
      groundRoughness: 1,
      hills: 1.2,
      ridges: 0.9,
    },
    props: {
      tall: [0x3f9a4a, 0x56b25a, 0x2f7f3f],
      cluster: [0xfafafa, 0xe85d4a, 0x3a6ea5, 0xffcf33],
      small: [0x4aa84f, 0xffcf33],
      rock: [0x9aa3a8, 0x868f95],
      special: 0xffffff,
      density: { tall: 0.7, cluster: 0.4, small: 0.9, rocks: 0.4, special: 0 },
      sway: 0.4,
      clouds: { count: 12, color: 0xffffff, opacity: 1, flat: false, height: 90 },
      flock: 'birds',
      flockColors: [0x2b3340],
      giant: false,
    },
    particles: { color: 0xfff6c8, size: 1.4, fall: -1, drift: -10, square: false, additive: true, opacity: 0.5 },
    fx: { bloom: 0.55, bloomThreshold: 0.8, outline: 0.75, outlineColor: 0x24324a, posterize: 0, hatch: 0, paper: 0, ink: 0, saturation: 1.18, contrast: 1.04, vignette: 0.25, grain: 0.02, chromatic: false },
    ui: {
      bg: '#e9f5ff',
      panel: 'rgba(255, 255, 255, 0.9)',
      panelSolid: '#ffffff',
      ink: '#24324a',
      muted: '#61718a',
      accent: '#2f8fe8',
      accentInk: '#ffffff',
      accent2: '#ffcf33',
      line: 'rgba(36, 50, 74, 0.14)',
      danger: '#e85d4a',
      good: '#3f9a4a',
      radius: '18px',
      border: '2px',
      shadow: '0 6px 0 rgba(36,50,74,.12)',
      display: "'M PLUS Rounded 1c', 'Arial Rounded MT Bold', sans-serif",
      body: "'M PLUS Rounded 1c', 'Arial Rounded MT Bold', sans-serif",
      numeric: "'M PLUS Rounded 1c', sans-serif",
      panelStyle: 'card',
      labelCase: 'none',
      labelTracking: '0.04em',
      titleWeight: 800,
      hudInk: '#ffffff',
      hudShadow: '0 2px 0 rgba(36,50,74,.55)',
    },
    mood: { root: 69, scale: PENTA, bpm: 92, density: 0.55, cutoff: 5200 },
    ambience: 3000,
    beam: 0,
    swatches: ['#2f8fe8', '#c6e8ff', '#79c25e', '#ffcf33', '#e85d4a'],
  },

  brick: {
    id: 'brick',
    name: 'Brick Town',
    line: 'Every hill clicks into place. Every creature does too.',
    material: 'plastic',
    world: {
      fog: 0xbfe0f5,
      fogDensity: 0.0014,
      skyTop: 0x6bb6e8,
      skyHorizon: 0xd2ecfa,
      skyBottom: 0xbfe0f5,
      sunColor: 0xffffff,
      sun: 2.4,
      sunDisc: 0.4,
      skyLight: 0xffffff,
      groundLight: 0x3a6a3a,
      ambient: 1.2,
      rays: 0,
      caustics: 0,
      aurora: 0,
      darkness: 0,
      ground: 0x4b9f4a,
      groundAlt: 0x3d8a3c,
      groundTexture: 'studs',
      groundRoughness: 0.35,
      hills: 0.35,
      ridges: 0.8,
    },
    props: {
      tall: [0x237841, 0x4b9f4a],
      cluster: [0xd01012, 0xf5cd2f, 0x0057a8, 0xffffff, 0xfe8a18],
      small: [0x237841, 0xf5cd2f],
      rock: [0x9ba19d, 0x6c6e68],
      special: 0xf5cd2f,
      density: { tall: 0.5, cluster: 0.55, small: 0.6, rocks: 0.5, special: 0 },
      sway: 0,
      clouds: { count: 8, color: 0xffffff, opacity: 1, flat: false, height: 80 },
      flock: 'birds',
      flockColors: [0xffffff, 0xd01012],
      giant: false,
    },
    particles: { color: 0xf5cd2f, size: 1.6, fall: 5, drift: -6, square: true, additive: false, opacity: 0.6 },
    fx: { bloom: 0.3, bloomThreshold: 0.9, outline: 0.25, outlineColor: 0x1b1b1b, posterize: 0, hatch: 0, paper: 0, ink: 0, saturation: 1.12, contrast: 1.05, vignette: 0.25, grain: 0.02, chromatic: false },
    ui: {
      bg: '#bfe0f5',
      panel: '#ffffff',
      panelSolid: '#ffffff',
      ink: '#1b1b1b',
      muted: '#5a5a5a',
      accent: '#f5cd2f',
      accentInk: '#1b1b1b',
      accent2: '#d01012',
      line: '#1b1b1b',
      danger: '#d01012',
      good: '#237841',
      radius: '6px',
      border: '3px',
      shadow: '0 5px 0 #1b1b1b',
      display: "'Lilita One', 'Arial Black', sans-serif",
      body,
      numeric: "'Lilita One', sans-serif",
      panelStyle: 'chunky',
      labelCase: 'uppercase',
      labelTracking: '0.06em',
      titleWeight: 400,
      hudInk: '#ffffff',
      hudShadow: '0 2px 0 #1b1b1b, 0 0 2px #1b1b1b',
    },
    mood: { root: 60, scale: MAJOR, bpm: 104, density: 0.6, cutoff: 4800 },
    ambience: 2800,
    beam: 0,
    swatches: ['#d01012', '#f5cd2f', '#0057a8', '#4b9f4a', '#ffffff'],
  },

  clay: {
    id: 'clay',
    name: 'Clay Valley',
    line: 'Soft, warm and slightly thumb-printed. Squash anything that squashes you.',
    material: 'clay',
    world: {
      fog: 0xead6cf,
      fogDensity: 0.0011,
      skyTop: 0xc9b6e4,
      skyHorizon: 0xf2c9b1,
      skyBottom: 0xead6cf,
      sunColor: 0xffe8d6,
      sun: 2,
      sunDisc: 0.12,
      skyLight: 0xfff0e8,
      groundLight: 0x8a7a8a,
      ambient: 1.35,
      rays: 0,
      caustics: 0,
      aurora: 0,
      darkness: 0,
      ground: 0xa7c4a0,
      groundAlt: 0x8fb08a,
      groundTexture: 'clay',
      groundRoughness: 1,
      hills: 1.4,
      ridges: 0.8,
    },
    props: {
      tall: [0xe98a7a, 0xf2b880, 0xb8a1d9],
      cluster: [0xf6d365, 0x9ad0c2, 0xe98a7a, 0xf2efe6],
      small: [0x8fb08a, 0xf4a6b7],
      rock: [0xc8b6a6, 0xb3a090],
      special: 0xf6d365,
      density: { tall: 0.5, cluster: 0.5, small: 0.8, rocks: 0.6, special: 0 },
      sway: 0.3,
      clouds: { count: 10, color: 0xfff6f0, opacity: 1, flat: false, height: 75 },
      flock: 'birds',
      flockColors: [0x7a6a8a],
      giant: false,
    },
    particles: { color: 0xfff0e0, size: 1.6, fall: 2, drift: -3, square: false, additive: false, opacity: 0.5 },
    fx: { bloom: 0.35, bloomThreshold: 0.85, outline: 0, outlineColor: 0x000000, posterize: 0, hatch: 0, paper: 0.15, ink: 0, saturation: 0.9, contrast: 0.96, vignette: 0.4, grain: 0.04, chromatic: false },
    ui: {
      bg: '#ead6cf',
      panel: 'rgba(250, 240, 235, 0.92)',
      panelSolid: '#faf0eb',
      ink: '#4a3f55',
      muted: '#8a7d92',
      accent: '#e98a7a',
      accentInk: '#ffffff',
      accent2: '#9ad0c2',
      line: 'rgba(74, 63, 85, 0.12)',
      danger: '#c95a5a',
      good: '#5f9a7a',
      radius: '22px',
      border: '0px',
      shadow: '0 10px 0 rgba(74,63,85,.08), 0 18px 40px rgba(74,63,85,.18)',
      display: "'Fredoka Variable', 'Arial Rounded MT Bold', sans-serif",
      body: "'Fredoka Variable', 'Arial Rounded MT Bold', sans-serif",
      numeric: "'Fredoka Variable', sans-serif",
      panelStyle: 'card',
      labelCase: 'none',
      labelTracking: '0.02em',
      titleWeight: 650,
      hudInk: '#4a3f55',
      hudShadow: '0 1px 0 rgba(255,255,255,.7)',
    },
    mood: { root: 58, scale: PENTA, bpm: 76, density: 0.4, cutoff: 2600 },
    ambience: 2000,
    beam: 0,
    swatches: ['#ead6cf', '#c9b6e4', '#e98a7a', '#9ad0c2', '#f6d365'],
  },

  ink: {
    id: 'ink',
    name: 'Ink Mountains',
    line: 'Brushed mountains and wet mist. The Blot feels at home here. So should you.',
    material: 'toon',
    world: {
      fog: 0xe9e3d6,
      fogDensity: 0.0026,
      skyTop: 0xe9e3d6,
      skyHorizon: 0xf1ece1,
      skyBottom: 0xe9e3d6,
      sunColor: 0xffffff,
      sun: 1.8,
      sunDisc: 0.3,
      skyLight: 0xffffff,
      groundLight: 0x555555,
      ambient: 1.1,
      rays: 0,
      caustics: 0,
      aurora: 0,
      darkness: 0.25,
      ground: 0x9a968c,
      groundAlt: 0x55524c,
      groundTexture: 'paper',
      groundRoughness: 1,
      hills: 1,
      ridges: 1.6,
    },
    props: {
      tall: [0x3a3a36, 0x4f4f4a],
      cluster: [0x2a2a28, 0x55524c, 0xc8352c],
      small: [0x55524c, 0xc8352c],
      rock: [0x6a675f, 0x55524c],
      special: 0xc8352c,
      density: { tall: 0.8, cluster: 0.35, small: 0.4, rocks: 0.8, special: 0 },
      sway: 0.35,
      clouds: { count: 9, color: 0xf4f0e6, opacity: 0.85, flat: true, height: 40 },
      flock: 'birds',
      flockColors: [0x1b1b1b],
      giant: false,
    },
    particles: { color: 0x1b1b1b, size: 1.2, fall: 8, drift: -2, square: false, additive: false, opacity: 0.35 },
    fx: { bloom: 0, bloomThreshold: 1, outline: 0.7, outlineColor: 0x1b1b1b, posterize: 0, hatch: 0, paper: 0.9, ink: 1, saturation: 1, contrast: 1.1, vignette: 0.45, grain: 0.03, chromatic: false },
    ui: {
      bg: '#e9e3d6',
      panel: 'rgba(241, 236, 225, 0.95)',
      panelSolid: '#f1ece1',
      ink: '#1b1b1b',
      muted: '#6a675f',
      accent: '#c8352c',
      accentInk: '#f1ece1',
      accent2: '#1b1b1b',
      line: 'rgba(27, 27, 27, 0.25)',
      danger: '#c8352c',
      good: '#3d5a40',
      radius: '0px',
      border: '1px',
      shadow: 'none',
      display: "'Shippori Mincho', 'Times New Roman', serif",
      body: "'Shippori Mincho', 'Times New Roman', serif",
      numeric: "'Shippori Mincho', serif",
      panelStyle: 'paper',
      labelCase: 'none',
      labelTracking: '0.12em',
      titleWeight: 800,
      hudInk: '#1b1b1b',
      hudShadow: '0 0 6px rgba(241,236,225,.9)',
    },
    mood: { root: 55, scale: HIRAJOSHI, bpm: 60, density: 0.25, cutoff: 2200 },
    ambience: 1400,
    beam: 0.2,
    swatches: ['#f1ece1', '#1b1b1b', '#c8352c', '#6a675f', '#9a968c'],
  },

  mesa: {
    id: 'mesa',
    name: 'Red Mesa',
    line: 'Heat shimmer, long shadows and nothing for miles. Except you.',
    material: 'pbr',
    world: {
      fog: 0xf0b48a,
      fogDensity: 0.0017,
      skyTop: 0x6d5a9e,
      skyHorizon: 0xffb36b,
      skyBottom: 0xf0b48a,
      sunColor: 0xffcf9a,
      sun: 2.8,
      sunDisc: 0.06,
      skyLight: 0xffd6b0,
      groundLight: 0x7a3a2a,
      ambient: 1.1,
      rays: 0.2,
      caustics: 0,
      aurora: 0,
      darkness: 0,
      ground: 0xd99a5b,
      groundAlt: 0xa4553a,
      groundTexture: 'sand',
      groundRoughness: 0.95,
      hills: 1.6,
      ridges: 1.5,
    },
    props: {
      tall: [0x4f7a4a, 0x5f8a52],
      cluster: [0x6f8a4a, 0xa4553a, 0xc9a06a],
      small: [0xc9a06a, 0xe76f51],
      rock: [0xa4553a, 0xb8683f],
      special: 0xffb36b,
      density: { tall: 0.45, cluster: 0.35, small: 0.5, rocks: 1, special: 0 },
      sway: 0.15,
      clouds: { count: 5, color: 0xffd9c0, opacity: 0.8, flat: true, height: 110 },
      flock: 'birds',
      flockColors: [0x2a1a1a],
      giant: false,
    },
    particles: { color: 0xf3c99a, size: 1.1, fall: 0.5, drift: -40, square: false, additive: false, opacity: 0.45 },
    fx: { bloom: 0.5, bloomThreshold: 0.8, outline: 0, outlineColor: 0x000000, posterize: 0, hatch: 0, paper: 0, ink: 0, saturation: 1.05, contrast: 1.05, vignette: 0.5, grain: 0.05, chromatic: false },
    ui: {
      bg: '#f1dcc0',
      panel: 'rgba(250, 236, 214, 0.92)',
      panelSolid: '#faecd6',
      ink: '#4a2218',
      muted: '#8a5a48',
      accent: '#2a9d8f',
      accentInk: '#fffaf0',
      accent2: '#e76f51',
      line: 'rgba(74, 34, 24, 0.2)',
      danger: '#c0392b',
      good: '#2a9d8f',
      radius: '3px',
      border: '1px',
      shadow: '0 18px 40px rgba(74,34,24,.18)',
      display: "'Big Shoulders Display Variable', 'Impact', sans-serif",
      body,
      numeric: "'Big Shoulders Display Variable', sans-serif",
      panelStyle: 'card',
      labelCase: 'uppercase',
      labelTracking: '0.18em',
      titleWeight: 800,
      hudInk: '#fff6ea',
      hudShadow: '0 1px 3px rgba(74,34,24,.7)',
    },
    mood: { root: 55, scale: DORIAN, bpm: 70, density: 0.3, cutoff: 2400 },
    ambience: 1600,
    beam: 0,
    swatches: ['#6d5a9e', '#ffb36b', '#d99a5b', '#a4553a', '#2a9d8f'],
  },

  glacier: {
    id: 'glacier',
    name: 'Glacier Light',
    line: 'Polar night, singing ice and the aurora overhead. Breathe slowly.',
    material: 'pbr',
    world: {
      fog: 0x9cc3d6,
      fogDensity: 0.0019,
      skyTop: 0x1d3557,
      skyHorizon: 0x9cc8dc,
      skyBottom: 0x9cc3d6,
      sunColor: 0xdbefff,
      sun: 1.6,
      sunDisc: -1,
      skyLight: 0xd8ecff,
      groundLight: 0x5a7a90,
      ambient: 1.25,
      rays: 0,
      caustics: 0,
      aurora: 1,
      darkness: 0.15,
      ground: 0xeef6f9,
      groundAlt: 0xb9d7e6,
      groundTexture: 'snow',
      groundRoughness: 0.6,
      hills: 1.2,
      ridges: 1.4,
    },
    props: {
      tall: [0x2f5d4a, 0x3d6e58],
      cluster: [0x9ad1e8, 0xcfeaf5, 0xffffff],
      small: [0xb9d7e6, 0x9ad1e8],
      rock: [0x8aa6b8, 0x6f8ea2],
      special: 0x9ad1e8,
      density: { tall: 0.5, cluster: 0.6, small: 0.5, rocks: 0.7, special: 0.6 },
      sway: 0.1,
      clouds: { count: 0, color: 0, opacity: 0, flat: false, height: 0 },
      flock: 'none',
      flockColors: [0xffffff],
      giant: false,
    },
    particles: { color: 0xffffff, size: 1.8, fall: 9, drift: -6, square: false, additive: false, opacity: 0.8 },
    fx: { bloom: 0.9, bloomThreshold: 0.75, outline: 0, outlineColor: 0x000000, posterize: 0, hatch: 0, paper: 0, ink: 0, saturation: 1, contrast: 1.02, vignette: 0.45, grain: 0.03, chromatic: false },
    ui: {
      bg: '#dcecf3',
      panel: 'rgba(244, 250, 252, 0.78)',
      panelSolid: '#f4fafc',
      ink: '#1d3557',
      muted: '#5a7189',
      accent: '#3aa98a',
      accentInk: '#ffffff',
      accent2: '#7b6fd6',
      line: 'rgba(29, 53, 87, 0.16)',
      danger: '#c8435a',
      good: '#3aa98a',
      radius: '14px',
      border: '1px',
      shadow: '0 20px 50px rgba(29,53,87,.18)',
      display: "'Josefin Sans Variable', 'Segoe UI', sans-serif",
      body,
      numeric: "'Josefin Sans Variable', sans-serif",
      panelStyle: 'glass',
      labelCase: 'uppercase',
      labelTracking: '0.2em',
      titleWeight: 700,
      hudInk: '#f4fafc',
      hudShadow: '0 1px 3px rgba(29,53,87,.7)',
    },
    mood: { root: 57, scale: LYDIAN, bpm: 64, density: 0.3, cutoff: 3000 },
    ambience: 1200,
    beam: 0.3,
    swatches: ['#1d3557', '#9cc8dc', '#eef6f9', '#3aa98a', '#7b6fd6'],
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Pick a random theme from the allowed pool, avoiding the current one. */
export function randomTheme(pool: ThemeId[], avoid?: ThemeId, rnd: () => number = Math.random): ThemeId {
  const list = pool.length ? pool : THEME_IDS;
  const choices = list.length > 1 ? list.filter((t) => t !== avoid) : list;
  return choices[Math.floor(rnd() * choices.length)];
}
