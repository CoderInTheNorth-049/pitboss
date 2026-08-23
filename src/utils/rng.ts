export class RNG {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  static fromTime(): RNG {
    return new RNG((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(minIncl: number, maxExcl: number): number {
    return Math.floor(this.range(minIncl, maxExcl));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length)];
  }
}
