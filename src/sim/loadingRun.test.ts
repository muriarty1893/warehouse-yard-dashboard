import { describe, expect, it } from 'vitest';
import { bayById } from '../config/devYard';
import type { Cargo, Pose } from '../domain/types';
import { planAll } from '../loading/candidates';
import type { Placement } from '../loading/types';
import { vehicleById } from '../loading/vehicles';
import { DEFAULT_ROUTES } from '../config/routes';
import { demoCargo } from '../world/demo';
import { buildLoadingRun, type LoadingRun } from './loadingRun';
import { compileRoute } from './route';

const cargo = demoCargo('normal', 1);
const L1 = bayById('L1');
const v = vehicleById('rigid-26');
const forklifts: { id: string; start: Pose }[] = [
  { id: 'FL-01', start: { x: 33.0, y: 31.2, heading: 0 } },
  { id: 'FL-02', start: { x: 19.4, y: 20.6, heading: 0 } },
];
const plan = planAll([{ truckId: 'TRUCK-102', route: DEFAULT_ROUTES['TRUCK-102'], vehicle: 'rigid-26', include: [], exclude: [], urgent: [] }], cargo, {})['TRUCK-102'];
const run = buildLoadingRun({ truckId: 'TRUCK-102', bay: L1, vehicle: v, placements: plan.placements, cargo, forklifts, t0: 100 });

/** [enter, leave] of every stay inside the truck, from the legs whose status starts with "Loading". */
function inTruck(r: LoadingRun) {
  const out: [number, number][] = [];
  for (const spec of Object.values(r.routes)) {
    const c = compileRoute(spec);
    let open: number | null = null;
    for (const leg of c.legs) {
      const loading = leg.leg.status?.startsWith('Loading') ?? false;
      if (loading && open === null) open = leg.t0;
      if (!loading && open !== null) {
        out.push([r.t0 + open, r.t0 + leg.t0]);
        open = null;
      }
    }
    if (open !== null) out.push([r.t0 + open, r.t0 + c.duration]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

describe('loading run', () => {
  it('has a trip per planned unit, alternating forklifts', () => {
    expect(run.trips.map((t) => t.cargoId)).toEqual([...plan.placements].sort((a, b) => a.seq - b.seq).map((p) => p.cargoId));
    expect(Object.keys(run.routes).sort()).toEqual(['FL-01', 'FL-02']);
    expect(new Set(run.trips.filter((t) => !t.skipped).map((t) => t.forkliftId))).toEqual(new Set(['FL-01', 'FL-02']));
    expect(run.trips.filter((t) => !t.skipped).length).toBeGreaterThan(plan.placements.length / 2);
  });

  it('trips follow the loading order', () => {
    const done = run.trips.filter((t) => !t.skipped);
    for (let i = 1; i < done.length; i++) expect(done[i].setAt).toBeGreaterThan(done[i - 1].setAt);
  });

  it('one forklift in the truck at a time', () => {
    const stays = inTruck(run);
    expect(stays.length).toBe(run.trips.filter((t) => !t.skipped).length);
    for (let i = 1; i < stays.length; i++) expect(stays[i][0]).toBeGreaterThanOrEqual(stays[i - 1][1]);
  });

  it('pick before set, both after t0', () => {
    for (const t of run.trips.filter((x) => !x.skipped)) {
      expect(t.pickAt).toBeGreaterThan(100);
      expect(t.setAt).toBeGreaterThan(t.pickAt);
    }
  });

  it('takes the first two forklifts that can reach the dock', () => {
    const cutOff: Pose = { x: 2.1, y: 29.5, heading: Math.PI / 2 };
    const r = buildLoadingRun({
      truckId: 'TRUCK-102',
      bay: L1,
      vehicle: v,
      placements: plan.placements,
      cargo,
      forklifts: [
        { id: 'FL-01', start: forklifts[0].start },
        { id: 'FL-03', start: cutOff },
        { id: 'FL-02', start: forklifts[1].start },
      ],
      t0: 0,
    });
    expect(Object.keys(r.routes).sort()).toEqual(['FL-01', 'FL-02']);
    expect(r.notes.join(' ')).toMatch(/FL-03 cannot reach the dock/);
  });

  it('boxed-in unit is skipped with a reason', () => {
    const base = cargo[0];
    const unit = (id: string, x: number, y: number): Cargo => ({ ...base, id, x, y, yaw: 0, on: null, areaId: 'OY', loadedOn: null, dims: { l: 1.2, w: 0.8, h: 1 }, weightKg: 300 });
    const yard = [unit('T', 10, 12), unit('N', 10, 13.1), unit('S', 10, 10.9), unit('E', 11.5, 12), unit('W', 8.5, 12), unit('U', 14, 9)];
    const placement = (cargoId: string, seq: number, x: number): Placement => ({ cargoId, stop: 1, seq, x, y: 0, z: 0, l: 1.2, w: 0.8, h: 1, yaw: 0, weightKg: 300, on: null });
    const r = buildLoadingRun({ truckId: 'TRUCK-102', bay: L1, vehicle: v, placements: [placement('T', 1, 0.3), placement('U', 2, 1.6)], cargo: yard, forklifts, t0: 50 });
    expect(r.trips[0].skipped).toMatch(/No forklift path to T/);
    expect(r.trips[1].skipped).toBeNull();
    expect(r.trips[1].pickAt).toBeGreaterThan(50);
    expect(r.notes.join(' ')).toMatch(/T/);
  });
});
