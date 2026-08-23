import type { RivalRecord } from '../memory/rivals';
import { TIERS, TRAIT_POOL } from '../enemies/traits';
import { formatTime } from '../utils/math';
import type { ScoreEntry } from '../core/highscores';

export interface DeathScreenData {
  killerName: string;
  killerTier: number;
  killerTraits: string[];
  taunt: string;
  promoted: boolean;
  newTier: number;
  newTrait: TraitName | null;
  stats: { wave: number; kills: number; accuracy: number; timeSec: number };
  shareCode: string;
  rank: number;
}

type TraitName = typeof TRAIT_POOL[number]['name'];

function tierColor(tier: number): string {
  return TIERS[Math.min(tier, TIERS.length - 1)].color;
}

export class Screens {
  private startEl = document.getElementById('screen-start')!;
  private deathEl = document.getElementById('screen-death')!;
  private rosterEl = document.getElementById('screen-roster')!;
  private pauseEl = document.getElementById('pause-layer')!;
  private enterBtn = document.getElementById('btn-enter') as HTMLButtonElement;

  private bestLine = document.getElementById('best-line')!;
  private killerName = document.getElementById('killer-name')!;
  private killerTier = document.getElementById('killer-tier')!;
  private killerTraits = document.getElementById('killer-traits')!;
  private killerTaunt = document.getElementById('killer-taunt')!;
  private killerPromo = document.getElementById('killer-promo')!;
  private runStats = document.getElementById('run-stats')!;
  private shareCode = document.getElementById('share-code') as HTMLInputElement;
  private rosterList = document.getElementById('roster-list')!;
  private rosterOpenedFromDeath = false;

  onEnterThePit: () => void = () => {};
  onReenter: () => void = () => {};
  onRosterOpen: (fromDeath: boolean) => void = () => {};
  onRosterClose: (fromDeath: boolean) => void = () => {};
  onResume: () => void = () => {};
  onDecode: (code: string) => void = () => {};

  private pasteInput = document.getElementById('paste-code') as HTMLInputElement;
  private decodeResult = document.getElementById('decode-result')!;
  private hallEl = document.getElementById('hall')!;
  private newHighscoreEl = document.getElementById('new-highscore')!;

