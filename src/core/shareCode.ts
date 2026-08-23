export interface RunSummary {
  wave: number;
  kills: number;
  accuracy: number;
  dayStamp: number;
}

export function encodeRun(r: RunSummary): string {
  const b36 = (n: number) => Math.max(0, Math.floor(n)).toString(36);
  return ['PB1', b36(r.wave), b36(r.kills), b36(Math.round(r.accuracy * 100)), b36(r.dayStamp)].join('-');
}

export function decodeRun(code: string): RunSummary | null {
  const parts = code.trim().toUpperCase().split('-');
  if (parts.length !== 5 || parts[0] !== 'PB1') return null;
  const nums = parts.slice(1).map(p => parseInt(p, 36));
  if (nums.some(n => Number.isNaN(n) || n < 0)) return null;
  const [wave, kills, acc, day] = nums;
  return { wave, kills, accuracy: acc / 100, dayStamp: day };
}

export function describeRun(code: string): string | null {
  const r = decodeRun(code);
  if (!r) return null;
  const daysAgo = Math.max(0, Math.floor(Date.now() / 86400000) - r.dayStamp);
  return `Wave ${r.wave} · ${r.kills} kills · ${Math.round(r.accuracy * 100)}% accuracy${daysAgo > 0 ? ` · ${daysAgo}d ago` : ' · today'}`;
}
