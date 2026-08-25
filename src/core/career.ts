export interface MilestoneDef {
  id: string;
  name: string;
  desc: string;
}

export const MILESTONES: readonly MilestoneDef[] = [
  { id: 'firstblood',  name: 'FIRST BLOOD',    desc: 'Win your first fight in the pit' },
  { id: 'wave5',       name: 'REGULAR',        desc: 'Reach wave 5' },
  { id: 'bossdown',    name: 'BOSS SLAYER',    desc: 'Bring down THE PITBOSS' },
  { id: 'wave10',      name: 'VETERAN',        desc: 'Reach wave 10' },
  { id: 'streak6',     name: 'UNSTOPPABLE',    desc: 'Land an UNSTOPPABLE streak' },
  { id: 'heads50',     name: 'SURGEON',        desc: '50 headshot kills' },
  { id: 'cratejackpot', name: 'JACKPOT',        desc: 'Hit a mystery crate jackpot' },
  { id: 'daily1',      name: 'DAILY GRINDER',  desc: 'Complete a daily run' },
  { id: 'kills250',    name: 'CROWD PLEASER',  desc: '250 total kills' },
  { id: 'warden1',     name: 'TURRET FAN',     desc: 'Get a Warden kill assist' }
];

export interface CareerCounters {
  kills: number;
  bestWave: number;
  headshotKills: number;
  cratesOpened: number;
  bestStreak: number;
  bossKills: number;
  wardenKills: number;
  dailyRuns: number;
  jackpots: number;
}

const DEFAULT_COUNTERS: CareerCounters = {
  kills: 0,
  bestWave: 0,
  headshotKills: 0,
  cratesOpened: 0,
  bestStreak: 0,
  bossKills: 0,
  wardenKills: 0,
  dailyRuns: 0,
  jackpots: 0
};

interface StoredCareer {
  c: CareerCounters;
  m: string[];
}

const STORE_KEY = 'pitboss.career.v1';

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const b36 = (n: number) => Math.max(0, Math.floor(n)).toString(36);

function encodePayload(counters: CareerCounters, milestoneIds: string[]): string {
  const ids = [...milestoneIds].sort();
  return [
    b36(counters.kills),
    b36(counters.bestWave),
    b36(counters.headshotKills),
    b36(counters.cratesOpened),
    b36(counters.bestStreak),
    b36(counters.bossKills),
    b36(counters.wardenKills),
    b36(counters.dailyRuns),
    b36(counters.jackpots),
    ids.join('.')
  ].join('-');
}

function decodePayload(payload: string): StoredCareer | null {
  const parts = payload.split('-');
  if (parts.length !== 10) return null;
  const nums = parts.slice(0, 9).map(p => parseInt(p, 36));
  if (nums.some(n => Number.isNaN(n) || n < 0)) return null;
  const milestones = parts[9] ? parts[9].split('.').filter(id => MILESTONES.some(m => m.id === id)) : [];
  return {
    c: {
      kills: nums[0],
      bestWave: nums[1],
      headshotKills: nums[2],
      cratesOpened: nums[3],
      bestStreak: nums[4],
      bossKills: nums[5],
      wardenKills: nums[6],
      dailyRuns: nums[7],
      jackpots: nums[8]
    },
    m: milestones
  };
}

export interface MilestoneToast {
  def: MilestoneDef;
}

export class Career {
  counters: CareerCounters = { ...DEFAULT_COUNTERS };
  milestones = new Set<string>();

  onMilestone: (def: MilestoneDef) => void = () => {};

  constructor() {
    this.load();
  }

  has(id: string): boolean {
    return this.milestones.has(id);
  }

  unlockedCount(): number {
    return this.milestones.size;
  }

  /** Record a counter bump; returns milestone defs newly unlocked this call. */
  track(patch: Partial<CareerCounters>): MilestoneDef[] {
    for (const [k, v] of Object.entries(patch)) {
      const key = k as keyof CareerCounters;
      this.counters[key] = Math.max(this.counters[key], v);
    }
    return this.evaluate();
  }

  /** Additive counters (kills, headshots, crates…). Returns newly unlocked defs. */
  bump(patch: Partial<CareerCounters>): MilestoneDef[] {
    for (const [k, v] of Object.entries(patch)) {
      const key = k as keyof CareerCounters;
      this.counters[key] += v;
    }
    return this.evaluate();
  }

  private evaluate(): MilestoneDef[] {
    const fresh: MilestoneDef[] = [];
    const c = this.counters;
    const check = (id: string, cond: boolean) => {
      if (cond && !this.milestones.has(id)) {
        this.milestones.add(id);
        const def = MILESTONES.find(m => m.id === id);
        if (def) fresh.push(def);
      }
    };
    check('firstblood', c.kills >= 1);
    check('wave5', c.bestWave >= 5);
    check('bossdown', c.bossKills >= 1);
    check('wave10', c.bestWave >= 10);
    check('streak6', c.bestStreak >= 6);
    check('heads50', c.headshotKills >= 50);
    check('cratejackpot', c.jackpots >= 1);
    check('daily1', c.dailyRuns >= 1);
    check('kills250', c.kills >= 250);
    check('warden1', c.wardenKills >= 1);
    if (fresh.length > 0) this.save();
    for (const def of fresh) this.onMilestone(def);
    return fresh;
  }

  exportCode(settingsSegment?: string): string {
    const payload = settingsSegment
      ? `${encodePayload(this.counters, [...this.milestones])}-${settingsSegment}`
      : encodePayload(this.counters, [...this.milestones]);
    const sum = b36(fnv1a(payload) % 1296);
    return `PBC${settingsSegment ? '2' : '1'}-${payload}-${sum}`;
  }

  /** Merge an imported code. Returns imported milestone count + settings segment (PBC2), or null if invalid. */
  importCode(code: string): { imported: number; settingsSegment: string | null } | null {
    const parts = code.trim().split('-');
    const header = parts[0]?.toLowerCase() ?? '';
    const isPBC2 = header === 'pbc2';
    const expected = isPBC2 ? 13 : 12;
    if (parts.length !== expected || !(header === 'pbc1' || isPBC2)) return null;
    const fullPayload = parts.slice(1, expected - 1).join('-');
    const sum = b36(fnv1a(fullPayload) % 1296);
    if (sum !== parts[expected - 1]) return null;
    const careerPayload = parts.slice(1, 11).join('-');
    const decoded = decodePayload(careerPayload);
    if (!decoded) return null;
    let imported = 0;
    for (const [k, v] of Object.entries(decoded.c)) {
      const key = k as keyof CareerCounters;
      if (v > this.counters[key]) this.counters[key] = v;
    }
    for (const id of decoded.m) {
      if (!this.milestones.has(id)) {
        this.milestones.add(id);
        imported++;
      }
    }
    this.save();
    return { imported, settingsSegment: isPBC2 ? parts[11] : null };
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredCareer;
      this.counters = { ...DEFAULT_COUNTERS, ...parsed.c };
      this.milestones = new Set((parsed.m ?? []).filter(id => MILESTONES.some(m => m.id === id)));
    } catch {
      // corrupted store — start fresh
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ c: this.counters, m: [...this.milestones] } satisfies StoredCareer));
    } catch {
      // storage unavailable — session-only career
    }
  }
}
