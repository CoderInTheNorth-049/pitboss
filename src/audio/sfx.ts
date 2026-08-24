export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 1;
  enabled = true;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42 * this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = 0.42 * this.volume;
  }

  private env(dur: number, peak: number): GainNode | null {
    if (!this.ctx || !this.master || !this.enabled) return null;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    return g;
  }

  private osc(type: OscillatorType, f0: number, f1: number, dur: number, peak: number): void {
    const g = this.env(dur, peak);
    if (!g || !this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, peak: number, filterFreq: number): void {
    const g = this.env(dur, peak);
    if (!g || !this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, Math.max(len, 1), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterFreq;
    src.connect(filt);
    filt.connect(g);
    src.start();
  }

  shot(): void {
    this.osc('square', 720, 130, 0.09, 0.16);
    this.noise(0.07, 0.1, 3200);
  }

  enemyShot(): void {
    this.osc('sawtooth', 340, 110, 0.11, 0.08);
  }

  hit(): void {
    this.osc('triangle', 1350, 900, 0.05, 0.12);
  }

  headshot(): void {
    this.osc('triangle', 2300, 1500, 0.07, 0.14);
    setTimeout(() => this.osc('sine', 2900, 2900, 0.05, 0.08), 30);
  }

  hurt(): void {
    this.osc('sine', 190, 70, 0.16, 0.3);
    this.noise(0.12, 0.14, 700);
  }

  telegraph(): void {
    this.osc('sine', 1180, 1180, 0.05, 0.09);
    setTimeout(() => this.osc('sine', 1520, 1520, 0.06, 0.09), 70);
  }

  kill(): void {
    this.osc('square', 520, 60, 0.2, 0.18);
    this.noise(0.16, 0.12, 1400);
  }

  death(): void {
    this.osc('sawtooth', 420, 40, 0.8, 0.24);
    this.noise(0.6, 0.14, 500);
  }

  reload(): void {
    this.osc('square', 240, 240, 0.04, 0.07);
    setTimeout(() => this.osc('square', 310, 310, 0.04, 0.07), 120);
  }

  ui(): void {
    this.osc('sine', 880, 660, 0.06, 0.08);
  }

  wave(): void {
    this.osc('sine', 220, 440, 0.35, 0.16);
  }

  surge(): void {
    this.osc('sawtooth', 90, 260, 0.5, 0.2);
    this.noise(0.5, 0.1, 900);
  }

  heal(): void {
    this.osc('sine', 520, 780, 0.14, 0.16);
    setTimeout(() => this.osc('sine', 780, 1040, 0.16, 0.14), 110);
  }

  powerup(): void {
    this.osc('square', 330, 330, 0.07, 0.12);
    setTimeout(() => this.osc('square', 440, 440, 0.07, 0.12), 90);
    setTimeout(() => this.osc('square', 660, 660, 0.12, 0.14), 180);
  }

  expire(): void {
    this.osc('sine', 640, 240, 0.28, 0.12);
  }

  rail(): void {
    this.osc('sawtooth', 1400, 90, 0.24, 0.2);
    this.noise(0.18, 0.12, 2400);
  }

  shotgun(): void {
    this.noise(0.24, 0.26, 600);
    this.osc('sine', 110, 45, 0.22, 0.3);
  }

  flame(): void {
    this.noise(0.09, 0.075, 900);
    if (Math.random() < 0.3) {
      setTimeout(() => this.noise(0.05, 0.04, 2400), Math.random() * 40);
    }
  }

  shieldUp(): void {
    this.osc('sine', 320, 640, 0.18, 0.16);
    setTimeout(() => this.osc('triangle', 640, 960, 0.22, 0.12), 120);
  }

  invulnUp(): void {
    const notes = [440, 554, 659, 880];
    notes.forEach((f, i) => setTimeout(() => this.osc('triangle', f, f * 1.01, 0.14, 0.14), i * 60));
    this.noise(0.35, 0.06, 5200);
    setTimeout(() => this.osc('sine', 1760, 2200, 0.3, 0.05), 240);
  }

  shieldBreak(): void {
    this.osc('square', 880, 140, 0.3, 0.16);
    this.noise(0.26, 0.14, 1800);
  }

  overdrive(): void {
    const notes = [220, 330, 440, 660];
    notes.forEach((f, i) => setTimeout(() => this.osc('sawtooth', f, f * 1.02, 0.1, 0.13), i * 70));
    this.noise(0.4, 0.08, 1200);
  }

  streak(tier: number): void {
    const base = 300 + tier * 90;
    this.noise(0.45, 0.2, 700 + tier * 150);
    this.osc('sawtooth', base, base * 1.5, 0.3, 0.12);
    setTimeout(() => this.osc('sawtooth', base * 1.25, base * 1.9, 0.28, 0.11), 110);
  }

  refill(): void {
    this.osc('square', 500, 500, 0.03, 0.08);
    setTimeout(() => this.osc('square', 380, 380, 0.03, 0.08), 80);
    setTimeout(() => this.osc('square', 620, 620, 0.05, 0.1), 160);
  }

  sentryShot(): void {
    this.osc('square', 980, 210, 0.07, 0.1);
    this.noise(0.05, 0.06, 4200);
  }

  sentryUp(): void {
    this.osc('sawtooth', 140, 520, 0.3, 0.13);
    setTimeout(() => this.osc('square', 660, 660, 0.05, 0.09), 260);
    setTimeout(() => this.osc('sine', 1320, 1320, 0.08, 0.08), 340);
  }

  sentryDown(): void {
    this.osc('sawtooth', 480, 90, 0.4, 0.12);
  }

  mutator(): void {
    this.osc('square', 200, 400, 0.16, 0.12);
    setTimeout(() => this.osc('square', 400, 200, 0.16, 0.12), 140);
    this.noise(0.25, 0.07, 1000);
  }
}
