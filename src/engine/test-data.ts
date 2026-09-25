// Test-only: reads the generated dataset from disk. The app fetches it instead.
import { readFileSync } from 'node:fs';
import type { DatasetMeta, Resident, ShiftRecord } from './types';

const read = <T>(file: string): T => JSON.parse(readFileSync(new URL(`../../data/${file}`, import.meta.url), 'utf8')) as T;

export const residents = read<{ residents: Resident[] }>('residents.json').residents;
export const records = read<{ meta: DatasetMeta; notes: ShiftRecord[] }>('notes.json').notes;
export const meta = read<{ meta: DatasetMeta }>('notes.json').meta;

export interface Truth {
  residentId: string;
  name: string;
  scenario: string;
  kind: 'finding' | 'confounder' | 'well';
  title: string;
  onsetDate: string | null;
  expectedPriority: 'red' | 'amber' | 'green';
  acceptablePriorities: ('red' | 'amber' | 'green')[];
}
export const groundTruth = read<{ residents: Truth[] }>('ground-truth.json').residents;

export interface NoteLabels {
  noteId: string;
  cough: 'none' | 'occasional' | 'frequent';
  sputum: boolean;
  breathless: boolean;
  confusionIncreased: boolean;
  dysuria: boolean;
  urineChange: boolean;
  reluctantToDrink: boolean;
  soreMouth: boolean;
  drowsy: boolean;
  abdominalPain: boolean;
  fall: boolean;
  negatedMention: boolean;
}
export const noteLabels = read<{ labels: NoteLabels[] }>('note-labels.json').labels;
