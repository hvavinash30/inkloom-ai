export function formatOverrideRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—';
  const rounded = Math.round(rate * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

export function hiddenCount(total: number, shown: number): number {
  return Math.max(0, total - shown);
}

export function describeSample(size: number, noun: string): string {
  return `${size} ${noun}${size === 1 ? '' : 's'}`;
}
