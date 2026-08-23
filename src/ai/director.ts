import { CONFIG } from '../config';
import { surgeLine } from '../enemies/taunts';
import { clamp, lerp } from '../utils/math';
import type { RNG } from '../utils/rng';
import type { RivalMemory, SpawnSpec } from '../memory/rivals';

const D = CONFIG.director;

export type Spawner = () => void;
export type Announcer = (text: string, kind?: 'wave' | 'surge' | 'info') => void;

interface DirectorSignals {
  hpFrac: number;
  accuracy: number;
  aliveEnemies: number;
}

export class Director {
  wave = 1;
  heat = 0.12;
  phase: 'intermission' | 'active' = 'intermission';

  private intermissionT = 3.0;
  private spawnCd = 1.2;
  private quotaLeft = 0;
  private surgeT = 0;
  private surgeCd = 8;
  private recentDamage: number[] = [];

  constructor(
    private memory: RivalMemory,
    private rng: RNG,
    private spawnFn: Spawner,
    private announce: Announcer
  ) {}

  beginRun(): void {
    this.wave = 1;
    this.heat = 0.12;
    this.phase = 'intermission';
    this.intermissionT = 3.0;
    this.quotaLeft = 0;
    this.recentDamage = [];
    this.surgeCd = 8;
    this.surgeT = 0;
  }

  registerPlayerDamage(amount: number): void {
    this.recentDamage.push(amount);
    if (this.recentDamage.length > 30) this.recentDamage.shift();
  }

  aggression(): number {
    return 0.55 + this.heat * 0.65;
  }

  get surging(): boolean {
    return this.surgeT > 0;
  }

  maxAlive(): number {
    return D.baseAlive + Math.round(this.heat * (D.aliveAtFullHeat - D.baseAlive));
  }

  requestSpawnSpec(exclude: ReadonlySet<string>): SpawnSpec {
    return this.memory.createSpawnSpec(this.wave, this.rng, exclude);
  }

  update(dt: number, signals: DirectorSignals): void {
    let stress = clamp(this.recentDamage.reduce((a, b) => a + b, 0) / 45, 0, 0.55);
    if (signals.hpFrac < D.lowHpThreshold) stress += 0.22;
    if (signals.accuracy < D.lowAccThreshold) stress += 0.12;
    stress = clamp(stress, 0, 1);

    const escalation = clamp(0.18 + this.wave * 0.055, 0, 0.95);
    const target = clamp(escalation * (1 - stress * 0.55), 0.05, 0.97);
    const rate = target > this.heat ? D.heatEaseUp : D.heatEaseDown;
    this.heat = clamp(this.heat + (target - this.heat) * Math.min(1, rate * dt), 0, 1);

    if (this.surgeT > 0) this.surgeT -= dt;
    if (this.surgeCd > 0) this.surgeCd -= dt;
    if (this.heat >= D.surgeHeat && this.surgeCd <= 0 && this.phase === 'active') {
      this.surgeT = D.surgeDuration;
      this.surgeCd = D.surgeCooldown;
      this.announce(surgeLine(this.rng), 'surge');
    }

    if (this.phase === 'intermission') {
      this.intermissionT -= dt;
      if (this.intermissionT <= 0) this.startWave();
      return;
    }

    this.spawnCd -= dt;
    const interval = lerp(D.spawnIntervalMax, D.spawnIntervalMin, this.heat) *
      (this.surgeT > 0 ? 0.5 : 1) * this.rng.range(0.75, 1.25);
    const cap = this.maxAlive() + (this.surgeT > 0 ? 2 : 0);
    if (this.spawnCd <= 0 && this.quotaLeft > 0 && signals.aliveEnemies < cap) {
      this.spawnCd = interval;
      this.quotaLeft--;
      this.spawnFn();
    }
    if (this.quotaLeft <= 0 && signals.aliveEnemies === 0) {
      this.phase = 'intermission';
      this.intermissionT = D.intermission;
      this.wave++;
      this.recentDamage = [];
    }
  }

  private startWave(): void {
    this.phase = 'active';
    this.quotaLeft = D.quotaBase + (this.wave - 1) * D.quotaPerWave;
    this.spawnCd = 0.4;
    this.announce(`WAVE ${this.wave}`, 'wave');
  }
}
