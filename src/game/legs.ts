import { devYard } from '../config/devYard';
import type { Cargo, Pose, TruckBay, Vec2 } from '../domain/types';
import { bayRear, FORKLIFT } from '../domain/vehicles';
import { heightAt } from '../domain/yard';
import { boxToYard } from '../loading/frame';
import type { Placement, VehicleSpec } from '../loading/types';
import { approachFor, clearUnit, findPath, isFree, reachUnit, restoreUnit, type Grid } from '../sim/grid';
import { compileRoute, type Leg, type RouteSpec } from '../sim/route';
import { baseHeight } from '../world/placement';

/**
 * One forklift job as a one-shot route (spec §1.4): pick a unit from the yard
 * or from a truck, carry it, set it down in a truck or at a yard spot. The
 * dock geometry is the Load-at-dock run's: a dock face just behind the doors,
 * a queue point behind it, one forklift inside the truck at a time.
 */

const SPEED = 2.2;
const ACCEL = 1.4;
/** Gap between one forklift leaving the truck and the next driving in (s). */
export const MARGIN = 1.5;
const TRAVEL_FORK = 0.4;

export interface TruckAt {
  pose: Pose;
  vehicle: VehicleSpec;
  bay: TruckBay;
}

export interface JobRoute {
  spec: RouteSpec;
  /** Engine times: unit lifted, unit set down, forklift free again. */
  pickAt: number;
  setAt: number;
  doneAt: number;
  /** Forklift at the dock face going in / coming back out (truck jobs only). */
  enterAt: number | null;
  leaveAt: number | null;
  end: Pose;
}

export type YardSpot = { x: number; y: number; yaw: number } | { on: string };

/** Path points without repeats (a zero-length step breaks the fillets). */
function tidy(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 1e-3) out.push(p);
  return out.length > 1 ? out : [out[0], out[0]];
}

const spec = (legs: Leg[], t0: number): RouteSpec => ({ legs, speed: SPEED, accel: ACCEL, once: true, offset: t0 });
const duration = (legs: Leg[]) => (legs.length ? compileRoute(spec(legs, 0)).duration : 0);

/** Dock face, queue point and the spot inside the truck for one placement. */
function dockGeometry(t: TruckAt, p: Placement) {
  const v = t.vehicle;
  const fwd: Vec2 = [Math.cos(t.pose.heading), Math.sin(t.pose.heading)];
  const left: Vec2 = [-fwd[1], fwd[0]];
  const [rx, ry] = bayRear(t.bay);
  const dock: Vec2 = [rx - fwd[0] * 0.75, ry - fwd[1] * 0.75];
  const off = p.y + p.w / 2 - v.inner.w / 2;
  const entry: Vec2 = [dock[0] + left[0] * off, dock[1] + left[1] * off];
  const queue: Vec2 = [entry[0] - fwd[0] * 2.2, entry[1] - fwd[1] * 2.2];
  const [cx, cy] = boxToYard(t.pose, v, p.x + p.l / 2, p.y + p.w / 2);
  const inside: Vec2 = [cx - fwd[0] * FORKLIFT.carryOffset, cy - fwd[1] * FORKLIFT.carryOffset];
  return { entry, queue, inside, heading: t.pose.heading };
}

