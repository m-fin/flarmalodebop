export function messageTime(iso: string): number {
  return new Date(iso).getTime();
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export function formatDur(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function isEmojiOnly(value: string): boolean {
  return (
    value.length <= 12 &&
    /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s)+$/u.test(value) &&
    !/^\d+$/.test(value.trim())
  );
}

export function downsamplePeaks(peaks: number[], count: number): number[] {
  if (peaks.length === 0) return Array.from({ length: count }, () => 0.2);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * peaks.length) / count);
    const end = Math.max(start + 1, Math.ceil(((i + 1) * peaks.length) / count));
    const slice = peaks.slice(start, end);
    const max = slice.length ? Math.max(...slice) : 0.2;
    out.push(Number(max.toFixed(2)));
  }
  return out;
}

export function meterLevel(db: number | undefined): number {
  if (db == null || Number.isNaN(db)) return 0.22;
  return Math.max(0.08, Math.min(1, (db + 50) / 50));
}
