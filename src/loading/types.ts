/**
 * Load planner model (spec §34–§35). Pure data: no three.js, no React.
 *
 * Positions inside a vehicle use the box frame: x from the inner front wall
 * towards the doors, y across from the right wall, z up from the deck (m).
 */

export type VehicleId = 'rigid-12' | 'rigid-18' | 'rigid-26' | 'semi-136' | 'container-40';
export type AxleId = 'front' | 'rear' | 'steer' | 'drive' | 'trailer';

export interface AxleSpec {
  id: AxleId;
  label: string;
  tareKg: number;
  ratingKg: number;
}

export interface VehicleSpec {
  id: VehicleId;
  label: string;
  axleCount: number;
  inner: { l: number; w: number; h: number };
  /** Deck height above the ground. */
  deck: number;
  axles: AxleSpec[];
  /** Axle positions in the box frame; articulated: tractor axles relative to the fifth wheel. */
  statics:
    | { kind: 'rigid'; front: number; rear: number }
    | { kind: 'artic'; kingpin: number; trailer: number; steerAhead: number; driveBehind: number; kingpinTareKg: number };
  gvwKg: number;
  payloadKg: number;
  /** Least share of the weight the steering axle must carry. */
  minSteerShare: number;
  overallLength: number;
  /** Drawing: model kind, model-local x of the inner front wall, door plane → model origin, rear axle positions (model-local x). */
  model: { kind: 'rigid' | 'semi' | 'container'; frontWall: number; doorsToOrigin: number; rearAxles: number[]; frontAxle: number };
}

/** A point mass in the box frame (x from the inner front wall towards the doors). */
export interface Mass {
  x: number;
  kg: number;
  stop: number;
}

export type AxleStatus = 'ok' | 'near' | 'over' | 'light';

export interface AxleLoad {
  id: AxleId;
  label: string;
  kg: number;
  ratingKg: number;
  pct: number;
  status: AxleStatus;
}

/** Axle loads with the cargo of stops 1…afterStop already dropped (0 = at departure). */
export interface LoadState {
  afterStop: number;
  label: string;
  payloadKg: number;
  cogX: number | null;
  axles: AxleLoad[];
  issues: string[];
}

export interface CurvePoint {
  x: number;
  maxKg: number;
}

export interface AxleReport {
  states: LoadState[];
  ok: boolean;
  issues: string[];
  /** Load-distribution curve: most payload the vehicle takes with its centre of gravity at x. */
  curve: CurvePoint[];
  /** Legal centre-of-gravity range for the departure payload. */
  window: [number, number] | null;
  cogX: number | null;
  payloadKg: number;
}