/** Drive to a yard unit, lift it, back out. `lift` indexes the lifting wait. */
function pickFromYard(g: Grid, cargo: Cargo[], unit: Cargo, from: Vec2, alongLength: boolean, carrying: string) {
  const a = reachUnit(g, cargo, unit, alongLength);
  if (!a) return null;
  const face: Vec2 = [Math.cos(a.heading), Math.sin(a.heading)];
  const back: Vec2 = [a.stand[0] - face[0] * 1.2, a.stand[1] - face[1] * 1.2];
  const toUnit = findPath(g, from, isFree(g, back[0], back[1]) ? back : a.stand);
  if (!toUnit) return null;
  const z = Math.max(0, baseHeight(cargo, unit) - heightAt(devYard, unit.x, unit.y));
  const pickPose: Vec2 = [unit.x - face[0] * FORKLIFT.carryOffset, unit.y - face[1] * FORKLIFT.carryOffset];
  const picking = `Picking ${unit.id}`;
  const legs: Leg[] = [{ kind: 'drive', phase: 'picking', path: tidy([...toUnit, a.stand]), radius: 1.2, fork: 0.12, status: picking }];
  if (z > 0.05) legs.push({ kind: 'wait', phase: 'picking', seconds: 1.2, fork: [0.12, z + 0.1], status: picking });
  legs.push({ kind: 'drive', phase: 'picking', path: tidy([a.stand, pickPose]), speed: 0.8, fork: z + 0.1, status: picking });
  const lift = legs.length;
  legs.push({ kind: 'wait', phase: 'picking', seconds: 2.2, fork: [z + 0.12, z + TRAVEL_FORK], carry: true, status: picking });
  legs.push({ kind: 'drive', phase: 'carrying', path: tidy([pickPose, a.stand]), reverse: true, speed: 1.0, carry: true, status: carrying });
  if (z > 0.05) legs.push({ kind: 'wait', phase: 'carrying', seconds: 1.2, fork: [z + TRAVEL_FORK, TRAVEL_FORK], carry: true, status: carrying });
  return { legs, lift, at: a.stand };
}

/** Drive a carried unit to a yard spot, set it down, back out. `set` indexes the setting-down wait. */
function setInYard(g: Grid, cargo: Cargo[], unit: Cargo, spot: YardSpot, from: Vec2, carrying: string) {
  let target: Cargo;
  let z = 0;
  let a: { stand: Vec2; heading: number } | null;
  if ('on' in spot) {
    const base = cargo.find((c) => c.id === spot.on);
    if (!base) return null;
    target = { ...unit, x: base.x, y: base.y, yaw: base.yaw, on: null };
    z = baseHeight(cargo, base) - heightAt(devYard, base.x, base.y) + base.dims.h;
    clearUnit(g, base);
    a = approachFor(g, target, true);
    restoreUnit(g, base);
  } else {
    target = { ...unit, x: spot.x, y: spot.y, yaw: spot.yaw, on: null };
    a = approachFor(g, target, true);
  }
  if (!a) return null;
  const face: Vec2 = [Math.cos(a.heading), Math.sin(a.heading)];
  const back: Vec2 = [a.stand[0] - face[0] * 1.2, a.stand[1] - face[1] * 1.2];
  const toStand = findPath(g, from, isFree(g, back[0], back[1]) ? back : a.stand);
  if (!toStand) return null;
  const setPose: Vec2 = [target.x - face[0] * FORKLIFT.carryOffset, target.y - face[1] * FORKLIFT.carryOffset];
  const high = Math.max(TRAVEL_FORK, z + 0.3);
  const setting = `Storing ${unit.id}`;
  const legs: Leg[] = [{ kind: 'drive', phase: 'carrying', path: tidy([...toStand, a.stand]), radius: 1.2, fork: TRAVEL_FORK, carry: true, status: carrying }];
  if (high > TRAVEL_FORK + 0.01) legs.push({ kind: 'wait', phase: 'working', seconds: 1.2, fork: [TRAVEL_FORK, high], carry: true, status: setting });
  legs.push({ kind: 'drive', phase: 'working', path: tidy([a.stand, setPose]), speed: 0.8, fork: high, carry: true, status: setting });
  const set = legs.length;
  legs.push({ kind: 'wait', phase: 'working', seconds: 2.4, fork: [high, z + 0.12], carry: true, status: setting });
  legs.push({ kind: 'wait', phase: 'working', seconds: 0.6, fork: [z + 0.12, z + 0.04], status: setting });
  legs.push({ kind: 'drive', phase: 'returning', path: tidy([setPose, a.stand]), reverse: true, speed: 1.0, fork: z + 0.04, status: 'Returning' });
  legs.push({ kind: 'wait', phase: 'returning', seconds: 0.8, fork: [z + 0.04, 0.12], status: 'Returning' });
  return { legs, set, end: { x: a.stand[0], y: a.stand[1], heading: a.heading } };
}

