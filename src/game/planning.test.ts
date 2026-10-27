import { describe, expect, test } from 'vitest';
import { act } from './engine';
import { dock, dockedOutboundFixture, TEST_RECIPE, withRecipe } from './fixtures';
import { newShift } from './generate';
import { planningCargo, planTrucks, recommendPlan } from './planning';

const twoOutbound = withRecipe({
  trucks: [
    TEST_RECIPE.trucks[1],
    { id: 'TRUCK-OUT-2', kind: 'outbound', carrier: 'bluepeak', arriveMin: 12, plannedArriveMin: 12, units: 6, stops: ['Konya', 'Adana'], deadlineMin: 150 },
  ],
});

describe('planning on the shift', () => {
  test('a docked outbound truck gets a plan from the yard units for its stops', () => {
    const s = dockedOutboundFixture();
    expect(planTrucks(s).map((t) => t.id)).toEqual(['TRUCK-OUT-1']);
    const plan = recommendPlan(s, 'TRUCK-OUT-1');
    expect(plan.placements.length).toBeGreaterThanOrEqual(1);
    const byId = new Map(s.cargo.map((c) => [c.id, c]));
    for (const p of plan.placements) expect(['Ankara', 'Konya']).toContain(byId.get(p.cargoId)!.destination);
  });

  test('units carried, aboard, written off or held by another plan are never offered', () => {
    const s = newShift(twoOutbound);
    dock(s, 'TRUCK-OUT-1', 'L1');
    dock(s, 'TRUCK-OUT-2', 'L2', 1);
    const first = recommendPlan(s, 'TRUCK-OUT-1');
    expect(act(s, { kind: 'confirmPlan', truckId: 'TRUCK-OUT-1', plan: first }, 0)).toEqual({ ok: true });
    const held = first.placements.map((p) => p.cargoId);
    const free = planningCargo(s).filter((c) => ['Konya', 'Adana'].includes(c.destination));
    expect(free.length).toBeGreaterThanOrEqual(3);
    const carried = free[0];
    const written = free[1];
    carried.transitJob = 'J-elsewhere';
    s.cargo.find((c) => c.id === written.id)!.gone = true;
    const ids = recommendPlan(s, 'TRUCK-OUT-2').placements.map((p) => p.cargoId);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of [...held, carried.id, written.id]) expect(ids).not.toContain(id);
    expect(planTrucks(s).map((t) => t.id)).toEqual(['TRUCK-OUT-2']);
  });
});
