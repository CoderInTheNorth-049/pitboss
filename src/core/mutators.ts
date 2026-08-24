export interface MutatorDef {
  id: string;
  name: string;
  desc: string;
  color: string;
  weight: number;
  minWave: number;
}

export const MUTATORS: readonly MutatorDef[] = [
  {
    id: 'lowgrav',
    name: 'LOW GRAVITY',
    desc: 'JUMPS FLOAT HIGH · GRAVITY WEAK',
    color: '#9dff3f',
    weight: 10,
    minWave: 2
  },
  {
    id: 'glasscannon',
    name: 'GLASS CANNON',
    desc: 'ALL DAMAGE DOUBLED — BOTH WAYS',
    color: '#ff2244',
    weight: 10,
    minWave: 2
  },
  {
    id: 'swarm',
    name: 'SWARM',
    desc: 'DOUBLE SPAWN QUOTA · WEAKER RIVALS',
    color: '#ff5c33',
    weight: 9,
    minWave: 3
  },
  {
    id: 'blink',
    name: 'BLINK',
    desc: 'RIVALS STRAFE UNPREDICTABLY',
    color: '#35e0d6',
    weight: 8,
    minWave: 3
  },
  {
    id: 'bounty',
    name: 'BOUNTY',
    desc: 'EVERY 4TH KILL DROPS LOOT',
    color: '#ffd23f',
    weight: 9,
    minWave: 2
  },
  {
    id: 'darkzone',
    name: 'DARK ZONE',
    desc: 'THE PIT GOES DARK · MUZZLES REVEAL',
    color: '#8a8894',
    weight: 7,
    minWave: 4
  },
  {
    id: 'vampire',
    name: 'VAMPIRE',
    desc: 'EVERY KILL HEALS +10',
    color: '#ff3355',
    weight: 9,
    minWave: 2
  }
];

export function mutatorById(id: string): MutatorDef | null {
  return MUTATORS.find(m => m.id === id) ?? null;
}