/** Times of a finished leg list, shifted to engine time. */
function times(legs: Leg[], t0: number) {
  const r = compileRoute(spec(legs, t0));
  return { start: (i: number) => t0 + r.legs[i].t0, end: (i: number) => t0 + r.legs[i].t0 + r.legs[i].duration, total: t0 + r.duration };
}

/** Wait at the queue point until the truck is free, so the approach ends no earlier than truckFreeAt + MARGIN. */
function waitForDock(legs: Leg[], approach: Leg, t0: number, truckFreeAt: number, carry: boolean) {
  const arrive = t0 + duration([...legs, approach]);
  if (arrive < truckFreeAt + MARGIN) legs.push({ kind: 'wait', phase: 'carrying', seconds: truckFreeAt + MARGIN - arrive, fork: [carry ? TRAVEL_FORK : 0.12, carry ? TRAVEL_FORK : 0.12], carry, status: 'Waiting for the dock' });
}

/** Yard unit → truck, at its planned placement. */
export function loadRoute(a: { from: Pose; grid: Grid; cargo: Cargo[]; unit: Cargo; truck: TruckAt; placement: Placement; t0: number; truckFreeAt: number }): JobRoute | null {
  const { grid: g, cargo, unit, placement: p, t0 } = a;
  const truckId = `${a.truck.bay.id}`;
  const geo = dockGeometry(a.truck, p);
  const pick = pickFromYard(g, cargo, unit, [a.from.x, a.from.y], p.yaw === 0, `To ${truckId}`);
  if (!pick) return null;
  clearUnit(g, unit);
  try {
    const toDock = findPath(g, pick.at, geo.queue);
    if (!toDock) return null;
    const legs = [...pick.legs];
    legs.push({ kind: 'drive', phase: 'carrying', path: tidy(toDock), radius: 1.2, fork: TRAVEL_FORK, carry: true, status: `To ${truckId}` });
    const approach: Leg = { kind: 'drive', phase: 'carrying', path: tidy([geo.queue, geo.entry]), speed: 1.0, fork: TRAVEL_FORK, carry: true, status: `To ${truckId}` };
    waitForDock(legs, approach, t0, a.truckFreeAt, true);
    const enter = legs.length;
    legs.push(approach);
    const high = Math.max(TRAVEL_FORK, p.z + 0.3);
    const loading = `Loading at ${truckId}`;
    if (high > TRAVEL_FORK + 0.01) legs.push({ kind: 'wait', phase: 'working', seconds: 1.2, fork: [TRAVEL_FORK, high], carry: true, status: loading });
    legs.push({ kind: 'drive', phase: 'working', path: tidy([geo.entry, geo.inside]), speed: 1.0, fork: high, carry: true, status: loading });
    const set = legs.length;
    legs.push({ kind: 'wait', phase: 'working', seconds: 2.4, fork: [high, p.z + 0.12], carry: true, status: loading });
    legs.push({ kind: 'wait', phase: 'working', seconds: 0.6, fork: [p.z + 0.12, p.z + 0.04], status: loading });
    const leave = legs.length;
    legs.push({ kind: 'drive', phase: 'returning', path: tidy([geo.inside, geo.entry]), reverse: true, speed: 1.0, fork: p.z + 0.04, status: 'Returning' });
    legs.push({ kind: 'wait', phase: 'returning', seconds: 0.8, fork: [p.z + 0.04, 0.12], status: 'Returning' });
    const tm = times(legs, t0);
    return { spec: spec(legs, t0), pickAt: tm.start(pick.lift), setAt: tm.end(set), doneAt: tm.total, enterAt: tm.end(enter), leaveAt: tm.end(leave), end: { x: geo.entry[0], y: geo.entry[1], heading: geo.heading } };
  } finally {
    restoreUnit(g, unit);
  }
}

