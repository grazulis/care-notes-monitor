/** Shown when no resident is selected: how to read the board. */
export function Legend() {
  return (
    <aside className="detail legend" aria-label="How this works">
      <h2>How to read this</h2>
      <p>
        Every resident is compared with <strong>their own normal</strong>, which is the five weeks before the
        last seven days, not a textbook value. A cough that is usual for someone with COPD, or frequent
        toileting on water tablets, is not flagged. A change is.
      </p>
      <dl className="legend-list">
        <dt><span className="chip red">Review today</span></dt>
        <dd>A pattern worth a clinical review today: a NEWS2 of 5 or more, or several signs pointing the same way.</dd>
        <dt><span className="chip amber">Watch closely</span></dt>
        <dd>Something has changed. Take obs, increase monitoring, and look again at the next handover.</dd>
        <dt><span className="chip green">No change</span></dt>
        <dd>Nothing found that differs from this person&rsquo;s usual.</dd>
      </dl>
      <h3>What it reads</h3>
      <ul>
        <li><strong>Charts:</strong> fluids, meals, toilet visits, incontinence, night wakings, bowels, falls, obs.</li>
        <li><strong>Free text:</strong> cough, sputum, breathlessness, confusion, pain passing urine, urine, sore or dry mouth, drowsiness, dizziness, tummy pain. It understands &ldquo;no cough&rdquo; and &ldquo;usual cough&rdquo;.</li>
      </ul>
      <h3>Try</h3>
      <ul>
        <li>Open a resident to see the evidence behind the flag, and the notes it came from.</li>
        <li>Drag the <strong>care day</strong> back a week and step forward: watch problems emerge.</li>
        <li>Edit today&rsquo;s note for someone and see the board re-score instantly.</li>
      </ul>
      <p className="fineprint">Decision support only. It points at patterns; the nurse decides. All data is synthetic.</p>
    </aside>
  );
}
