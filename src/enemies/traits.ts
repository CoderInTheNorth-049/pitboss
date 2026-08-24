export type TraitId = 'swift' | 'bulwark' | 'deadeye' | 'twincast' | 'phantom' | 'bruiser';

export interface TraitDef {
  id: TraitId;
  name: string;
  desc: string;
  speedMul?: number;
  hpMul?: number;
  accAdd?: number;
  dmgAdd?: number;
  burstAdd?: number;
  strafeMul?: number;
}

export const TRAIT_POOL: readonly TraitDef[] = [
  { id: 'swift',    name: 'SWIFT',    desc: 'Moves 30% faster' },
  { id: 'bulwark',  name: 'BULWARK',  desc: '+60% vitality' },
  { id: 'deadeye',  name: 'DEADEYE',  desc: 'Far more accurate' },
  { id: 'twincast', name: 'TWINCAST', desc: 'Fires two-shot bursts' },
  { id: 'phantom',  name: 'PHANTOM',  desc: 'Unpredictable strafing' },
  { id: 'bruiser',  name: 'BRUISER',  desc: '+5 damage per hit' }
];

const byId = new Map<string, TraitDef>(TRAIT_POOL.map(t => [t.id, t]));

export const TIERS = [
  { name: 'GRUNT',   color: '#ff5c33' },
  { name: 'VENGER',  color: '#ffb233' },
  { name: 'REAVER',  color: '#ff4fa0' },
  { name: 'WARLORD', color: '#35e0d6' },
  { name: 'TYRANT',  color: '#ffffff' }
] as const;

export const MAX_TIER = TIERS.length - 1;

export interface EnemyStats {
  hp: number;
  speed: number;
  strafeSpeed: number;
  accuracy: number;
  damage: number;
  burst: number;
  telegraphTime: number;
  cooldownScale: number;
  scale: number;
}

export function buildStats(
  tier: number,
  traitIds: readonly TraitId[],
  wave: number,
  aggression: number,
  rng: { range(min: number, max: number): number },
  enemyHpMul = 1,
  strafeMul = 1
): EnemyStats {
  const e = {
    hp: 90 * (1 + tier * 0.35) * enemyHpMul,
    speed: rng.range(3.3, 4.5),
    strafeSpeed: 2.6 * strafeMul,
    accuracy: Math.min(0.72, 0.26 + (wave - 1) * 0.02),
    damage: Math.min(18, 9 + (wave - 1) * 0.45),
    burst: 1,
    telegraphTime: 0.5 - Math.min(0.18, tier * 0.04),
    cooldownScale: 1.35 - aggression * 0.45,
    scale: 1 + tier * 0.06
  };
  e.hp *= 1 + Math.min(wave - 1, 10) * 0.06;
  for (const id of traitIds) {
    const t = byId.get(id);
    if (!t) continue;
    if (t.speedMul) e.speed *= t.speedMul;
    if (t.hpMul) e.hp *= t.hpMul;
    if (t.accAdd) e.accuracy += t.accAdd;
    if (t.dmgAdd) e.damage += t.dmgAdd;
    if (t.burstAdd) e.burst += t.burstAdd;
    if (t.strafeMul) e.strafeSpeed *= t.strafeMul;
  }
  return e;
}

export function pickNewTrait(owned: readonly TraitId[], rng: { pick<T>(a: readonly T[]): T }): TraitDef | null {
  const available = TRAIT_POOL.filter(t => !owned.includes(t.id));
  return available.length > 0 ? rng.pick(available) : null;
}
