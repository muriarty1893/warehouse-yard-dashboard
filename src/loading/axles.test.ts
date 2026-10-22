import { describe, expect, it } from 'vitest';
import { axleReport, cogWindow, distributionCurve, loadState } from './axles';
import type { AxleId, LoadState, Mass } from './types';
import { vehicleById } from './vehicles';

const axle = (s: LoadState, id: AxleId) => {
  const a = s.axles.find((x) => x.id === id);
  if (!a) throw new Error(`no ${id} axle`);
  return a;
};

describe('axle statics', () => {
  it('rigid-18: 5.8 t at x=1.7 puts the front axle at its 7.5 t rating', () => {
    const s = loadState(vehicleById('rigid-18'), [{ x: 1.7, kg: 5800, stop: 1 }], 0);
    expect(axle(s, 'front').kg).toBeCloseTo(7500, 0);
    expect(axle(s, 'rear').kg).toBeCloseTo(6600, 0);
    expect(axle(s, 'front').status).toBe('near');
    expect(axle(s, 'rear').status).toBe('ok');
  });

  it('semi-136: 20 t at x=6.8 splits 7244 / 11905 / 16250', () => {
    const s = loadState(vehicleById('semi-136'), [{ x: 6.8, kg: 20000, stop: 1 }], 0);
    expect(axle(s, 'steer').kg).toBeCloseTo(7244, 0);
    expect(axle(s, 'drive').kg).toBeCloseTo(11905, 0);
    expect(axle(s, 'trailer').kg).toBeCloseTo(16250, 0);
    expect(s.axles.reduce((sum, a) => sum + a.kg, 0)).toBeCloseTo(15400 + 20000, 3);
  });

  it('steer too light is reported', () => {
    const v = vehicleById('rigid-18');
    const r = axleReport(v, [{ x: 7.3, kg: 9700, stop: 1 }], 1);
    const s = r.states[0];
    expect(axle(s, 'front').status).toBe('light');
    expect(axle(s, 'rear').status).toBe('over');
    expect(s.issues.length).toBeGreaterThan(0);
    expect(s.issues).toContain('Front axle too light at departure');
    expect(r.ok).toBe(false);
  });

  it('after-drop states drop earlier stops first', () => {
    const masses: Mass[] = [
      { x: 6.5, kg: 2000, stop: 1 },
      { x: 3, kg: 2000, stop: 2 },
      { x: 1, kg: 2000, stop: 3 },
    ];
    const r = axleReport(vehicleById('rigid-18'), masses, 3);
    expect(r.states.length).toBe(3);
    expect(r.states.map((s) => s.payloadKg)).toEqual([6000, 4000, 2000]);
    expect(r.states.map((s) => s.label)).toEqual(['Depart', 'After 1', 'After 2']);
    const cogs = r.states.map((s) => s.cogX ?? NaN);
    expect(cogs[1]).toBeLessThan(cogs[0]);
    expect(cogs[2]).toBeLessThan(cogs[1]);
  });

  it('single stop has only the departure state', () => {
    const r = axleReport(vehicleById('rigid-26'), [{ x: 3, kg: 1000, stop: 1 }], 1);
    expect(r.states.length).toBe(1);
  });

  it('distribution curve matches brute force', () => {
    for (const id of ['rigid-18', 'semi-136'] as const) {
      const v = vehicleById(id);
      const curve = distributionCurve(v);
      expect(curve.length).toBe(100);
      for (const p of curve.filter((_, i) => i % 11 === 0)) {
        const legal = (kg: number) => loadState(v, [{ x: p.x, kg, stop: 1 }], 0).issues.length === 0;
        let lo = 0;
        let hi = v.payloadKg * 2;
        if (!legal(lo)) {
          expect(p.maxKg).toBe(0);
          continue;
        }
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (legal(mid)) lo = mid;
          else hi = mid;
        }
        expect(Math.abs(p.maxKg - lo)).toBeLessThan(1);
      }
    }
  });

  it("cog window contains the plan's legal CoG", () => {
    const v = vehicleById('rigid-18');
    const w = cogWindow(v, 4000);
    expect(w).not.toBeNull();
    const [w0, w1] = w!;
    expect(w0).toBeLessThan(w1);
    expect(loadState(v, [{ x: (w0 + w1) / 2, kg: 4000, stop: 1 }], 0).issues).toEqual([]);
    expect(loadState(v, [{ x: w0 - 0.05, kg: 4000, stop: 1 }], 0).issues.length + loadState(v, [{ x: w1 + 0.05, kg: 4000, stop: 1 }], 0).issues.length).toBeGreaterThan(0);
  });
});
