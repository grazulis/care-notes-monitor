#!/usr/bin/env node
/**
 * Synthetic nursing-notes dataset for a 30-bed residential care home.
 *
 * Everything here is invented: residents, names, staff, notes. The generator is seeded, so
 * running it again produces identical files. Change SEED for a different home.
 *
 * Outputs (../data):
 *   residents.json     who lives here, incl. care-plan lines where "normal" is unusual for them
 *   notes.json / .csv  one record per resident per shift: charted values + a free-text note
 *   ground-truth.json  what is developing for whom, and the priority the app should reach
 *   note-labels.json   what each free-text note actually mentions — to test the text extractor
 *
 * A care day D = early shift (07–14) + late shift (14–21) on D, and the night running into D+1.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED = 20260925;
const LAST_CARE_DAY = '2026-09-25'; // "today" in the demo
const DAYS = 42; // six weeks: enough baseline even when the demo replays the last week
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

const SHIFTS = ['early', 'late', 'night'];
const SHIFT_SPLIT = { early: 0.45, late: 0.4, night: 0.15 }; // share of a day's fluids

// ── randomness (seeded) ─────────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const chance = (p) => rand() < p;
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const between = (lo, hi) => lo + rand() * (hi - lo);
const intBetween = (lo, hi) => Math.floor(between(lo, hi + 1));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const roundTo = (x, step) => Math.round(x / step) * step;
const pad2 = (n) => String(n).padStart(2, '0');
function normal(mean, sd) {
  const u = 1 - rand();
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function poisson(lambda) {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rand();
  } while (p > limit);
  return k - 1;
}
function weighted(pairs) {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [value, w] of pairs) {
    r -= w;
    if (r <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}
function shuffle(xs) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const times = (k) => (k === 1 ? 'once' : k === 2 ? 'twice' : `${k} times`);

// ── dates ───────────────────────────────────────────────────────────────────────────────────
function dateAt(offset) {
  const d = new Date(`${LAST_CARE_DAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// ── residents ───────────────────────────────────────────────────────────────────────────────
const FEMALE_NAMES = ['Doris', 'Margaret', 'Joan', 'Dorothy', 'Betty', 'Irene', 'Edna', 'Jean',
  'Eileen', 'Kathleen', 'Winifred', 'Mary', 'Elsie', 'Ivy', 'Hilda', 'Audrey', 'Sylvia', 'Peggy',
  'Violet', 'Marjorie', 'Gladys', 'Phyllis', 'Mavis', 'Brenda', 'Vera'];
const MALE_NAMES = ['Arthur', 'Albert', 'Harold', 'Frank', 'Kenneth', 'Stanley', 'Ernest',
  'Leonard', 'Ronald', 'Walter', 'George', 'Frederick', 'Dennis', 'Norman', 'Cyril'];
const SURNAMES = ['Ashworth', 'Barlow', 'Brierley', 'Clegg', 'Crompton', 'Dawson', 'Entwistle',
  'Fletcher', 'Greenhalgh', 'Hargreaves', 'Holden', 'Kershaw', 'Lomax', 'Marsden', 'Ogden',
  'Pilling', 'Ramsbottom', 'Schofield', 'Tattersall', 'Whittaker', 'Walsh', 'Heywood',
  'Butterworth', 'Duckworth', 'Haworth', 'Nuttall', 'Openshaw', 'Sutcliffe', 'Taylor', 'Wood'];

const PRONOUNS = {
  F: { he: 'she', He: 'She', him: 'her', his: 'her', His: 'Her', self: 'herself' },
  M: { he: 'he', He: 'He', him: 'him', his: 'his', His: 'His', self: 'himself' },
};

const CONDITIONS = [
  ['Dementia', 0.6], ['Hypertension', 0.5], ['Osteoarthritis', 0.4], ['Hearing loss', 0.3],
  ['Osteoporosis', 0.25], ['Chronic kidney disease', 0.2], ['Type 2 diabetes', 0.2],
  ['Atrial fibrillation', 0.2], ['Previous stroke', 0.15], ['Macular degeneration', 0.15],
  ['Heart failure', 0.08], ["Parkinson's disease", 0.05],
];
const MEDS = {
  Dementia: ['Donepezil 5mg ON'],
  Hypertension: ['Amlodipine 5mg OD'],
  Osteoarthritis: ['Paracetamol 1g QDS'],
  Osteoporosis: ['Alendronic acid 70mg weekly', 'Adcal-D3 BD'],
  'Type 2 diabetes': ['Metformin 500mg BD'],
  'Atrial fibrillation': ['Apixaban 2.5mg BD', 'Bisoprolol 2.5mg OD'],
  'Previous stroke': ['Clopidogrel 75mg OD', 'Atorvastatin 20mg ON'],
  'Heart failure': ['Furosemide 40mg OM', 'Ramipril 2.5mg OD'],
  "Parkinson's disease": ['Co-careldopa 25/100 TDS'],
  COPD: ['Tiotropium inhaler OD', 'Salbutamol inhaler PRN'],
};

function makeResidents() {
  const females = shuffle(FEMALE_NAMES);
  const males = shuffle(MALE_NAMES);
  const surnames = shuffle(SURNAMES);
  const sexes = shuffle([...Array(21).fill('F'), ...Array(9).fill('M')]);
  const residents = [];

  for (let i = 0; i < 30; i++) {
    const sex = sexes[i];
    // Guarantee the range is represented: one centenarian, one aged 80.
    const age = i === 3 ? 100 : i === 17 ? 80 : clamp(Math.round(normal(88, 4.5)), 80, 99);
    const dob = new Date(Date.UTC(2026 - age, 8, 25));
    dob.setUTCDate(dob.getUTCDate() - intBetween(1, 364));

    const conditions = CONDITIONS.filter(([, p]) => chance(p)).map(([c]) => c);
    if (conditions.length === 0) conditions.push('Hypertension');
    const mobility = weighted([['Independent', 0.2], ['Walking frame', 0.45],
      ['Wheelchair, assistance of one', 0.2], ['Hoist, assistance of two', 0.15]]);
    const continence = mobility.startsWith('Hoist')
      ? 'Wears pads, needs full assistance'
      : weighted([['Continent', 0.5], ['Occasionally incontinent of urine', 0.3],
        ['Wears pads, needs full assistance', 0.2]]);
    const medications = conditions.flatMap((c) => MEDS[c] ?? []);
    if (chance(0.4)) medications.push('Laxido 1 sachet PRN');
    const fluidTargetMl = pick([1500, 1500, 1500, 1400, 1600, 1200]);

    residents.push({
      id: `R${pad2(i + 1)}`,
      firstName: sex === 'F' ? females.pop() : males.pop(),
      lastName: surnames.pop(),
      sex,
      dateOfBirth: dob.toISOString().slice(0, 10),
      age,
      unit: i < 15 ? 'Rose' : 'Willow',
      room: i + 1,
      admittedOn: dateAt(-intBetween(60, 2200)),
      conditions,
      medications,
      mobility,
      continence,
      cognition: conditions.includes('Dementia')
        ? pick(['Mild dementia; short-term memory loss', 'Moderate dementia; orientated to person only',
          'Moderate dementia; needs prompting with most care'])
        : 'No cognitive impairment',
      fluidTargetMl,
      carePlanNotes: [],
      // Internal: this person's "normal". Not exported — the app must learn it from the notes.
      _b: {
        fluidMl: clamp(normal(fluidTargetMl * 0.97, 140), 1000, 1900),
        mealPct: clamp(normal(78, 9), 55, 95),
        dayToilet: between(2.5, 5),
        nightToilet: between(0.3, 1.3),
        nightWake: between(0.1, 0.8),
        incontinence: continence.startsWith('Continent') ? 0.02
          : continence.startsWith('Occasionally') ? 0.25 : 0.9,
        bowelEveryDays: pick([1, 1, 2, 2, 2, 3]),
        temp: normal(36.5, 0.2),
        pulse: Math.round(normal(74, 7)),
        rr: intBetween(15, 17),
        spo2: intBetween(95, 98),
        sbp: Math.round(normal(134, 12)),
        obsWeekday: i % 7,
      },
    });
  }
  return residents;
}

// ── scenarios: what is developing, for whom ─────────────────────────────────────────────────
// mods(offset, shift, m, r) nudges one shift. offset 0 = today, -1 = yesterday, …
const blankMods = () => ({
  fluidFactor: 1, mealFactor: 1, dayToiletAdd: 0, nightToiletAdd: 0, wakingsAdd: 0,
  incontinenceAdd: 0, bowelsBlocked: false, cough: null, sputum: false, sputumColour: null,
  chronicCough: false, breathless: false, confusion: false, dysuria: false, urine: null,
  reluctantToDrink: false, soreMouth: false, drowsy: false, abdominalPain: false, fall: false,
  obs: null, phrases: [],
});

const SCENARIOS = [
  // ── things the app should find ──
  {
    key: 'uti_clear', kind: 'finding', title: 'Urinary tract infection developing',
    onset: -4, expected: 'red', acceptable: ['red'],
    fits: (r) => r.sex === 'F',
    signals: ['Night-time toilet visits climbing over four nights', 'Daytime frequency up',
      'Urine dark and strong-smelling, then stinging on passing urine (text only)',
      'New confusion from two days ago (text only)', 'New incontinence', 'Fluid intake down ~20%',
      "Today's obs: T 37.9, P 102, new confusion → NEWS2 5"],
    mods(o, shift, m, r) {
      if (o < -4) return;
      const P = PRONOUNS[r.sex];
      const p = (o + 4) / 4;
      m.nightToiletAdd = 1 + 3 * p;
      m.dayToiletAdd = 1 + 2 * p;
      m.wakingsAdd = 0.5 * p;
      m.fluidFactor = 1 - 0.2 * p;
      if (o >= -3 && shift !== 'night') m.urine = 'dark and strong-smelling';
      if (o >= -2) { m.confusion = true; m.incontinenceAdd = 0.8; }
      if (o >= -1 && shift === 'early') m.dysuria = true;
      if (o === -1 && shift === 'late') m.obs = { tempC: 37.6, pulse: 94, respRate: 18, spo2: 96, systolicBp: 128 };
      if (o === 0 && shift === 'early') m.obs = { tempC: 37.9, pulse: 102, respRate: 20, spo2: 95, systolicBp: 122, consciousness: 'C' };
      if (o === 0 && shift === 'late') m.phrases.push(`Not ${P.self} this afternoon, restless and pulling at ${P.his} clothes.`);
    },
  },
  {
    key: 'uti_subtle', kind: 'finding', title: 'Possible early urinary infection',
    onset: -2, expected: 'amber', acceptable: ['amber'],
    fits: (r) => r.sex === 'F',
    signals: ['Night toilet visits up over the last two nights', 'Restless, passing small amounts (text only)',
      'Slight dip in fluids', 'No obs yet — nobody has checked'],
    mods(o, shift, m) {
      if (o < -2) return;
      const p = (o + 2) / 2;
      m.nightToiletAdd = 1 + p;
      m.dayToiletAdd = p;
      m.wakingsAdd = 0.5;
      m.fluidFactor = 1 - 0.1 * p;
      if (shift === 'night') {
        m.phrases.push(pick(['Restless, asking for the toilet several times.',
          'Up and down to the toilet, passing small amounts each time.']));
      }
    },
  },
  {
    key: 'chest_clear', kind: 'finding', title: 'Chest infection / pneumonia developing',
    onset: -5, expected: 'red', acceptable: ['red'],
    fits: () => true,
    signals: ['New cough five days ago, frequent from day three', 'Sputum yellow then green (text only)',
      'Woken by coughing at night', 'Appetite and fluids falling', 'Breathless, then drowsy today',
      "Today's obs: T 38.2, P 108, RR 24, SpO2 91% → NEWS2 7"],
    mods(o, shift, m) {
      if (o < -5) return;
      const p = (o + 5) / 5;
      m.cough = o <= -4 ? 'occasional' : 'frequent';
      if (o >= -2) { m.sputum = true; m.sputumColour = o >= -1 ? 'green' : 'yellow'; }
      if (o >= -3 && shift === 'night') m.wakingsAdd = 1.5;
      m.mealFactor = 1 - 0.45 * p;
      m.fluidFactor = 1 - 0.25 * p;
      if (o >= -1) m.breathless = true;
      if (o === 0) m.drowsy = true;
      if (o === -2 && shift === 'early') m.obs = { tempC: 37.5, pulse: 90, respRate: 20, spo2: 94, systolicBp: 130 };
      if (o === 0 && shift === 'early') m.obs = { tempC: 38.2, pulse: 108, respRate: 24, spo2: 91, systolicBp: 112 };
    },
  },
  {
    key: 'chest_subtle', kind: 'finding', title: 'New cough, worsening',
    onset: -3, expected: 'amber', acceptable: ['amber'],
    fits: () => true,
    signals: ['New occasional cough three days ago', 'Frequent from yesterday, disturbing sleep',
      'Yellow sputum today (text only)', 'Appetite slightly down', 'No obs taken'],
    mods(o, shift, m) {
      if (o < -3) return;
      m.cough = o <= -2 ? 'occasional' : 'frequent';
      if (o === 0) { m.sputum = true; m.sputumColour = 'yellow'; }
      if (o >= -1 && shift === 'night') m.wakingsAdd = 1;
      m.mealFactor = 1 - 0.15 * ((o + 3) / 3);
    },
  },
  {
    key: 'dehydration_clear', kind: 'finding', title: 'Dehydration — intake falling for a week',
    onset: -7, expected: 'red', acceptable: ['red', 'amber'],
    fits: () => true,
    signals: ['Fluid intake falling steadily to about half of usual', 'Fewer toilet visits',
      'Reluctant to drink, dark urine, dry mouth (text only)', 'Drowsy in the afternoons',
      'Dizzy on standing today; P 98, systolic BP 104'],
    mods(o, shift, m) {
      if (o < -7) return;
      const p = (o + 7) / 7;
      m.fluidFactor = 1 - 0.5 * p;
      m.mealFactor = 1 - 0.2 * p;
      m.dayToiletAdd = -1.5 * p;
      m.nightToiletAdd = -0.4 * p;
      if (o >= -5 && shift !== 'night') m.reluctantToDrink = true;
      if (o >= -3 && shift !== 'night') m.urine = 'dark';
      if (o >= -2 && shift === 'early') m.phrases.push('Lips and mouth look dry.');
      if (o >= -1 && shift === 'late') m.drowsy = true;
      if (o === 0 && shift === 'early') {
        m.phrases.push('Dizzy on standing, needed two staff to transfer.');
        m.obs = { tempC: 37.1, pulse: 98, respRate: 18, spo2: 96, systolicBp: 104 };
      }
    },
  },
  {
    key: 'dehydration_subtle', kind: 'finding', title: 'Drinking and eating less — sore mouth',
    onset: -3, expected: 'amber', acceptable: ['amber'],
    fits: () => true,
    signals: ['Fluids down ~30% over three days', 'Meals down', 'Says mouth is sore (text only)',
      'Mouth red and coated — possible oral thrush'],
    mods(o, shift, m) {
      if (o < -3) return;
      const p = (o + 3) / 3;
      m.fluidFactor = 1 - 0.3 * p;
      m.mealFactor = 1 - 0.3 * p;
      if (shift !== 'night') m.soreMouth = true;
      if (o >= -1 && shift === 'early') m.phrases.push('Mouth looks red and coated.');
    },
  },
  {
    key: 'constipation', kind: 'finding', title: 'Constipation',
    onset: -5, expected: 'amber', acceptable: ['amber'],
    fits: () => true,
    setup(r) {
      r._b.bowelEveryDays = 1;
      if (!r.medications.includes('Laxido 1 sachet PRN')) r.medications.push('Laxido 1 sachet PRN');
    },
    signals: ['Bowels not opened for six days (usually daily)', 'Appetite dropping',
      'Tummy ache, firm abdomen, straining (text only)', 'PRN laxative given without effect'],
    mods(o, shift, m) {
      if (o < -5) return;
      m.bowelsBlocked = true;
      if (o >= -2) m.mealFactor = 1 - 0.35 * ((o + 2) / 2);
      if (o === -2 && shift === 'late') m.phrases.push('PRN Laxido given.');
      if (o >= -1 && shift !== 'night') m.abdominalPain = true;
      if (o === 0 && shift === 'early') m.phrases.push('Straining on the toilet, bowels not opened.');
    },
  },
  {
    key: 'falls_delirium', kind: 'finding', title: 'New confusion and two falls — possible delirium',
    onset: -3, expected: 'amber', acceptable: ['amber', 'red'],
    fits: (r) => r.conditions.includes('Dementia') && ['Independent', 'Walking frame'].includes(r.mobility),
    signals: ['Confusion beyond usual for three days (text only)', 'Unsettled nights',
      'Unwitnessed fall two nights ago; witnessed slide from chair today',
      'Trying to leave the unit', 'No infection signals yet — cause unclear'],
    mods(o, shift, m, r) {
      if (o < -3) return;
      const P = PRONOUNS[r.sex];
      m.confusion = true;
      if (shift === 'night') m.wakingsAdd = 1.5;
      if (o === -2 && shift === 'night') {
        m.fall = true;
        m.phrases.push(`Found sitting on the floor beside ${P.his} bed at 03:10, unwitnessed fall. No obvious injury, body map completed, obs within normal range.`);
        m.obs = { tempC: 36.7, pulse: 80, respRate: 16, spo2: 96, systolicBp: 138 };
      }
      if (o === 0 && shift === 'early') {
        m.fall = true;
        m.phrases.push('Slid from chair in the lounge while trying to stand unaided. Witnessed, no injury.');
      }
      if (o >= -1 && shift === 'late') m.phrases.push('Trying to leave the unit, needed a lot of reassurance.');
    },
  },

  // ── confounders: things that look alarming in absolute terms but are this person's normal ──
  {
    key: 'copd_stable', kind: 'confounder', title: 'COPD — chronic productive cough, stable',
    onset: null, expected: 'green', acceptable: ['green'],
    fits: () => true,
    setup(r) {
      const P = PRONOUNS[r.sex];
      r.conditions.push('COPD');
      r.medications.push(...MEDS.COPD);
      r.carePlanNotes.push(`Has COPD. A productive cough with white sputum is ${P.his} normal. Usual SpO2 91–93% on air.`);
      r._b.spo2 = 92;
      r._b.rr = 19;
      r._b.nightWake = 1;
    },
    signals: ['Cough and sputum every day — unchanged', 'SpO2 92% is this person\'s normal',
      'Should NOT be flagged: nothing has changed'],
    mods(o, shift, m) { m.chronicCough = true; },
  },
  {
    key: 'diuretic', kind: 'confounder', title: 'On furosemide — frequent toileting is normal',
    onset: null, expected: 'green', acceptable: ['green'],
    fits: (r) => !r.continence.startsWith('Wears'),
    setup(r) {
      const P = PRONOUNS[r.sex];
      if (!r.conditions.includes('Heart failure')) r.conditions.push('Heart failure');
      for (const med of MEDS['Heart failure']) if (!r.medications.includes(med)) r.medications.push(med);
      r.carePlanNotes.push(`Takes furosemide in the morning. Frequent toileting through the day and up twice most nights is normal for ${P.him}.`);
      r._b.dayToilet = 6.5;
      r._b.nightToilet = 2.3;
    },
    signals: ['High day and night toilet counts every day — unchanged', 'Should NOT be flagged'],
    mods(o, shift, m) {
      if (shift === 'early' && chance(0.3)) m.phrases.push('Furosemide given, up to the toilet frequently this morning as usual.');
    },
  },
  {
    key: 'bad_night', kind: 'confounder', title: 'One disturbed night, explained',
    onset: 0, expected: 'green', acceptable: ['green', 'amber'],
    fits: () => true,
    signals: ['Awake many times last night — once, with a stated cause', 'Everything else normal',
      'At most a low amber "watch"; never red'],
    mods(o, shift, m) {
      if (o === 0 && shift === 'night') {
        m.wakingsAdd = 3.5;
        m.nightToiletAdd = 1;
        m.phrases.push('Woken by another resident shouting in the corridor around 01:00, took a while to resettle.');
      }
    },
  },
  {
    key: 'low_drinker', kind: 'confounder', title: 'Habitually low fluid intake, stable',
    onset: null, expected: 'green', acceptable: ['green'],
    fits: () => true,
    setup(r) {
      r.fluidTargetMl = 1000;
      r._b.fluidMl = 960;
      r.carePlanNotes.push('Has always drunk small amounts. Fluid target of 1000ml agreed with GP; offer small cups often.');
    },
    signals: ['~950ml/day every day — below a generic 1500ml target but stable',
      'Should NOT be flagged as a new change'],
    mods(o, shift, m) {
      if (shift === 'early' && chance(0.2)) m.phrases.push('Prefers small cups of tea, offered little and often.');
    },
  },
  {
    key: 'recovered_chest', kind: 'confounder', title: 'Chest infection three weeks ago, recovered',
    onset: -24, expected: 'green', acceptable: ['green'],
    fits: () => true,
    signals: ['Cough, sputum, low appetite and antibiotics 24–15 days ago', 'Fully resolved',
      'Tests that an old episode does not pollute today\'s comparison'],
    mods(o, shift, m) {
      if (o < -24 || o > -15) return;
      m.cough = o <= -22 || o >= -18 ? 'occasional' : 'frequent';
      if (o >= -23 && o <= -19) { m.sputum = true; m.sputumColour = 'yellow'; m.mealFactor = 0.75; }
      if (o === -23 && shift === 'early') m.obs = { tempC: 37.8, pulse: 96, respRate: 21, spo2: 93, systolicBp: 126 };
      if (o === -22 && shift === 'late') m.phrases.push('GP visited, chest infection diagnosed. Amoxicillin 500mg TDS for 5 days commenced.');
      if (o === -17 && shift === 'late') m.phrases.push('Course of amoxicillin completed today.');
    },
  },
];

function assignScenarios(residents) {
  const order = shuffle(residents);
  for (const scenario of SCENARIOS) {
    const r = order.find((x) => !x._scenario && scenario.fits(x)) ?? order.find((x) => !x._scenario);
    r._scenario = scenario;
    scenario.setup?.(r);
  }
}

// ── note text ───────────────────────────────────────────────────────────────────────────────
const DAY_STAFF = ['SJ (RN)', 'KM (Senior Carer)', 'AB (Carer)', 'RP (RN)', 'LT (Carer)', 'HN (Senior Carer)'];
const NIGHT_STAFF = ['DW (RN)', 'MO (Carer)', 'CF (Senior Carer)'];

function mobilityLine(r, P) {
  if (r.mobility === 'Independent') return pick(['Walked independently to the dining room.', `Mobilising well around the unit.`]);
  if (r.mobility === 'Walking frame') return pick([`Mobilised to the lounge with ${P.his} frame.`, 'Walked to the dining room with frame and supervision.']);
  if (r.mobility.startsWith('Wheelchair')) return pick(['Assisted to the lounge in wheelchair.', 'Transferred to chair with assistance of one.']);
  return pick(['Transferred with hoist and two staff.', 'Hoisted to armchair, positioned comfortably.']);
}

function mealLine(pct, shift) {
  const meal = shift === 'early' ? 'breakfast and lunch' : 'tea';
  if (pct >= 85) return pick([`Ate all of ${meal}.`, `Good appetite, ate well at ${meal}.`]);
  if (pct >= 60) return pick([`Ate most of ${meal}.`, `Ate a reasonable amount at ${meal}.`]);
  if (pct >= 35) return pick([`Ate about half of ${meal}.`, `Picked at ${meal}, ate around half.`]);
  return pick([`Poor appetite, only a few mouthfuls of ${meal}.`, `Declined most of ${meal}.`]);
}

function fluidLine(ratio, ml) {
  if (ratio >= 0.9) return pick([`Drinking well (${ml}ml).`, `Good fluid intake, ${ml}ml.`, 'Drinking well.']);
  if (ratio >= 0.7) return pick([`Fluids encouraged, ${ml}ml taken.`, `${ml}ml taken, prompted with drinks.`]);
  return pick([`Poor fluid intake, only ${ml}ml despite encouragement.`, `Fluids low this shift (${ml}ml).`]);
}

function composeNote(r, shift, rec, m) {
  const n = r.firstName;
  const P = PRONOUNS[r.sex];
  const dementia = r.conditions.includes('Dementia');
  const s = [];
  const L = {
    cough: 'none', sputum: false, breathless: false, confusionIncreased: false, dysuria: false,
    urineChange: false, reluctantToDrink: false, soreMouth: false, drowsy: false,
    abdominalPain: false, fall: Boolean(m.fall), negatedMention: false,
  };

  if (shift === 'early') {
    if (m.drowsy) { s.push(`${n} very drowsy this morning, difficult to rouse for personal care.`); L.drowsy = true; }
    else s.push(pick([`${n} assisted with washing and dressing.`, `Personal care given, ${P.he} was happy with this.`,
      `Assisted ${n} with a shower this morning.`, `${n} washed and dressed with support of one.`]));
    if (chance(0.5)) s.push(mobilityLine(r, P));
  } else if (shift === 'late') {
    s.push(pick([`${n} had a settled afternoon.`, `${n} rested on ${P.his} bed after lunch.`,
      `${n} spent the afternoon in the lounge.`, `${n} joined the singing group this afternoon.`,
      `Family visited ${n} this afternoon.`]));
    if (m.drowsy) { s.push('Drowsy, sleeping in chair for most of the shift.'); L.drowsy = true; }
  } else {
    const w = rec.nightWakings;
    const t = rec.toiletVisits;
    if (w === 0) s.push(pick(['Slept well, checked two-hourly.', 'Settled night, asleep on all checks.', 'Good night, no concerns.']));
    else if (w <= 2) s.push(`Woke ${times(w)}${t > 0 ? `, assisted to the toilet ${times(t)}` : ''}, resettled well.`);
    else s.push(`Unsettled night, awake ${w} times.${t > 0 ? ` Up to the toilet ${times(t)}.` : ''}`);
    if (chance(0.4)) s.push(`${rec.fluidIntakeMl}ml fluids taken overnight.`);
  }

  if (shift !== 'night') {
    s.push(mealLine(rec.mealsEatenPct, shift));
    const expected = r.fluidTargetMl * SHIFT_SPLIT[shift];
    s.push(fluidLine(rec.fluidIntakeMl / expected, rec.fluidIntakeMl));
    if (rec.toiletVisits >= 4) s.push(`Asked to use the toilet frequently (${rec.toiletVisits} times).`);
    else if (rec.toiletVisits > 0 && chance(0.35)) s.push(`Assisted to the toilet ${times(rec.toiletVisits)}.`);
  }
  if (rec.incontinenceEpisodes > 0) {
    s.push(rec.incontinenceEpisodes > 1 ? `Pad changed x${rec.incontinenceEpisodes}, wet.` : pick(['Pad changed, wet.', 'Incontinent of urine, pad changed.']));
  }
  if (rec.bowelsOpened) s.push(pick(['Bowels opened, type 4.', 'BO type 4.', 'Bowels opened (Bristol type 5).']));

  // Symptoms: these live only in the free text, as they would in real notes.
  if (m.chronicCough) {
    s.push(shift === 'night' ? 'Coughing at times overnight as usual.'
      : pick(['Usual productive cough, white sputum, no change.', `Chesty cough as normal for ${P.him}, sputum white.`]));
    L.cough = 'frequent';
    L.sputum = shift !== 'night'; // the night line mentions the cough, not the sputum
  } else if (m.cough === 'frequent') {
    s.push(shift === 'night' ? 'Woke several times coughing.'
      : pick(['Coughing frequently.', 'Harsh cough throughout the shift.', 'Cough ++ this shift.']));
    L.cough = 'frequent';
  } else if (m.cough === 'occasional') {
    s.push(pick(['Occasional dry cough noted.', 'Coughing now and again.', 'Slight cough today.']));
    L.cough = 'occasional';
  }
  if (m.sputum && !m.chronicCough) {
    s.push(pick([`Productive, ${m.sputumColour} sputum.`, `Bringing up ${m.sputumColour} phlegm.`]));
    L.sputum = true;
  }
  if (m.breathless) {
    s.push(shift === 'night' ? pick(['Short of breath when repositioned.', 'Breathing sounds laboured, sat up on pillows.'])
      : pick(['Breathless walking to the lounge.', 'Appears short of breath at rest.']));
    L.breathless = true;
  }
  if (m.confusion) {
    s.push(shift === 'night' ? pick(['More confused than usual overnight.', 'Confused and calling out in the night.', 'Disorientated on waking, did not know where ' + P.he + ' was.'])
      : pick(['More confused than usual.', 'Not recognising staff today.', 'Agitated and calling out.',
        `Muddled, asking the same question repeatedly, not ${P.his} usual self.`]));
    L.confusionIncreased = true;
  } else if (dementia && shift !== 'night' && chance(0.5)) {
    s.push(pick(['Pleasantly confused, settled.', 'Some usual confusion, easily reassured.', 'Chatty, orientated to person only as usual.']));
  } else if (!dementia && shift !== 'night' && chance(0.4)) {
    s.push(pick(['Cheerful, chatting with staff.', `Read the paper in ${P.his} room.`, 'Enjoyed the quiz.', 'Bright in mood.']));
  }
  if (m.dysuria) { s.push(pick(['Says it stings when passing urine.', 'Complained of discomfort passing water.'])); L.dysuria = true; }
  if (m.urine) { s.push(`Urine ${m.urine}.`); L.urineChange = true; }
  if (m.reluctantToDrink) { s.push(pick(['Reluctant to drink, refusing tea.', 'Declined most drinks offered.', 'Only taking sips despite encouragement.'])); L.reluctantToDrink = true; }
  if (m.soreMouth) { s.push(pick(['Says mouth is sore, only taking small sips.', 'Complaining of a sore mouth when eating.'])); L.soreMouth = true; }
  if (m.abdominalPain) { s.push(pick(['Complaining of tummy ache, abdomen feels firm.', 'Holding tummy, says it aches.'])); L.abdominalPain = true; }
  s.push(...m.phrases);

  // Negated mentions — the extractor must not read "no cough" as a cough.
  if (!m.cough && !m.chronicCough && !m.confusion && shift === 'early' && chance(0.1)) {
    s.push(pick(['No cough or chest concerns.', 'Denies any pain.', 'No signs of distress.', 'Nil confusion noted today.']));
    L.negatedMention = true;
  }

  if (rec.obs) {
    const o = rec.obs;
    s.push(`${o.routine ? 'Weekly obs' : 'Obs'}: T ${o.tempC.toFixed(1)}, P ${o.pulse}, RR ${o.respRate}, SpO2 ${o.spo2}%, BP ${o.systolicBp}/${o.diastolicBp}${o.consciousness === 'C' ? ', new confusion' : ''}.`);
  }
  return { text: s.join(' '), labels: L };
}

// ── generation ──────────────────────────────────────────────────────────────────────────────
function fullObs(partial, routine) {
  return {
    tempC: partial.tempC,
    pulse: partial.pulse,
    respRate: partial.respRate,
    spo2: partial.spo2,
    systolicBp: partial.systolicBp,
    diastolicBp: Math.round(partial.systolicBp * 0.58 + normal(0, 4)),
    consciousness: partial.consciousness ?? 'A',
    routine,
  };
}

function routineObs(b) {
  return fullObs({
    tempC: Math.round(normal(b.temp, 0.2) * 10) / 10,
    pulse: Math.round(normal(b.pulse, 4)),
    respRate: b.rr + intBetween(-1, 1),
    spo2: clamp(b.spo2 + intBetween(-1, 1), 85, 100),
    systolicBp: Math.round(normal(b.sbp, 8)),
  }, true);
}

function generate(residents) {
  const notes = [];
  const labels = [];
  for (const r of residents) {
    const b = r._b;
    let daysSinceBowels = intBetween(0, b.bowelEveryDays - 1);
    for (let o = -(DAYS - 1); o <= 0; o++) {
      const date = dateAt(o);
      const mods = SHIFTS.map((shift) => {
        const m = blankMods();
        r._scenario?.mods(o, shift, m, r);
        return m;
      });
      const blocked = mods.some((m) => m.bowelsBlocked);
      const bowelDue = !blocked && (daysSinceBowels + 1 >= b.bowelEveryDays ? chance(0.85) : chance(0.15));
      const bowelShift = bowelDue ? weighted([['early', 0.6], ['late', 0.35], ['night', 0.05]]) : null;
      daysSinceBowels = bowelDue ? 0 : daysSinceBowels + 1;

      SHIFTS.forEach((shift, si) => {
        const m = mods[si];
        // Everyday noise, so healthy residents are not suspiciously flat.
        if (!m.cough && !m.chronicCough && chance(0.012)) m.cough = 'occasional';
        const split = SHIFT_SPLIT[shift];
        let mealFactor = m.mealFactor;
        if (shift !== 'night' && chance(0.03)) mealFactor *= 0.5;
        const extraNight = shift === 'night' && chance(0.05) ? 1 : 0;

        const toiletVisits = shift === 'night'
          ? poisson(Math.max(0, b.nightToilet + m.nightToiletAdd + extraNight))
          : poisson(Math.max(0, (b.dayToilet + m.dayToiletAdd) / 2));
        const routineDay = shift === 'early' && ((o % 7) + 7) % 7 === b.obsWeekday;
        const rec = {
          fluidIntakeMl: Math.max(0, roundTo(normal(b.fluidMl * split * m.fluidFactor, b.fluidMl * split * 0.13), 10)),
          mealsEatenPct: shift === 'night' ? null : clamp(roundTo(normal(b.mealPct * mealFactor, 9), 5), 0, 100),
          toiletVisits,
          incontinenceEpisodes: poisson(b.incontinence + m.incontinenceAdd),
          nightWakings: shift === 'night' ? toiletVisits + poisson(b.nightWake + m.wakingsAdd) : null,
          bowelsOpened: bowelShift === shift,
          fall: m.fall,
          obs: m.obs ? fullObs(m.obs, false) : routineDay ? routineObs(b) : null,
        };
        const { text, labels: L } = composeNote(r, shift, rec, m);
        const recordedAt = shift === 'early' ? `${date}T13:${pad2(intBetween(20, 55))}`
          : shift === 'late' ? `${date}T20:${pad2(intBetween(20, 55))}`
            : `${dateAt(o + 1)}T06:${pad2(intBetween(20, 55))}`;
        const note = {
          id: '',
          residentId: r.id,
          careDate: date,
          shift,
          recordedAt,
          author: pick(shift === 'night' ? NIGHT_STAFF : DAY_STAFF),
          ...rec,
          note: text,
        };
        if (note.obs) delete note.obs.routine;
        notes.push(note);
        labels.push({ note, labels: L });
      });
    }
  }
  notes.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.residentId.localeCompare(b.residentId));
  notes.forEach((note, i) => { note.id = `N${String(i + 1).padStart(5, '0')}`; });
  return { notes, labels: labels.map(({ note, labels: L }) => ({ noteId: note.id, ...L })).sort((a, b) => a.noteId.localeCompare(b.noteId)) };
}

// ── output ──────────────────────────────────────────────────────────────────────────────────
function toCsv(notes) {
  const cols = ['id', 'residentId', 'careDate', 'shift', 'recordedAt', 'author', 'fluidIntakeMl',
    'mealsEatenPct', 'toiletVisits', 'incontinenceEpisodes', 'nightWakings', 'bowelsOpened', 'fall',
    'tempC', 'pulse', 'respRate', 'spo2', 'systolicBp', 'diastolicBp', 'consciousness', 'note'];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const str = String(v);
    return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
  };
  const rows = notes.map((n) => cols.map((c) => esc(c in n ? n[c] : n.obs?.[c])).join(','));
  return [cols.join(','), ...rows].join('\n') + '\n';
}

const residents = makeResidents();
assignScenarios(residents);
const { notes, labels } = generate(residents);

const groundTruth = residents.map((r) => {
  const s = r._scenario;
  return {
    residentId: r.id,
    name: `${r.firstName} ${r.lastName}`,
    scenario: s?.key ?? 'well',
    kind: s?.kind ?? 'well',
    title: s?.title ?? 'No change — well',
    onsetDate: s?.onset != null ? dateAt(s.onset) : null,
    expectedPriority: s?.expected ?? 'green',
    acceptablePriorities: s?.acceptable ?? ['green'],
    signals: s?.signals ?? [],
  };
});

mkdirSync(OUT_DIR, { recursive: true });
const publicResidents = residents.map(({ _b, _scenario, ...rest }) => rest);
const meta = { generatedBy: 'scripts/generate-data.mjs', seed: SEED, firstCareDay: dateAt(-(DAYS - 1)), lastCareDay: LAST_CARE_DAY, synthetic: true };
writeFileSync(join(OUT_DIR, 'residents.json'), JSON.stringify({ meta, residents: publicResidents }, null, 2) + '\n');
writeFileSync(join(OUT_DIR, 'notes.json'), JSON.stringify({ meta, notes }, null, 2) + '\n');
writeFileSync(join(OUT_DIR, 'notes.csv'), toCsv(notes));
writeFileSync(join(OUT_DIR, 'ground-truth.json'), JSON.stringify({ meta, residents: groundTruth }, null, 2) + '\n');
writeFileSync(join(OUT_DIR, 'note-labels.json'), JSON.stringify({ meta, labels }, null, 2) + '\n');

console.log(`${publicResidents.length} residents, ${notes.length} shift notes, ${meta.firstCareDay} → ${meta.lastCareDay}`);
for (const g of groundTruth.filter((x) => x.kind !== 'well')) {
  console.log(`  ${g.residentId} ${g.name.padEnd(22)} ${g.expectedPriority.padEnd(6)} ${g.title}`);
}
