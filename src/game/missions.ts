export type MissionKind = 'sparks' | 'kills' | 'level' | 'bosses' | 'dash' | 'reveal' | 'shards' | 'combo' | 'flare' | 'clean' | 'powerups' | 'worlds';

interface Template {
  kind: MissionKind;
  text: (n: number) => string;
  base: number;
  step: number;
  reward: number;
  /** "best in a single run" rather than accumulated across runs. */
  single?: boolean;
}

const TEMPLATES: Template[] = [
  { kind: 'sparks', text: (n) => `Collect ${n} sparks`, base: 60, step: 60, reward: 3 },
  { kind: 'kills', text: (n) => `Defeat ${n} creatures`, base: 25, step: 25, reward: 3 },
  { kind: 'level', text: (n) => `Reach level ${n} in one run`, base: 3, step: 2, reward: 5, single: true },
  { kind: 'bosses', text: (n) => `Defeat ${n} boss${n > 1 ? 'es' : ''}`, base: 1, step: 1, reward: 6 },
  { kind: 'dash', text: (n) => `Ram ${n} creatures with a dash`, base: 5, step: 5, reward: 4 },
  { kind: 'reveal', text: (n) => `Reveal ${n} creatures with a pulse`, base: 8, step: 8, reward: 3 },
  { kind: 'shards', text: (n) => `Find ${n} hidden shards`, base: 3, step: 3, reward: 4 },
  { kind: 'combo', text: (n) => `Reach a ×${n} spark combo`, base: 12, step: 6, reward: 4, single: true },
  { kind: 'flare', text: (n) => `Unleash ${n} Bioflare${n > 1 ? 's' : ''}`, base: 2, step: 2, reward: 3 },
  { kind: 'clean', text: (n) => `Finish ${n} level${n > 1 ? 's' : ''} without a scratch`, base: 1, step: 1, reward: 5 },
  { kind: 'powerups', text: (n) => `Grab ${n} power-ups`, base: 4, step: 4, reward: 3 },
  { kind: 'worlds', text: (n) => `Visit ${n} different worlds in one run`, base: 3, step: 1, reward: 5, single: true },
];

export interface Mission {
  kind: MissionKind;
  target: number;
  progress: number;
  reward: number;
  tier: number;
  single: boolean;
}

export function describe(m: Mission) {
  return TEMPLATES.find((t) => t.kind === m.kind)!.text(m.target);
}

export function makeMission(kind: MissionKind, tier: number): Mission {
  const t = TEMPLATES.find((x) => x.kind === kind)!;
  return { kind, target: t.base + t.step * tier, progress: 0, reward: t.reward + tier, tier, single: !!t.single };
}

/** Pick a mission kind not already active. */
export function nextMission(active: Mission[], tiers: Partial<Record<MissionKind, number>>, rnd = Math.random): Mission {
  const free = TEMPLATES.filter((t) => !active.some((a) => a.kind === t.kind));
  const t = free[Math.floor(rnd() * free.length)];
  return makeMission(t.kind, tiers[t.kind] ?? 0);
}

export function starterMissions(): Mission[] {
  return [makeMission('sparks', 0), makeMission('kills', 0), makeMission('level', 0)];
}