/** Truck → yard spot: wait for the truck, drive in, lift the unit, back out, store it. */
export function unloadRoute(a: { from: Pose; grid: Grid; cargo: Cargo[]; unit: Cargo; truck: TruckAt; placement: Placement; spot: YardSpot; t0: number; truckFreeAt: number }): JobRoute | null {
  const { grid: g, cargo, unit, placement: p, t0 } = a;
  const geo = dockGeometry(a.truck, p);
  const toQueue = findPath(g, [a.from.x, a.from.y], geo.queue);
  if (!toQueue) return null;
  const unloading = `Unloading at ${a.truck.bay.id}`;
  const legs: Leg[] = [{ kind: 'drive', phase: 'picking', path: tidy(toQueue), radius: 1.2, fork: 0.12, status: unloading }];
  const approach: Leg = { kind: 'drive', phase: 'picking', path: tidy([geo.queue, geo.entry]), speed: 1.0, fork: 0.12, status: unloading };
  waitForDock(legs, approach, t0, a.truckFreeAt, false);
  const enter = legs.length;
  legs.push(approach);
  if (p.z > 0.05) legs.push({ kind: 'wait', phase: 'working', seconds: 1.2, fork: [0.12, p.z + 0.04], status: unloading });
  legs.push({ kind: 'drive', phase: 'working', path: tidy([geo.entry, geo.inside]), speed: 1.0, fork: p.z + 0.04, status: unloading });
  const lift = legs.length;
  legs.push({ kind: 'wait', phase: 'working', seconds: 2.2, fork: [p.z + 0.04, p.z + 0.3], carry: true, status: unloading });
  const leave = legs.length;
  legs.push({ kind: 'drive', phase: 'carrying', path: tidy([geo.inside, geo.entry]), reverse: true, speed: 1.0, fork: p.z + 0.3, carry: true, status: unloading });
  if (Math.abs(p.z + 0.3 - TRAVEL_FORK) > 0.01) legs.push({ kind: 'wait', phase: 'carrying', seconds: 1.2, fork: [p.z + 0.3, TRAVEL_FORK], carry: true, status: unloading });
  const put = setInYard(g, cargo, unit, a.spot, geo.entry, `To storage · ${unit.id}`);
  if (!put) return null;
  const first = legs.length;
  legs.push(...put.legs);
  const tm = times(legs, t0);
  return { spec: spec(legs, t0), pickAt: tm.start(lift), setAt: tm.end(first + put.set), doneAt: tm.total, enterAt: tm.end(enter), leaveAt: tm.end(leave), end: put.end };
}

/** Yard unit → another yard spot. */
export function moveRoute(a: { from: Pose; grid: Grid; cargo: Cargo[]; unit: Cargo; spot: YardSpot; t0: number }): JobRoute | null {
  const { grid: g, cargo, unit, t0 } = a;
  const pick = pickFromYard(g, cargo, unit, [a.from.x, a.from.y], true, `Moving ${unit.id}`);
  if (!pick) return null;
  clearUnit(g, unit);
  try {
    const put = setInYard(g, cargo, unit, a.spot, pick.at, `Moving ${unit.id}`);
    if (!put) return null;
    const legs = [...pick.legs, ...put.legs];
    const tm = times(legs, t0);
    return { spec: spec(legs, t0), pickAt: tm.start(pick.lift), setAt: tm.end(pick.legs.length + put.set), doneAt: tm.total, enterAt: null, leaveAt: null, end: put.end };
  } finally {
    restoreUnit(g, unit);
  }
}
