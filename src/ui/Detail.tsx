import { useState } from 'react';
import { FLOORS, robust, windows } from '../engine/baseline';
import { addDays, dateRange, formatDay } from '../engine/dates';
import type { SymptomKey } from '../engine/extract';
import type { DayFeatures, Model } from '../engine/features';
import { news2 } from '../engine/news2';
import { SHIFTS, type Assessment, type ShiftRecord } from '../engine/types';
import { PriorityChip } from './Board';
import { NoteText } from './NoteText';
import { Sparkline } from './Sparkline';

interface Props {
  model: Model;
  assessment: Assessment;
  asOf: string;
  onClose: () => void;
  onEdit: (record: ShiftRecord) => void;
}

const TREND_DAYS = 28;
const SHIFT_LABEL = { early: 'Early', late: 'Late', night: 'Night' } as const;

export function Detail({ model, assessment, asOf, onClose, onEdit }: Props) {
  const t = model.timelines.get(assessment.residentId)!;
  const r = t.resident;
  const [focus, setFocus] = useState<string[]>([]);

  const dates = dateRange(addDays(asOf, -(TREND_DAYS - 1)), asOf).filter((d) => d >= model.firstDay);
  const days = dates.map((d) => t.byDate.get(d));
  const base = windows(t.days, asOf).base;
  const recentFrom = Math.max(0, dates.length - 3);
  const bandFor = (f: (d: DayFeatures) => number | null, floor: number) => {
    const s = robust(base.map(f), floor);
    return s ? { lo: Math.max(0, s.median - s.spread), hi: s.median + s.spread, median: s.median } : null;
  };
  const series = (f: (d: DayFeatures) => number | null) => days.map((d) => (d ? f(d) : null));

  const showNotes = (ids: string[]) => {
    if (!ids.length) return;
    setFocus(ids);
    requestAnimationFrame(() => document.getElementById(`note-${ids[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const noteDays = dateRange(addDays(asOf, -6), asOf).reverse();
  const scale2 = r.conditions.includes('COPD');

  return (
    <article className="detail" aria-labelledby="detail-name">
      <header className="detail-head">
        <button type="button" className="link back" onClick={onClose}>← All residents</button>
        <div className="detail-title">
          <h2 id="detail-name">{r.firstName} {r.lastName}</h2>
          <PriorityChip priority={assessment.priority} />
        </div>
        <p className="detail-meta">
          Room {r.room}, {r.unit} · {r.age} years · {r.mobility} · {r.continence} · fluid target {r.fluidTargetMl}ml
        </p>
        <p className="tags">{r.conditions.map((c) => <span key={c} className="tag">{c}</span>)}</p>
        {r.carePlanNotes.length > 0 && (
          <div className="careplan"><strong>Normal for {r.firstName}:</strong> {r.carePlanNotes.join(' ')}</div>
        )}
      </header>

      <section aria-labelledby="findings-h">
        <h3 id="findings-h">What the app found {assessment.since && assessment.since !== asOf && <span className="muted">· flagged since {formatDay(assessment.since)}</span>}</h3>
        {assessment.findings.length === 0 && <p className="muted">Nothing differs from {r.firstName}&rsquo;s usual pattern.</p>}
        {assessment.findings.map((f) => (
          <div key={f.risk + f.title} className={`finding ${f.level}`}>
            <div className="finding-head">
              <span className={`level ${f.level}`}>{f.level === 'info' ? 'Info' : f.level === 'red' ? 'Review' : 'Watch'}</span>
              <h4>{f.title}</h4>
            </div>
            <ul className="evidence">
              {f.evidence.map((e, i) => (
                <li key={i}>
                  {e.noteIds.length ? (
                    <button type="button" className="evidence-link" onClick={() => showNotes(e.noteIds)} title="Show the notes this came from">
                      {e.text} <span className="src">{e.noteIds.length} note{e.noteIds.length === 1 ? '' : 's'} ↓</span>
                    </button>
                  ) : e.text}
                </li>
              ))}
            </ul>
            {f.level !== 'info' && <p className="advice">{f.advice}</p>}
          </div>
        ))}
      </section>

      <section aria-labelledby="trends-h">
        <h3 id="trends-h">Last four weeks <span className="muted">· shaded band = {r.firstName}&rsquo;s usual range · right edge = last 3 days</span></h3>
        <div className="sparks">
          <Sparkline label="Fluids" unit="ml" values={series((d) => d.fluidMl)} band={bandFor((d) => d.fluidMl, FLOORS.fluidMl)} recentFrom={recentFrom} target={r.fluidTargetMl} />
          <Sparkline label="Night toilet visits" unit="" values={series((d) => d.nightToilet)} band={bandFor((d) => d.nightToilet, FLOORS.nightToilet)} recentFrom={recentFrom} />
          <Sparkline label="Night wakings" unit="" values={series((d) => d.nightWakings)} band={bandFor((d) => d.nightWakings, FLOORS.nightWakings)} recentFrom={recentFrom} />
          <Sparkline label="Day toilet visits" unit="" values={series((d) => d.dayToilet)} band={bandFor((d) => d.dayToilet, FLOORS.dayToilet)} recentFrom={recentFrom} />
          <Sparkline label="Meals eaten" unit="%" values={series((d) => d.mealPct)} band={bandFor((d) => d.mealPct, FLOORS.mealPct)} recentFrom={recentFrom} />
        </div>
        <SymptomStrip dates={dates} days={days} />
      </section>

      <section aria-labelledby="notes-h">
        <h3 id="notes-h">Notes, last seven days <span className="muted">· what the app read is highlighted</span></h3>
        {noteDays.map((date) => {
          const day = t.byDate.get(date);
          if (!day) return null;
          const recs = SHIFTS.map((s) => day.records[s]).filter((x): x is ShiftRecord => Boolean(x)).reverse();
          return (
            <div key={date} className="note-day">
              <h4>{formatDay(date)}</h4>
              {recs.map((rec) => {
                const n2 = rec.obs ? news2(rec.obs, scale2) : null;
                return (
                  <div key={rec.id} id={`note-${rec.id}`} className={`note${focus.includes(rec.id) ? ' focused' : ''}`}>
                    <div className="note-head">
                      <span className="shift">{SHIFT_LABEL[rec.shift]}</span>
                      <span className="muted">{rec.recordedAt.slice(11)} · {rec.author}</span>
                      {date === asOf && <button type="button" className="link edit" onClick={() => onEdit(rec)}>Edit</button>}
                    </div>
                    <p className="note-charts">
                      {rec.fluidIntakeMl !== null && <span>{rec.fluidIntakeMl}ml</span>}
                      {rec.mealsEatenPct !== null && <span>meals {rec.mealsEatenPct}%</span>}
                      {rec.toiletVisits !== null && <span>toilet ×{rec.toiletVisits}</span>}
                      {!!rec.incontinenceEpisodes && <span>incont. ×{rec.incontinenceEpisodes}</span>}
                      {rec.nightWakings !== null && <span>awake ×{rec.nightWakings}</span>}
                      {rec.bowelsOpened && <span>BO</span>}
                      {rec.fall && <span className="alert">fall</span>}
                      {n2 && <span className={n2.total >= 5 || n2.anyThree ? 'alert' : ''}>NEWS2 {n2.total}</span>}
                    </p>
                    <p className="note-text"><NoteText text={rec.note} extraction={model.extractions.get(rec.id)} /></p>
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>
    </article>
  );
}

const STRIP: { label: string; keys: SymptomKey[] }[] = [
  { label: 'Cough', keys: ['cough'] },
  { label: 'Sputum', keys: ['sputum'] },
  { label: 'Breathless', keys: ['breathless'] },
  { label: 'New confusion', keys: ['confusion'] },
  { label: 'Urinary', keys: ['dysuria', 'urine', 'urinaryFrequency'] },
  { label: 'Drinking', keys: ['reluctantToDrink', 'soreMouth', 'dryMouth'] },
  { label: 'Drowsy / dizzy', keys: ['drowsy', 'dizzy'] },
  { label: 'Tummy pain', keys: ['abdominalPain'] },
];

/** One row per symptom, one cell per day: new mention, usual-for-them mention, or nothing. */
function SymptomStrip({ dates, days }: { dates: string[]; days: (DayFeatures | undefined)[] }) {
  const cell = (d: DayFeatures | undefined, keys: SymptomKey[]) => {
    if (!d) return 'none';
    if (keys.some((k) => d.symptoms[k]?.length)) return keys[0] === 'cough' && d.coughLevel === 1 ? 'mild' : 'new';
    if (keys.some((k) => d.chronic[k]?.length)) return 'usual';
    return 'none';
  };
  const rows = [
    ...STRIP.map((s) => ({ label: s.label, cells: days.map((d) => cell(d, s.keys)) })),
    { label: 'Bowels opened', cells: days.map((d) => (d?.bowelsOpened ? 'bo' : 'none')) },
    { label: 'Fall', cells: days.map((d) => (d?.falls ? 'new' : 'none')) },
  ];
  return (
    <div className="strip" style={{ ['--cols' as string]: dates.length }}>
      {rows.map((row) => (
        <div key={row.label} className="strip-row">
          <span className="strip-label">{row.label}</span>
          <span className="strip-cells" aria-label={`${row.label}: ${row.cells.filter((c) => c !== 'none').length} of ${dates.length} days`}>
            {row.cells.map((c, i) => <span key={dates[i]} className={`cell ${c}`} title={`${formatDay(dates[i] ?? '')}: ${c === 'none' ? '—' : c}`} />)}
          </span>
        </div>
      ))}
      <div className="strip-row axis">
        <span className="strip-label" />
        <span className="strip-cells">
          {dates.map((d, i) => <span key={d} className="tick">{i % 7 === dates.length % 7 ? formatDay(d, false) : ''}</span>)}
        </span>
      </div>
    </div>
  );
}
