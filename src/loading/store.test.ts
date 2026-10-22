import { beforeEach, describe, expect, it } from 'vitest';
import { demoCargo } from '../world/demo';
import { useInventory } from '../world/inventory';
import { recommendSpot } from '../world/placement';
import { outdated, planOf, useLoading } from './store';

const truck = (id = 'TRUCK-102') => useLoading.getState().trucks[id];

beforeEach(() => {
  useInventory.setState({ cargo: demoCargo('normal', 1), documents: [], events: [], epoch: 0 });
  useLoading.getState().resetAll();
});

/** Move a planned unit of TRUCK-102 to the recommended free spot; returns its id. */
function movePlannedUnit() {
  const plan = planOf(useLoading.getState(), 'TRUCK-102')!;
  const inv = useInventory.getState();
  for (const p of plan.placements) {
    const unit = inv.cargo.find((c) => c.id === p.cargoId)!;
    const spot = recommendSpot(inv.cargo, unit);
    if (spot && useInventory.getState().move(unit.id, spot).ok) return unit.id;
  }
  throw new Error('no planned unit could be moved');
}

describe('loading store', () => {
  it('starts with a draft plan for every plannable truck', () => {
    for (const id of ['TRUCK-102', 'TRUCK-109', 'TRUCK-110']) {
      expect(truck(id).status).toBe('draft');
      expect(truck(id).recommended?.placements.length).toBeGreaterThan(0);
    }
  });

  it('drafts re-plan when cargo changes', () => {
    const before = truck().recommended!;
    const id = movePlannedUnit();
    const after = truck().recommended!;
    expect(after).not.toBe(before);
    if (after.units[id]) expect(after.units[id].spot).not.toBe(before.units[id].spot);
  });

  it('confirmed plans are not re-planned; outdated names the unit', () => {
    const store = useLoading.getState();
    const plan = truck().recommended!;
    expect(store.confirm('TRUCK-102', plan.checks.ok ? undefined : { overrideReason: 'test' }).ok).toBe(true);
    expect(truck().status).toBe('confirmed');
    expect(outdated(truck(), useInventory.getState().cargo)).toBeNull();
    const id = movePlannedUnit();
    expect(truck().recommended).toBe(plan);
    expect(outdated(truck(), useInventory.getState().cargo)).toBe(`${id} moved`);
  });

  it('confirm logs a planned event per unit', () => {
    const plan = truck().recommended!;
    useLoading.getState().confirm('TRUCK-102', plan.checks.ok ? undefined : { overrideReason: 'test' });
    const planned = useInventory.getState().events.filter((e) => e.kind === 'planned');
    expect(planned.length).toBe(plan.placements.length);
    expect(planned[0].text).toMatch(/^Planned for TRUCK-102 · stop \d /);
  });

  it('confirm refuses an empty plan', () => {
    useLoading.getState().setRoute('TRUCK-102', ['Nowhere']);
    expect(truck().recommended!.placements).toEqual([]);
    expect(useLoading.getState().confirm('TRUCK-102').ok).toBe(false);
    expect(truck().status).toBe('draft');
  });

  it('confirm with failing checks needs a reason and stores it', () => {
    const t = truck();
    const bad = { ...t.recommended!, checks: { ...t.recommended!.checks, ok: false, issues: ['Front axle over 9 t after stop 1'] } };
    useLoading.setState({ trucks: { ...useLoading.getState().trucks, 'TRUCK-102': { ...t, recommended: bad } } });
    expect(useLoading.getState().confirm('TRUCK-102').ok).toBe(false);
    expect(useLoading.getState().confirm('TRUCK-102', { overrideReason: 'Driver drops stop 1 last' }).ok).toBe(true);
    expect(truck().confirmed?.reason).toBe('Driver drops stop 1 last');
    expect(truck().confirmed?.overriddenChecks).toEqual(['Front axle over 9 t after stop 1']);
    expect(useInventory.getState().events.at(-1)!.text).toMatch(/ · checks overridden: Driver drops stop 1 last$/);
  });

  it('route keeps at least one stop', () => {
    const store = useLoading.getState();
    store.setRoute('TRUCK-102', ['Ankara']);
    store.removeStop('TRUCK-102', 0);
    expect(truck().route).toEqual(['Ankara']);
    store.setRoute('TRUCK-102', []);
    expect(truck().route).toEqual(['Ankara']);
    store.setRoute('TRUCK-102', ['A', 'B', 'C', 'D', 'E', 'F']);
    expect(truck().route).toEqual(['Ankara']);
  });

  it('moves, adds and removes stops', () => {
    const store = useLoading.getState();
    store.moveStop('TRUCK-102', 0, 2);
    expect(truck().route).toEqual(['Ankara', 'Kayseri', 'Eskişehir']);
    store.addStop('TRUCK-102', 'Bursa');
    expect(truck().route).toEqual(['Ankara', 'Kayseri', 'Eskişehir', 'Bursa']);
    store.removeStop('TRUCK-102', 1);
    expect(truck().route).toEqual(['Ankara', 'Eskişehir', 'Bursa']);
  });

  it('hydrated plan with unknown cargo is out of date', () => {
    const t = truck();
    const ghost = { ...t.recommended!, units: { 'CARGO-00001': { goods: 1, spot: 2 } } };
    const confirmed = { ...ghost, confirmedAt: 0, by: 'test', overriddenChecks: [], reason: null };
    const state = { ...t, status: 'confirmed' as const, confirmed };
    expect(outdated(state, useInventory.getState().cargo)).toBe('CARGO-00001 released');
  });

  it('keep hides the out-of-date warning and logs it', () => {
    const plan = truck().recommended!;
    useLoading.getState().confirm('TRUCK-102', plan.checks.ok ? undefined : { overrideReason: 'test' });
    const id = movePlannedUnit();
    useLoading.getState().keep('TRUCK-102');
    expect(truck().keptOutdated).toBe(true);
    expect(useInventory.getState().events.at(-1)!.text).toBe(`Plan for TRUCK-102 kept after ${id} moved`);
  });

  it('new day clears plans', () => {
    const plan = truck().recommended!;
    useLoading.getState().confirm('TRUCK-102', plan.checks.ok ? undefined : { overrideReason: 'test' });
    useInventory.getState().newDay();
    expect(truck().status).toBe('draft');
    expect(truck().confirmed).toBeNull();
  });

  it('a confirmed truck keeps its units away from the others', () => {
    const plan = truck('TRUCK-102').recommended!;
    useLoading.getState().confirm('TRUCK-102', plan.checks.ok ? undefined : { overrideReason: 'test' });
    useLoading.getState().setVehicle('TRUCK-110', 'semi-136');
    const mine = new Set(plan.placements.map((p) => p.cargoId));
    for (const p of truck('TRUCK-110').recommended!.placements) expect(mine.has(p.cargoId)).toBe(false);
  });
});
