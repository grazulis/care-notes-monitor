import { formatDay } from '../engine/dates';
import type { Model } from '../engine/features';
import type { Assessment, Priority } from '../engine/types';

export const PRIORITY_LABEL: Record<Priority, string> = {
  red: 'Review today',
  amber: 'Watch closely',
  green: 'No change',
};

export function PriorityChip({ priority }: { priority: Priority }) {
  return <span className={`chip ${priority}`}>{PRIORITY_LABEL[priority]}</span>;
}

interface Props {
  assessments: Assessment[];
  model: Model;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Board({ assessments, model, selectedId, onSelect }: Props) {
  const of = (p: Priority) => assessments.filter((a) => a.priority === p);
  const red = of('red');
  const amber = of('amber');
  const green = of('green');
  const resident = (id: string) => model.timelines.get(id)!.resident;

  const card = (a: Assessment) => {
    const r = resident(a.residentId);
    const selected = a.residentId === selectedId;
    return (
      <li key={a.residentId}>
        <button type="button" className={`card ${a.priority}${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={() => onSelect(a.residentId)}>
          <span className="card-top">
            <span className="card-name">{r.firstName} {r.lastName}</span>
            <PriorityChip priority={a.priority} />
          </span>
          <span className="card-meta">
            Room {r.room} · {r.unit} · {r.age}
            {a.since && (a.since === a.asOf ? ' · new today' : ` · flagged since ${formatDay(a.since)}`)}
          </span>
          <span className="card-findings">
            {a.findings.filter((f) => f.level !== 'info').slice(0, 3).map((f) => (
              <span key={f.risk} className="card-finding">
                <span className={`dot ${f.level}`} aria-hidden="true" />
                <span><strong>{f.title}</strong> <span className="shorts">{f.evidence.slice(0, 4).map((e) => e.short).join(' · ')}</span></span>
              </span>
            ))}
          </span>
        </button>
      </li>
    );
  };

  return (
    <section className="board" aria-label="Residents by priority">
      <p className="counts">
        <span className="count red"><strong>{red.length}</strong> review today</span>
        <span className="count amber"><strong>{amber.length}</strong> to watch</span>
        <span className="count green"><strong>{green.length}</strong> no change</span>
      </p>

      {red.length > 0 && (<>
        <h2 className="group red">Consider clinical review today</h2>
        <ul className="cards">{red.map(card)}</ul>
      </>)}
      {amber.length > 0 && (<>
        <h2 className="group amber">Watch closely</h2>
        <ul className="cards">{amber.map(card)}</ul>
      </>)}

      <h2 className="group green">No change detected</h2>
      <ul className="green-list">
        {green.map((a) => {
          const r = resident(a.residentId);
          const notes = a.findings.flatMap((f) => f.evidence.map((e) => e.short));
          return (
            <li key={a.residentId}>
              <button type="button" className={a.residentId === selectedId ? 'selected' : ''} aria-pressed={a.residentId === selectedId} onClick={() => onSelect(a.residentId)}>
                <span className="room">{r.room}</span>
                <span className="gname">{r.firstName} {r.lastName}</span>
                {notes.length > 0 && <span className="ginfo">{notes.join(' · ')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
