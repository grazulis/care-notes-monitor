import { describe, expect, it } from 'vitest';
import { extract, type SymptomKey } from './extract';
import { noteLabels, records, type NoteLabels } from './test-data';

describe('extract: unit cases', () => {
  it('finds a frequent productive cough and its colour', () => {
    const e = extract('Harsh cough throughout the shift. Productive, green sputum.');
    expect(e.coughLevel).toBe(2);
    expect(e.current.has('sputum')).toBe(true);
    expect(e.sputumColour).toBe('green');
  });
  it('treats negated mentions as absent', () => {
    expect(extract('No cough or chest concerns.').current.has('cough')).toBe(false);
    expect(extract('Nil confusion noted today.').current.has('confusion')).toBe(false);
  });
  it('treats "usual" symptoms as chronic, not new', () => {
    const e = extract('Usual productive cough, white sputum, no change.');
    expect(e.current.has('cough')).toBe(false);
    expect(e.chronic.has('cough')).toBe(true);
    expect(extract('Pleasantly confused, settled.').current.has('confusion')).toBe(false);
  });
  it('does not mistake "more confused than usual" for usual', () => {
    expect(extract('More confused than usual.').current.has('confusion')).toBe(true);
  });
  it('keeps decimal points inside a sentence', () => {
    expect(extract('Obs: T 37.9, P 102, new confusion.').current.has('confusion')).toBe(true);
  });
  it('reads urinary symptoms', () => {
    const e = extract('Says it stings when passing urine. Urine dark and strong-smelling.');
    expect(e.current.has('dysuria')).toBe(true);
    expect(e.current.has('urine')).toBe(true);
  });
});

// The extractor's contract: against every generated note's labels, precision and recall ≥ 0.95.
const MAP: [string, (l: NoteLabels) => boolean, SymptomKey, 'present' | 'current'][] = [
  ['cough', (l) => l.cough !== 'none', 'cough', 'present'],
  ['sputum', (l) => l.sputum, 'sputum', 'present'],
  ['breathless', (l) => l.breathless, 'breathless', 'current'],
  ['confusion (new)', (l) => l.confusionIncreased, 'confusion', 'current'],
  ['dysuria', (l) => l.dysuria, 'dysuria', 'current'],
  ['urine change', (l) => l.urineChange, 'urine', 'current'],
  ['reluctant to drink', (l) => l.reluctantToDrink, 'reluctantToDrink', 'current'],
  ['sore mouth', (l) => l.soreMouth, 'soreMouth', 'current'],
  ['drowsy', (l) => l.drowsy, 'drowsy', 'current'],
  ['abdominal pain', (l) => l.abdominalPain, 'abdominalPain', 'current'],
  ['fall', (l) => l.fall, 'fall', 'current'],
];

describe('extract: against note-labels.json', () => {
  const text = new Map(records.map((r) => [r.id, r.note]));
  const extracted = new Map(noteLabels.map((l) => [l.noteId, extract(text.get(l.noteId) ?? '')]));

  it.each(MAP)('%s: precision and recall ≥ 0.95', (_name, truth, key, mode) => {
    let tp = 0, fp = 0, fn = 0;
    for (const l of noteLabels) {
      const e = extracted.get(l.noteId)!;
      const got = mode === 'current' ? e.current.has(key) : e.current.has(key) || e.chronic.has(key);
      const want = truth(l);
      if (got && want) tp++;
      else if (got) fp++;
      else if (want) fn++;
    }
    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    expect(tp, 'no positives in the data').toBeGreaterThan(0);
    expect(precision).toBeGreaterThanOrEqual(0.95);
    expect(recall).toBeGreaterThanOrEqual(0.95);
  });

  it('cough severity matches (occasional vs frequent)', () => {
    let right = 0, total = 0;
    for (const l of noteLabels) {
      if (l.cough === 'none') continue;
      total++;
      const e = extracted.get(l.noteId)!;
      if (e.anyCoughLevel === (l.cough === 'frequent' ? 2 : 1)) right++;
    }
    expect(right / total).toBeGreaterThanOrEqual(0.95);
  });
});
