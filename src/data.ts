import type { DatasetMeta, Resident, ShiftRecord } from './engine/types';

export interface Dataset {
  meta: DatasetMeta;
  residents: Resident[];
  records: ShiftRecord[];
}

/** The generated files in data/ are served at the site root (vite.config.ts: publicDir). */
export async function loadDataset(): Promise<Dataset> {
  const [r, n] = await Promise.all([fetch('/residents.json'), fetch('/notes.json')]);
  if (!r.ok || !n.ok) throw new Error('dataset not found');
  const residents = (await r.json()) as { residents: Resident[] };
  const notes = (await n.json()) as { meta: DatasetMeta; notes: ShiftRecord[] };
  return { meta: notes.meta, residents: residents.residents, records: notes.notes };
}

// Notes edited during a demo live in this browser only, keyed by record id, and can be reset.
const EDITS_KEY = 'care-notes-monitor:edits';

export function loadEdits(): Record<string, ShiftRecord> {
  try {
    return JSON.parse(localStorage.getItem(EDITS_KEY) ?? '{}') as Record<string, ShiftRecord>;
  } catch {
    return {};
  }
}

export function saveEdits(edits: Record<string, ShiftRecord>): void {
  try {
    localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
  } catch {
    // Storage unavailable: edits still work for this session.
  }
}

export function mergeRecords(base: ShiftRecord[], edits: Record<string, ShiftRecord>): ShiftRecord[] {
  const known = new Set(base.map((r) => r.id));
  return [...base.map((r) => edits[r.id] ?? r), ...Object.values(edits).filter((e) => !known.has(e.id))];
}
