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

/** A unit to pack, reduced to what the packer needs. */
export interface PackItem {
  id: string;
  /** Drop order on the route: 1 = first stop. */
  stop: number;
  l: number;
  w: number;
  h: number;
  weightKg: number;
  /** Can carry other units, and may stand on others. */
  stackable: boolean;
  fragile: boolean;
  urgent: boolean;
}

/** A packed unit: min corner and as-placed extents in the box frame; `seq` is the loading order. */
export interface Placement {
  cargoId: string;
  stop: number;
  seq: number;
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  yaw: 0 | 90;
  weightKg: number;
  /** The unit it stands on. */
  on: string | null;
}

export interface LeftOut {
  cargoId: string;
  reason: string;
  /** Truck the unit is proposed for instead (overflow), if any. */
  to: string | null;
}

export interface PackOptions {
  seed: number;
  /** Shuffle near-equal units in the selection and packing order. */
  shuffle: boolean;
  /** Orientation tried first. */
  yawFirst: 0 | 90;
  /** Fill from the right wall (1) or the left (-1). */
  side: 1 | -1;
  /** Random spread (±) applied to the placement score weights. */
  jitter: number;
  /** Space kept clear at the front wall (m); null tries a few and keeps the best. */
  clearance: number | null;
}
