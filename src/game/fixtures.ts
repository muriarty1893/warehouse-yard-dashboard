import type { Recipe } from './types';

/**
 * Test-only recipes and helpers for the game engine's tests. Not imported by
 * the app.
 */

/** A small shift: one inbound and one outbound truck, two bays, three forklifts, everything switched on. */
export const TEST_RECIPE: Recipe = {
  id: 'test',
  no: 0,
  name: 'Test shift',
  teaches: 'Everything',
  briefing: { newTitle: 'Test', newText: 'Test', rule: 'Test' },
  seed: 7,
  bays: ['L1', 'L2'],
  forklifts: ['FL-01', 'FL-02', 'FL-03'],
  fill: 'quiet',
  mechanics: ['storage', 'outbound', 'papers', 'queue', 'tempForklift', 'rain', 'bayClosed', 'rushOrder', 'overtime'],
  trucks: [
    { id: 'TRUCK-IN-1', kind: 'inbound', carrier: 'cargoviva', arriveMin: 5, plannedArriveMin: 5, units: 4 },
    { id: 'TRUCK-OUT-1', kind: 'outbound', carrier: 'nordline', arriveMin: 10, plannedArriveMin: 10, units: 4, stops: ['Ankara', 'Konya'], deadlineMin: 120 },
  ],
  incidents: [],
  budget: 1000,
  targets: [100, 200, 300],
};

export const withRecipe = (patch: Partial<Recipe>): Recipe => ({ ...TEST_RECIPE, ...patch });

// ---------------------------------------------------------------------------
// Docked trucks for route and crew tests

import { bayById } from '../config/devYard';
import type { Cargo } from '../domain/types';
import { pack } from '../loading/pack';
import { vehicleById } from '../loading/vehicles';
import type { Placement } from '../loading/types';
import { buildGrid, reachUnit, type Grid } from '../sim/grid';
import { newShift } from './generate';
import { parkedPose } from './places';
import type { GameTruck, ShiftState } from './types';

export const truck = (s: ShiftState, id: string): GameTruck => s.trucks.find((t) => t.id === id)!;
export const yardOf = (s: ShiftState): Cargo[] => s.cargo.filter((c) => !c.loadedOn && !c.gone);

/** Put a truck straight into a bay, as if it had docked. */
export function dock(s: ShiftState, id: string, bayId: string, t = 0): GameTruck {
  const tr = truck(s, id);
  const bay = bayById(bayId);
  Object.assign(tr, { stage: 'docked', bayId, pose: parkedPose(bay), slot: null, times: { arrived: t, leftKerb: t, docked: t } });
  return tr;
}

export const truckAt = (tr: GameTruck) => ({ pose: tr.pose, vehicle: vehicleById(tr.vehicle), bay: bayById(tr.bayId!) });

/** TRUCK-OUT-1 docked at L1 with one of its yard units and that unit's placement in the truck. */
export function loadFixture() {
  const s = newShift(TEST_RECIPE);
  const tr = dock(s, 'TRUCK-OUT-1', 'L1');
  const unit = yardOf(s).find((c) => c.destination === 'Ankara')!;
  const placement = packOne(unit, 1);
  return { s, unit, truck: truckAt(tr), placement };
}

/** TRUCK-IN-1 docked at L2: the unit nearest its doors and that unit's placement. */
export function unloadFixture() {
  const s = newShift(TEST_RECIPE);
  const tr = dock(s, 'TRUCK-IN-1', 'L2');
  const placement = [...tr.load].sort((a, b) => b.seq - a.seq)[0];
  const unit = s.cargo.find((c) => c.id === placement.cargoId)!;
  return { s, unit, truck: truckAt(tr), placement };
}

