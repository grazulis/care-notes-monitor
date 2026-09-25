import { useEffect, useMemo, useState } from 'react';
import { loadDataset, loadEdits, mergeRecords, saveEdits, type Dataset } from './data';
import { assessAll } from './engine/assess';
import { addDays, dateRange, formatDay } from './engine/dates';
import { buildModel } from './engine/features';
import type { ShiftRecord } from './engine/types';
import { Board } from './ui/Board';
import { Detail } from './ui/Detail';
import { Legend } from './ui/Legend';
import { NoteEditor } from './ui/NoteEditor';

export function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadDataset().then(setData, (e: unknown) => setError(String(e)));
  }, []);

  if (error) return <p className="loading">Could not load the dataset ({error}). Run <code>npm run generate</code> first.</p>;
  if (!data) return <p className="loading">Reading the notes…</p>;
  return <Monitor data={data} />;
}

function Monitor({ data }: { data: Dataset }) {
  const [edits, setEdits] = useState(loadEdits);
  useEffect(() => saveEdits(edits), [edits]);

  const records = useMemo(() => mergeRecords(data.records, edits), [data, edits]);
  const model = useMemo(() => buildModel(data.residents, records), [data, records]);
  // The first week is baseline only, so the replay starts after it.
  const days = useMemo(() => dateRange(addDays(model.firstDay, 7), model.lastDay), [model]);
  const [asOf, setAsOf] = useState(model.lastDay);
  const assessments = useMemo(() => assessAll(model, asOf), [model, asOf]);

  const [unit, setUnit] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShiftRecord | null>(null);

  const units = ['All', ...new Set(data.residents.map((r) => r.unit))];
  const shown = assessments.filter((a) => unit === 'All' || model.timelines.get(a.residentId)?.resident.unit === unit);
  const selected = assessments.find((a) => a.residentId === selectedId) ?? null;
  const dayIndex = days.indexOf(asOf);
  const editCount = Object.keys(edits).length;
  const step = (n: number) => setAsOf(days[Math.min(days.length - 1, Math.max(0, dayIndex + n))] ?? asOf);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Care Notes Monitor</h1>
          <p>Hackday prototype · synthetic residents and notes · decision support, not diagnosis</p>
        </div>

        <div className="replay" role="group" aria-label="Which care day to review">
          <button type="button" className="icon" onClick={() => step(-1)} disabled={dayIndex <= 0} aria-label="Previous day">◀</button>
          <div className="replay-body">
            <label htmlFor="asof">Care day <strong>{formatDay(asOf)}</strong>{asOf === model.lastDay ? ' · today' : ''}</label>
            <input id="asof" type="range" min={0} max={days.length - 1} value={dayIndex}
              onChange={(e) => setAsOf(days[Number(e.target.value)] ?? asOf)} />
          </div>
          <button type="button" className="icon" onClick={() => step(1)} disabled={dayIndex >= days.length - 1} aria-label="Next day">▶</button>
          {asOf !== model.lastDay && <button type="button" className="link" onClick={() => setAsOf(model.lastDay)}>Today</button>}
        </div>

        <div className="filters">
          <div className="segmented" role="group" aria-label="Unit">
            {units.map((u) => (
              <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u}</button>
            ))}
          </div>
          {editCount > 0 && (
            <button type="button" className="link" onClick={() => setEdits({})}>
              Reset {editCount} edited note{editCount === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </header>

      <main className={`layout${selected ? ' has-detail' : ''}`}>
        <Board assessments={shown} model={model} selectedId={selectedId} onSelect={setSelectedId} />
        {selected ? (
          <Detail key={selected.residentId} model={model} assessment={selected} asOf={asOf}
            onClose={() => setSelectedId(null)} onEdit={setEditing} />
        ) : (
          <Legend />
        )}
      </main>

      {editing && (
        <NoteEditor
          record={editing}
          resident={model.timelines.get(editing.residentId)!.resident}
          onCancel={() => setEditing(null)}
          onSave={(r) => {
            setEdits((e) => ({ ...e, [r.id]: r }));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
