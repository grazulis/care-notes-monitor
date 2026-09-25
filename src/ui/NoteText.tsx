import type { ReactNode } from 'react';
import { SYMPTOM_LABELS, type Extraction, type SymptomKey } from '../engine/extract';

const GROUP: Record<SymptomKey, string> = {
  cough: 'resp', sputum: 'resp', breathless: 'resp',
  dysuria: 'urine', urine: 'urine', urinaryFrequency: 'urine',
  confusion: 'mind', drowsy: 'mind', dizzy: 'mind', fall: 'mind',
  reluctantToDrink: 'fluid', soreMouth: 'fluid', dryMouth: 'fluid',
  abdominalPain: 'gut', disturbed: 'other',
};

/** The note as written, with what the app read in it marked. */
export function NoteText({ text, extraction }: { text: string; extraction: Extraction | undefined }) {
  if (!extraction) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const m of extraction.matches) {
    if (m.start < at) continue;
    parts.push(text.slice(at, m.start));
    const state = m.negated ? 'neg' : m.chronic ? 'chronic' : 'new';
    const why = m.negated ? 'read as negated' : m.chronic ? 'usual for them' : 'new';
    parts.push(
      <mark key={m.start} className={`sym ${GROUP[m.symptom]} ${state}`} title={`${SYMPTOM_LABELS[m.symptom]}: ${why}`}>
        {text.slice(m.start, m.end)}
      </mark>,
    );
    at = m.end;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}
