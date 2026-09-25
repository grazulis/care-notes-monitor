import { dateRange } from './dates';
import { extract, type Extraction, type SymptomKey } from './extract';
import type { Obs, Resident, Shift, ShiftRecord } from './types';

/** Everything known about one resident on one care day, charts and text together. */
export interface DayFeatures {
  date: string;
  records: Partial<Record<Shift, ShiftRecord>>;
  fluidMl: number | null;
  mealPct: number | null;
  dayToilet: number | null;
  nightToilet: number | null;
  nightWakings: number | null;
  incontinence: number;
  bowelsOpened: boolean;
  falls: number;
  fallNoteIds: string[];
  obs: { obs: Obs; noteId: string; shift: Shift }[];
  /** Current (new, non-chronic) symptom mentions → the notes they appear in. */
  symptoms: Partial<Record<SymptomKey, string[]>>;
  chronic: Partial<Record<SymptomKey, string[]>>;
  coughLevel: 0 | 1 | 2;
  sputumColours: string[];
}

export interface Timeline {
  resident: Resident;
  days: DayFeatures[];
  byDate: Map<string, DayFeatures>;
}

export interface Model {
  timelines: Map<string, Timeline>;
  extractions: Map<string, Extraction>;
  records: Map<string, ShiftRecord>;
  firstDay: string;
  lastDay: string;
}

const isNum = (x: number | null | undefined): x is number => typeof x === 'number';
const sumOrNull = (xs: (number | null)[]) => {
  const v = xs.filter(isNum);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

export function buildModel(residents: Resident[], records: ShiftRecord[]): Model {
  const extractions = new Map<string, Extraction>();
  const recordMap = new Map<string, ShiftRecord>();
  const grouped = new Map<string, ShiftRecord[]>();
  let firstDay = '9999-12-31';
  let lastDay = '0000-01-01';

  for (const r of records) {
    extractions.set(r.id, extract(r.note));
    recordMap.set(r.id, r);
    const key = `${r.residentId}|${r.careDate}`;
    const list = grouped.get(key);
    if (list) list.push(r);
    else grouped.set(key, [r]);
    if (r.careDate < firstDay) firstDay = r.careDate;
    if (r.careDate > lastDay) lastDay = r.careDate;
  }

  const dates = dateRange(firstDay, lastDay);
  const timelines = new Map<string, Timeline>();
  for (const resident of residents) {
    const days = dates.map((date) => dayFeatures(date, grouped.get(`${resident.id}|${date}`) ?? [], extractions));
    timelines.set(resident.id, { resident, days, byDate: new Map(days.map((d) => [d.date, d])) });
  }
  return { timelines, extractions, records: recordMap, firstDay, lastDay };
}

function dayFeatures(date: string, recs: ShiftRecord[], ex: Map<string, Extraction>): DayFeatures {
  const records: Partial<Record<Shift, ShiftRecord>> = {};
  for (const r of [...recs].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) records[r.shift] = r;
  const all = Object.values(records);
  const dayShifts = [records.early, records.late].filter((r): r is ShiftRecord => Boolean(r));
  const meals = dayShifts.map((r) => r.mealsEatenPct).filter(isNum);

  const symptoms: DayFeatures['symptoms'] = {};
  const chronic: DayFeatures['chronic'] = {};
  let coughLevel: 0 | 1 | 2 = 0;
  const sputumColours: string[] = [];
  const fallNoteIds: string[] = [];
  for (const r of all) {
    const e = ex.get(r.id);
    if (!e) continue;
    for (const k of e.current) (symptoms[k] ??= []).push(r.id);
    for (const k of e.chronic) (chronic[k] ??= []).push(r.id);
    if (e.coughLevel > coughLevel) coughLevel = e.coughLevel;
    if (e.sputumColour && e.current.has('sputum')) sputumColours.push(e.sputumColour);
    if (r.fall || e.current.has('fall')) fallNoteIds.push(r.id);
  }

  return {
    date,
    records,
    fluidMl: sumOrNull(all.map((r) => r.fluidIntakeMl)),
    mealPct: meals.length ? meals.reduce((a, b) => a + b, 0) / meals.length : null,
    dayToilet: sumOrNull(dayShifts.map((r) => r.toiletVisits)),
    nightToilet: records.night?.toiletVisits ?? null,
    nightWakings: records.night?.nightWakings ?? null,
    incontinence: all.reduce((s, r) => s + (r.incontinenceEpisodes ?? 0), 0),
    bowelsOpened: all.some((r) => r.bowelsOpened),
    falls: fallNoteIds.length,
    fallNoteIds,
    obs: all.filter((r) => r.obs).map((r) => ({ obs: r.obs as Obs, noteId: r.id, shift: r.shift })),
    symptoms,
    chronic,
    coughLevel,
    sputumColours,
  };
}