/** loadRoute arguments for a yard unit walled in on all four approach sides. */
export function boxedInFixture() {
  const { s, unit, truck: at, placement } = loadFixture();
  const blockers: Cargo[] = [];
  for (const axis of [0, Math.PI / 2]) {
    const half = (axis === 0 ? unit.dims.l : unit.dims.w) / 2;
    for (const side of [1, -1]) {
      const d = side * (half + 1.45);
      const yaw = unit.yaw + axis;
      blockers.push({ ...unit, id: `BLOCK-${blockers.length}`, x: unit.x + Math.cos(yaw) * d, y: unit.y + Math.sin(yaw) * d, dims: { l: 1, w: 1, h: 1 }, on: null });
    }
  }
  const cargo = [...yardOf(s), ...blockers];
  return { from: { x: 40, y: 20, heading: 0 }, grid: buildGrid(cargo), cargo, unit, truck: at, placement, t0: 0, truckFreeAt: -Infinity };
}

export function packOne(unit: Cargo, stop: number): Placement {
  return pack(vehicleById('rigid-26'), [{ id: unit.id, stop, l: unit.dims.l, w: unit.dims.w, h: unit.dims.h, weightKg: unit.weightKg, stackable: true, fragile: false, urgent: false }]).placements[0];
}

export const reachable = (grid: Grid, cargo: Cargo[], c: Cargo) => !!reachUnit(grid, cargo, c);

// ---------------------------------------------------------------------------
// Crew helpers

import type { Due, GameCargo, JobKind } from './types';

export function dockedInboundFixture(bayId = 'L1') {
  const s = newShift(TEST_RECIPE);
  dock(s, 'TRUCK-IN-1', bayId);
  return s;
}

export function dockedOutboundFixture(bayId = 'L1') {
  const s = newShift(TEST_RECIPE);
  dock(s, 'TRUCK-OUT-1', bayId);
  return s;
}

export type GroupDef = { kind: JobKind; label: string; truckId: string | null; areaId: string | null; units: { unitId: string; placement: Placement | null }[] };

/** Load jobs for the first n of TRUCK-OUT-1's yard units, packed together. */
export function loadGroupFor(s: ShiftState, n: number): GroupDef {
  const units = yardOf(s).filter((c) => ['Ankara', 'Konya'].includes(c.destination)).slice(0, n);
  const placements = pack(
    vehicleById('rigid-26'),
    units.map((u) => ({ id: u.id, stop: 1, l: u.dims.l, w: u.dims.w, h: u.dims.h, weightKg: u.weightKg, stackable: true, fragile: false, urgent: false })),
  ).placements.sort((a, b) => a.seq - b.seq);
  return { kind: 'load', label: 'Load TRUCK-OUT-1', truckId: 'TRUCK-OUT-1', areaId: null, units: placements.map((p) => ({ unitId: p.cargoId, placement: p })) };
}

/** Unload jobs for all of TRUCK-IN-1's units, doors first. */
export function unloadGroupFor(s: ShiftState, areaId: string): GroupDef {
  const load = [...truck(s, 'TRUCK-IN-1').load].sort((a, b) => b.seq - a.seq);
  return { kind: 'unload', label: `Unload TRUCK-IN-1 → ${areaId}`, truckId: 'TRUCK-IN-1', areaId, units: load.map((p) => ({ unitId: p.cargoId, placement: p })) };
}

/** Run due events in (t, order, id) order up to `limit`, re-dispatching after each, as the engine does. */
export function runAll(dueFn: (s: ShiftState) => Due[], s: ShiftState, limit: number, after: (s: ShiftState, t: number) => void) {
  for (let guard = 0; guard < 10_000; guard++) {
    const next = dueFn(s)
      .filter((d) => d.t <= limit)
      .sort((a, b) => a.t - b.t || a.order - b.order || a.id.localeCompare(b.id))[0];
    if (!next) return;
    next.run();
    after(s, next.t);
  }
  throw new Error('runAll did not settle');
}

/** A blocker unit for tests: a GameCargo copy of `like` at (x, y). */
export const blocker = (like: GameCargo, id: string, x: number, y: number): GameCargo => ({ ...like, id, x, y, dims: { l: 1, w: 1, h: 1 }, on: null, loadedOn: null, transitJob: null });
