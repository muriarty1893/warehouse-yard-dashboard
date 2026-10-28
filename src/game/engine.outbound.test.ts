import { describe, expect, test } from 'vitest';
import { act, advance, isLoaded } from './engine';
import { advanceUntil, TEST_RECIPE, truck, withRecipe } from './fixtures';
import { newShift } from './generate';
import { lateAmount } from './ledger';
import { recommendPlan } from './planning';
import { shiftMinutes, type Recipe, type ShiftState } from './types';

function docked(recipe: Recipe = TEST_RECIPE) {
  const s = newShift(recipe);
  advanceUntil(s, (x) => truck(x, 'TRUCK-OUT-1').stage === 'waiting');
  act(s, { kind: 'assignBay', truckId: 'TRUCK-OUT-1', bayId: 'L2' }, s.t);
  advanceUntil(s, (x) => truck(x, 'TRUCK-OUT-1').stage === 'docked');
  return s;
}
const confirm = (s: ShiftState) => {
  const plan = recommendPlan(s, 'TRUCK-OUT-1');
  expect(act(s, { kind: 'confirmPlan', truckId: 'TRUCK-OUT-1', plan }, s.t)).toEqual({ ok: true });
  return plan;
};

describe('outbound trucks', () => {
  test('confirm, load, dispatch: paid per unit aboard', () => {
    const s = docked(withRecipe({ trucks: [TEST_RECIPE.trucks[0], { ...TEST_RECIPE.trucks[1], deadlineMin: 400 }] }));
    const plan = confirm(s);
    advanceUntil(s, (x) => isLoaded(truck(x, 'TRUCK-OUT-1')));
    expect(act(s, { kind: 'dispatch', truckId: 'TRUCK-OUT-1' }, s.t)).toEqual({ ok: true });
    advance(s, truck(s, 'TRUCK-OUT-1').busyUntil + 0.01);
    const tr = truck(s, 'TRUCK-OUT-1');
    expect(tr.stage).toBe('departing');
    expect(s.ledger.filter((e) => e.kind === 'delivery')).toEqual([expect.objectContaining({ amount: 80 * plan.placements.length, text: `TRUCK-OUT-1 dispatched · ${plan.placements.length} units` })]);
    expect(s.ledger.filter((e) => e.kind === 'late' || e.kind === 'missedTruck' || e.kind === 'missingPapers')).toEqual([]);
    for (const p of plan.placements) expect(s.cargo.find((c) => c.id === p.cargoId)!.gone).toBe(true);
  });

  test('leaving late, with missing papers or units left behind is fined', () => {
    const recipe = withRecipe({ trucks: [TEST_RECIPE.trucks[0], { ...TEST_RECIPE.trucks[1], deadlineMin: 15, missingPapers: 2 }] });
    const s = docked(recipe);
    const plan = confirm(s);
    // Three forklifts take three of the four jobs at once; dispatching now cancels the fourth.
    expect(s.jobs.filter((j) => j.kind === 'load' && j.status === 'queued').length).toBeGreaterThanOrEqual(1);
    act(s, { kind: 'dispatch', truckId: 'TRUCK-OUT-1' }, s.t);
    advanceUntil(s, (x) => truck(x, 'TRUCK-OUT-1').stage === 'departing', 0.05);
    const tr = truck(s, 'TRUCK-OUT-1');
    const aboardMissing = tr.aboard.filter((id) => s.cargo.find((c) => c.id === id)!.papers === 'missing').length;
    const late = s.ledger.filter((e) => e.kind === 'late');
    expect(late).toEqual([expect.objectContaining({ amount: lateAmount(s.prices, shiftMinutes(tr.times.departed! - tr.deadline!)) })]);
    expect(late[0].amount).toBeLessThan(0);
    expect(s.ledger.filter((e) => e.kind === 'missingPapers').map((e) => e.amount)).toEqual(Array(aboardMissing).fill(-300));
    expect(s.ledger.filter((e) => e.kind === 'missedTruck').map((e) => e.amount)).toEqual(Array(plan.placements.length - tr.aboard.length).fill(-240));
    expect(plan.placements.length - tr.aboard.length).toBeGreaterThanOrEqual(1);
  });

  test('dispatch while a forklift is inside waits for it', () => {
    const s = docked();
    confirm(s);
    advanceUntil(s, (x) => x.jobs.some((j) => j.kind === 'load' && j.status === 'active' && j.enterAt! <= x.t && x.t < truck(x, 'TRUCK-OUT-1').busyUntil), 0.05);
    const busyUntil = truck(s, 'TRUCK-OUT-1').busyUntil;
    expect(act(s, { kind: 'dispatch', truckId: 'TRUCK-OUT-1' }, s.t)).toEqual({ ok: true });
    const tr = truck(s, 'TRUCK-OUT-1');
    expect(tr.dispatchPending).toBe(true);
    expect(s.jobs.filter((j) => j.truckId === tr.id && j.status === 'queued')).toEqual([]);
    advance(s, busyUntil + 0.01);
    expect(tr.stage).toBe('departing');
    expect(tr.times.departed).toBe(busyUntil);
  });

  test('wrong-stage outbound actions are refused', () => {
    const s = newShift(TEST_RECIPE);
    advanceUntil(s, (x) => truck(x, 'TRUCK-OUT-1').stage === 'waiting' && truck(x, 'TRUCK-IN-1').stage === 'waiting');
    const before = JSON.stringify(s);
    expect(act(s, { kind: 'dispatch', truckId: 'TRUCK-OUT-1' }, s.t)).toEqual({ ok: false, reason: 'TRUCK-OUT-1 is not docked' });
    expect(act(s, { kind: 'confirmPlan', truckId: 'TRUCK-IN-1', plan: recommendPlan(s, 'TRUCK-OUT-1') }, s.t).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
    const d = docked();
    const plan = confirm(d);
    expect(act(d, { kind: 'confirmPlan', truckId: 'TRUCK-OUT-1', plan }, d.t)).toEqual({ ok: false, reason: 'TRUCK-OUT-1 already has a confirmed plan' });
  });

  test('with outbound off, a docked outbound truck plans, loads and leaves by itself', () => {
    const s = docked(withRecipe({ mechanics: ['storage'], trucks: [TEST_RECIPE.trucks[0], { ...TEST_RECIPE.trucks[1], deadlineMin: 400 }] }));
    const tr = truck(s, 'TRUCK-OUT-1');
    expect(tr.plan?.placements.length).toBeGreaterThan(0);
    advanceUntil(s, (x) => truck(x, 'TRUCK-OUT-1').stage === 'departing');
    expect(s.ledger.filter((e) => e.kind === 'delivery')).toHaveLength(1);
  });

  test('sending an outbound truck away without its cargo costs every unit it came for', () => {
    const s = docked(withRecipe({ trucks: [TEST_RECIPE.trucks[0], { ...TEST_RECIPE.trucks[1], deadlineMin: 400 }] }));
    expect(act(s, { kind: 'dispatch', truckId: 'TRUCK-OUT-1' }, s.t)).toEqual({ ok: true });
    expect(s.ledger.filter((e) => e.kind === 'missedTruck').map((e) => e.amount)).toEqual([-240, -240, -240, -240]);
  });
});
