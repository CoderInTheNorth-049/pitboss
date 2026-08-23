export type WeaponSoundId = 'shot' | 'rail' | 'shotgun';

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
}

export const DEFAULT_SPEC: WeaponSpec = {
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
    id: 'scattergate',
    name: 'SCATTERGATE',
    desc: 'Six-pellet breacher',
    damage: 13,
    fireInterval: 0.75,
    magSize: 8,
    pellets: 6,
    spreadBase: 0.055,
    bloomPerShot: 0.004,
    bloomMax: 0.07,
    reloadTime: 1.6,
    pierce: false,
    tracerColor: 0xffc233,
    tracerLife: 0.09,
    tracerWidth: 0.016,
    recoilKick: 0.035,
    sound: 'shotgun',
    specialDuration: 12
  },
  {
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
  }
];

export function specById(id: string): WeaponSpec {
  return SPECIALS.find(s => s.id === id) ?? DEFAULT_SPEC;
}
