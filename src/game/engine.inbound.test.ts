import { describe, expect, test } from 'vitest';
import { act, advance, validate } from './engine';
import { advanceUntil, runScripted, TEST_RECIPE, truck, withRecipe } from './fixtures';
import { newShift } from './generate';
import { secondsFor, type ShiftState } from './types';

const arrived = (s: ShiftState, id: string) => truck(s, id).stage === 'waiting';

describe('gate and bays', () => {
  test('a truck arrives, waits at the kerb and docks when given a bay', () => {
    const s = newShift(TEST_RECIPE);
    advance(s, secondsFor(6) + 60);
    expect(truck(s, 'TRUCK-IN-1').stage).toBe('waiting');
    expect(act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L1' }, s.t)).toEqual({ ok: true });
    advance(s, s.t + 120);
    expect(truck(s, 'TRUCK-IN-1').stage).toBe('docked');
  });

  test('waiting past the free minutes is charged when the truck leaves the kerb', () => {
    const s = newShift(TEST_RECIPE);
    advanceUntil(s, (x) => arrived(x, 'TRUCK-IN-1'));
    const t = truck(s, 'TRUCK-IN-1').times.arrived! + secondsFor(15);
    expect(act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L1' }, t).ok).toBe(true);
    expect(s.ledger.filter((e) => e.kind === 'gateWait')).toEqual([expect.objectContaining({ amount: -120, text: 'TRUCK-IN-1 waited 15 min at the gate', ref: 'TRUCK-IN-1' })]);
  });

  test('unloading pays per unit, then the truck leaves on its own', () => {
    const s = newShift(TEST_RECIPE);
    advanceUntil(s, (x) => arrived(x, 'TRUCK-IN-1'));
    act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L1' }, s.t);
    advanceUntil(s, (x) => truck(x, 'TRUCK-IN-1').stage === 'docked');
    expect(act(s, { kind: 'chooseArea', truckId: 'TRUCK-IN-1', areaId: 'HS1' }, s.t)).toEqual({ ok: true });
    advanceUntil(s, (x) => truck(x, 'TRUCK-IN-1').stage === 'gone');
    expect(s.ledger.filter((e) => e.kind === 'handling').map((e) => e.amount)).toEqual([40, 40, 40, 40]);
    expect(truck(s, 'TRUCK-IN-1').stage).toBe('gone');
  });

  test('with storage off the suggested area is chosen automatically', () => {
    const s = newShift(withRecipe({ mechanics: [] }));
    advanceUntil(s, (x) => arrived(x, 'TRUCK-IN-1'));
    act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L1' }, s.t);
    advanceUntil(s, (x) => truck(x, 'TRUCK-IN-1').stage === 'docked');
    expect(s.groups.map((g) => [g.kind, g.truckId])).toEqual([['unload', 'TRUCK-IN-1']]);
    expect(truck(s, 'TRUCK-IN-1').areaId).not.toBeNull();
  });

  test('actions in the wrong stage are refused and change nothing', () => {
    const s = newShift(TEST_RECIPE);
    advance(s, 1);
    const before = JSON.stringify(s);
    expect(act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L1' }, 1)).toEqual({ ok: false, reason: 'TRUCK-IN-1 is not waiting at the gate' });
    expect(act(s, { kind: 'chooseArea', truckId: 'TRUCK-IN-1', areaId: 'HS1' }, 1).ok).toBe(false);
    expect(act(s, { kind: 'dispatch', truckId: 'TRUCK-IN-1' }, 1).ok).toBe(false);
    expect(act(s, { kind: 'assignBay', truckId: 'TRUCK-NOPE', bayId: 'L1' }, 1).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  test('a bay is busy while docked and not free until the departing truck has pulled out', () => {
    const s = newShift(TEST_RECIPE);
    advanceUntil(s, (x) => arrived(x, 'TRUCK-IN-1') && arrived(x, 'TRUCK-OUT-1'));
    act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L1' }, s.t);
    expect(validate(s, { kind: 'assignBay', truckId: 'TRUCK-OUT-1', bayId: 'L1' }, s.t)).toEqual({ ok: false, reason: 'Bay L1 is busy' });
    advanceUntil(s, (x) => truck(x, 'TRUCK-IN-1').stage === 'docked');
    act(s, { kind: 'chooseArea', truckId: 'TRUCK-IN-1', areaId: 'HS1' }, s.t);
    advanceUntil(s, (x) => truck(x, 'TRUCK-IN-1').stage === 'departing', 0.05);
    const clearAt = truck(s, 'TRUCK-IN-1').times.clearAt!;
    expect(s.t).toBeLessThan(clearAt);
    expect(validate(s, { kind: 'assignBay', truckId: 'TRUCK-OUT-1', bayId: 'L1' }, s.t)).toEqual({ ok: false, reason: 'Bay L1 is still being cleared' });
    advance(s, clearAt);
    expect(act(s, { kind: 'assignBay', truckId: 'TRUCK-OUT-1', bayId: 'L1' }, clearAt)).toEqual({ ok: true });
  });

  test('trucks still at the gate or in the yard at 14:00 are fined', () => {
    const s = newShift(TEST_RECIPE);
    const events = advance(s, s.end + 1);
    expect(s.ledger.filter((e) => e.kind === 'gateWait').map((e) => e.ref).sort()).toEqual(['TRUCK-IN-1', 'TRUCK-OUT-1']);
    expect(s.ledger.filter((e) => e.kind === 'unserved').map((e) => e.amount)).toEqual([-500, -500]);
    expect(s.over).toBe(true);
    expect(events.at(-1)).toEqual({ kind: 'over' });
    expect(validate(s, { kind: 'overtime' }, s.t)).toEqual({ ok: false, reason: 'The shift is over' });
  });

  test('advance is step-size independent', () => {
    const plan = [
      { t: 40, action: { kind: 'assignBay' as const, truckId: 'TRUCK-IN-1', bayId: 'L1' } },
      { t: 120, action: { kind: 'chooseArea' as const, truckId: 'TRUCK-IN-1', areaId: 'HS1' } },
      { t: 130, action: { kind: 'assignBay' as const, truckId: 'TRUCK-OUT-1', bayId: 'L2' } },
    ];
    const a = runScripted(TEST_RECIPE, plan, 0.25);
    const b = runScripted(TEST_RECIPE, plan, 10_000);
    expect(a.ledger.length).toBeGreaterThan(3);
    expect(b.ledger).toEqual(a.ledger);
    expect(b.trucks.map((t) => [t.stage, t.pose])).toEqual(a.trucks.map((t) => [t.stage, t.pose]));
    expect(b.forklifts.map((f) => f.pose)).toEqual(a.forklifts.map((f) => f.pose));
  });
});
