import { addDays } from './dates';
import type { DayFeatures } from './features';

/** Baseline = days D−42 … D−8; recent = D−2 … D; week = D−6 … D. */
export const BASELINE_FROM = -42;
export const BASELINE_TO = -8;
export const RECENT_DAYS = 3;

export interface Stat {
  median: number;
  /** MAD × 1.4826 (≈ SD for normal data), never below the feature's floor. */
  spread: number;
  n: number;
}

/** Floors stop a perfectly flat baseline turning a tiny change into a huge z-score. */
export const FLOORS = {
  fluidMl: 120,
  mealPct: 8,
  dayToilet: 1,
  nightToilet: 0.7,
  nightWakings: 0.7,
  incontinence: 0.5,
} as const;

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export function robust(values: (number | null)[], floor: number): Stat | null {
  const xs = values.filter((x): x is number => typeof x === 'number');
  if (xs.length < 5) return null;
  const m = median(xs);
  const mad = median(xs.map((x) => Math.abs(x - m))) * 1.4826;
  return { median: m, spread: Math.max(mad, floor), n: xs.length };
}

export function mean(values: (number | null)[]): number | null {
  const xs = values.filter((x): x is number => typeof x === 'number');
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Least-squares slope per day, or null with fewer than 4 points. */
export function slope(values: (number | null)[]): number | null {
  const pts = values.map((y, x) => [x, y] as const).filter((p): p is readonly [number, number] => typeof p[1] === 'number');
  if (pts.length < 4) return null;
  const mx = pts.reduce((s, [x]) => s + x, 0) / pts.length;
  const my = pts.reduce((s, [, y]) => s + y, 0) / pts.length;
  const num = pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const den = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return den ? num / den : null;
}

export interface Windows {
  base: DayFeatures[];
  recent: DayFeatures[];
  week: DayFeatures[];
  today: DayFeatures | undefined;
}

export function windows(days: DayFeatures[], asOf: string): Windows {
  const within = (from: number, to: number) =>
    days.filter((d) => d.date >= addDays(asOf, from) && d.date <= addDays(asOf, to));
  return {
    base: within(BASELINE_FROM, BASELINE_TO),
    recent: within(-(RECENT_DAYS - 1), 0),
    week: within(-6, 0),
    today: days.find((d) => d.date === asOf),
  };
}
