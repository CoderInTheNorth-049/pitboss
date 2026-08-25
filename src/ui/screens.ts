import type { RivalRecord } from '../memory/rivals';
import { TIERS, TRAIT_POOL } from '../enemies/traits';
import { formatTime } from '../utils/math';
import type { ScoreEntry } from '../core/highscores';
import type { Settings, Action } from '../core/settings';
import { ACTIONS, prettyCode } from '../core/settings';
import type { Input } from '../core/input';
import type { BoonDef } from '../core/boons';
import { MUTATORS } from '../core/mutators';
import { MILESTONES, type Career } from '../core/career';
import { MUZZLE_STYLES } from '../core/settings';

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

  private settingsEl = document.getElementById('screen-settings')!;
  private controlsTab = document.getElementById('tab-controls') as HTMLButtonElement;
  private accessTab = document.getElementById('tab-access') as HTMLButtonElement;
  private styleTab = document.getElementById('tab-style') as HTMLButtonElement;
  private panelControls = document.getElementById('panel-controls')!;
  private panelAccess = document.getElementById('panel-access')!;
  private panelStyle = document.getElementById('panel-style')!;
  private muzzleOptions = document.getElementById('muzzle-options')!;
  private bindList = document.getElementById('bind-list')!;
  private controlsHelp = document.getElementById('controls-help')!;
  private sensInput = document.getElementById('set-sens') as HTMLInputElement;
  private fovInput = document.getElementById('set-fov') as HTMLInputElement;
  private volInput = document.getElementById('set-vol') as HTMLInputElement;
  private crossInput = document.getElementById('set-cross') as HTMLInputElement;
  private invertInput = document.getElementById('set-invert') as HTMLInputElement;
  private flashInput = document.getElementById('set-flash') as HTMLInputElement;
  private sensVal = document.getElementById('sens-val')!;
  private fovVal = document.getElementById('fov-val')!;
  private volVal = document.getElementById('vol-val')!;
  private crossVal = document.getElementById('cross-val')!;
  private settingsFromPause = false;
  private listeningAction: Action | null = null;
  private dropGuide = document.getElementById('drop-guide')!;
  private mutatorChips = document.getElementById('mutator-chips')!;
  private dailyBtn = document.getElementById('btn-daily')!;
  private dailyBestLine = document.getElementById('daily-best-line')!;
  private careerCodeInput = document.getElementById('career-code-input') as HTMLInputElement;
  private careerImportBtn = document.getElementById('btn-career-import')!;
  private careerCopyBtn = document.getElementById('btn-career-copy')!;
  private careerResult = document.getElementById('career-result')!;
  private milestoneList = document.getElementById('milestone-list')!;
  private draftEl = document.getElementById('screen-draft')!;
  private boonCards = document.getElementById('boon-cards')!;
  private draftSkip = document.getElementById('btn-draft-skip')!;

  onBoonPicked: (index: number) => void = () => {};
  onDraftSkip: () => void = () => {};
  onDailyRun: () => void = () => {};
  onCareerImport: (code: string) => void = () => {};
  onCareerCopy: () => void = () => {};

  onAccessChanged: () => void = () => {};

  constructor(private settings: Settings, private input: Input, private career: Career) {
    document.getElementById('btn-enter')!.addEventListener('click', () => { this.onEnterThePit(); });
    document.getElementById('btn-reenter')!.addEventListener('click', () => { this.onReenter(); });
    document.getElementById('btn-roster')!.addEventListener('click', () => this.onRosterOpen(false));
    document.getElementById('btn-roster-death')!.addEventListener('click', () => this.onRosterOpen(true));
    document.getElementById('btn-roster-back')!.addEventListener('click', () => {
      this.onRosterClose(this.rosterOpenedFromDeath);
    });
    document.getElementById('btn-resume')!.addEventListener('click', () => this.onResume());
    document.getElementById('btn-settings')!.addEventListener('click', () => this.showSettings(false));
    this.dailyBtn.addEventListener('click', () => this.onDailyRun());
    this.careerImportBtn.addEventListener('click', () => this.onCareerImport(this.careerCodeInput.value));
    this.careerCopyBtn.addEventListener('click', () => this.onCareerCopy());
    this.careerCodeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.onCareerImport(this.careerCodeInput.value);
    });
    document.getElementById('btn-pause-settings')!.addEventListener('click', () => this.showSettings(true));
    document.getElementById('btn-settings-back')!.addEventListener('click', () => this.closeSettings());
    this.draftSkip.addEventListener('click', () => this.onDraftSkip());
    document.getElementById('btn-binds-reset')!.addEventListener('click', () => {
      if (this.listeningAction) return;
      this.settings.resetBindings();
    });
    this.controlsTab.addEventListener('click', () => this.switchTab('controls'));
    this.accessTab.addEventListener('click', () => this.switchTab('access'));
    this.styleTab.addEventListener('click', () => this.switchTab('style'));
    this.sensInput.addEventListener('input', () =>
      this.settings.setAccess({ mouseSens: Number(this.sensInput.value) }));
    this.fovInput.addEventListener('input', () =>
      this.settings.setAccess({ fov: Number(this.fovInput.value) }));
    this.volInput.addEventListener('input', () =>
      this.settings.setAccess({ volume: Number(this.volInput.value) }));
    this.crossInput.addEventListener('input', () =>
      this.settings.setAccess({ crosshairScale: Number(this.crossInput.value) }));
    this.invertInput.addEventListener('change', () =>
      this.settings.setAccess({ invertY: this.invertInput.checked }));
    this.flashInput.addEventListener('change', () =>
      this.settings.setAccess({ reducedFlash: this.flashInput.checked }));

    this.settings.onChange(() => {
      this.renderBindList();
      this.renderControlsHelp();
      this.renderAccessValues();
      this.renderStyleOptions();
      this.onAccessChanged();
    });
    this.renderBindList();
    this.renderControlsHelp();
    this.renderAccessValues();
    this.renderDropGuide();
    this.renderMutatorChips();
    this.setMilestones(this.career);

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
    for (const el of [this.startEl, this.deathEl, this.rosterEl, this.pauseEl, this.settingsEl, this.draftEl]) {
      el.classList.add('hidden');
    }
  }

  showDraft(choices: BoonDef[], stackOf: (id: string) => number): void {
    this.hideAll();
    this.boonCards.innerHTML = '';
    choices.forEach((boon, i) => {
      const card = document.createElement('button');
      card.className = 'boon-card';
      card.style.setProperty('--boon-color', boon.color);

      const name = document.createElement('div');
      name.className = 'boon-name';
      name.textContent = boon.name;

      const desc = document.createElement('div');
      desc.className = 'boon-desc';
      desc.textContent = boon.desc;

      const owned = stackOf(boon.id);
      const pips = document.createElement('div');
      pips.className = 'boon-pips';
      for (let p = 0; p < boon.maxStacks; p++) {
        const pip = document.createElement('span');
        pip.className = p < owned ? 'pip owned' : 'pip';
        pips.appendChild(pip);
      }

      const key = document.createElement('div');
      key.className = 'boon-key';
      key.textContent = `PICK ${i + 1}`;

      card.append(name, desc, pips, key);
      card.addEventListener('click', () => this.onBoonPicked(i));
      this.boonCards.appendChild(card);
    });
    this.draftEl.classList.remove('hidden');
  }

  hideDraft(): void {
    this.draftEl.classList.add('hidden');
  }

  private switchTab(which: 'controls' | 'access' | 'style'): void {
    this.controlsTab.classList.toggle('active', which === 'controls');
    this.accessTab.classList.toggle('active', which === 'access');
    this.styleTab.classList.toggle('active', which === 'style');
    this.panelControls.classList.toggle('hidden', which !== 'controls');
    this.panelAccess.classList.toggle('hidden', which !== 'access');
    this.panelStyle.classList.toggle('hidden', which !== 'style');
    if (which === 'style') this.renderStyleOptions();
  }

  private renderStyleOptions(): void {
    this.muzzleOptions.innerHTML = '';
    for (const style of MUZZLE_STYLES) {
      const unlocked = !style.requires || this.career.has(style.requires);
      const btn = document.createElement('button');
      btn.className = 'muzzle-btn' + (this.settings.access.muzzle === style.id ? ' active' : '');
      btn.disabled = !unlocked;

      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = style.css ?? '#e8e6e0';
      if (style.css) swatch.style.boxShadow = `0 0 10px ${style.css}`;

      const label = document.createElement('span');
      label.textContent = style.name;

      const req = document.createElement('small');
      if (unlocked) {
        req.textContent = style.requires ? 'UNLOCKED' : 'DEFAULT';
      } else {
        const def = MILESTONES.find(m => m.id === style.requires);
        req.textContent = `LOCKED — ${def ? def.name.toUpperCase() : ''}`;
      }

      btn.append(swatch, label, req);
      if (unlocked) {
        btn.addEventListener('click', () => this.settings.setAccess({ muzzle: style.id }));
      }
      this.muzzleOptions.appendChild(btn);
    }
  }

  showSettings(fromPause: boolean): void {
    this.settingsFromPause = fromPause;
    if (fromPause) this.pauseEl.classList.add('hidden');
    else this.startEl.classList.add('hidden');
    this.settingsEl.classList.remove('hidden');
  }

  closeSettings(): void {
    if (this.listeningAction) {
      this.listeningAction = null;
      this.input.cancelCapture();
    }
    this.settingsEl.classList.add('hidden');
    if (this.settingsFromPause) this.pauseEl.classList.remove('hidden');
    else this.startEl.classList.remove('hidden');
  }

  isSettingsVisible(): boolean {
    return !this.settingsEl.classList.contains('hidden');
  }

  private renderBindList(): void {
    this.bindList.innerHTML = '';
    for (const def of ACTIONS) {
      const row = document.createElement('div');
      row.className = 'bind-row';

      const label = document.createElement('span');
      label.className = 'bind-label';
      label.textContent = def.label;

      const key = document.createElement('button');
      key.className = 'bind-key';
      key.dataset.action = def.id;
      key.textContent =
        this.listeningAction === def.id ? 'PRESS KEY…' : prettyCode(this.settings.bindings[def.id]);
      if (this.listeningAction === def.id) key.classList.add('listening');
      key.addEventListener('click', () => this.beginCapture(def.id));

      row.append(label, key);
      this.bindList.appendChild(row);
    }
  }

  private beginCapture(action: Action): void {
    if (this.listeningAction === action) return;
    this.listeningAction = action;
    this.renderBindList();
    this.input.onCapture = code => {
      this.input.onCapture = () => {};
      this.listeningAction = null;
      if (code !== null) this.settings.rebind(action, code);
      else {
        this.renderBindList();
        this.renderControlsHelp();
      }
    };
    this.input.startCapture();
  }

  private renderControlsHelp(): void {
    const b = this.settings.bindings;
    const k = (code: string) => prettyCode(code).replace('MOUSE ', 'M');
    this.controlsHelp.innerHTML = '';
    const parts: Array<[string, string]> = [
      [`${k(b.forward)}${k(b.left)}${k(b.back)}${k(b.right)}`, 'move'],
      ['MOUSE', 'aim'],
      [k(b.fire), 'fire'],
      [k(b.reload), 'reload'],
      [k(b.jump), 'jump'],
      [k(b.sprint), 'sprint'],
      [k(b.crouch), 'crouch'],
      ['ESC', 'pause']
    ];
    for (const [key, label] of parts) {
      const span = document.createElement('span');
      const bold = document.createElement('b');
      bold.textContent = key;
      span.append(bold, document.createTextNode(` ${label}`));
      this.controlsHelp.appendChild(span);
    }
  }

  private renderMutatorChips(): void {
    this.mutatorChips.innerHTML = '';
    for (const m of MUTATORS) {
      const chip = document.createElement('span');
      chip.className = 'mchip';
      chip.textContent = m.name;
      chip.title = m.desc;
      chip.style.setProperty('--mc', m.color);
      this.mutatorChips.appendChild(chip);
    }
  }

  private renderDropGuide(): void {
    this.dropGuide.innerHTML = '';
    for (const entry of DROP_GUIDE) {
      const row = document.createElement('div');
      row.className = 'guide-row';
      row.style.setProperty('--guide-color', entry.color);

      const icon = document.createElement('span');
      icon.className = 'guide-icon';
      icon.innerHTML =
        `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" aria-hidden="true">${GUIDE_ICONS[entry.icon]}</svg>`;

      const text = document.createElement('span');
      text.className = 'guide-text';
      const label = document.createElement('b');
      label.textContent = entry.label;
      const desc = document.createElement('span');
      desc.textContent = entry.desc;
      text.append(label, desc);

      row.append(icon, text);
      this.dropGuide.appendChild(row);
    }
  }

  private renderAccessValues(): void {
    const a = this.settings.access;
    this.sensInput.value = String(a.mouseSens);
    this.fovInput.value = String(a.fov);
    this.volInput.value = String(a.volume);
    this.crossInput.value = String(a.crosshairScale);
    this.invertInput.checked = a.invertY;
    this.flashInput.checked = a.reducedFlash;
    this.sensVal.textContent = `${a.mouseSens.toFixed(2)}×`;
    this.fovVal.textContent = `${a.fov}°`;
    this.volVal.textContent = `${Math.round(a.volume * 100)}%`;
    this.crossVal.textContent = `${a.crosshairScale.toFixed(2)}×`;
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

  setDailyBest(wave: number): void {
    if (wave > 0) {
      this.dailyBestLine.textContent = `TODAY'S DAILY BEST — WAVE ${wave}`;
      this.dailyBestLine.classList.remove('hidden');
    } else {
      this.dailyBestLine.classList.add('hidden');
    }
  }

  setMilestones(career: Career): void {
    this.milestoneList.innerHTML = '';
    for (const m of MILESTONES) {
      const unlocked = career.has(m.id);
      const chip = document.createElement('span');
      chip.className = unlocked ? 'ms-chip unlocked' : 'ms-chip';
      chip.textContent = m.name;
      chip.title = m.desc;
      this.milestoneList.appendChild(chip);
    }
  }

  setCareerResult(text: string, good: boolean): void {
    this.careerResult.textContent = text;
    this.careerResult.classList.toggle('good', good);
    this.careerResult.classList.toggle('bad', !good);
  }

  setCareerInput(value: string): void {
    this.careerCodeInput.value = value;
    this.careerCodeInput.select();
  }

  get careerInput(): string {
    return this.careerCodeInput.value;
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

type GuideIcon = 'heart' | 'gun' | 'flame' | 'turret' | 'shield' | 'shard' | 'cage' | 'crate' | 'mystery';

interface GuideEntry {
  icon: GuideIcon;
  color: string;
  label: string;
  desc: string;
}

const DROP_GUIDE: readonly GuideEntry[] = [
  { icon: 'heart',   color: '#ff3355', label: 'VITALITY VIAL', desc: '+30 VITALS · ONE EVERY WAVE' },
  { icon: 'gun',     color: '#35e0d6', label: 'RAILHAND',      desc: 'PIERCES ALL IN A LINE · 12s' },
  { icon: 'flame',   color: '#ff6a1a', label: 'PYROCLAST',     desc: 'FLAME CONE · BURNS CROWDS · 12s' },
  { icon: 'turret',  color: '#c15cff', label: 'WARDEN',        desc: 'AUTO-TURRET AT YOUR FEET · 20s' },
  { icon: 'shield',  color: '#3fa7ff', label: 'AEGIS',         desc: 'ABSORBS 65–80% DAMAGE · 10s' },
  { icon: 'shard',   color: '#ff2244', label: 'OVERDRIVE',     desc: '2× DMG + INFINITE AMMO · 6s' },
  { icon: 'cage',    color: '#ffd23f', label: 'BULWARK',       desc: 'TOTAL INVULNERABILITY · 5s' },
  { icon: 'crate',   color: '#9dff3f', label: 'AMMO CACHE',    desc: 'INSTANT FULL MAGAZINE' },
  { icon: 'mystery', color: '#ff8adf', label: 'MYSTERY CRATE', desc: 'RANDOM TREAT INSIDE' }
];

const GUIDE_ICONS: Record<GuideIcon, string> = {
  heart: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
  gun: '<polygon points="2,9.5 19,9.5 19,12.5 21,12.5 21,14.5 13,14.5 11.5,19 8,19 9.6,14.5 2,14.5"/><rect x="4" y="7" width="3" height="2"/>',
  flame: '<path d="M12 2c1.2 4-3.2 5.6-3.2 9a3.6 3.6 0 0 0 7.2.4C17.6 8.8 14 7.4 14.6 4c2.2 1.6 5.4 4.6 5.4 9A7.9 7.9 0 0 1 4 13C4 8.2 10 6.4 12 2z"/>',
  turret: '<path d="M7.5 15a4.5 4.5 0 0 1 9 0z"/><rect x="12.5" y="11" width="8" height="2.4" rx="1"/><rect x="9.8" y="15" width="4.4" height="3"/><rect x="5" y="18" width="14" height="2.4" rx="0.8"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z"/>',
  shard: '<polygon points="12,2 19,12 12,22 5,12"/>',
  cage: '<polygon points="12,1.5 22.5,12 12,22.5 1.5,12" fill="none" stroke-width="1.8"/><polygon points="12,7 17,12 12,17 7,12"/>',
  crate: '<rect x="4" y="6" width="16" height="12.5" rx="1"/><rect x="4" y="10.6" width="16" height="2.2" fill="#0b0b0e" opacity="0.55"/>',
  mystery: '<rect x="4" y="5" width="16" height="14" rx="1.5" fill="none" stroke-width="2"/><path d="M9.2 10a2.8 2.8 0 1 1 4 2.5c-.9.5-1.2 1-1.2 2" fill="none" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.4" stroke="none"/>'
};
