/**
 * Free text → symptoms. A lexicon per symptom, with two refinements that matter in care notes:
 *  - negation: "no cough", "nil confusion" are not a cough or confusion;
 *  - chronic qualifiers: "usual productive cough", "pleasantly confused" are someone's normal,
 *    so they are recorded as chronic and never count as a new change.
 */
export type SymptomKey =
  | 'cough' | 'sputum' | 'breathless' | 'confusion' | 'dysuria' | 'urine' | 'urinaryFrequency'
  | 'reluctantToDrink' | 'soreMouth' | 'dryMouth' | 'drowsy' | 'dizzy' | 'abdominalPain'
  | 'fall' | 'disturbed';

export const SYMPTOM_LABELS: Record<SymptomKey, string> = {
  cough: 'Cough',
  sputum: 'Sputum',
  breathless: 'Breathless',
  confusion: 'New confusion',
  dysuria: 'Pain passing urine',
  urine: 'Urine change',
  urinaryFrequency: 'Frequency',
  reluctantToDrink: 'Not drinking',
  soreMouth: 'Sore mouth',
  dryMouth: 'Dry mouth',
  drowsy: 'Drowsy',
  dizzy: 'Dizzy',
  abdominalPain: 'Abdominal pain',
  fall: 'Fall',
  disturbed: 'Disturbed by something',
};

export interface Match {
  symptom: SymptomKey;
  start: number;
  end: number;
  text: string;
  negated: boolean;
  chronic: boolean;
}

export interface Extraction {
  /** Mentioned, not negated, and not described as usual. */
  current: Set<SymptomKey>;
  /** Mentioned as this person's normal. */
  chronic: Set<SymptomKey>;
  /** 0 none, 1 occasional, 2 frequent — current coughs only. */
  coughLevel: 0 | 1 | 2;
  /** Cough level including chronic mentions. */
  anyCoughLevel: 0 | 1 | 2;
  sputumColour: string | null;
  matches: Match[];
}

interface Pattern {
  symptom: SymptomKey;
  re: RegExp;
  level?: 1 | 2;
}

// Order matters for cough: the "frequent" forms are tried before the generic word.
const PATTERNS: Pattern[] = [
  { symptom: 'cough', level: 2, re: /cough(?:ing)?\s*\+\+|coughing (?:frequently|all night|through the night|a lot|constantly)|harsh cough|persistent cough|chesty cough|productive cough|woke (?:several times |repeatedly |up )?coughing|coughing at times|cough(?:ing)? (?:is )?(?:worse|worsening)/gi },
  { symptom: 'cough', level: 1, re: /\bcough(?:s|ing|ed)?\b/gi },
  { symptom: 'sputum', re: /\bsputum\b|\bphlegm\b|\bproductive\b/gi },
  { symptom: 'breathless', re: /breathless\w*|short of breath|\bSOB\b|breathing (?:sounds |is |appears )?(?:laboured|difficult|rapid|noisy)|difficulty breathing|wheez\w*/gi },
  { symptom: 'confusion', re: /more confused|new(?:ly)? confus\w*|not recognising|agitated|calling out|muddled|not (?:her|his|their) usual self|disorientated|trying to leave|not (?:herself|himself|themselves)|\bconfus(?:ed|ion)\b|hallucinat\w*|delirium|delirious/gi },
  { symptom: 'dysuria', re: /stings? when passing (?:urine|water)|stinging|burning (?:on|when) passing|discomfort passing (?:urine|water)|pain(?:ful)? (?:on )?passing (?:urine|water)|dysuria/gi },
  { symptom: 'urine', re: /urine (?:appears |looks |is |very )?(?:dark|strong|smelly|offensive|cloudy|concentrated|bloody|blood[- ]stained)[\w -]*|(?:dark|cloudy|smelly|offensive|strong[- ]smelling) urine|haematuria/gi },
  { symptom: 'urinaryFrequency', re: /asking for the toilet (?:several times|many times|repeatedly)|up and down to the toilet|passing small amounts|urinary frequency|urgency/gi },
  { symptom: 'reluctantToDrink', re: /reluctant to drink|declined (?:most |all )?drinks|refus(?:ing|ed) (?:tea|drinks|fluids|to drink)|only taking sips|not drinking/gi },
  { symptom: 'soreMouth', re: /sore mouth|mouth (?:is |feels |looks )?(?:sore|red|coated|ulcerated)|oral thrush/gi },
  { symptom: 'dryMouth', re: /(?:lips|mouth|tongue)(?: and \w+)? (?:looks? |feels? |are |is )?dry|dry (?:lips|mouth)/gi },
  { symptom: 'drowsy', re: /drowsy|difficult to rouse|lethargic|very sleepy|hard to wake/gi },
  { symptom: 'dizzy', re: /dizzy|light[- ]headed|unsteady/gi },
  { symptom: 'abdominalPain', re: /tummy ache|holding (?:her |his |their )?tummy|abdom\w* (?:feels |is |looks )?(?:firm|distended|tender|pain)|abdominal pain|stomach ache/gi },
  { symptom: 'fall', re: /\bfall\b|\bfell\b|found (?:sitting |lying )?on the floor|slid from|slipped (?:from|off)/gi },
  { symptom: 'disturbed', re: /woken by|disturbed by|\bnoise\b|fire alarm/gi },
];

