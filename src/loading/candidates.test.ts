import { describe, expect, it } from 'vitest';
import { stopEtas } from '../config/cities';
import { DEFAULT_ROUTES, PLAN_QUEUE } from '../config/routes';
import type { Cargo } from '../domain/types';
import { demoCargo } from '../world/demo';
import { hasOnTop } from '../world/placement';
import { candidatesFor, planAll } from './candidates';
import type { TruckPlanInput } from './types';

const cargo = demoCargo('normal', 1);
const input = (truckId: string, over: Partial<TruckPlanInput> = {}): TruckPlanInput => ({ truckId, route: DEFAULT_ROUTES[truckId], vehicle: 'rigid-26', include: [], exclude: [], urgent: [], ...over });
const inputs = () => PLAN_QUEUE.map((id) => input(id));
const byId = new Map(cargo.map((c) => [c.id, c]));

describe('candidates', () => {
  it("candidates are the route's yard units", () => {
    const taken = new Set([cargo.find((c) => c.destination === 'Ankara')!.id]);
    const { items } = candidatesFor(input('TRUCK-102'), cargo, taken);
    expect(items.length).toBeGreaterThan(5);
    for (const it of items) {
      const c = byId.get(it.id)!;
      expect(DEFAULT_ROUTES['TRUCK-102']).toContain(c.destination);
      expect(it.stop).toBe(DEFAULT_ROUTES['TRUCK-102'].indexOf(c.destination) + 1);
      expect(c.loadedOn ?? null).toBeNull();
      expect(taken.has(it.id)).toBe(false);
    }
  });

  it('containers, units under others and too-big units are left out with reasons', () => {
    const base = cargo.find((c) => c.destination === 'Ankara' && !c.on && !hasOnTop(cargo, c.id) && c.look !== 'container')!;
    const container: Cargo = { ...base, id: 'CARGO-90001', look: 'container', type: 'container', dims: { l: 12.19, w: 2.44, h: 2.59 }, x: 5, y: 10 };
    const bottom: Cargo = { ...base, id: 'CARGO-90002', x: 8, y: 10 };
    const top: Cargo = { ...base, id: 'CARGO-90003', destination: 'İzmir', on: 'CARGO-90002', x: 8, y: 10 };
    const tall: Cargo = { ...base, id: 'CARGO-90004', dims: { l: 1.2, w: 1, h: 2.9 }, x: 11, y: 10 };
    const { items, blocked } = candidatesFor(input('TRUCK-102'), [...cargo, container, bottom, top, tall], new Set());
    const reason = (id: string) => blocked.find((b) => b.cargoId === id)?.reason;
    expect(reason('CARGO-90001')).toBe('Container — goes on a chassis, not into a truck');
    expect(reason('CARGO-90002')).toBe('Under CARGO-90003 — move it first');
    expect(reason('CARGO-90004')).toMatch(/^Too big for this vehicle/);
    expect(items.map((i) => i.id)).not.toContain('CARGO-90002');
  });

  it('include adds a unit at the chosen stop; exclude removes one; urgent sets urgent', () => {
    const extra = cargo.find((c) => c.destination === 'İzmir' && !hasOnTop(cargo, c.id) && c.look !== 'container')!;
    const plain = candidatesFor(input('TRUCK-102'), cargo, new Set()).items;
    const gone = plain[0].id;
    const hot = plain[1].id;
    const { items } = candidatesFor(input('TRUCK-102', { include: [{ cargoId: extra.id, stop: 2 }], exclude: [gone], urgent: [hot] }), cargo, new Set());
    expect(items.find((i) => i.id === extra.id)?.stop).toBe(2);
    expect(items.map((i) => i.id)).not.toContain(gone);
    expect(items.find((i) => i.id === hot)?.urgent).toBe(true);
  });
});

describe('planAll', () => {
  it('empty route gives an empty plan', () => {
    const plans = planAll([input('TRUCK-102', { route: ['Nowhere'] })], cargo, {});
    const p = plans['TRUCK-102'];
    expect(p.placements).toEqual([]);
    expect(p.stats.units).toBe(0);
    expect(p.checks.window).toBeNull();
    expect(p.checks.ok).toBe(true);
  });

  it('overflow goes to the next truck on the queue that covers the destination', () => {
    const plans = planAll([input('TRUCK-102', { vehicle: 'rigid-12', route: ['Ankara'] }), input('TRUCK-109'), input('TRUCK-110')], cargo, {});
    const overflow = plans['TRUCK-102'].leftOut.filter((l) => l.to === 'TRUCK-110');
    expect(overflow.length).toBeGreaterThan(0);
    for (const l of overflow) expect(plans['TRUCK-110'].placements.map((p) => p.cargoId)).toContain(l.cargoId);
  });

  it('a unit is planned on at most one truck', () => {
    const plans = planAll(inputs(), cargo, {});
    const ids = Object.values(plans).flatMap((p) => p.placements.map((x) => x.cargoId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(10);
  });

  it("another truck's confirmed plan keeps its units", () => {
    const first = planAll(inputs(), cargo, {});
    const kept = first['TRUCK-110'];
    const plans = planAll(inputs(), cargo, { 'TRUCK-110': kept });
    expect(plans['TRUCK-110']).toBe(kept);
    const elsewhere = new Set([...plans['TRUCK-102'].placements, ...plans['TRUCK-109'].placements].map((p) => p.cargoId));
    for (const p of kept.placements) expect(elsewhere.has(p.cargoId)).toBe(false);
  });

  it('records fingerprints of the planned units', () => {
    const p = planAll(inputs(), cargo, {})['TRUCK-102'];
    expect(Object.keys(p.units).sort()).toEqual(p.placements.map((x) => x.cargoId).sort());
  });
});

describe('stop ETAs', () => {
  it('stopEtas increase along the route', () => {
    const etas = stopEtas(9 * 3600, ['Eskişehir', 'Ankara', 'Kayseri']);
    expect(etas.length).toBe(3);
    expect(etas[0]).toBeGreaterThan(9 * 3600);
    expect(etas[1]).toBeGreaterThan(etas[0]);
    expect(etas[2]).toBeGreaterThan(etas[1]);
  });

  it('Ankara is about 4–6 h from the yard', () => {
    const [eta] = stopEtas(0, ['Ankara']);
    expect(eta / 3600).toBeGreaterThan(4);
    expect(eta / 3600).toBeLessThan(6);
  });
});
