import { beforeEach, describe, expect, it } from 'vitest';
import type { Cargo } from '../domain/types';
import { demoCargo } from '../world/demo';
import { planOf, setPlanSource, useLoading, type ConfirmedPlan, type PlanSource } from './store';
import type { VehicleId } from './types';

/** A plan source over plain data, standing in for the game's shift. */
function source(cargo: Cargo[], trucks: { id: string; route: string[]; vehicle: VehicleId }[], onConfirm: PlanSource['onConfirm'] = () => ({ ok: true })) {
  const confirmed: { truckId: string; plan: ConfirmedPlan }[] = [];
  const src: PlanSource = {
    trucks: () => trucks,
    cargo: () => cargo,
    bayOf: () => null,
    papersMissing: (id) => id === cargo[0].id,
    onConfirm: (truckId, plan) => {
      const r = onConfirm(truckId, plan);
      if (r.ok) confirmed.push({ truckId, plan });
      return r;
    },
  };
  return { src, confirmed };
}

const yard = demoCargo('normal', 1);
const cities = [...new Set(yard.map((c) => c.destination))];
const TRUCKS = [
  { id: 'T-1', route: cities.slice(0, 2), vehicle: 'rigid-26' as const },
  { id: 'T-2', route: cities.slice(2, 4), vehicle: 'rigid-26' as const },
];

beforeEach(() => {
  setPlanSource(source(yard, TRUCKS).src);
  useLoading.getState().resetAll();
});

describe('loading store on a plan source', () => {
  it('drafts come from the source’s trucks and cargo', () => {
    expect(Object.keys(useLoading.getState().trucks)).toEqual(['T-1', 'T-2']);
    const plan = planOf(useLoading.getState(), 'T-1')!;
    expect(plan.placements.length).toBeGreaterThan(0);
    const byId = new Map(yard.map((c) => [c.id, c]));
    for (const p of plan.placements) expect(TRUCKS[0].route).toContain(byId.get(p.cargoId)!.destination);
  });

  it('confirm hands the plan to the source and keeps it', () => {
    const { src, confirmed } = source(yard, TRUCKS);
    setPlanSource(src);
    useLoading.getState().resetAll();
    const r = useLoading.getState().confirm('T-1', { overrideReason: 'test' });
    expect(r).toEqual({ ok: true });
    expect(confirmed.map((c) => c.truckId)).toEqual(['T-1']);
    expect(useLoading.getState().trucks['T-1'].status).toBe('confirmed');
    expect(useLoading.getState().trucks['T-1'].confirmed?.by).toBe('Yard manager');
  });

  it('a refusal from the source is passed on and leaves the draft', () => {
    setPlanSource(source(yard, TRUCKS, () => ({ ok: false, reason: 'T-1 is not docked' })).src);
    useLoading.getState().resetAll();
    expect(useLoading.getState().confirm('T-1', { overrideReason: 'test' })).toEqual({ ok: false, reason: 'T-1 is not docked' });
    expect(useLoading.getState().trucks['T-1'].status).toBe('draft');
  });

  it('replan follows the source: trucks that leave it go, new ones arrive as drafts', () => {
    const trucks = [TRUCKS[0]];
    setPlanSource(source(yard, trucks).src);
    useLoading.getState().resetAll();
    trucks.splice(0, 1, TRUCKS[1]);
    useLoading.getState().replan();
    expect(Object.keys(useLoading.getState().trucks)).toEqual(['T-2']);
    expect(useLoading.getState().trucks['T-2'].status).toBe('draft');
  });

  it('nothing is written to the browser storage', () => {
    const writes: string[] = [];
    const ls = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = { setItem: (k: string) => writes.push(k), getItem: () => null, removeItem: () => {} };
    useLoading.getState().toggleExclude('T-1', planOf(useLoading.getState(), 'T-1')!.placements[0].cargoId);
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    expect(writes).toEqual([]);
  });
});
