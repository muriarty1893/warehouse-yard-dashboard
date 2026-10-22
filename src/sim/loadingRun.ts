import { devYard } from '../config/devYard';
import type { Cargo, Pose, TruckBay, Vec2 } from '../domain/types';
import { bayRear, FORKLIFT } from '../domain/vehicles';
import { heightAt } from '../domain/yard';
import { boxToYard, truckPoseFor } from '../loading/frame';
import type { Placement, VehicleId, VehicleSpec } from '../loading/types';
import { baseHeight, inYard } from '../world/placement';
import { buildGrid, clearUnit, findPath, isFree, reachUnit, restoreUnit } from './grid';
import { compileRoute, type Leg, type RouteSpec } from './route';

/**
 * "Load at dock" (spec §3.1): forklifts take the planned units in loading
 * order from their yard spots to the truck. Each forklift gets one one-shot
 * route on the sim clock; only one is inside the truck at a time.
 */

export interface Trip {
  cargoId: string;
  forkliftId: string;
  /** Sim time the unit leaves its yard spot (lifted), and is set down in the truck. */
  pickAt: number;
  setAt: number;
  skipped: string | null;
}

export interface LoadingRun {
  truckId: string;
  t0: number;
  routes: Record<string, RouteSpec>;
  trips: Trip[];
  notes: string[];
  /** Where the truck stands and what it is, for the floor height inside its box. */
  pose: Pose;
  vehicle: VehicleId;
}

const SPEED = 2.2;
const ACCEL = 1.4;
/** Gap between one forklift leaving the truck and the next driving in (s). */
const MARGIN = 1.5;
const TRAVEL_FORK = 0.4;

/** Path points without repeats (a zero-length step breaks the fillets). */
function tidy(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 1e-3) out.push(p);
  return out.length > 1 ? out : [out[0], out[0]];
}

/** How many forklifts work a run. */
const CREW = 2;

