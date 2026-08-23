import { clamp } from '../utils/math';

export class Hud {
  private root = document.getElementById('hud')!;
  private hpFill = document.getElementById('hp-fill')!;
  private hpBar = document.getElementById('hp-bar')!;
  private ammoCount = document.getElementById('ammo-count')!;
  private reloadHint = document.getElementById('reload-hint')!;
  private waveNum = document.getElementById('wave-num')!;
  private heatFill = document.getElementById('heat-fill')!;
  private killfeed = document.getElementById('killfeed')!;
  private bannerEl = document.getElementById('banner')!;
  private vignette = document.getElementById('vignette')!;
  private hitmarker = document.getElementById('hitmarker')!;
  private bossbar = document.getElementById('bossbar')!;
  private bossName = document.getElementById('boss-name')!;
  private bossHpFill = document.getElementById('boss-hp-fill')!;
  private specialWrap = document.getElementById('special-wrap')!;
  private specialName = document.getElementById('special-name')!;
  private specialFill = document.getElementById('special-fill')!;
  private vignetteTimer: number | undefined;

  private bannerTimer = 0;
  private bannerQueue: string[] = [];

  show(): void { this.root.classList.remove('hidden'); }
  hide(): void { this.root.classList.add('hidden'); }

  setSpecial(name: string | null, frac: number, seconds: number): void {
    if (name === null) {
      this.specialWrap.classList.add('hidden');
      return;
    }
    this.specialWrap.classList.remove('hidden');
    this.specialName.textContent = `${name} · ${Math.max(0, seconds).toFixed(1)}s`;
    this.specialFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  setHp(cur: number, max: number): void {
    const frac = clamp(cur / max, 0, 1);
    this.hpFill.style.width = `${frac * 100}%`;
    this.hpFill.classList.toggle('low', frac < 0.35);
    void this.hpBar;
  }

  setAmmo(ammo: number, reloading: boolean): void {
    this.ammoCount.textContent = String(ammo);
    this.reloadHint.classList.toggle('hidden', !reloading);
  }

  setWave(wave: number): void {
    this.waveNum.textContent = String(wave);
  }

  setHeat(heat: number): void {
    this.heatFill.style.width = `${clamp(heat, 0, 1) * 100}%`;
  }

  feed(text: string, cls: '' | 'rival' | 'info' = ''): void {
    const item = document.createElement('div');
    item.className = `feed-item ${cls}`.trim();
    item.textContent = text;
    this.killfeed.prepend(item);
    while (this.killfeed.children.length > 5) {
      this.killfeed.lastChild?.remove();
    }
    setTimeout(() => item.classList.add('fadeout'), 3400);
    setTimeout(() => item.remove(), 4100);
  }

  banner(text: string): void {
    this.bannerQueue.push(text);
    if (this.bannerTimer <= 0) this.nextBanner();
  }

  private nextBanner(): void {
    const next = this.bannerQueue.shift();
    if (!next) return;
    this.bannerEl.textContent = next;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    this.bannerTimer = 2.3;
    setTimeout(() => this.nextBanner(), 2300);
  }

  tick(dt: number): void {
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
  }

  damageFlash(strength: number): void {
    const alpha = Math.min(1, strength) * 0.85;
    this.vignette.style.boxShadow = `inset 0 0 ${120 + strength * 90}px rgba(255,51,85,${alpha})`;
    window.clearTimeout(this.vignetteTimer);
    this.vignetteTimer = window.setTimeout(() => {
      this.vignette.style.boxShadow = 'inset 0 0 180px rgba(255,51,85,0)';
    }, 130);
  }

  hitMarker(): void {
    this.hitmarker.classList.remove('show');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('show');
  }

  setBoss(name: string | null, frac: number): void {
    if (name === null) {
      this.bossbar.classList.add('hidden');
      return;
    }
    this.bossbar.classList.remove('hidden');
    this.bossName.textContent = name;
    this.bossHpFill.style.width = `${clamp(frac, 0, 1) * 100}%`;
  }
}
