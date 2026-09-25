export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatDay(iso: string, withWeekday = true): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: withWeekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
