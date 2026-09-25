export type Shift = 'early' | 'late' | 'night';
export const SHIFTS: readonly Shift[] = ['early', 'late', 'night'];

/** ACVPU. C = new confusion, which NEWS2 scores as 3. */
export type Consciousness = 'A' | 'C' | 'V' | 'P' | 'U';

export interface Obs {
  tempC: number;
  pulse: number;
  respRate: number;
  spo2: number;
  systolicBp: number;
  diastolicBp: number;
  consciousness: Consciousness;
}

/** One shift's charts and free-text note for one resident. */
export interface ShiftRecord {
  id: string;
  residentId: string;
  /** Early and late on this date; the night shift runs into the next morning. */
  careDate: string;
  shift: Shift;
  recordedAt: string;
  author: string;
  fluidIntakeMl: number | null;
  mealsEatenPct: number | null;
  toiletVisits: number | null;
  incontinenceEpisodes: number | null;
  nightWakings: number | null;
  bowelsOpened: boolean;
  fall: boolean;
  obs: Obs | null;
  note: string;
}

export interface Resident {
  id: string;
  firstName: string;
  lastName: string;
  sex: 'F' | 'M';
  dateOfBirth: string;
  age: number;
  unit: string;
  room: number;
  admittedOn: string;
  conditions: string[];
  medications: string[];
  mobility: string;
  continence: string;
  cognition: string;
  fluidTargetMl: number;
  carePlanNotes: string[];
}

export interface DatasetMeta {
  seed: number;
  firstCareDay: string;
  lastCareDay: string;
  synthetic: boolean;
}

export type Priority = 'red' | 'amber' | 'green';
/** A finding is red or amber (it sets priority) or info (worth knowing, changes nothing). */
export type Level = 'red' | 'amber' | 'info';
export type RiskKey = 'uti' | 'chest' | 'hydration' | 'bowels' | 'delirium' | 'news2' | 'soft';

export interface Evidence {
  /** Full sentence for the detail view. */
  text: string;
  /** A few words for the handover card. */
  short: string;
  /** The notes this came from, so every claim can be checked. */
  noteIds: string[];
}

export interface Finding {
  risk: RiskKey;
  title: string;
  level: Level;
  evidence: Evidence[];
  advice: string;
}

export interface News2Result {
  total: number;
  anyThree: boolean;
  scale2: boolean;
  parts: { param: string; value: string; score: number }[];
}

export interface Assessment {
  residentId: string;
  asOf: string;
  priority: Priority;
  findings: Finding[];
  latestNews2: (News2Result & { noteId: string; date: string }) | null;
  baselineDays: number;
  /** First day of the current unbroken run of non-green priority. */
  since: string | null;
}