/** `forklifts` in order of preference; the first two that can reach the dock do the run. */
export function buildLoadingRun(args: { truckId: string; bay: TruckBay; vehicle: VehicleSpec; placements: Placement[]; cargo: Cargo[]; forklifts: { id: string; start: Pose }[]; t0: number }): LoadingRun {
  const { truckId, bay, vehicle: v, cargo, t0 } = args;
  const pose = truckPoseFor(bay, v);
  const fwd: Vec2 = [Math.cos(pose.heading), Math.sin(pose.heading)];
  const left: Vec2 = [-fwd[1], fwd[0]];
  const [rx, ry] = bayRear(bay);
  // Dock face: just onto the platform behind the truck's doors.
  const dock: Vec2 = [rx - fwd[0] * 0.75, ry - fwd[1] * 0.75];
  const grid = buildGrid(cargo);
  const index = new Map(cargo.map((c) => [c.id, c]));
  const spec = (legs: Leg[]): RouteSpec => ({ legs, speed: SPEED, accel: ACCEL, once: true, offset: t0 });
  const duration = (legs: Leg[]) => (legs.length ? compileRoute(spec(legs)).duration : 0);
  const marks: { trip: Trip; legs: Leg[]; lift: number; set: number }[] = [];
  const trips: Trip[] = [];
  const notes: string[] = [];
  const fleet: { id: string; at: Vec2; legs: Leg[] }[] = [];
  for (const f of args.forklifts) {
    if (fleet.length === CREW) break;
    const at: Vec2 = [f.start.x, f.start.y];
    if (findPath(grid, at, dock)) fleet.push({ id: f.id, at, legs: [] });
    else notes.push(`${f.id} cannot reach the dock`);
  }
  /** Run time (s) the truck was last left by a forklift. */
  let free = -Infinity;
  let turn = 0;

  /** The legs of one trip for a forklift, or null when it cannot get there. */
  const plan = (fl: (typeof fleet)[number], p: Placement, c: Cargo, a: { stand: Vec2; heading: number }) => {
    const face: Vec2 = [Math.cos(a.heading), Math.sin(a.heading)];
    const back: Vec2 = [a.stand[0] - face[0] * 1.2, a.stand[1] - face[1] * 1.2];
    const toUnit = findPath(grid, fl.at, isFree(grid, back[0], back[1]) ? back : a.stand);
    const entry: Vec2 = [dock[0] + left[0] * (p.y + p.w / 2 - v.inner.w / 2), dock[1] + left[1] * (p.y + p.w / 2 - v.inner.w / 2)];
    const queue: Vec2 = [entry[0] - fwd[0] * 2.2, entry[1] - fwd[1] * 2.2];
    const toDock = findPath(grid, a.stand, queue);
    if (!toUnit || !toDock) return null;

    const id = p.cargoId;
    const pickZ = Math.max(0, baseHeight(cargo, c) - heightAt(devYard, c.x, c.y));
    const pickPose: Vec2 = [c.x - face[0] * FORKLIFT.carryOffset, c.y - face[1] * FORKLIFT.carryOffset];
    const [cx, cy] = boxToYard(pose, v, p.x + p.l / 2, p.y + p.w / 2);
    const setPose: Vec2 = [cx - fwd[0] * FORKLIFT.carryOffset, cy - fwd[1] * FORKLIFT.carryOffset];
    const high = Math.max(TRAVEL_FORK, p.z + 0.3);
    const picking = `Picking ${id}`;
    const carrying = `To ${bay.id} · ${truckId}`;
    const loading = `Loading ${truckId}`;

    const legs: Leg[] = [{ kind: 'drive', phase: 'picking', path: tidy([...toUnit, a.stand]), radius: 1.2, fork: 0.12, status: picking }];
    if (pickZ > 0.05) legs.push({ kind: 'wait', phase: 'picking', seconds: 1.2, fork: [0.12, pickZ + 0.1], status: picking });
    legs.push({ kind: 'drive', phase: 'picking', path: tidy([a.stand, pickPose]), speed: 0.8, fork: pickZ + 0.1, status: picking });
    const lift = legs.length;
    legs.push({ kind: 'wait', phase: 'picking', seconds: 2.2, fork: [pickZ + 0.12, pickZ + TRAVEL_FORK], carry: true, status: picking });
    legs.push({ kind: 'drive', phase: 'carrying', path: tidy([pickPose, a.stand]), reverse: true, speed: 1.0, carry: true, status: carrying });
    if (pickZ > 0.05) legs.push({ kind: 'wait', phase: 'carrying', seconds: 1.2, fork: [pickZ + TRAVEL_FORK, TRAVEL_FORK], carry: true, status: carrying });
    legs.push({ kind: 'drive', phase: 'carrying', path: tidy(toDock), radius: 1.2, fork: TRAVEL_FORK, carry: true, status: carrying });
    // One forklift in the truck at a time: queue behind the dock until the last one is out.
    const approach: Leg = { kind: 'drive', phase: 'carrying', path: tidy([queue, entry]), speed: 1.0, fork: TRAVEL_FORK, carry: true, status: carrying };
    const arrive = duration([...fl.legs, ...legs, approach]);
    if (arrive < free + MARGIN) legs.push({ kind: 'wait', phase: 'carrying', seconds: free + MARGIN - arrive, fork: [TRAVEL_FORK, TRAVEL_FORK], carry: true, status: 'Waiting for the dock' });
    legs.push(approach);
    if (high > TRAVEL_FORK + 0.01) legs.push({ kind: 'wait', phase: 'working', seconds: 1.2, fork: [TRAVEL_FORK, high], carry: true, status: loading });
    legs.push({ kind: 'drive', phase: 'working', path: tidy([entry, setPose]), speed: 1.0, fork: high, carry: true, status: loading });
    const set = legs.length;
    legs.push({ kind: 'wait', phase: 'working', seconds: 2.4, fork: [high, p.z + 0.12], carry: true, status: loading });
    legs.push({ kind: 'wait', phase: 'working', seconds: 0.6, fork: [p.z + 0.12, p.z + 0.04], status: loading });
    legs.push({ kind: 'drive', phase: 'working', path: tidy([setPose, entry]), reverse: true, speed: 1.0, fork: p.z + 0.04, status: loading });
    return { legs, lift, set, entry, rest: p.z + 0.04 };
  };

  for (const p of [...args.placements].sort((a, b) => a.seq - b.seq)) {
    const c = index.get(p.cargoId);
    const skip = (reason: string) => {
      trips.push({ cargoId: p.cargoId, forkliftId: fleet[turn % fleet.length]?.id ?? '', pickAt: t0, setAt: t0, skipped: reason });
      notes.push(reason);
    };
    if (!c || !inYard(c)) {
      skip(`${p.cargoId} is not in the yard`);
      continue;
    }
    // Along the unit's length when it travels lengthwise in the truck, so it needs no turn on the forks.
    const a = reachUnit(grid, cargo, c, p.yaw === 0);
    if (!a) {
      skip(`No forklift path to ${p.cargoId}`);
      continue;
    }
    clearUnit(grid, c);
    // Forklifts take turns; one that cannot get there hands the trip to the next.
    let done = false;
    for (let k = 0; k < fleet.length && !done; k++) {
      const fl = fleet[(turn + k) % fleet.length];
      const trip = plan(fl, p, c, a);
      if (!trip) continue;
      const before = fl.legs.length;
      fl.legs.push(...trip.legs);
      free = duration(fl.legs);
      fl.legs.push({ kind: 'wait', phase: 'returning', seconds: 0.8, fork: [trip.rest, 0.12], status: 'Returning' });
      fl.at = trip.entry;
      const t: Trip = { cargoId: p.cargoId, forkliftId: fl.id, pickAt: 0, setAt: 0, skipped: null };
      trips.push(t);
      marks.push({ trip: t, legs: fl.legs, lift: before + trip.lift, set: before + trip.set });
      turn = (turn + k + 1) % fleet.length;
      done = true;
    }
    if (!done) {
      restoreUnit(grid, c);
      skip(`No forklift path to ${p.cargoId}`);
    }
  }

  // Absolute pick and set-down times from the finished routes.
  const routes: Record<string, RouteSpec> = {};
  for (const fl of fleet) if (fl.legs.length) routes[fl.id] = spec(fl.legs);
  const compiled = new Map(fleet.filter((fl) => fl.legs.length).map((fl) => [fl.legs, compileRoute(spec(fl.legs))]));
  for (const m of marks) {
    const r = compiled.get(m.legs)!;
    m.trip.pickAt = t0 + r.legs[m.lift].t0;
    m.trip.setAt = t0 + r.legs[m.set].t0 + r.legs[m.set].duration;
  }
  return { truckId, t0, routes, trips, notes, pose, vehicle: v.id };
}
