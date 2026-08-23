const KILL_TAUNTS = [
  'Your streak fed me.',
  'The pit remembers what you forget.',
  'You die louder than you fight.',
  'I kept your rhythm. It was easy to break.',
  'Every run, I learn you better.',
  'That was the lesson. There will be more.',
  'You made me this. Thank you.',
  'Scream again. The crowd loves it.',
  'Next time, bring something new.',
  'I have worn better than you.'
];

const SPAWN_LINES = [
  '{name} steps into the light.',
  '{name} has been waiting for this.',
  'The gates open. {name} does not hesitate.',
  '{name} remembers your patterns.',
  'Something older than you walks in: {name}.'
];

const FEARED_LINES = [
  '{name} hesitates at your sight... then charges anyway.',
  '{name} has fallen to you {n} times. It studies you now.',
  '{name} fights scared. Scared is dangerous.',
  'The crowd chants a name it knows loses: {name}.'
];

const SURGE_LINES = [
  'THE CROWD ROARS — SURGE INCOMING',
  'THE PIT DEMANDS MORE — SURGE',
  'BLOOD IN THE AIR — SURGE'
];

interface Roller {
  pick<T>(arr: readonly T[]): T;
  int(minIncl: number, maxExcl: number): number;
  chance(p: number): boolean;
}

export function killTaunt(rng: Roller): string {
  return rng.pick(KILL_TAUNTS);
}

export function spawnLine(name: string, fearedDeaths: number, rng: Roller): string {
  if (fearedDeaths >= 3 && rng.chance(0.5)) {
    return rng.pick(FEARED_LINES).replace('{name}', name).replace('{n}', String(fearedDeaths));
  }
  return rng.pick(SPAWN_LINES).replace('{name}', name);
}

export function surgeLine(rng: Roller): string {
  return rng.pick(SURGE_LINES);
}
