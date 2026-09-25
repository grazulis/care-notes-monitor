import { windows } from './baseline';
import { addDays, formatDay } from './dates';
import type { Model, Timeline } from './features';
import { news2 } from './news2';
import { bowels, chest, delirium, hydration, news2Finding, softSigns, uti, type Ctx } from './rules';
import type { Assessment, Finding, Level, Priority } from './types';

const LEVEL_ORDER: Record<Level, number> = { red: 0, amber: 1, info: 2 };
const PRIORITY_ORDER: Record<Priority, number> = { red: 0, amber: 1, green: 2 };
const MIN_BASELINE_DAYS = 7;

function context(model: Model, t: Timeline, asOf: string): Ctx {
  const w = windows(t.days, asOf);
  const scale2 = t.resident.conditions.includes('COPD');
  const recentObs = w.recent.flatMap((d) => d.obs.map((o) => ({ ...o, date: d.date })));
  const latestRaw = w.recent.filter((d) => d.date >= addDays(asOf, -1)).flatMap((d) => d.obs.map((o) => ({ ...o, date: d.date }))).at(-1);
  return {
    timeline: t,
    asOf,
    w,
    extractions: model.extractions,
    scale2,
    recentObs,
    latest: latestRaw ? { ...latestRaw, news2: news2(latestRaw.obs, scale2) } : null,
    baseObs: w.base.flatMap((d) => d.obs.map((o) => o.obs)),
  };
}

/** One resident, one day. Pure: the same model and date always give the same answer. */
export function assess(model: Model, residentId: string, asOf: string): Assessment {
  const t = model.timelines.get(residentId);
  if (!t) throw new Error(`Unknown resident ${residentId}`);
  const c = context(model, t, asOf);
  const enoughHistory = c.w.base.length >= MIN_BASELINE_DAYS;

  // NEWS2 is absolute, so it runs even before a baseline exists. Everything else compares.
  const findings = (enoughHistory
    ? [uti(c), chest(c), hydration(c), bowels(c), delirium(c), news2Finding(c), softSigns(c)]
    : [news2Finding(c)]
  ).filter((f): f is Finding => f !== null);

  if (!enoughHistory) {
    findings.push({ risk: 'soft', title: 'Building a baseline', level: 'info', advice: 'Comparisons start once a week of notes exists.', evidence: [{ text: `Only ${c.w.base.length} days of history before ${formatDay(asOf)}.`, short: 'building baseline', noteIds: [] }] });
  }

  // Delirium: point at causes the other rules have already found (PINCH ME).
  const del = findings.find((f) => f.risk === 'delirium' && f.title.startsWith('New confusion'));
  if (del) {
    const causes = findings.filter((f) => f !== del && f.level !== 'info' && ['uti', 'chest', 'hydration', 'bowels'].includes(f.risk));
    del.evidence.push(causes.length
      ? { text: `Possible causes already flagged: ${causes.map((f) => f.title.toLowerCase()).join('; ')}.`, short: 'cause flagged', noteIds: [] }
      : { text: 'No infection, hydration or bowel cause found in the notes so far. Look wider: pain, medication, environment.', short: 'cause unclear', noteIds: [] });
  }

  findings.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const priority: Priority = findings.some((f) => f.level === 'red') ? 'red' : findings.some((f) => f.level === 'amber') ? 'amber' : 'green';

  const weekObs = c.w.week.flatMap((d) => d.obs.map((o) => ({ ...o, date: d.date }))).at(-1);
  return {
    residentId,
    asOf,
    priority,
    findings,
    latestNews2: weekObs ? { ...news2(weekObs.obs, c.scale2), noteId: weekObs.noteId, date: weekObs.date } : null,
    baselineDays: c.w.base.length,
    since: null,
  };
}

/** Everyone, as of one day, with how long each non-green resident has been flagged. Sorted for handover. */
export function assessAll(model: Model, asOf: string): Assessment[] {
  const out = [...model.timelines.keys()].map((id) => {
    const a = assess(model, id, asOf);
    if (a.priority !== 'green') {
      a.since = asOf;
      for (let k = 1; k <= 14; k++) {
        const day = addDays(asOf, -k);
        if (day < model.firstDay || assess(model, id, day).priority === 'green') break;
        a.since = day;
      }
    }
    return a;
  });
  return out.sort((a, b) =>
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    || score(b) - score(a)
    || (model.timelines.get(a.residentId)?.resident.room ?? 0) - (model.timelines.get(b.residentId)?.resident.room ?? 0));
}

function score(a: Assessment): number {
  return a.findings.reduce((s, f) => s + (f.level === 'red' ? 10 : f.level === 'amber' ? 3 : 0) + f.evidence.length * 0.1, 0);
}

