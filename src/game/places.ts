import { devYard, road } from '../config/devYard';
import { forklifts as fleetForklifts } from '../config/fleet';
import type { Pose, TruckBay, Vec2 } from '../domain/types';
import { truckPoseFor } from '../loading/frame';
import { vehicleById } from '../loading/vehicles';
import { compileRoute, type Leg, type RouteSpec } from '../sim/route';

/**
 * Where game trucks wait and how they get in and out (spec §1.2). Every
 * route plays once from t0 (`offset`), so it is evaluated at engine time.
 */

const gate = devYard.gates.find((g) => !g.closed) ?? devYard.gates[0];
const gateMid = (gate.a[0] + gate.b[0]) / 2;
/** Drive on the right: in through the east half of the gate, out through the west half. */
export const IN_X = gateMid + 4;
export const OUT_X = gateMid - 4;
/** Waiting trucks line up at the kerb outside the wall, clear of the traffic lanes. */
export const KERB_Y = -1.8;
const TURN_Y = 11.5;
const REVERSE_R = 4.2;
const CHECK_IN: Vec2 = [IN_X, 6];
const CHECK_OUT: Vec2 = [OUT_X, 9.5];
/** Point a departing truck reaches once it is out of its bay. */
const CLEAR_Y = 15.5;

const TRUCK = { speed: 3.2, accel: 1.1 };

export const kerbSlot = (k: number): Pose => ({ x: 57 + 12.5 * k, y: KERB_Y, heading: Math.PI });

/** Where a game truck stands in a bay: the planner's frame, so packed units line up. */
export const parkedPose = (bay: TruckBay): Pose => truckPoseFor(bay, vehicleById('rigid-26'));

/** Where each forklift starts the shift: on the loading strip behind the bays, where every bay can be reached. */
export const FORKLIFT_HOMES: Record<string, Pose> = {
  ...Object.fromEntries(fleetForklifts.filter((f) => f.pose).map((f) => [f.id, f.pose!])),
  'FL-01': { x: 33.0, y: 31.4, heading: 0 },
  'FL-02': { x: 38.5, y: 30.4, heading: 0 },
  'FL-03': { x: 47.8, y: 30.4, heading: Math.PI },
};

/** A temp forklift drives in through the gate and waits here. */
export const TEMP_IN: Pose = { x: IN_X - 2, y: 8, heading: Math.PI / 2 };

/** Path points without near-repeats (a zero-length step breaks the fillets). */
function tidy(points: Vec2[], min = 0.5): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > min) out.push(p);
  return out.length > 1 ? out : [out[0], out[0]];
}

const route = (legs: Leg[], t0: number, motion = TRUCK): RouteSpec => ({ legs, speed: motion.speed, accel: motion.accel, once: true, offset: t0 });

/** From the road, along the westbound lane, pulling over to a kerb slot. */
export function arriveRoute(slot: Pose, t0: number): RouteSpec {
  const path: Vec2[] = [
    [road.spawnEast, road.westbound],
    [slot.x + 12, road.westbound],
    [slot.x + 5, KERB_Y],
    [slot.x, KERB_Y],
  ];
  return route([{ kind: 'drive', phase: 'arriving', path, radius: 3, speed: 11, status: 'Arriving' }], t0);
}

/** Creep forward to a kerb slot nearer the gate. */
export function queueRoute(from: Pose, to: Pose, t0: number): RouteSpec {
  return route([{ kind: 'drive', phase: 'gate', path: tidy([[from.x, from.y], [to.x, to.y]], 0.01), speed: 2, status: 'Moving up' }], t0);
}

/**
 * From the kerb through the gate check-in, then the bayVisit manoeuvre: pass
 * the bay by the reversing radius, stop, reverse in. Bays left of the gate
 * lane are passed on the west, the others on the east.
 */
export function dockRoute(from: Pose, bay: TruckBay, t0: number): RouteSpec {
  if (wallBay(bay)) return wallDockRoute(from, bay, t0);
  const bx = bay.center[0];
  const parked = parkedPose(bay);
  const west = IN_X - (bx - REVERSE_R) >= 3;
  const x0 = west ? bx - REVERSE_R : bx + REVERSE_R;
  const legs: Leg[] = [
    { kind: 'drive', phase: 'gate', path: tidy([[from.x, from.y], [IN_X, KERB_Y], CHECK_IN]), radius: 4, status: `To the gate · ${bay.id}` },
    { kind: 'wait', phase: 'gate', seconds: 3, status: 'Gate check-in' },
    { kind: 'drive', phase: 'docking', path: [CHECK_IN, [IN_X, TURN_Y], [x0, TURN_Y]], radius: Math.min(4, Math.abs(IN_X - x0)), status: `To ${bay.id}` },
    { kind: 'wait', phase: 'docking', seconds: 1.2, status: `Reversing to ${bay.id}` },
    { kind: 'drive', phase: 'docking', path: [[x0, TURN_Y], [bx, TURN_Y], [parked.x, parked.y]], radius: REVERSE_R, reverse: true, speed: 1.5, status: `Reversing to ${bay.id}` },
  ];
  return route(legs, t0);
}

