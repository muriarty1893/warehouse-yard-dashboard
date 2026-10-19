import { devYard, road } from '../config/devYard';
import type { TruckBay, Vec2 } from '../domain/types';
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
 * Rigid truck: arrive from the road, check in just inside the entrance, swing
 * west across the open centre, reverse into a loading space (rear against the
 * platform), load/unload, then leave through the west half of the entrance.
 */
export function bayVisit(bay: TruckBay, opts: { period: number; offset: number; dwell: number; inbound: boolean }): RouteSpec {
  const bx = bay.center[0];
  const parked = parkInBay(bay, 'rigid');
  const turnY = 11.5;
  const reverseR = 4.2;
  const x0 = bx - reverseR;
  const work = opts.inbound ? `Unloading at ${bay.id}` : `Loading at ${bay.id}`;
  const checkIn = P(IN_X, 6);
  const checkOut = P(OUT_X, 9.5);
  const legs: Leg[] = [
    { kind: 'drive', phase: 'arriving', path: [P(road.spawnEast, road.westbound), P(IN_X, road.westbound), checkIn], radius: 5, speed: 11, status: `Arriving · ${bay.id}` },
    { kind: 'wait', phase: 'gate', seconds: 3, status: 'Gate check-in' },
    { kind: 'drive', phase: 'docking', path: [checkIn, P(IN_X, turnY), P(x0, turnY)], radius: Math.min(4, IN_X - x0), speed: 3.2, status: `To ${bay.id}` },
    { kind: 'wait', phase: 'docking', seconds: 1.2, status: `Reversing to ${bay.id}` },
    { kind: 'drive', phase: 'docking', path: [P(x0, turnY), P(bx, turnY), P(bx, parked.y)], radius: reverseR, reverse: true, speed: 1.5, status: `Reversing to ${bay.id}` },
    { kind: 'wait', phase: 'working', seconds: opts.dwell, status: work, doors: true },
    { kind: 'drive', phase: 'departing', path: [P(bx, parked.y), P(bx, 15.5), P(OUT_X, Math.max(checkOut[1] + 3, 15.5 - (bx - OUT_X))), checkOut], radius: 3.5, speed: 3.2, status: 'Departing' },
    { kind: 'wait', phase: 'gate', seconds: 2.5, status: 'Gate check-out' },
    { kind: 'drive', phase: 'departed', path: [checkOut, P(OUT_X, road.westbound), P(road.spawnWest, road.westbound)], radius: 5, speed: 11, status: 'Departed' },
  ];
  return { speed: 3.2, accel: 1.1, period: opts.period, offset: opts.offset, legs };
}

/**
 * Forklift on the raised hold space: pick a pallet from the front row of the
 * storage band, carry it along the loading strip and put it into the truck
 * at a bay, back out without swinging into the manager tables, return.
 */
export function platformShuttle(opts: { pick: Vec2; bay: TruckBay; truckId: string; offset?: number }): RouteSpec {
  const { bay, truckId } = opts;
  const [sx, sy] = opts.pick;
  const bx = bay.center[0];
  const yPick = sy - FORKLIFT.carryOffset;
  const [, rearY] = bayRear(bay);
  const dropY = rearY + 0.75;
  const lane = 30.4;
  const start = P(sx, lane + 0.8);
  return {
    speed: 2.6,
    accel: 1.6,
    offset: opts.offset,
    legs: [
      { kind: 'drive', phase: 'picking', path: [start, P(sx, yPick)], speed: 0.9, fork: 0.12, status: 'Picking from the hold space' },
      { kind: 'wait', phase: 'picking', seconds: 2.2, fork: [0.12, 0.4], carry: true, status: 'Lifting pallet' },
      { kind: 'drive', phase: 'carrying', path: [P(sx, yPick), P(sx, lane), P(sx - 2, lane)], radius: 1.2, reverse: true, speed: 1.2, carry: true, status: 'Reversing' },
      { kind: 'drive', phase: 'carrying', path: [P(sx - 2, lane), P(bx, lane), P(bx, dropY)], radius: 1.6, carry: true, status: `To ${bay.id} · ${truckId}` },
      { kind: 'wait', phase: 'working', seconds: 2.4, fork: [0.4, 0.2], carry: true, status: `Loading ${truckId}` },
      { kind: 'wait', phase: 'working', seconds: 0.8, fork: [0.2, 0.12], status: `Loading ${truckId}` },
      { kind: 'drive', phase: 'returning', path: [P(bx, dropY), P(bx, lane), P(bx + 1.8, lane)], radius: 1, reverse: true, speed: 1.2, status: 'Reversing' },
      { kind: 'drive', phase: 'returning', path: [P(bx + 1.8, lane), P(sx, lane), start], radius: 0.8, status: 'Returning' },
    ],
  };
}

/**
 * Forklift on the ground: pick from the open yard, reverse round, drive up
 * the ramp onto the raised hold space, set the pallet down at the front of
 * the storage band, come back down.
 */
export function rampShuttle(opts: { pick: Vec2; offset?: number }): RouteSpec {
  const [px, py] = opts.pick;
  const ramp = devYard.ramps[0].rect;
  const rx = ramp.x + 2.4;
  const fx = px + FORKLIFT.carryOffset;
  const start = P(fx + 1.2, py);
  const dropY = 29.6;
  return {
    speed: 2.4,
    accel: 1.5,
    offset: opts.offset,
    legs: [
      { kind: 'drive', phase: 'picking', path: [start, P(fx, py)], speed: 0.9, fork: 0.12, status: 'Picking in the open yard' },
      { kind: 'wait', phase: 'picking', seconds: 2.2, fork: [0.12, 0.4], carry: true, status: 'Lifting pallet' },
      { kind: 'drive', phase: 'carrying', path: [P(fx, py), P(rx, py), P(rx, py - 2.4)], radius: 2.4, reverse: true, speed: 1.2, carry: true, status: 'Reversing' },
      { kind: 'drive', phase: 'carrying', path: [P(rx, py - 2.4), P(rx, dropY)], carry: true, status: 'Up the ramp to the hold space' },
      { kind: 'wait', phase: 'working', seconds: 2.2, fork: [0.4, 0.12], carry: true, status: 'Putting away on the platform' },
      { kind: 'drive', phase: 'returning', path: [P(rx, dropY), P(rx, py), P(rx + 1.6, py)], radius: 1.6, reverse: true, speed: 1.3, status: 'Down the ramp' },
      { kind: 'drive', phase: 'returning', path: [P(rx + 1.6, py), start], status: 'Returning' },
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