const NEGATION = /\b(?:no|nil|denies|denied|without|free of|not|nor)\b(?:[\s,]+[\w'-]+){0,3}[\s,]*$/i;
const CHRONIC = /\b(?:as usual|usual (?:productive|cough|confusion|chesty)|as normal|normal for (?:her|him|them)|no change|pleasantly)\b/i;
const COLOUR = /\b(green|yellow|white|clear|blood[- ]stained|brown)\b/i;

/** Sentences split at . ! ? followed by whitespace, so "T 37.9" stays in one piece. */
function sentences(text: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ((c === '.' || c === '!' || c === '?') && (i + 1 === text.length || /\s/.test(text[i + 1] ?? ''))) {
      out.push({ start, text: text.slice(start, i + 1) });
      start = i + 1;
    }
  }
  if (start < text.length) out.push({ start, text: text.slice(start) });
  return out;
}

export function extract(text: string): Extraction {
  const current = new Set<SymptomKey>();
  const chronic = new Set<SymptomKey>();
  const matches: Match[] = [];
  let coughLevel: 0 | 1 | 2 = 0;
  let anyCoughLevel: 0 | 1 | 2 = 0;
  let sputumColour: string | null = null;

  for (const s of sentences(text)) {
    const isChronic = CHRONIC.test(s.text);
    const taken: [number, number][] = [];
    for (const p of PATTERNS) {
      for (const m of s.text.matchAll(p.re)) {
        const from = m.index;
        const to = from + m[0].length;
        if (taken.some(([a, b]) => from < b && to > a)) continue; // a stronger pattern already has it
        taken.push([from, to]);
        const negated = NEGATION.test(s.text.slice(0, from));
        matches.push({ symptom: p.symptom, start: s.start + from, end: s.start + to, text: m[0], negated, chronic: isChronic });
        if (negated) continue;
        (isChronic ? chronic : current).add(p.symptom);
        if (p.symptom === 'cough') {
          const level = p.level ?? 1;
          if (level > anyCoughLevel) anyCoughLevel = level;
          if (!isChronic && level > coughLevel) coughLevel = level;
        }
        if (p.symptom === 'sputum') {
          const colour = COLOUR.exec(s.text)?.[1]?.toLowerCase();
          if (colour) sputumColour = colour;
        }
      }
    }
  }
  for (const k of current) chronic.delete(k);
  matches.sort((a, b) => a.start - b.start);
  return { current, chronic, coughLevel, anyCoughLevel, sputumColour, matches };
}
