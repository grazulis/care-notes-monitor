import { describe, expect, it } from 'vitest';
import { news2 } from './news2';
import type { Obs } from './types';

const obs = (o: Partial<Obs>): Obs => ({ tempC: 36.8, pulse: 72, respRate: 16, spo2: 97, systolicBp: 130, diastolicBp: 75, consciousness: 'A', ...o });

describe('NEWS2', () => {
  it('scores normal obs as 0', () => {
    expect(news2(obs({})).total).toBe(0);
  });
  it('scores a pneumonia picture as 7: T 38.2, P 108, RR 24, SpO2 91', () => {
    const r = news2(obs({ tempC: 38.2, pulse: 108, respRate: 24, spo2: 91, systolicBp: 112 }));
    expect(r.total).toBe(7);
    expect(r.anyThree).toBe(true);
  });
  it('scores new confusion as 3', () => {
    expect(news2(obs({ tempC: 37.9, pulse: 102, respRate: 20, spo2: 95, systolicBp: 122, consciousness: 'C' })).total).toBe(5);
  });
  it('uses scale 2 for SpO2 when the target is lower, so 92% scores nothing', () => {
    expect(news2(obs({ spo2: 92 }), false).total).toBe(2);
    expect(news2(obs({ spo2: 92 }), true).total).toBe(0);
    expect(news2(obs({ spo2: 85 }), true).total).toBe(2);
  });
  it('band edges', () => {
    expect(news2(obs({ tempC: 38.0 })).total).toBe(0);
    expect(news2(obs({ tempC: 38.1 })).total).toBe(1);
    expect(news2(obs({ pulse: 91 })).total).toBe(1);
    expect(news2(obs({ systolicBp: 90 })).total).toBe(3);
  });
});
