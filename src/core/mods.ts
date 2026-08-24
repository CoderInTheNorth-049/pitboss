import { CONFIG } from '../config';
import type { RNG } from '../utils/rng';
import type { MutatorDef } from './mutators';
import { MUTATORS, mutatorById } from './mutators';

const V = CONFIG.variety;

export class RunMods {
  private stacks = new Map<string, number>();
  private lastMutatorId: string | null = null;
  mutator: MutatorDef | null = null;

  reset(): void {
    this.stacks.clear();
    this.mutator = null;
    this.lastMutatorId = null;
  }

  addBoon(id: string): void {
    this.stacks.set(id, (this.stacks.get(id) ?? 0) + 1);
  }

  stackOf(id: string): number {
    return this.stacks.get(id) ?? 0;
  }

  boonEntries(): Array<{ id: string; stacks: number }> {
    return [...this.stacks.entries()].map(([id, stacks]) => ({ id, stacks }));
  }

  rollMutator(wave: number, rng: RNG): MutatorDef | null {
    this.mutator = null;
    if (wave < V.minWave) return null;
    if (!rng.chance(V.mutatorChance)) return null;
    const pool = MUTATORS.filter(m => wave >= m.minWave && m.id !== this.lastMutatorId);
    const fallback = MUTATORS.filter(m => wave >= m.minWave);
    const use = pool.length > 0 ? pool : fallback;
    if (use.length === 0) return null;
    const total = use.reduce((a, m) => a + m.weight, 0);
    let roll = rng.next() * total;
    for (const m of use) {
      roll -= m.weight;
      if (roll <= 0) {
        this.mutator = m;
        this.lastMutatorId = m.id;
        return m;
      }
    }
    this.mutator = use[use.length - 1];
    this.lastMutatorId = this.mutator.id;
    return this.mutator;
  }

  forceMutator(id: string): MutatorDef | null {
    this.mutator = mutatorById(id);
    if (this.mutator) this.lastMutatorId = this.mutator.id;
    return this.mutator;
  }

  clearMutator(): void {
    this.mutator = null;
  }

  // ---- boon getters ----
  get moveSpeedMul(): number { return 1 + 0.12 * this.stackOf('swift'); }
  get magSizeMul(): number { return 1 + 0.25 * this.stackOf('mag'); }
  get headshotBonus(): number { return 0.15 * this.stackOf('headshot'); }
  get burnMul(): number { return 1 + 0.4 * this.stackOf('burn'); }
  get sentryDurMul(): number { return 1 + 0.4 * this.stackOf('sentry'); }
  get bulwarkDurAdd(): number { return 2 * this.stackOf('bulwark'); }
  get maxHpAdd(): number { return 20 * this.stackOf('vitality'); }
  get dropRateMul(): number { return 1 + 0.25 * this.stackOf('scavenger'); }
  get reloadSpeedMul(): number { return 1 - 0.2 * Math.min(2, this.stackOf('fasthands')); }
  get killHealBoon(): number { return 5 * this.stackOf('leech'); }
  get sentryDmgMul(): number { return 1 + 0.25 * this.stackOf('overwatch'); }
  get specialDurAdd(): number { return 4 * this.stackOf('residue'); }
  get dropKillsReduce(): number { return this.stackOf('bounty') > 0 ? 4 : 0; }

  // ---- mutator getters ----
  get dmgOutMul(): number { return this.mutator?.id === 'glasscannon' ? 2 : 1; }
  get dmgInMul(): number { return this.mutator?.id === 'glasscannon' ? 2 : 1; }
  get enemyHpMul(): number { return this.mutator?.id === 'swarm' ? 0.6 : 1; }
  get quotaMul(): number { return this.mutator?.id === 'swarm' ? 2 : 1; }
  get jumpMul(): number { return this.mutator?.id === 'lowgrav' ? 1.6 : 1; }
  get gravityMul(): number { return this.mutator?.id === 'lowgrav' ? 0.6 : 1; }
  get strafeMul(): number { return this.mutator?.id === 'blink' ? 1.9 : 1; }
  get killHealMut(): number { return this.mutator?.id === 'vampire' ? 10 : 0; }
  get bountyEvery(): number | null { return this.mutator?.id === 'bounty' ? V.bountyEvery : null; }
  get fogDensity(): number { return this.mutator?.id === 'darkzone' ? V.fogDark : V.fogBase; }
}