/** A bay along the south wall (L5): parked nose to the gate, not against the platform. */
const wallBay = (bay: TruckBay) => Math.abs(Math.sin(bay.heading)) < 0.5;

/** Through check-in, up the in-lane, then back down it and west along the wall into the bay. */
function wallDockRoute(from: Pose, bay: TruckBay, t0: number): RouteSpec {
  const parked = parkedPose(bay);
  const top: Vec2 = [IN_X, TURN_Y];
  const legs: Leg[] = [
    { kind: 'drive', phase: 'gate', path: tidy([[from.x, from.y], [IN_X, KERB_Y], CHECK_IN]), radius: 4, status: `To the gate · ${bay.id}` },
    { kind: 'wait', phase: 'gate', seconds: 3, status: 'Gate check-in' },
    { kind: 'drive', phase: 'docking', path: [CHECK_IN, top], status: `To ${bay.id}` },
    { kind: 'wait', phase: 'docking', seconds: 1.2, status: `Reversing to ${bay.id}` },
    { kind: 'drive', phase: 'docking', path: [top, [IN_X, parked.y], [parked.x, parked.y]], radius: REVERSE_R, reverse: true, speed: 1.5, status: `Reversing to ${bay.id}` },
  ];
  return route(legs, t0);
}

/** Forward out of a wall bay towards the gate, check-out, then right out of the gate onto the westbound lane. */
function wallDepartRoute(bay: TruckBay, t0: number): { spec: RouteSpec; clearAt: number } {
  const parked = parkedPose(bay);
  const y = parked.y;
  const outX = IN_X - 6;
  const legs: Leg[] = [
    { kind: 'drive', phase: 'departing', path: [[parked.x, y], [outX - 4.5, y]], status: 'Departing' },
    { kind: 'wait', phase: 'gate', seconds: 2.5, status: 'Gate check-out' },
    { kind: 'drive', phase: 'departed', path: [[outX - 4.5, y], [outX, y], [outX, road.westbound], [road.spawnWest, road.westbound]], radius: 3.5, speed: 11, status: 'Departed' },
  ];
  const spec = route(legs, t0);
  return { spec, clearAt: t0 + compileRoute(spec).legs[0].duration };
}

/** Out of the bay (the bay is free at `clearAt`), through check-out, west along the road. */
export function departRoute(bay: TruckBay, t0: number): { spec: RouteSpec; clearAt: number } {
  if (wallBay(bay)) return wallDepartRoute(bay, t0);
  const parked = parkedPose(bay);
  const bx = parked.x;
  const out: Leg = { kind: 'drive', phase: 'departing', path: [[bx, parked.y], [bx, CLEAR_Y]], status: 'Departing' };
  const legs: Leg[] = [
    out,
    { kind: 'drive', phase: 'departing', path: tidy([[bx, CLEAR_Y], [OUT_X, Math.max(CHECK_OUT[1] + 3, CLEAR_Y - Math.abs(bx - OUT_X))], CHECK_OUT]), radius: 3.5, status: 'Departing' },
    { kind: 'wait', phase: 'gate', seconds: 2.5, status: 'Gate check-out' },
    { kind: 'drive', phase: 'departed', path: [CHECK_OUT, [OUT_X, road.westbound], [road.spawnWest, road.westbound]], radius: 5, speed: 11, status: 'Departed' },
  ];
  const spec = route(legs, t0);
  return { spec, clearAt: t0 + compileRoute(spec).legs[0].duration };
}

const FORK = { speed: 2.2, accel: 1.4 };

/** A temp forklift arriving through the gate. */
export function tempInRoute(t0: number): RouteSpec {
  return route([{ kind: 'drive', phase: 'arriving', path: [[TEMP_IN.x, -3], [TEMP_IN.x, TEMP_IN.y]], fork: 0.12, status: 'Temp forklift arriving' }], t0, FORK);
}

/** A temp forklift leaving: along `path` (to TEMP_IN, from the yard grid) and out through the gate. */
export function tempOutRoute(path: Vec2[], t0: number): RouteSpec {
  return route([{ kind: 'drive', phase: 'departing', path: tidy([...path, [TEMP_IN.x, TEMP_IN.y], [TEMP_IN.x, -3]], 0.05), radius: 1.2, fork: 0.12, status: 'Temp forklift leaving' }], t0, FORK);
}