  constructor() {
    document.getElementById('btn-enter')!.addEventListener('click', () => { this.onEnterThePit(); });
    document.getElementById('btn-reenter')!.addEventListener('click', () => { this.onReenter(); });
    document.getElementById('btn-roster')!.addEventListener('click', () => this.onRosterOpen(false));
    document.getElementById('btn-roster-death')!.addEventListener('click', () => this.onRosterOpen(true));
    document.getElementById('btn-roster-back')!.addEventListener('click', () => {
      this.onRosterClose(this.rosterOpenedFromDeath);
    });
    document.getElementById('btn-resume')!.addEventListener('click', () => this.onResume());
    const decodeNow = () => this.onDecode(this.pasteInput.value);
    document.getElementById('btn-decode')!.addEventListener('click', decodeNow);
    this.pasteInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') decodeNow();
    });
    document.getElementById('btn-copy')!.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.shareCode.value);
        const btn = document.getElementById('btn-copy')!;
        btn.textContent = 'COPIED';
        setTimeout(() => { btn.textContent = 'COPY'; }, 1200);
      } catch {
        this.shareCode.select();
      }
    });
  }

  hideAll(): void {
    for (const el of [this.startEl, this.deathEl, this.rosterEl, this.pauseEl]) {
      el.classList.add('hidden');
    }
  }

  setLoading(loading: boolean): void {
    this.enterBtn.disabled = loading;
    this.enterBtn.textContent = loading ? 'WAKING THE PIT…' : 'ENTER THE PIT';
  }

  setBest(bestWave: number): void {
    this.bestLine.textContent = bestWave > 0 ? `BEST RUN — WAVE ${bestWave}` : 'NO RUNS ON RECORD. THE PIT AWAITS.';
  }

  setHall(entries: ScoreEntry[]): void {
    this.setBest(entries[0]?.wave ?? 0);
    this.hallEl.innerHTML = '';
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hall-empty';
      empty.textContent = 'HALL OF SCARS — EMPTY. FEED IT.';
      this.hallEl.appendChild(empty);
      return;
    }
    entries.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'hall-row';

      const rank = document.createElement('span');
      rank.className = 'hall-rank';
      rank.textContent = `#${i + 1}`;

      const stats = document.createElement('span');
      stats.className = 'hall-stats';
      stats.textContent = `WAVE ${e.wave} · ${e.kills} KILLS · ${Math.round(e.accuracy * 100)}%`;

      const meta = document.createElement('span');
      meta.className = 'hall-meta';
      meta.textContent = `${formatTime(e.timeSec)} · ${daysAgo(e.dayStamp)}`;

      row.append(rank, stats, meta);
      this.hallEl.appendChild(row);
    });
  }

  setDecodeResult(text: string, kind: 'good' | 'bad' | 'beat'): void {
    this.decodeResult.textContent = text;
    this.decodeResult.classList.remove('good', 'bad', 'beat');
    this.decodeResult.classList.add(kind);
  }

  showStart(): void {
    this.hideAll();
    this.startEl.classList.remove('hidden');
  }

  showPause(): void {
    if (this.rosterEl.classList.contains('hidden')) this.pauseEl.classList.remove('hidden');
  }

  hidePause(): void {
    this.pauseEl.classList.add('hidden');
  }

  showDeath(data: DeathScreenData): void {
    this.hideAll();
    if (data.rank === 1) {
      this.newHighscoreEl.textContent = '★ NEW HIGH SCORE ★';
      this.newHighscoreEl.classList.remove('hidden');
    } else if (data.rank > 0) {
      this.newHighscoreEl.textContent = `MADE THE HALL OF SCARS — #${data.rank}`;
      this.newHighscoreEl.classList.remove('hidden');
    } else {
      this.newHighscoreEl.classList.add('hidden');
    }
    this.killerName.textContent = data.killerName;
    this.killerName.style.color = tierColor(data.killerTier);
    this.killerTier.textContent = `${TIERS[Math.min(data.killerTier, TIERS.length - 1)].name} · TIER ${data.killerTier + 1}`;
    this.killerTaunt.textContent = `“${data.taunt}”`;

    this.killerTraits.innerHTML = '';
    for (const id of data.killerTraits) {
      if (data.newTrait && TRAIT_POOL.find(t => t.id === id)?.name === data.newTrait) continue;
      const def = TRAIT_POOL.find(t => t.id === id);
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = def ? def.name : id;
      chip.title = def ? def.desc : '';
      this.killerTraits.appendChild(chip);
    }
    if (data.newTrait) {
      const def = TRAIT_POOL.find(t => t.name === data.newTrait);
      const chip = document.createElement('span');
      chip.className = 'chip new';
      chip.textContent = `+ ${data.newTrait}`;
      chip.title = def ? def.desc : '';
      this.killerTraits.appendChild(chip);
    }

    this.killerPromo.textContent = data.promoted
      ? `${data.killerName} CONSUMED YOUR STREAK → ${TIERS[data.newTier].name}`
      : `${data.killerName} grows no stronger. Yet.`;

    this.runStats.innerHTML = '';
    const entries: Array<[string, string]> = [
      ['WAVE', String(data.stats.wave)],
      ['KILLS', String(data.stats.kills)],
      ['ACCURACY', `${Math.round(data.stats.accuracy * 100)}%`],
      ['TIME', formatTime(data.stats.timeSec)]
    ];
    for (const [label, value] of entries) {
      const div = document.createElement('div');
      div.className = 'rs-item';
      const v = document.createElement('div');
      v.className = 'rs-value';
      v.textContent = value;
      const l = document.createElement('div');
      l.className = 'rs-label';
      l.textContent = label;
      div.append(v, l);
      this.runStats.appendChild(div);
    }

    this.shareCode.value = data.shareCode;
    this.deathEl.classList.remove('hidden');
  }

  isDeathVisible(): boolean {
    return !this.deathEl.classList.contains('hidden');
  }

  showRoster(records: RivalRecord[], fromDeath: boolean): void {
    this.rosterOpenedFromDeath = fromDeath;
    this.hideAll();
    this.rosterList.innerHTML = '';
    if (records.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'roster-sub';
      empty.textContent = 'No rivals yet. Die to someone worth remembering.';
      this.rosterList.appendChild(empty);
    }
    for (const r of records) {
      const row = document.createElement('div');
      row.className = 'rival-row';
      row.style.setProperty('--tier-color', tierColor(r.tier));

      const tier = document.createElement('div');
      tier.className = 'rival-tier';
      tier.textContent = TIERS[Math.min(r.tier, TIERS.length - 1)].name;

      const nameWrap = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'rival-name';
      name.textContent = r.name;
      nameWrap.appendChild(name);
      if (r.deaths >= 3) {
        const feared = document.createElement('div');
        feared.className = 'rival-feared';
        feared.textContent = `has fallen to you ${r.deaths} times`;
        nameWrap.appendChild(feared);
      }

      const traits = document.createElement('div');
      traits.className = 'rival-traits';
      for (const id of r.traits) {
        const def = TRAIT_POOL.find(t => t.id === id);
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = def ? def.name : id;
        chip.title = def ? def.desc : '';
        traits.appendChild(chip);
      }

      const record = document.createElement('div');
      record.className = 'rival-record';
      record.innerHTML = `killed you <b>${r.kills}</b>× · died <b>${r.deaths}</b>×`;

      row.append(tier, nameWrap, traits, record);
      this.rosterList.appendChild(row);
    }
    this.rosterEl.classList.remove('hidden');
  }
}

function daysAgo(dayStamp: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 86400000) - dayStamp);
  return diff === 0 ? 'today' : `${diff}d ago`;
}
