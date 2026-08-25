import { clamp } from '../utils/math';

export class Hud {
  private root = document.getElementById('hud')!;
  private crosshair = document.getElementById('crosshair')!;
  private hpFill = document.getElementById('hp-fill')!;
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
  private shieldWrap = document.getElementById('shield-wrap')!;
  private shieldName = document.getElementById('shield-name')!;
  private shieldFill = document.getElementById('shield-fill')!;
  private boostWrap = document.getElementById('boost-wrap')!;
  private boostName = document.getElementById('boost-name')!;
  private boostFill = document.getElementById('boost-fill')!;
  private invulnWrap = document.getElementById('invuln-wrap')!;
  private invulnName = document.getElementById('invuln-name')!;
  private invulnFill = document.getElementById('invuln-fill')!;
  private mutatorChip = document.getElementById('mutator-chip')!;
  private vignetteTimer: number | undefined;
  reducedFlash = false;
  private last = {
    ammo: -1,
    reloading: false as boolean | null,
    wave: -1,
    heat: -1,
    special: '',
    shield: '',
    boost: '',
    invuln: '' as string | number,
    hp: -1
  };

  private setWidth(el: HTMLElement, frac: number, key: 'hp' | 'heat'): void {
    const pct = Math.round(Math.max(0, Math.min(1, frac)) * 200) / 2;
    if (this.last[key] === pct) return;
    this.last[key] = pct;
    el.style.width = `${pct}%`;
  }

  private bannerTimer = 0;
  private bannerQueue: string[] = [];

  show(): void { this.root.classList.remove('hidden'); }
  hide(): void { this.root.classList.add('hidden'); }

  setCrosshairScale(scale: number): void {
    this.crosshair.style.transform = `scale(${Math.max(0.2, scale)})`;
  }

  setCrosshairColor(css: string | null): void {
    const ring = this.crosshair.querySelector('.ch-ring') as HTMLElement | null;
    const dot = this.crosshair.querySelector('.ch-dot') as HTMLElement | null;
    if (ring) ring.style.borderColor = css ?? 'rgba(232, 230, 224, 0.55)';
    if (dot) dot.style.background = css ?? 'var(--accent)';
  }

  setSpecial(name: string | null, frac: number, seconds: number): void {
    const sig = `${name}|${Math.round(frac * 100)}`;
    if (sig === this.last.special) return;
    this.last.special = sig;
    if (name === null) {
      this.specialWrap.classList.add('hidden');
      return;
    }
    this.specialWrap.classList.remove('hidden');
    this.specialName.textContent = `${name} · ${Math.max(0, seconds).toFixed(1)}s`;
    this.specialFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  setShield(frac: number, seconds: number): void {
    const sig = `${Math.round(frac * 100)}|${seconds.toFixed(1)}`;
    if (sig === this.last.shield) return;
    this.last.shield = sig;
    if (frac <= 0) {
      this.shieldWrap.classList.add('hidden');
      return;
    }
    this.shieldWrap.classList.remove('hidden');
    this.shieldName.textContent = `AEGIS · ${Math.max(0, seconds).toFixed(1)}s`;
    this.shieldFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    this.shieldWrap.classList.toggle('low', seconds < 3);
  }

  setBoost(name: string | null, frac: number, seconds: number): void {
    const sig = `${name}|${Math.round(frac * 100)}`;
    if (sig === this.last.boost) return;
    this.last.boost = sig;
    if (name === null) {
      this.boostWrap.classList.add('hidden');
      return;
    }
    this.boostWrap.classList.remove('hidden');
    this.boostName.textContent = `${name} · ${Math.max(0, seconds).toFixed(1)}s`;
    this.boostFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  setInvuln(frac: number): void {
    const sig = frac <= 0 ? 'off' : `on${Math.round(frac * 50)}`;
    if (sig === this.last.invuln) return;
    this.last.invuln = sig;
    if (frac <= 0) {
      this.invulnWrap.classList.add('hidden');
      return;
    }
    this.invulnWrap.classList.remove('hidden');
    this.invulnName.textContent = `BULWARK · IMMORTAL`;
    this.invulnFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    this.invulnWrap.classList.toggle('low', frac < 0.3);
  }

  setMutator(name: string | null, color: string | null): void {
    if (name === null || color === null) {
      this.mutatorChip.classList.add('hidden');
      return;
    }
    this.mutatorChip.classList.remove('hidden');
    this.mutatorChip.textContent = `MUTATOR · ${name}`;
    this.mutatorChip.style.setProperty('--mut-color', color);
    this.mutatorChip.style.borderColor = color;
    this.mutatorChip.style.color = color;
  }

  setHp(cur: number, max: number): void {
    this.setWidth(this.hpFill, cur / max, 'hp');
    this.hpFill.classList.toggle('low', cur / max < 0.35);
  }

  setAmmo(ammo: number, reloading: boolean): void {
    if (ammo === this.last.ammo && reloading === this.last.reloading) return;
    this.last.ammo = ammo;
    this.last.reloading = reloading;
    this.ammoCount.textContent = String(ammo);
    this.reloadHint.classList.toggle('hidden', !reloading);
  }

  setWave(wave: number): void {
    if (wave === this.last.wave) return;
    this.last.wave = wave;
    this.waveNum.textContent = String(wave);
  }

  setHeat(heat: number): void {
    this.setWidth(this.heatFill, heat, 'heat');
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
    if (this.reducedFlash) {
      const alpha = Math.min(1, strength) * 0.3;
      this.vignette.style.boxShadow = `inset 0 0 ${90 + strength * 50}px rgba(255,51,85,${alpha})`;
    } else {
      const alpha = Math.min(1, strength) * 0.85;
      this.vignette.style.boxShadow = `inset 0 0 ${120 + strength * 90}px rgba(255,51,85,${alpha})`;
    }
    window.clearTimeout(this.vignetteTimer);
    this.vignetteTimer = window.setTimeout(() => {
      this.vignette.style.boxShadow = 'inset 0 0 180px rgba(255,51,85,0)';
    }, 130);
  }

  hitMarker(headshot = false): void {
    this.hitmarker.classList.remove('show', 'head');
    void this.hitmarker.offsetWidth;
    if (headshot) this.hitmarker.classList.add('head');
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
