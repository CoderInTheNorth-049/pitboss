const SYL_A = ['VEX', 'KROG', 'MAL', 'SARR', 'DRU', 'NYX', 'GOR', 'THAL', 'RUK', 'ZEPH', 'KARN', 'ULL', 'BRAK', 'MOOR', 'HEXX', 'VOR'];
const SYL_B = ['A', 'OR', 'IX', 'UN', 'ETH', 'AK', 'IS', 'ON', 'AR', 'OG', 'YS', 'UM'];
const EPITHETS = [
  'THE FORGOTTEN', 'THE UNDYING', 'THE PATIENT', 'FLAYBRINGER', 'THE RED',
  'DOOMHELD', 'THE CROWNED', 'PITBORN', 'THE HUNGRY', 'LAST LIGHT',
  'THE SECOND', 'IRON-JAWED'
];

interface NameRoller {
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
}

export function generateName(tier: number, rng: NameRoller): string {
  let name = rng.pick(SYL_A) + rng.pick(SYL_B);
  if (rng.chance(0.25)) name += rng.pick(SYL_B).toLowerCase();
  if (tier >= 1 && rng.chance(0.45 + tier * 0.15)) {
    name += ', ' + rng.pick(EPITHETS);
  }
  return name.toUpperCase();
}
