import { road } from '../config/devYard';
import type { StoragePosition, TruckBay, Vec2 } from '../domain/types';
import { bayRear, FORKLIFT, parkInBay, SEMI } from '../domain/vehicles';
import type { Leg, RouteSpec } from './route';

/**
 * Route builders for the simulated yard activity. They turn yard entities
 * (positions, bays) into scripted legs, so moving a bay in the config moves
 * the traffic with it.
 */

const INBOUND_X = 51;
const OUTBOUND_X = 41;

/** Road → gate check-in → yard. Ends heading north inside the gate. */
function arriveFromRoad(status: string): Leg[] {
  return [
    { kind: 'drive', phase: 'arriving', path: [[road.spawnEast, road.westbound], [INBOUND_X, road.westbound], [INBOUND_X, 11]], radius: 6, speed: 11, status },
    { kind: 'wait', phase: 'gate', seconds: 3, status: 'Gate check-in' },
  ];
}

/** Gate check-out → road (westbound). Starts heading south at the gate. */
function leaveToRoad(): Leg[] {
  return [
    { kind: 'wait', phase: 'gate', seconds: 2.5, status: 'Gate check-out' },
    { kind: 'drive', phase: 'departed', path: [[OUTBOUND_X, 6], [OUTBOUND_X, road.westbound], [road.spawnWest, road.westbound]], radius: 6, speed: 11, status: 'Departed' },
  ];
}

/** Semi-truck: arrive, U-turn in the truck court, reverse onto a dock, unload, leave. */
export function dockVisit(dock: TruckBay, opts: { period: number; offset: number; dwell: number }): RouteSpec {
  const x = dock.center[0];
  const parked = parkInBay(dock, 'semi');
  const turnR = (INBOUND_X - x) / 2;
  const top = parked.y - 9;
  return {
    speed: 4.5,
    accel: 1.1,
    trailerLag: SEMI.trailerLag,
    period: opts.period,
    offset: opts.offset,
    legs: [
      ...arriveFromRoad(`Arriving · ${dock.id}`),
      { kind: 'drive', phase: 'docking', path: [[INBOUND_X, 11], [INBOUND_X, top], [x, top], [x, top - 22]], radius: turnR, status: `To ${dock.id}` },
      { kind: 'wait', phase: 'docking', seconds: 1.5, status: `Reversing to ${dock.id}` },
      { kind: 'drive', phase: 'docking', path: [[x, top - 22], [parked.x, parked.y]], reverse: true, speed: 1.5, status: `Reversing to ${dock.id}` },
      { kind: 'wait', phase: 'working', seconds: opts.dwell, status: `Unloading at ${dock.id}`, doors: true },
      { kind: 'drive', phase: 'departing', path: [[parked.x, parked.y], [x, 52], [OUTBOUND_X, 45], [OUTBOUND_X, 6]], radius: 8, status: 'Departing' },
      ...leaveToRoad(),
    ],
  };
}

/** Rigid truck: arrive, loop round to a loading bay (rear to the forklift apron), load, leave. */
export function loadingVisit(bay: TruckBay, opts: { period: number; offset: number; dwell: number; apronX: number }): RouteSpec {
  const y = bay.center[1];
  const parked = parkInBay(bay, 'rigid');
  return {
    speed: 4.5,
    accel: 1.2,
    period: opts.period,
    offset: opts.offset,
    legs: [
      ...arriveFromRoad(`Arriving · ${bay.id}`),
      { kind: 'drive', phase: 'docking', path: [[INBOUND_X, 11], [INBOUND_X, 50], [opts.apronX, 50], [opts.apronX, y], [parked.x, y]], radius: 7, status: `To ${bay.id}` },
      { kind: 'wait', phase: 'working', seconds: opts.dwell, status: `Loading at ${bay.id}`, doors: true },
      { kind: 'drive', phase: 'departing', path: [[parked.x, y], [OUTBOUND_X, y], [OUTBOUND_X, 6]], radius: 7, status: 'Departing' },
      ...leaveToRoad(),
    ],
  };
}

/**
 * Forklift shuttle: pick a pallet from a storage position, drive it along the
 * corridor and apron to a truck in a loading bay, load it, return. Loops.
 */
export function forkliftShuttle(opts: {
  pick: StoragePosition;
  bay: TruckBay;
  truckId: string;
  laneY: number;
  apronX: number;
  offset?: number;
}): RouteSpec {
  const { pick, bay, truckId, laneY, apronX } = opts;
  const f = pick.face === 'south' ? 1 : -1;
  const sx = pick.x;
  const yPick = pick.y - f * FORKLIFT.carryOffset;
  const [rearX, yBay] = bayRear(bay);
  const xDrop = rearX + FORKLIFT.carryOffset - 0.75;
  const returnY = laneY - f * 2;
  const P = (x: number, y: number): Vec2 => [x, y];
  return {
    speed: 3,
    accel: 1.6,
    offset: opts.offset,
    legs: [
      { kind: 'drive', phase: 'picking', path: [P(sx, laneY), P(sx, yPick)], speed: 1.1, fork: 0.12, status: `Picking at ${pick.id}` },
      { kind: 'wait', phase: 'picking', seconds: 2.4, fork: [0.12, 0.42], carry: true, status: `Lifting at ${pick.id}` },
      { kind: 'drive', phase: 'carrying', path: [P(sx, yPick), P(sx, laneY), P(sx + 3, laneY)], radius: 2, reverse: true, speed: 1.4, carry: true, status: 'Reversing' },
      { kind: 'drive', phase: 'carrying', path: [P(sx + 3, laneY), P(apronX, laneY), P(apronX, yBay), P(xDrop, yBay)], radius: 2.5, carry: true, status: `To ${bay.id} · ${truckId}` },
      { kind: 'wait', phase: 'working', seconds: 2.6, fork: [0.42, 1.38], carry: true, status: `Loading ${truckId}` },
      { kind: 'wait', phase: 'working', seconds: 0.8, fork: [1.38, 1.3], status: `Loading ${truckId}` },
      { kind: 'wait', phase: 'returning', seconds: 1.2, fork: [1.3, 0.12], status: `Loaded ${truckId}` },
      { kind: 'drive', phase: 'returning', path: [P(xDrop, yBay), P(apronX, yBay), P(apronX, yBay - 3)], radius: 2.5, reverse: true, speed: 1.4, status: 'Reversing' },
      { kind: 'drive', phase: 'returning', path: [P(apronX, yBay - 3), P(apronX, returnY), P(sx, returnY), P(sx, laneY)], radius: 2.5, status: 'Returning' },
    ],
  };
}

/** Closed walking loop for a worker (first point is repeated at the end). */
export function walkLoop(points: Vec2[], opts: { offset?: number; speed?: number; status: string }): RouteSpec {
  return {
    speed: opts.speed ?? 1.3,
    accel: 2,
    offset: opts.offset,
    legs: [{ kind: 'drive', phase: 'walking', path: [...points, points[0]], radius: 0.6, status: opts.status }],
  };
}
