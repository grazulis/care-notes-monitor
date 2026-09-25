import type { News2Result, Obs } from './types';

/**
 * NEWS2 (Royal College of Physicians, 2017). Assumes the resident is on room air, which is
 * true for this dataset. Scale 2 for SpO2 is used for people with a lower target (e.g. COPD).
 */
export function news2(o: Obs, scale2 = false): News2Result {
  const parts = [
    { param: 'RR', value: `${o.respRate}`, score: band(o.respRate, [[8, 3], [11, 1], [20, 0], [24, 2]], 3) },
    { param: 'SpO2', value: `${o.spo2}%`, score: scale2 ? band(o.spo2, [[83, 3], [85, 2], [87, 1]], 0) : band(o.spo2, [[91, 3], [93, 2], [95, 1]], 0) },
    { param: 'BP', value: `${o.systolicBp}`, score: band(o.systolicBp, [[90, 3], [100, 2], [110, 1], [219, 0]], 3) },
    { param: 'Pulse', value: `${o.pulse}`, score: band(o.pulse, [[40, 3], [50, 1], [90, 0], [110, 1], [130, 2]], 3) },
    { param: 'ACVPU', value: o.consciousness, score: o.consciousness === 'A' ? 0 : 3 },
    { param: 'Temp', value: o.tempC.toFixed(1), score: band(o.tempC, [[35.0, 3], [36.0, 1], [38.0, 0], [39.0, 1]], 2) },
  ];
  return {
    total: parts.reduce((s, p) => s + p.score, 0),
    anyThree: parts.some((p) => p.score === 3),
    scale2,
    parts,
  };
}

/** First band whose upper bound (inclusive) contains the value; otherwise `above`. */
function band(value: number, bands: [number, number][], above: number): number {
  for (const [upper, score] of bands) if (value <= upper) return score;
  return above;
}
