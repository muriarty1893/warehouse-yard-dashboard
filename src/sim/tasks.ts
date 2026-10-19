import { devYard, road } from '../config/devYard';
import type { StoragePosition, TruckBay, Vec2 } from '../domain/types';
import { bayRear, FORKLIFT, parkInBay } from '../domain/vehicles';
import type { Leg, RouteSpec } from './route';

/**
 * Route builders for the simulated yard activity. They turn yard entities
 * (gate, bays, positions, ramp) into scripted legs, so moving something in
 * the config moves the traffic with it.
 */

const gate = devYard.gates.find((g) => !g.closed) ?? devYard.gates[0];
const gateMid = (gate.a[0] + gate.b[0]) / 2;
/** Drive on the right: in through the east half of the gate, out through the west half. */
const IN_X = gateMid + 4;
const OUT_X = gateMid - 4;
const P = (x: number, y: number): Vec2 => [x, y];

/**
 * Rigid truck: arrive from the road, swing west in the yard, reverse into a
 * loading space (rear against the platform), load/unload, leave.
 */
export function bayVisit(bay: TruckBay, opts: { period: number; offset: number; dwell: number; inbound: boolean }): RouteSpec {
  const bx = bay.center[0];
  const parked = parkInBay(bay, 'rigid');
  const turnY = 11.5;
  const work = opts.inbound ? `Unloading at ${bay.id}` : `Loading at ${bay.id}`;
  const legs: Leg[] = [
    { kind: 'drive', phase: 'arriving', path: [P(road.spawnEast, road.westbound), P(IN_X, road.westbound), P(IN_X, 3)], radius: 5, speed: 11, status: `Arriving · ${bay.id}` },
    { kind: 'wait', phase: 'gate', seconds: 3, status: 'Gate check-in' },
    { kind: 'drive', phase: 'docking', path: [P(IN_X, 3), P(IN_X, turnY), P(bx - 11, turnY)], radius: 4, speed: 3.5, status: `To ${bay.id}` },
    { kind: 'wait', phase: 'docking', seconds: 1.2, status: `Reversing to ${bay.id}` },
    { kind: 'drive', phase: 'docking', path: [P(bx - 11, turnY), P(bx, turnY), P(bx, parked.y)], radius: 6, reverse: true, speed: 1.6, status: `Reversing to ${bay.id}` },
    { kind: 'wait', phase: 'working', seconds: opts.dwell, status: work, doors: true },
    { kind: 'drive', phase: 'departing', path: [P(bx, parked.y), P(bx, 10), P(OUT_X, 5), P(OUT_X, 2)], radius: 4, speed: 3.5, status: 'Departing' },
    { kind: 'wait', phase: 'gate', seconds: 2.5, status: 'Gate check-out' },
    { kind: 'drive', phase: 'departed', path: [P(OUT_X, 2), P(OUT_X, road.westbound), P(road.spawnWest, road.westbound)], radius: 5, speed: 11, status: 'Departed' },
  ];
  return { speed: 3.5, accel: 1.1, period: opts.period, offset: opts.offset, legs };
}

/**
 * Forklift on the raised hold space: pick a pallet from a slot facing the
 * loading strip, drive along the strip, load it into the truck at a bay.
 */
export function platformShuttle(opts: { pick: StoragePosition; bay: TruckBay; truckId: string; laneY: number; offset?: number }): RouteSpec {
  const { pick, bay, truckId, laneY } = opts;
  const sx = pick.x;
  const bx = bay.center[0];
  const dir = Math.sign(bx - sx) || 1;
  const yPick = pick.y - FORKLIFT.carryOffset;
  const [, rearY] = bayRear(bay);
  const dropY = rearY + 0.75;
  const backY = laneY - 2;
  return {
    speed: 2.8,
    accel: 1.6,
    offset: opts.offset,
    legs: [
      { kind: 'drive', phase: 'picking', path: [P(sx, laneY), P(sx, yPick)], speed: 1.1, fork: 0.12, status: `Picking at ${pick.id}` },
      { kind: 'wait', phase: 'picking', seconds: 2.2, fork: [0.12, 0.4], carry: true, status: `Lifting at ${pick.id}` },
      { kind: 'drive', phase: 'carrying', path: [P(sx, yPick), P(sx, laneY), P(sx - dir * 3, laneY)], radius: 2, reverse: true, speed: 1.3, carry: true, status: 'Reversing' },
      { kind: 'drive', phase: 'carrying', path: [P(sx - dir * 3, laneY), P(bx, laneY), P(bx, dropY)], radius: 2, carry: true, status: `To ${bay.id} · ${truckId}` },
      { kind: 'wait', phase: 'working', seconds: 2.4, fork: [0.4, 0.2], carry: true, status: `Loading ${truckId}` },
      { kind: 'wait', phase: 'working', seconds: 0.8, fork: [0.2, 0.12], status: `Loading ${truckId}` },
      { kind: 'drive', phase: 'returning', path: [P(bx, dropY), P(bx, backY), P(bx + dir * 3, backY)], radius: 1.8, reverse: true, speed: 1.3, status: 'Reversing' },
      { kind: 'drive', phase: 'returning', path: [P(bx + dir * 3, backY), P(sx, backY), P(sx, laneY)], radius: 1.8, status: 'Returning' },
    ],
  };
}

/**
 * Forklift on the ground: pick from open storage (slot facing north), drive
 * up the ramp onto the raised hold space, put the pallet down, come back.
 */
export function rampShuttle(opts: { pick: StoragePosition; laneY: number; offset?: number }): RouteSpec {
  const { pick, laneY } = opts;
  const ramp = devYard.ramps[0].rect;
  const rx = ramp.x + ramp.w / 2;
  const sx = pick.x;
  const yPick = pick.y + FORKLIFT.carryOffset;
  const dropY = ramp.y + ramp.h + 3.2;
  const returnY = laneY + 1.6;
  return {
    speed: 2.6,
    accel: 1.5,
    offset: opts.offset,
    legs: [
      { kind: 'drive', phase: 'picking', path: [P(sx, laneY), P(sx, yPick)], speed: 1.1, fork: 0.12, status: `Picking at ${pick.id}` },
      { kind: 'wait', phase: 'picking', seconds: 2.2, fork: [0.12, 0.4], carry: true, status: `Lifting at ${pick.id}` },
      { kind: 'drive', phase: 'carrying', path: [P(sx, yPick), P(sx, laneY), P(sx - 3, laneY)], radius: 2, reverse: true, speed: 1.3, carry: true, status: 'Reversing' },
      { kind: 'drive', phase: 'carrying', path: [P(sx - 3, laneY), P(rx, laneY), P(rx, dropY)], radius: 2.2, carry: true, status: 'Up the ramp to Zone B' },
      { kind: 'wait', phase: 'working', seconds: 2.2, fork: [0.4, 0.12], carry: true, status: 'Putting away on the platform' },
      { kind: 'drive', phase: 'returning', path: [P(rx, dropY), P(rx, returnY), P(rx + 3, returnY)], radius: 2, reverse: true, speed: 1.3, status: 'Down the ramp' },
      { kind: 'drive', phase: 'returning', path: [P(rx + 3, returnY), P(sx, returnY), P(sx, laneY)], radius: 1.4, status: 'Returning' },
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
