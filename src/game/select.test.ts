import { describe, expect, test } from 'vitest';
import { dock, TEST_RECIPE, truck } from './fixtures';
import { newShift } from './generate';
import { bayInfo, briefingRows, crewView, timelineRows, truckView } from './select';
import { secondsFor } from './types';

describe('HUD selectors', () => {
  test('timeline: a truck that waited then docked', () => {
    const s = newShift(TEST_RECIPE);
    Object.assign(truck(s, 'TRUCK-IN-1'), { stage: 'docked', bayId: 'L1', times: { arrived: secondsFor(10), leftKerb: secondsFor(25) } });
    const row = timelineRows(s, secondsFor(40)).find((r) => r.truckId === 'TRUCK-IN-1')!;
    expect(row.segments.filter((x) => x.kind !== 'plan')).toEqual([
      { kind: 'wait', from: 10, to: 25 },
      { kind: 'dock', from: 25, to: 40 },
    ]);
    expect(row.segments[0]).toEqual({ kind: 'plan', from: 5, to: 65 });
  });

  test('timeline: an outbound truck past its deadline shows a late segment', () => {
    const s = newShift(TEST_RECIPE);
    Object.assign(truck(s, 'TRUCK-OUT-1'), { stage: 'docked', bayId: 'L2', times: { arrived: secondsFor(12), leftKerb: secondsFor(14) } });
    const row = timelineRows(s, secondsFor(130)).find((r) => r.truckId === 'TRUCK-OUT-1')!;
    expect(row.deadlineMin).toBe(120);
    expect(row.segments.at(-1)).toEqual({ kind: 'late', from: 120, to: 130 });
  });

  test('truck actions explain why they are disabled', () => {
    const s = newShift(TEST_RECIPE);
    dock(s, 'TRUCK-IN-1', 'L1');
    Object.assign(truck(s, 'TRUCK-OUT-1'), { stage: 'waiting', slot: 0, times: { arrived: 0 } });
    const v = truckView(s, 'TRUCK-OUT-1', secondsFor(1))!;
    expect(v.stageLabel).toBe('At the gate · 1 min');
    expect(v.actions.find((a) => a.action.kind === 'assignBay' && a.action.bayId === 'L1')!.result).toEqual({ ok: false, reason: 'Bay L1 is busy' });
    expect(v.actions.find((a) => a.action.kind === 'assignBay' && a.action.bayId === 'L2')!.result).toEqual({ ok: true });
  });

  test('bays, crew and briefing views', () => {
    const s = newShift(TEST_RECIPE);
    dock(s, 'TRUCK-IN-1', 'L1');
    expect(bayInfo(s, 0)).toEqual([
      { id: 'L1', truckId: 'TRUCK-IN-1', closedUntilMin: null, clearing: false, done: 0, total: 4 },
      { id: 'L2', truckId: null, closedUntilMin: null, clearing: false, done: 0, total: 0 },
    ]);
    expect(crewView(s, 0)).toEqual([]);
    expect(briefingRows(TEST_RECIPE).map((r) => [r.id, r.fromMin, r.toMin])).toEqual([
      ['TRUCK-IN-1', 5, 65],
      ['TRUCK-OUT-1', 10, 120],
    ]);
  });
});
