interface Props {
  label: string;
  unit: string;
  values: (number | null)[];
  /** The usual range: median ± spread from the baseline window. */
  band: { lo: number; hi: number; median: number } | null;
  /** Index from which the "recent" (last three days) shading starts. */
  recentFrom: number;
  target?: number;
  format?: (n: number) => string;
}

const W = 520;
const H = 60;
const PAD = 5;

export function Sparkline({ label, unit, values, band, recentFrom, target, format = (n) => String(Math.round(n)) }: Props) {
  const nums = values.filter((v): v is number => v !== null);
  const top = Math.max(1, ...nums, band?.hi ?? 0, target ?? 0) * 1.12;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(1, values.length - 1);
  const y = (v: number) => H - PAD - (v / top) * (H - 2 * PAD);

  let d = '';
  values.forEach((v, i) => {
    if (v === null) return;
    d += `${d && values[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const lastIndex = values.length - 1;
  const last = values[lastIndex] ?? null;
  const step = (W - 2 * PAD) / Math.max(1, values.length - 1);
  const outside = last !== null && band !== null && (last > band.hi || last < band.lo);

  return (
    <div className="spark">
      <div className="spark-label">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${values.map((v) => (v === null ? 'no record' : format(v))).join(', ')}`}>
        <rect className="spark-recent" x={x(recentFrom) - step / 2} y={0} width={W - x(recentFrom) + step / 2} height={H} />
        {band && <rect className="spark-band" x={PAD} width={W - 2 * PAD} y={y(band.hi)} height={Math.max(1, y(band.lo) - y(band.hi))} />}
        {band && <line className="spark-median" x1={PAD} x2={W - PAD} y1={y(band.median)} y2={y(band.median)} />}
        {target !== undefined && <line className="spark-target" x1={PAD} x2={W - PAD} y1={y(target)} y2={y(target)} />}
        <path className="spark-line" d={d} />
        {values.map((v, i) => v !== null && i >= recentFrom && (
          <circle key={i} className={`spark-dot${i === lastIndex && outside ? ' out' : ''}`} cx={x(i)} cy={y(v)} r={i === lastIndex ? 4 : 3} />
        ))}
      </svg>
      <div className="spark-value">
        <strong className={outside ? 'out' : ''}>{last === null ? '–' : format(last)}</strong>
        <span>{unit}</span>
        {band && <span className="usual">usual {format(band.median)}</span>}
      </div>
    </div>
  );
}
