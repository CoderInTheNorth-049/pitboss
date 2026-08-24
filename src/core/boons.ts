export interface BoonDef {
  id: string;
  name: string;
  desc: string;
  color: string;
  maxStacks: number;
}

export const BOONS: readonly BoonDef[] = [
  { id: 'swift',     name: 'ADRENAL BOOST',   desc: '+12% MOVE SPEED',                    color: '#9dff3f', maxStacks: 3 },
  { id: 'mag',       name: 'EXTENDED MAGS',   desc: '+25% MAGAZINE SIZE',                 color: '#ffd23f', maxStacks: 3 },
  { id: 'headshot',  name: 'DEADEYE',         desc: 'HEADSHOTS +0.15× DAMAGE',            color: '#35e0d6', maxStacks: 3 },
  { id: 'burn',      name: 'HOT ROUNDS',      desc: 'BURN DAMAGE +40%',                   color: '#ff6a1a', maxStacks: 2 },
  { id: 'sentry',    name: 'TURRET TECH',     desc: 'WARDEN UPTIME +40%',                 color: '#c15cff', maxStacks: 2 },
  { id: 'bulwark',   name: 'CORE TUNING',     desc: 'BULWARK LASTS +2s',                  color: '#ffd23f', maxStacks: 2 },
  { id: 'vitality',  name: 'IRON VITALS',     desc: '+20 MAX VITALS · HEAL 20',           color: '#ff3355', maxStacks: 2 },
  { id: 'scavenger', name: 'SCAVENGER',       desc: 'KILL DROPS 25% MORE OFTEN',          color: '#9dff3f', maxStacks: 2 },
  { id: 'fasthands', name: 'FAST HANDS',      desc: 'RELOAD 20% FASTER',                  color: '#35e0d6', maxStacks: 2 },
  { id: 'leech',     name: 'PIT LEECH',       desc: 'KILLS HEAL +5',                      color: '#ff3355', maxStacks: 3 },
  { id: 'overwatch', name: 'OVERWATCH',       desc: 'WARDEN DAMAGE +25%',                 color: '#c15cff', maxStacks: 2 },
  { id: 'residue',   name: 'RESIDUE CHARGE',  desc: 'SPECIAL WEAPONS LAST +4s',           color: '#ff6a1a', maxStacks: 2 },
  { id: 'bounty',    name: 'BOUNTY HUNTER',   desc: 'DROP EVERY 4 KILLS EARLIER',         color: '#ffd23f', maxStacks: 1 }
];

export function boonById(id: string): BoonDef | null {
  return BOONS.find(b => b.id === id) ?? null;
}
