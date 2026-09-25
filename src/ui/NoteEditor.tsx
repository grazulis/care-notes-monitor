import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDay } from '../engine/dates';
import { extract, SYMPTOM_LABELS } from '../engine/extract';
import type { Consciousness, Obs, Resident, ShiftRecord } from '../engine/types';

interface Props {
  record: ShiftRecord;
  resident: Resident;
  onSave: (record: ShiftRecord) => void;
  onCancel: () => void;
}

const BLANK_OBS: Obs = { tempC: 36.8, pulse: 76, respRate: 16, spo2: 96, systolicBp: 130, diastolicBp: 76, consciousness: 'A' };
const num = (v: string): number | null => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Edit one shift record. What the app reads in the text updates as you type. */
export function NoteEditor({ record, resident, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<ShiftRecord>(record);
  const [withObs, setWithObs] = useState(record.obs !== null);
  const [obs, setObs] = useState<Obs>(record.obs ?? BLANK_OBS);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  const read = useMemo(() => extract(draft.note), [draft.note]);
  const set = <K extends keyof ShiftRecord>(k: K, v: ShiftRecord[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const isNight = draft.shift === 'night';

  const numberField = (label: string, key: 'fluidIntakeMl' | 'mealsEatenPct' | 'toiletVisits' | 'incontinenceEpisodes' | 'nightWakings') => (
    <label className="field">
      <span>{label}</span>
      <input type="number" inputMode="numeric" value={draft[key] ?? ''} onChange={(e) => set(key, num(e.target.value))} />
    </label>
  );
  const obsField = (label: string, key: Exclude<keyof Obs, 'consciousness'>, stepSize = 1) => (
    <label className="field">
      <span>{label}</span>
      <input type="number" step={stepSize} value={obs[key]} onChange={(e) => setObs((o) => ({ ...o, [key]: Number(e.target.value) }))} />
    </label>
  );

  return (
    <dialog ref={dialog} className="editor" onCancel={(e) => { e.preventDefault(); onCancel(); }} aria-labelledby="editor-h">
      <form method="dialog" onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...draft, obs: withObs ? obs : null });
      }}>
        <h2 id="editor-h">{resident.firstName} {resident.lastName}: {draft.shift} shift, {formatDay(draft.careDate)}</h2>

        <label className="field wide">
          <span>Note</span>
          <textarea rows={5} value={draft.note} onChange={(e) => set('note', e.target.value)} autoFocus />
        </label>
        <div className="reads" aria-live="polite">
          <span className="muted">The app reads:</span>
          {[...read.current].map((k) => <span key={k} className="read new">{SYMPTOM_LABELS[k]}{k === 'cough' ? (read.coughLevel === 2 ? ' (frequent)' : ' (occasional)') : ''}{k === 'sputum' && read.sputumColour ? ` (${read.sputumColour})` : ''}</span>)}
          {[...read.chronic].map((k) => <span key={k} className="read usual">{SYMPTOM_LABELS[k]} (usual)</span>)}
          {read.matches.filter((m) => m.negated).map((m) => <span key={m.start} className="read neg">not {SYMPTOM_LABELS[m.symptom].toLowerCase()}</span>)}
          {read.current.size + read.chronic.size === 0 && !read.matches.some((m) => m.negated) && <span className="muted">nothing of note</span>}
        </div>

        <fieldset>
          <legend>Charts</legend>
          <div className="grid">
            {numberField('Fluids (ml)', 'fluidIntakeMl')}
            {!isNight && numberField('Meals eaten (%)', 'mealsEatenPct')}
            {numberField('Toilet visits', 'toiletVisits')}
            {numberField('Incontinence', 'incontinenceEpisodes')}
            {isNight && numberField('Times awake', 'nightWakings')}
            <label className="check"><input type="checkbox" checked={draft.bowelsOpened} onChange={(e) => set('bowelsOpened', e.target.checked)} /> Bowels opened</label>
            <label className="check"><input type="checkbox" checked={draft.fall} onChange={(e) => set('fall', e.target.checked)} /> Fall</label>
          </div>
        </fieldset>

        <fieldset>
          <legend><label className="check"><input type="checkbox" checked={withObs} onChange={(e) => setWithObs(e.target.checked)} /> Observations taken</label></legend>
          {withObs && (
            <div className="grid">
              {obsField('Temp °C', 'tempC', 0.1)}
              {obsField('Pulse', 'pulse')}
              {obsField('Resp rate', 'respRate')}
              {obsField('SpO2 %', 'spo2')}
              {obsField('Systolic BP', 'systolicBp')}
              {obsField('Diastolic BP', 'diastolicBp')}
              <label className="field">
                <span>ACVPU</span>
                <select value={obs.consciousness} onChange={(e) => setObs((o) => ({ ...o, consciousness: e.target.value as Consciousness }))}>
                  <option value="A">Alert</option>
                  <option value="C">New confusion</option>
                  <option value="V">Voice</option>
                  <option value="P">Pain</option>
                  <option value="U">Unresponsive</option>
                </select>
              </label>
            </div>
          )}
        </fieldset>

        <div className="actions">
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary">Save and re-score</button>
        </div>
      </form>
    </dialog>
  );
}
