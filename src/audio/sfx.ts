export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
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
}
