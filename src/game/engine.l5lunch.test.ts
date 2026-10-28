import { describe, expect, test } from 'vitest';
import { act, advance, isLoaded, validate } from './engine';
import { advanceUntil, truck, withRecipe } from './fixtures';
import { newShift } from './generate';
import { recommendPlan } from './planning';
import { atLunch, LUNCH, secondsFor, workDone } from './types';

const L5 = withRecipe({ bays: ['L1', 'L2', 'L3', 'L4', 'L5'] });

describe('bay L5 by the gate wall', () => {
  test('an inbound truck docks at L5 and the crew unloads it into the open yard', () => {
    const s = newShift(L5);
    advanceUntil(s, (x) => truck(x, 'TRUCK-IN-1').stage === 'waiting');
    expect(act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L5' }, s.t)).toEqual({ ok: true });
    advanceUntil(s, (x) => truck(x, 'TRUCK-IN-1').stage === 'docked');
    expect(act(s, { kind: 'chooseArea', truckId: 'TRUCK-IN-1', areaId: 'OY' }, s.t)).toEqual({ ok: true });
    advanceUntil(s, (x) => truck(x, 'TRUCK-IN-1').stage === 'gone');
    expect(s.ledger.filter((e) => e.kind === 'handling')).toHaveLength(4);
    expect(s.jobs.every((j) => j.status === 'done')).toBe(true);
  });

  test('an outbound truck at L5 is loaded to plan', () => {
    const s = newShift(L5);
    advanceUntil(s, (x) => truck(x, 'TRUCK-OUT-1').stage === 'waiting');
    act(s, { kind: 'assignBay', truckId: 'TRUCK-OUT-1', bayId: 'L5' }, s.t);
    advanceUntil(s, (x) => truck(x, 'TRUCK-OUT-1').stage === 'docked');
    const plan = recommendPlan(s, 'TRUCK-OUT-1');
    expect(plan.placements.length).toBeGreaterThan(0);
    expect(act(s, { kind: 'confirmPlan', truckId: 'TRUCK-OUT-1', plan }, s.t)).toEqual({ ok: true });
    advanceUntil(s, (x) => isLoaded(truck(x, 'TRUCK-OUT-1')));
    expect(s.jobs.filter((j) => j.blocked)).toEqual([]);
  });
});

describe('lunch', () => {
  const noon = secondsFor(LUNCH.fromMin);
  const one = secondsFor(LUNCH.toMin);

  test('runs 12:00 to 13:00', () => {
    expect(atLunch(noon - 1)).toBe(false);
    expect(atLunch(noon)).toBe(true);
    expect(atLunch(one - 1)).toBe(true);
    expect(atLunch(one)).toBe(false);
  });

  test('work across lunch takes the hour off; work started at lunch waits for 13:00', () => {
    expect(workDone(0, 100)).toBe(100);
    expect(workDone(noon - 50, 100)).toBe(one + 50);
    expect(workDone(noon + 10, 100)).toBe(one + 100);
    expect(workDone(one, 100)).toBe(one + 100);
  });

  test('no forklift job starts at lunch; the crew starts again at 13:00', () => {
    const s = newShift(withRecipe({ trucks: [{ id: 'TRUCK-IN-1', kind: 'inbound', carrier: 'cargoviva', arriveMin: 350, plannedArriveMin: 350, units: 4 }] }));
    advanceUntil(s, (x) => truck(x, 'TRUCK-IN-1').stage === 'waiting');
    act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L1' }, s.t);
    advanceUntil(s, (x) => truck(x, 'TRUCK-IN-1').stage === 'docked');
    expect(atLunch(s.t)).toBe(true);
    act(s, { kind: 'chooseArea', truckId: 'TRUCK-IN-1', areaId: 'HS1' }, s.t);
    advance(s, one - 1);
    expect(s.jobs.every((j) => j.status === 'queued')).toBe(true);
    advance(s, one + 1);
    expect(s.jobs.some((j) => j.status === 'active')).toBe(true);
  });
});

describe('admin', () => {
  test('with freeCash, spending is never refused for lack of cash', () => {
    const s = newShift(withRecipe({ budget: 0 }));
    advance(s, 1);
    expect(validate(s, { kind: 'rentForklift', hours: 4 }, 1).ok).toBe(false);
    s.freeCash = true;
    expect(validate(s, { kind: 'rentForklift', hours: 4 }, 1).ok).toBe(true);
  });
});
