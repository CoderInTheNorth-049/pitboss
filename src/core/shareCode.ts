export interface RunSummary {
  wave: number;
  kills: number;
  accuracy: number;
  dayStamp: number;
  daily?: boolean;
}

export function encodeRun(r: RunSummary): string {
  const b36 = (n: number) => Math.max(0, Math.floor(n)).toString(36);
  if (r.daily) {
    return ['PB2', b36(r.wave), b36(r.kills), b36(Math.round(r.accuracy * 100)), b36(r.dayStamp), 'd'].join('-');
  }
  return ['PB1', b36(r.wave), b36(r.kills), b36(Math.round(r.accuracy * 100)), b36(r.dayStamp)].join('-');
}

export function decodeRun(code: string): RunSummary | null {
  const parts = code.trim().toUpperCase().split('-');
  if (parts[0] === 'PB1' && parts.length === 5) {
    const nums = parts.slice(1).map(p => parseInt(p, 36));
    if (nums.some(n => Number.isNaN(n) || n < 0)) return null;
    const [wave, kills, acc, day] = nums;
    return { wave, kills, accuracy: acc / 100, dayStamp: day, daily: false };
  }
  if (parts[0] === 'PB2' && parts.length === 6) {
    const nums = parts.slice(1, 5).map(p => parseInt(p, 36));
    if (nums.some(n => Number.isNaN(n) || n < 0)) return null;
    const daily = parts[5].toLowerCase() === 'd';
    const [wave, kills, acc, day] = nums;
    return { wave, kills, accuracy: acc / 100, dayStamp: day, daily };
  }
  return null;
}

export function describeRun(code: string): string | null {
  const r = decodeRun(code);
  if (!r) return null;
  const daysAgo = Math.max(0, Math.floor(Date.now() / 86400000) - r.dayStamp);
  const when = daysAgo > 0 ? `${daysAgo}d ago` : 'today';
  const kind = r.daily ? 'DAILY run' : 'run';
  return `${r.daily ? 'DAILY ' : ''}Wave ${r.wave} · ${r.kills} kills · ${Math.round(r.accuracy * 100)}% accuracy · ${when} — ${kind}`;
}
