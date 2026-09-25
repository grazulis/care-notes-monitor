/**
 * One function per risk. Each compares the resident's recent days with their own baseline and
 * returns a finding with its evidence, or null. Thresholds are in one place so they can be tuned
 * against ground-truth.json (see assess.eval.test.ts).
 */
import { FLOORS, mean, robust, slope, type Windows } from './baseline';
import { addDays, formatDay } from './dates';
import type { Extraction, SymptomKey } from './extract';
import type { DayFeatures, Timeline } from './features';
import type { Evidence, Finding, News2Result, Obs, Shift } from './types';

export interface Ctx {
  timeline: Timeline;
  asOf: string;
  w: Windows;
  extractions: Map<string, Extraction>;
  scale2: boolean;
  /** Obs within the recent window, oldest first. */
  recentObs: { obs: Obs; noteId: string; date: string }[];
  /** Most recent obs taken today or yesterday, scored. */
  latest: { obs: Obs; noteId: string; date: string; news2: News2Result } | null;
  baseObs: Obs[];
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const round10 = (n: number) => Math.round(n / 10) * 10;
const ids = (days: DayFeatures[], shifts: Shift[]) =>
  days.flatMap((d) => shifts.map((s) => d.records[s]?.id)).filter((x): x is string => Boolean(x));
const mentions = (days: DayFeatures[], key: SymptomKey) => days.flatMap((d) => d.symptoms[key] ?? []);
const rate = (days: DayFeatures[], pred: (d: DayFeatures) => boolean) =>
  days.length ? days.filter(pred).length / days.length : 0;
const has = (key: SymptomKey) => (d: DayFeatures) => (d.symptoms[key]?.length ?? 0) > 0;
const series = (days: DayFeatures[], f: (d: DayFeatures) => number | null) =>
  days.map((d) => (f(d) === null ? '–' : fmt(f(d) as number))).join(' → ');

/** The words a note used for a symptom — quoting beats paraphrasing for trust. */
function quote(c: Ctx, noteIds: string[], key: SymptomKey): string | null {
  for (const id of [...noteIds].reverse()) {
    const m = c.extractions.get(id)?.matches.find((x) => x.symptom === key && !x.negated && !x.chronic);
    if (m) return m.text.trim();
  }
  return null;
}

function textEvidence(c: Ctx, key: SymptomKey, label: string, short: string): Evidence | null {
  const noteIds = mentions(c.w.recent, key);
  if (!noteIds.length) return null;
  const q = quote(c, noteIds, key);
  const n = noteIds.length;
  return {
    text: `${label}${q ? `: “${q}”` : ''} (${n} note${n === 1 ? '' : 's'} in 3 days).`,
    short,
    noteIds,
  };
}

/** Confusion beyond this person's usual, in the recent window. Empty if confusion is common for them. */
function newConfusion(c: Ctx): string[] {
  if (rate(c.w.base, has('confusion')) >= 0.2) return [];
  return mentions(c.w.recent, 'confusion');
}

function feverEvidence(c: Ctx, threshold: number): Evidence | null {
  const baseTemp = c.baseObs.length >= 2 ? mean(c.baseObs.map((o) => o.tempC)) : null;
  const hot = c.recentObs.filter((o) => o.obs.tempC >= threshold || (baseTemp !== null && o.obs.tempC >= baseTemp + 1));
  const top = hot.sort((a, b) => b.obs.tempC - a.obs.tempC)[0];
  if (!top) return null;
  return {
    text: `Temperature ${top.obs.tempC.toFixed(1)}°C on ${formatDay(top.date)}${baseTemp !== null ? ` (usually ${baseTemp.toFixed(1)})` : ''}.`,
    short: `T ${top.obs.tempC.toFixed(1)}`,
    noteIds: [top.noteId],
  };
}

function news2Evidence(c: Ctx, min: number): Evidence | null {
  if (!c.latest || c.latest.news2.total < min) return null;
  return { text: `NEWS2 ${c.latest.news2.total} on ${formatDay(c.latest.date)}.`, short: `NEWS2 ${c.latest.news2.total}`, noteIds: [c.latest.noteId] };
}

const compact = (xs: (Evidence | null)[]) => xs.filter((x): x is Evidence => x !== null);

// ── urinary tract infection ─────────────────────────────────────────────────────────────────
export function uti(c: Ctx): Finding | null {
  const { base, recent } = c.w;
  const signs: Evidence[] = [];

  const nb = robust(base.map((d) => d.nightToilet), FLOORS.nightToilet);
  if (nb) {
    const high = recent.filter((d) => d.nightToilet !== null && d.nightToilet >= nb.median + 2 && (d.nightToilet - nb.median) / nb.spread >= 2);
    if (high.length >= 2) {
      const peak = Math.max(...high.map((d) => d.nightToilet ?? 0));
      signs.push({
        text: `Night toilet visits ${series(recent, (d) => d.nightToilet)} over the last three nights; usually ${fmt(nb.median)}.`,
        short: `night toilet ${fmt(nb.median)} → ${peak}`,
        noteIds: ids(high, ['night']),
      });
    }
  }
  const db = robust(base.map((d) => d.dayToilet), FLOORS.dayToilet);
  const dm = mean(recent.map((d) => d.dayToilet));
  if (db && dm !== null && dm >= db.median + 2 && (dm - db.median) / db.spread >= 2) {
    signs.push({ text: `Daytime toilet visits averaging ${fmt(dm)} a day; usually ${fmt(db.median)}.`, short: 'frequency by day', noteIds: ids(recent, ['early', 'late']) });
  }
  const ib = robust(base.map((d) => d.incontinence), FLOORS.incontinence);
  const im = mean(recent.map((d) => d.incontinence));
  if (ib && im !== null && im >= ib.median + 1.5) {
    signs.push({ text: `Incontinence ${fmt(im)} times a day; usually ${fmt(ib.median)}.`, short: 'new incontinence', noteIds: ids(recent.filter((d) => d.incontinence > ib.median), ['early', 'late', 'night']) });
  }
  signs.push(...compact([
    textEvidence(c, 'dysuria', 'Pain passing urine', 'pain passing urine'),
    textEvidence(c, 'urine', 'Urine changed', 'urine changed'),
    textEvidence(c, 'urinaryFrequency', 'Frequency or urgency described', 'frequency'),
  ]));
  if (signs.length < 2) return null;

  const confusion = newConfusion(c);
  const escalators = compact([
    confusion.length ? { text: `New confusion in ${confusion.length} note${confusion.length === 1 ? '' : 's'}: “${quote(c, confusion, 'confusion') ?? 'confused'}”.`, short: 'new confusion', noteIds: confusion } : null,
    feverEvidence(c, 37.9),
    news2Evidence(c, 5),
  ]);
  const red = escalators.length > 0;
  return {
    risk: 'uti',
    title: 'Possible urinary tract infection',
    level: red ? 'red' : 'amber',
    evidence: [...signs, ...escalators],
    advice: red
      ? 'Consider clinical review today (GP / 111 / community team). Do not dipstick: in over-65s it misleads. Encourage fluids, repeat obs, and watch for rigors or worsening confusion.'
      : 'Take a full set of obs, encourage fluids, ask about pain passing urine, look for new confusion, and review at the next handover.',
  };
}

// ── chest infection ─────────────────────────────────────────────────────────────────────────
const COLOURED = new Set(['yellow', 'green', 'brown', 'blood-stained', 'blood stained']);

export function chest(c: Ctx): Finding | null {
  const { base, recent, week, today } = c.w;
  const chronicCough = rate(base, (d) => (d.chronic.cough?.length ?? 0) > 0) > 0.3;
  const baseRate = rate(base, (d) => d.coughLevel > 0);
  const colouredNow = recent.filter((d) => d.sputumColours.some((x) => COLOURED.has(x)));

  if (chronicCough) {
    // Their normal includes a cough. Only a change in its character counts.
    const colouredBefore = rate(base, (d) => d.sputumColours.some((x) => COLOURED.has(x)));
    const ev = compact([
      colouredNow.length && colouredBefore < 0.1
        ? { text: `Sputum now ${colouredNow.flatMap((d) => d.sputumColours).join(', ')}; usually white.`, short: 'sputum colour changed', noteIds: mentions(colouredNow, 'sputum') }
        : null,
      rate(base, has('breathless')) < 0.2 ? textEvidence(c, 'breathless', 'Newly breathless', 'breathless') : null,
    ]);
    if (!ev.length) return null;
    return { risk: 'chest', title: 'Change in usual chest symptoms', level: 'amber', evidence: ev, advice: 'Their usual cough has changed. Take a full set of obs including SpO2 against their usual range, and review at the next handover.' };
  }

  const coughDays = recent.filter((d) => d.coughLevel > 0);
  if (baseRate >= 0.25 || !(coughDays.length >= 2 || today?.coughLevel === 2)) return null;

  // When did this run of coughing start?
  let onset = coughDays[0]?.date ?? c.asOf;
  for (let i = week.length - 1; i >= 0; i--) {
    const d = week[i] as DayFeatures;
    if (d.coughLevel > 0) onset = d.date;
    else if (d.date < onset) break;
  }
  const levels = recent.map((d) => d.coughLevel);
  const worsening = levels.indexOf(1) !== -1 && levels.lastIndexOf(2) > levels.indexOf(1);
  const signs: Evidence[] = [{
    text: `New cough since ${formatDay(onset)}: on ${coughDays.length} of the last 3 days${worsening ? ', getting worse (occasional → frequent)' : ''}. Seen on ${Math.round(baseRate * 100)}% of days before.`,
    short: worsening ? 'cough worsening' : 'new cough',
    noteIds: coughDays.flatMap((d) => [...(d.symptoms.cough ?? [])]),
  }];

  const lowSpo2 = c.recentObs.filter((o) => {
    const usual = c.baseObs.length >= 2 ? mean(c.baseObs.map((b) => b.spo2)) : null;
    return (usual !== null && o.obs.spo2 <= usual - 3) || o.obs.spo2 <= (c.scale2 ? 87 : 92);
  }).at(-1);
  const fastRr = c.recentObs.filter((o) => o.obs.respRate >= 21).at(-1);
  const escalators = compact([
    colouredNow.length ? { text: `Sputum ${[...new Set(colouredNow.flatMap((d) => d.sputumColours))].join(' then ')}.`, short: `${colouredNow.at(-1)?.sputumColours.at(-1)} sputum`, noteIds: mentions(colouredNow, 'sputum') } : null,
    textEvidence(c, 'breathless', 'Breathless', 'breathless'),
    textEvidence(c, 'drowsy', 'Drowsy', 'drowsy'),
    fastRr ? { text: `Respiratory rate ${fastRr.obs.respRate} on ${formatDay(fastRr.date)}.`, short: `RR ${fastRr.obs.respRate}`, noteIds: [fastRr.noteId] } : null,
    lowSpo2 ? { text: `SpO2 ${lowSpo2.obs.spo2}% on ${formatDay(lowSpo2.date)}.`, short: `SpO2 ${lowSpo2.obs.spo2}%`, noteIds: [lowSpo2.noteId] } : null,
    feverEvidence(c, 38.0),
    news2Evidence(c, 5),
  ]);
  const red = escalators.length >= 2;
  return {
    risk: 'chest',
    title: red ? 'Possible chest infection / pneumonia' : 'New or worsening cough',
    level: red ? 'red' : 'amber',
    evidence: [...signs, ...escalators],
    advice: red
      ? 'Consider clinical review today, sooner if breathing or SpO2 worsens. Sit upright, encourage fluids, repeat obs 4-hourly.'
      : 'Take a full set of obs including SpO2, note sputum colour, and review at the next handover.',
  };
}

// ── hydration ───────────────────────────────────────────────────────────────────────────────
export function hydration(c: Ctx): Finding | null {
  const { base, recent, week } = c.w;
  const fb = robust(base.map((d) => d.fluidMl), FLOORS.fluidMl);
  const rm = mean(recent.map((d) => d.fluidMl));
  const textIds = [...mentions(recent, 'reluctantToDrink'), ...mentions(recent, 'soreMouth')];
  if (!fb || rm === null) return null;
  const ratio = rm / fb.median;
  const sl = slope(week.map((d) => d.fluidMl));
  const falling = sl !== null && sl <= -60 && ratio < 0.85;
  if (!(ratio < 0.75 || falling || textIds.length >= 2)) return null;

  const signs = compact([
    ratio < 0.9 ? { text: `Fluids averaging ${round10(rm)}ml a day over the last three days: ${Math.round(ratio * 100)}% of usual (${round10(fb.median)}ml).`, short: `fluids ${Math.round(ratio * 100)}% of usual`, noteIds: ids(recent, ['early', 'late', 'night']) } : null,
    falling ? { text: `Falling for a week, by about ${round10(-(sl as number))}ml a day: ${series(week, (d) => d.fluidMl)}.`, short: 'falling all week', noteIds: [] } : null,
    textEvidence(c, 'reluctantToDrink', 'Reluctant to drink', 'reluctant to drink'),
    textEvidence(c, 'soreMouth', 'Sore mouth', 'sore mouth'),
  ]);

  const dbase = robust(base.map((d) => d.dayToilet), FLOORS.dayToilet);
  const dm = mean(recent.map((d) => d.dayToilet));
  const baseSbp = c.baseObs.length >= 2 ? mean(c.baseObs.map((o) => o.systolicBp)) : null;
  const lowBp = c.recentObs.filter((o) => o.obs.systolicBp <= 110 || (baseSbp !== null && o.obs.systolicBp <= baseSbp - 20)).at(-1);
  const escalators = ratio < 0.65 ? compact([
    textEvidence(c, 'dizzy', 'Dizzy', 'dizzy'),
    textEvidence(c, 'drowsy', 'Drowsy', 'drowsy'),
    textEvidence(c, 'urine', 'Urine changed', 'dark urine'),
    textEvidence(c, 'dryMouth', 'Dry mouth', 'dry mouth'),
    lowBp ? { text: `Systolic BP ${lowBp.obs.systolicBp} on ${formatDay(lowBp.date)}${baseSbp ? ` (usually ${Math.round(baseSbp)})` : ''}.`, short: `BP ${lowBp.obs.systolicBp}`, noteIds: [lowBp.noteId] } : null,
    dbase && dm !== null && dm <= dbase.median - 2 ? { text: `Fewer toilet visits: ${fmt(dm)} a day; usually ${fmt(dbase.median)}.`, short: 'passing less urine', noteIds: [] } : null,
  ]) : [];
  const red = escalators.length > 0;
  return {
    risk: 'hydration',
    title: red ? 'Dehydration' : 'Drinking less than usual',
    level: red ? 'red' : 'amber',
    evidence: [...signs, ...escalators],
    advice: red
      ? 'Consider clinical review today. Offer drinks little and often, record every drink, check lying and standing BP, and treat as a falls risk.'
      : 'Offer preferred drinks little and often, record every drink, and look for a cause: sore mouth, infection, low mood, or swallowing.',
  };
}

// ── bowels ──────────────────────────────────────────────────────────────────────────────────
export function bowels(c: Ctx): Finding | null {
  const { base, recent } = c.w;
  if (base.length < 7) return null;
  const opened = base.filter((d) => d.bowelsOpened).length;
  const interval = opened ? base.length / opened : 7;
  const upTo = c.timeline.days.filter((d) => d.date <= c.asOf);
  let since = 0;
  for (let i = upTo.length - 1; i >= 0 && !(upTo[i] as DayFeatures).bowelsOpened; i--) since++;
  const threshold = Math.max(3, Math.ceil(2 * interval));
  if (since <= threshold) return null;

  const pain = textEvidence(c, 'abdominalPain', 'Abdominal pain', 'abdominal pain');
  const mb = robust(base.map((d) => d.mealPct), FLOORS.mealPct);
  const mm = mean(recent.map((d) => d.mealPct));
  const lastOpened = addDays(c.asOf, -since);
  const evidence = compact([
    { text: `Bowels not opened since ${formatDay(lastOpened)}: ${since} days (usually every ${fmt(Math.round(interval * 10) / 10)} days).`, short: `bowels not open ${since} days`, noteIds: [] },
    pain,
    mb && mm !== null && mm < mb.median * 0.8 ? { text: `Eating less: ${Math.round(mm)}% of meals; usually ${Math.round(mb.median)}%.`, short: 'eating less', noteIds: ids(recent, ['early', 'late']) } : null,
  ]);
  const red = since >= 7 && pain !== null;
  return {
    risk: 'bowels',
    title: 'Possible constipation',
    level: red ? 'red' : 'amber',
    evidence,
    advice: red
      ? 'Consider clinical review today: prolonged constipation with pain. Check for vomiting, distension or overflow.'
      : 'Check the bowel chart and PRN laxatives, encourage fluids and mobility. Escalate if there is pain, vomiting or distension.',
  };
}

// ── delirium and falls ──────────────────────────────────────────────────────────────────────
export function delirium(c: Ctx): Finding | null {
  const confusion = newConfusion(c);
  const recentFalls = c.w.recent.flatMap((d) => d.fallNoteIds);
  const weekFalls = c.w.week.flatMap((d) => d.fallNoteIds);
  if (confusion.length < 2 && recentFalls.length === 0) return null;

  const evidence = compact([
    confusion.length ? { text: `Confusion beyond usual in ${confusion.length} note${confusion.length === 1 ? '' : 's'}: “${quote(c, confusion, 'confusion') ?? 'confused'}”.`, short: 'new confusion', noteIds: confusion } : null,
    weekFalls.length ? { text: `${weekFalls.length === 1 ? 'A fall' : `${weekFalls.length} falls`} in the last 7 days.`, short: weekFalls.length === 1 ? 'fall' : `${weekFalls.length} falls this week`, noteIds: weekFalls } : null,
  ]);
  const red = weekFalls.length >= 2 && confusion.length >= 1;
  return {
    risk: 'delirium',
    title: confusion.length >= 2 ? 'New confusion: possible delirium' : 'Recent fall',
    level: red ? 'red' : 'amber',
    evidence,
    advice: confusion.length >= 2
      ? 'Screen for delirium (4AT). Look for a cause, PINCH ME: Pain, Infection, Constipation, Hydration, Medication, Environment.'
      : 'Observe for 24–48 hours after a fall: head injury signs, new pain, change in mobility or confusion.',
  };
}

// ── NEWS2 ───────────────────────────────────────────────────────────────────────────────────
export function news2Finding(c: Ctx): Finding | null {
  if (!c.latest || c.latest.news2.total === 0) return null;
  const n = c.latest.news2;
  const level = n.total >= 5 || n.anyThree ? 'red' : n.total >= 3 ? 'amber' : 'info';
  return {
    risk: 'news2',
    title: `NEWS2 ${n.total}`,
    level,
    evidence: [{
      text: `Obs on ${formatDay(c.latest.date)} scored ${n.total}${n.scale2 ? ' (SpO2 scale 2)' : ''}: ${n.parts.filter((p) => p.score > 0).map((p) => `${p.param} ${p.value} (+${p.score})`).join(', ')}.`,
      // The title already says "NEWS2 n", so the card shows what drove it.
      short: n.parts.filter((p) => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((p) => (p.param === 'ACVPU' ? 'new confusion' : `${p.param} ${p.value}`)).join(' · '),
      noteIds: [c.latest.noteId],
    }],
    advice: level === 'red'
      ? 'NEWS2 of 5 or more, or a single parameter scoring 3: urgent clinical review under your escalation policy.'
      : level === 'amber' ? 'Repeat obs within 4 hours; escalate if the score rises.' : 'Low score. Continue routine observation.',
  };
}

// ── soft signs (information only) ───────────────────────────────────────────────────────────
export function softSigns(c: Ctx): Finding | null {
  const { base, recent, today } = c.w;
  const evidence: Evidence[] = [];
  if (!today || Object.keys(today.records).length === 0) {
    evidence.push({ text: 'No notes recorded for this day yet.', short: 'no notes today', noteIds: [] });
  }
  const mb = robust(base.map((d) => d.mealPct), FLOORS.mealPct);
  const mm = mean(recent.map((d) => d.mealPct));
  if (mb && mm !== null && mm < mb.median * 0.8) {
    evidence.push({ text: `Eating less: ${Math.round(mm)}% of meals over three days; usually ${Math.round(mb.median)}%.`, short: 'eating less', noteIds: ids(recent, ['early', 'late']) });
  }
  const wb = robust(base.map((d) => d.nightWakings), FLOORS.nightWakings);
  const night = today?.records.night;
  if (wb && today?.nightWakings != null && today.nightWakings >= wb.median + 3 && night) {
    const cause = c.extractions.get(night.id)?.current.has('disturbed') ? ' The note gives a cause.' : '';
    evidence.push({ text: `Unsettled night: awake ${today.nightWakings} times; usually ${fmt(wb.median)}.${cause}`, short: 'unsettled night', noteIds: [night.id] });
  }
  if (!evidence.length) return null;
  return { risk: 'soft', title: 'Worth knowing', level: 'info', evidence, advice: 'No action suggested on these alone. Mention at handover if they persist.' };
}
