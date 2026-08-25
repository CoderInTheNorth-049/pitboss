export const CONFIG = {
  player: {
    radius: 0.4,
    height: 1.8,
    eyeHeight: 1.62,
    speed: 7.0,
    sprintMul: 1.42,
    accel: 55,
    friction: 9.5,
    jumpVel: 8.3,
    gravity: 21,
    stepHeight: 0.55,
    maxHp: 100
  },
  weapon: {
    magSize: 30,
    fireInterval: 0.125,
    damage: 26,
    reloadTime: 1.15,
    spreadBase: 0.0025,
    bloomPerShot: 0.008,
    bloomMax: 0.05,
    bloomRecover: 0.11,
    range: 120,
    recoilKick: 0.013,
    headshotMul: 1.75
  },
  enemy: {
    baseHp: 90,
    hpPerTier: 0.35,
    speedMin: 3.3,
    speedMax: 4.5,
    attackRange: 17,
    minDist: 5.5,
    maxDist: 12,
    telegraphTime: 0.5,
    baseAccuracy: 0.26,
    accuracyPerWave: 0.02,
    accuracyMax: 0.72,
    baseDmg: 9,
    dmgPerWave: 0.45,
    dmgMax: 18,
    cooldownMin: 1.15,
    cooldownMax: 1.95,
    hpWaveScale: 0.06,
    hpWaveCap: 10
  },
  director: {
    spawnIntervalMax: 3.3,
    spawnIntervalMin: 1.05,
    baseAlive: 3,
    aliveAtFullHeat: 8,
    surgeHeat: 0.88,
    surgeDuration: 7,
    surgeCooldown: 22,
    heatEaseUp: 0.35,
    heatEaseDown: 0.09,
    damageWindowSec: 6,
    killWindowSec: 8,
    lowHpThreshold: 0.35,
    lowAccThreshold: 0.25,
    intermission: 4,
    healBetweenWaves: 25,
    quotaBase: 5,
    quotaPerWave: 2
  },
  drops: {
    killsPerDrop: 8,
    shieldWeight: 38,
    overdriveWeight: 24,
    refillWeight: 15,
    invulnWeight: 9,
    sentryWeight: 12,
    mysteryWeight: 8,
    shieldAbsorbMin: 0.65,
    shieldAbsorbMax: 0.8,
    shieldDuration: 10,
    shieldBudget: 120
  },
  boost: {
    overdriveDuration: 6,
    damageMul: 2,
    invulnDuration: 5
  },
  sentry: {
    duration: 20,
    range: 25,
    damage: 78,
    fireInterval: 0.5,
    turnSpeed: 7,
    aimTolerance: 0.14
  },
  streak: {
    windowSec: 3.5,
    heatBonus: 0.02,
    tiers: [
      { count: 2, name: 'DOUBLE KILL' },
      { count: 3, name: 'TRIPLE KILL' },
      { count: 4, name: 'RAMPAGE' },
      { count: 6, name: 'UNSTOPPABLE' }
    ]
  },
  burnSpread: {
    radius: 3,
    chance: 0.5,
    checkInterval: 0.4
  },
  variety: {
    mutatorChance: 0.75,
    minWave: 2,
    bountyEvery: 4,
    fogBase: 0.016,
    fogDark: 0.05,
    draftChoices: 3,
    skipHeal: 25,
    midwaveHealWave: 5,
    midwaveHealMax: 3
  }
} as const;
