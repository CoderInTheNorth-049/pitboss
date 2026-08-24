export type WeaponSoundId = 'shot' | 'rail' | 'flame';
export type WeaponMode = 'hitscan' | 'cone';

export interface WeaponSpec {
  id: string;
  name: string;
  desc: string;
  damage: number;
  fireInterval: number;
  magSize: number;
  pellets: number;
  spreadBase: number;
  bloomPerShot: number;
  bloomMax: number;
  reloadTime: number;
  pierce: boolean;
  tracerColor: number;
  tracerLife: number;
  tracerWidth: number;
  recoilKick: number;
  sound: WeaponSoundId;
  specialDuration: number;
  mode: WeaponMode;
  range: number;
  coneAngle: number;
  splashRadius: number;
  burnDps: number;
  burnDuration: number;
}

const HITSCAN_BASE = {
  mode: 'hitscan' as const,
  range: 120,
  coneAngle: 0,
  splashRadius: 0,
  burnDps: 0,
  burnDuration: 0
};

export const DEFAULT_SPEC: WeaponSpec = {
  ...HITSCAN_BASE,
  id: 'rifle',
  name: 'PIT RIFLE',
  desc: 'Trusty automatic',
  damage: 26,
  fireInterval: 0.125,
  magSize: 30,
  pellets: 1,
  spreadBase: 0.0025,
  bloomPerShot: 0.008,
  bloomMax: 0.05,
  reloadTime: 1.15,
  pierce: false,
  tracerColor: 0xffe9c9,
  tracerLife: 0.06,
  tracerWidth: 0.012,
  recoilKick: 0.013,
  sound: 'shot',
  specialDuration: 0
};

export const SPECIALS: readonly WeaponSpec[] = [
  {
    ...HITSCAN_BASE,
    id: 'railhand',
    name: 'RAILHAND',
    desc: 'Piercing lance — hits everything in line',
    damage: 70,
    fireInterval: 0.55,
    magSize: 6,
    pellets: 1,
    spreadBase: 0.0008,
    bloomPerShot: 0,
    bloomMax: 0.002,
    reloadTime: 1.4,
    pierce: true,
    tracerColor: 0x35e0d6,
    tracerLife: 0.22,
    tracerWidth: 0.05,
    recoilKick: 0.05,
    sound: 'rail',
    specialDuration: 12
  },
  {
    mode: 'cone',
    id: 'pyroclast',
    name: 'PYROCLAST',
    desc: 'Short-range flame cone — burns whole crowds',
    damage: 14,
    fireInterval: 0.06,
    magSize: 100,
    pellets: 1,
    spreadBase: 0,
    bloomPerShot: 0,
    bloomMax: 0,
    reloadTime: 1.5,
    pierce: false,
    tracerColor: 0xff6a1a,
    tracerLife: 0.09,
    tracerWidth: 0.02,
    recoilKick: 0.006,
    sound: 'flame',
    specialDuration: 12,
    range: 12,
    coneAngle: 0.36,
    splashRadius: 2.2,
    burnDps: 8,
    burnDuration: 2
  }
];

export function specById(id: string): WeaponSpec {
  return SPECIALS.find(s => s.id === id) ?? DEFAULT_SPEC;
}
