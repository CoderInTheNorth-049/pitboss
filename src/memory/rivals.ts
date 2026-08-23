import { generateName } from '../enemies/names';
import { MAX_TIER, pickNewTrait, TIERS } from '../enemies/traits';
import { killTaunt } from '../enemies/taunts';
import type { TraitDef, TraitId } from '../enemies/traits';
import type { RNG } from '../utils/rng';
import { RivalStore } from './store';

export interface RivalRecord {
  id: string;
  name: string;
  tier: number;
  traits: TraitId[];
  kills: number;
  deaths: number;
  taunt: string;
  created: number;
  lastSeen: number;
}

export interface SpawnSpec {
  rivalId: string;
  name: string;
  tier: number;
  traitIds: TraitId[];
}

const STARTER_COUNT = 3;
const ROSTER_CAP = 24;

export class RivalMemory {
  private rivals = new Map<string, RivalRecord>();
  private store = new RivalStore<RivalRecord>();
  private nextId = 1;
  private newGruntCounter = 0;

  async init(rng: RNG): Promise<void> {
    await this.store.init();
    const loaded = await this.store.loadAll();
    for (const r of loaded) {
      this.rivals.set(r.id, r);
      const n = parseInt(r.id.slice(2), 10);
      if (!Number.isNaN(n)) this.nextId = Math.max(this.nextId, n + 1);
    }
    if (this.rivals.size === 0) {
      for (let i = 0; i < STARTER_COUNT; i++) {
        const id = this.freshId();
        const rec: RivalRecord = {
          id,
          name: generateName(0, rng),
          tier: 0,
          traits: [],
          kills: 0,
          deaths: 0,
          taunt: killTaunt(rng),
          created: Date.now(),
          lastSeen: 0
        };
        this.rivals.set(id, rec);
        void this.store.put(rec);
      }
    }
  }

  fallbackOnly(rng: RNG): void {
    if (this.rivals.size === 0) {
      for (let i = 0; i < STARTER_COUNT; i++) {
        const id = this.freshId();
        this.rivals.set(id, {
          id,
          name: generateName(0, rng),
          tier: 0,
          traits: [],
          kills: 0,
          deaths: 0,
          taunt: killTaunt(rng),
          created: Date.now(),
          lastSeen: 0
        });
      }
    }
  }

  private freshId(): string {
    return `r_${this.nextId++}`;
  }

  roster(): RivalRecord[] {
    return [...this.rivals.values()].sort(
      (a, b) => b.tier - a.tier || b.kills - a.kills || b.created - a.created
    );
  }

  get(id: string): RivalRecord | undefined {
    return this.rivals.get(id);
  }

  createSpawnSpec(wave: number, rng: RNG, exclude: ReadonlySet<string>): SpawnSpec {
    if (this.rivals.size === 0) return this.createFreshGrunt(rng);

    if (wave % 3 === 0 && ++this.newGruntCounter >= 2 && this.rivals.size < ROSTER_CAP) {
      this.newGruntCounter = 0;
      return this.createFreshGrunt(rng);
    }

    const pool = [...this.rivals.values()].filter(r => !exclude.has(r.id));
    const candidates = pool.length > 0 ? pool : [...this.rivals.values()];
    candidates.sort((a, b) => (b.tier + rng.next() * 1.4) - (a.tier + rng.next() * 1.4));
    const shortlist = candidates.slice(0, Math.max(2, Math.ceil(candidates.length / 3)));
    const chosen = rng.pick(shortlist);
    chosen.lastSeen = Date.now();
    return {
      rivalId: chosen.id,
      name: chosen.name,
      tier: chosen.tier,
      traitIds: [...chosen.traits]
    };
  }

  private createFreshGrunt(rng: RNG): SpawnSpec {
    const id = this.freshId();
    const rec: RivalRecord = {
      id,
      name: generateName(0, rng),
      tier: 0,
      traits: [],
      kills: 0,
      deaths: 0,
      taunt: killTaunt(rng),
      created: Date.now(),
      lastSeen: Date.now()
    };
    this.rivals.set(id, rec);
    void this.store.put(rec);
    return { rivalId: id, name: rec.name, tier: 0, traitIds: [] };
  }

  promoteOnPlayerDeath(rivalId: string, rng: RNG): { record: RivalRecord; promoted: boolean; newTrait: TraitDef | null } {
    const rec = this.rivals.get(rivalId)!;
    let promoted = false;
    let newTrait: TraitDef | null = null;
    if (rec.tier < MAX_TIER) {
      rec.tier++;
      promoted = true;
      newTrait = pickNewTrait(rec.traits, rng);
      if (newTrait) rec.traits.push(newTrait.id);
    }
    rec.kills++;
    rec.taunt = killTaunt(rng);
    rec.lastSeen = Date.now();
    void this.store.put(rec);
    return { record: rec, promoted, newTrait };
  }

  registerEnemyDeath(rivalId: string): void {
    const rec = this.rivals.get(rivalId);
    if (!rec) return;
    rec.deaths++;
    void this.store.put(rec);
  }

  tierColor(tier: number): string {
    return TIERS[Math.min(tier, TIERS.length - 1)].color;
  }
}
