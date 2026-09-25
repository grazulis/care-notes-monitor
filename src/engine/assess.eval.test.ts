/**
 * The definition of done (PLAN.md §5.5): the engine, run as of the last care day, agrees with
 * ground-truth.json — and would have warned a day earlier for every red case.
 */
import { describe, expect, it } from 'vitest';
import { assess, assessAll } from './assess';
import { addDays } from './dates';
import { buildModel } from './features';
import { groundTruth, meta, records, residents } from './test-data';

const model = buildModel(residents, records);
const today = meta.lastCareDay;
const all = assessAll(model, today);
const byId = new Map(all.map((a) => [a.residentId, a]));

describe(`assessment as of ${today}`, () => {
  it('prints the handover (for the slide)', () => {
    const rows = groundTruth.map((g) => {
      const a = byId.get(g.residentId)!;
      const ok = g.acceptablePriorities.includes(a.priority) ? '✓' : '✗';
      return `${ok} ${g.residentId} ${g.name.padEnd(20)} ${g.scenario.padEnd(19)} expected ${g.expectedPriority.padEnd(5)} got ${a.priority.padEnd(5)} ${a.findings.filter((f) => f.level !== 'info').map((f) => `${f.level}:${f.risk}`).join(' ')}`;
    });
    console.log(rows.join('\n'));
  });

  it.each(groundTruth.filter((g) => g.kind !== 'well'))('$residentId $name ($scenario) → $expectedPriority', (g) => {
    expect(g.acceptablePriorities).toContain(byId.get(g.residentId)!.priority);
  });

  it('no well resident is red, and at most two are amber (alert fatigue)', () => {
    const well = groundTruth.filter((g) => g.kind === 'well').map((g) => byId.get(g.residentId)!);
    expect(well.filter((a) => a.priority === 'red').map((a) => a.residentId)).toEqual([]);
    expect(well.filter((a) => a.priority === 'amber').length).toBeLessThanOrEqual(2);
  });

  it('early warning: every red scenario is already at least amber the day before', () => {
    for (const g of groundTruth.filter((x) => x.expectedPriority === 'red')) {
      expect(assess(model, g.residentId, addDays(today, -1)).priority, g.name).not.toBe('green');
    }
  });

  it('a week earlier, before anything began, the scripted residents are green', () => {
    const weekAgo = addDays(today, -8);
    for (const g of groundTruth.filter((x) => x.onsetDate && x.onsetDate > weekAgo)) {
      expect(assess(model, g.residentId, weekAgo).priority, g.name).toBe('green');
    }
  });

  it('every red or amber finding carries evidence', () => {
    for (const a of all) for (const f of a.findings) expect(f.evidence.length, `${a.residentId} ${f.title}`).toBeGreaterThan(0);
  });
});

describe('replay across the last three weeks', () => {
  it('no well resident is ever red on any day', () => {
    const well = groundTruth.filter((g) => g.kind === 'well');
    const reds: string[] = [];
    for (let k = 0; k < 21; k++) {
      const day = addDays(today, -k);
      for (const g of well) if (assess(model, g.residentId, day).priority === 'red') reds.push(`${g.residentId}@${day}`);
    }
    expect(reds).toEqual([]);
  });
});
