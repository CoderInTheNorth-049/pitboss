export interface ScoreEntry {
  wave: number;
  kills: number;
  accuracy: number;
  timeSec: number;
  dayStamp: number;
  at: number;
}

const KEY = 'pitboss.scores';
const CAP = 5;

export class HighScores {
  private entries: ScoreEntry[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      this.entries = Array.isArray(raw) ? raw.filter(e => typeof e?.wave === 'number') : [];
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.entries));
    } catch {
      /* storage unavailable */
    }
  }

  add(entry: ScoreEntry): number {
    this.entries.push(entry);
    this.sort();
    const rank = this.entries.indexOf(entry);
    this.entries = this.entries.slice(0, CAP);
    this.save();
    return rank >= 0 && rank < CAP ? rank + 1 : -1;
  }

  top(): ScoreEntry[] {
    return [...this.entries];
  }

  bestWave(): number {
    return this.entries[0]?.wave ?? 0;
  }

  private sort(): void {
    this.entries.sort((a, b) =>
      b.wave - a.wave || b.kills - a.kills || b.accuracy - a.accuracy ||
      b.timeSec - a.timeSec || a.at - b.at
    );
  }
}
