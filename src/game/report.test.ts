import { describe, expect, test } from 'vitest';
import { runScripted, TEST_RECIPE } from './fixtures';
import { postedProfit } from './ledger';
import { buildReport, replay, starsFor } from './report';
import type { ShiftState } from './types';

const plan = [
  { t: 40, action: { kind: 'assignBay' as const, truckId: 'TRUCK-IN-1', bayId: 'L1' } },
  { t: 120, action: { kind: 'chooseArea' as const, truckId: 'TRUCK-IN-1', areaId: 'HS1' } },
  { t: 130, action: { kind: 'assignBay' as const, truckId: 'TRUCK-OUT-1', bayId: 'L2' } },
];
const scriptedShift = () => runScripted(TEST_RECIPE, plan, 5);

describe('report', () => {
  test('stars from profit targets', () => {
    expect(starsFor(2999, [3000, 5000, 7000])).toBe(0);
    expect(starsFor(3000, [3000, 5000, 7000])).toBe(1);
    expect(starsFor(5000, [3000, 5000, 7000])).toBe(2);
    expect(starsFor(9000, [3000, 5000, 7000])).toBe(3);
  });

  test('the report adds up to the profit', () => {
    const s = scriptedShift();
    const r = buildReport(s);
    const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);
    expect(sum(r.earnings) + sum(r.fines) + sum(r.spending)).toBe(r.profit);
    expect(r.profit).toBe(postedProfit(s));
    expect(r.earnings).toContainEqual({ label: '4 units stored × €40', amount: 160 });
    expect(r.fines.map((f) => f.t)).toEqual([...r.fines.map((f) => f.t)].sort((a, b) => a - b));
  });

  test('the lesson names the biggest loss', () => {
    const s = scriptedShift();
    s.ledger = [
      { t: 1, kind: 'late', amount: -690, text: 'x', rule: 'r', ref: 'A' },
      { t: 2, kind: 'gateWait', amount: -180, text: 'y', rule: 'r', ref: 'B' },
    ];
    expect(buildReport(s).lesson.startsWith('Late departures cost you €690')).toBe(true);
    s.ledger = [];
    expect(buildReport(s).lesson).toBe('A clean shift. Next time, push for more trucks served.');
  });

  test('replaying the action log gives the same ledger', () => {
    const s: ShiftState = scriptedShift();
    expect(replay(s.recipe, s.log, s.t).ledger).toEqual(s.ledger);
  });
});
