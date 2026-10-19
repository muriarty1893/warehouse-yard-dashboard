/**
 * Docktor domain model (spec §8, §24, §25, §39).
 *
 * The operational model is 2D, in meters: x points east, y points north.
 * Heights are kept separately (stack levels). The 3D scene converts these
 * coordinates for rendering; nothing here knows about three.js.
 */

export type Vec2 = [x: number, y: number];

/** Axis-aligned rectangle; (x, y) is the south-west corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ZoneKind = 'storage' | 'container' | 'loading' | 'staging';

export interface StorageGrid {
  cols: number;
  rows: number;
  /** Slot footprint: [along x, along y]. */
  slot: Vec2;
  colGap: number;
  /** Rows are laid out back-to-back in pairs, separated by forklift aisles. */
  pairGap: number;
  aisle: number;
  /** Space kept free at the zone's north edge for the painted zone label. */
  labelSpace: number;
  maxStack: number;
}

export interface Zone {
  id: string;
  name: string;
  kind: ZoneKind;
  rect: Rect;
  grid?: StorageGrid;
  /** Tint used for the painted zone label. */
  color: string;
}

export interface StoragePosition {
  id: string;
  zoneId: string;
  /** Slot center. */
  x: number;
  y: number;
  /** Footprint along x / along y. */
  w: number;
  d: number;
  maxStack: number;
  /** Which aisle a forklift approaches this slot from. */
  face: 'north' | 'south';
}

export type BayKind = 'dock' | 'loading' | 'staging';

export interface TruckBay {
  id: string;
  kind: BayKind;
  center: Vec2;
  length: number;
  width: number;
  /** Direction (radians, CCW from east) a parked truck faces. */
  heading: number;
}

export interface Building {
  id: string;
  name: string;
  kind: 'warehouse' | 'office' | 'gatehouse';
  rect: Rect;
  height: number;
  /** Dock door centers along the building's south face (x, meters). */
  docks?: { id: string; x: number }[];
  subtitle?: string;
}

export type AreaKind = 'walkway' | 'crossing' | 'restricted' | 'forklift' | 'truckLane';

export interface Area {
  id: string;
  kind: AreaKind;
  rect: Rect;
  label?: string;
  /** For crossings: direction of the stripes. */
  stripes?: 'ns' | 'ew';
}

export interface Gate {
  id: string;
  a: Vec2;
  b: Vec2;
}

export interface YardConfig {
  id: string;
  name: string;
  /** Yard boundary polygon (counter-clockwise). L-shaped for the dev yard. */
  boundary: Vec2[];
  gates: Gate[];
  zones: Zone[];
  bays: TruckBay[];
  buildings: Building[];
  areas: Area[];
}

// ---------------------------------------------------------------------------
// Cargo (spec §8–§11, §25)

export type CargoType =
  | 'container'
  | 'pallet'
  | 'box'
  | 'package'
  | 'crate'
  | 'roll'
  | 'machine'
  | 'large_freight'
  | 'raw_material'
  | 'group'
  | 'other';

/** Visual variant used by the twin; derived from type, never authoritative. */
export type CargoLook =
  | 'cartons'
  | 'wrap-blue'
  | 'wrap-white'
  | 'crate'
  | 'drum'
  | 'bag'
  | 'machine'
  | 'pipes'
  | 'group-cartons'
  | 'container';

export interface Dimensions {
  /** Meters: length (along slot x), width (along slot y), height. */
  l: number;
  w: number;
  h: number;
}

export interface Cargo {
  id: string;
  type: CargoType;
  look: CargoLook;
  description: string;
  destination: string;
  weightKg: number;
  dims: Dimensions;
  positionId: string;
  stackLevel: number;
  /** Container livery / pallet tint where relevant. */
  color?: string;
  brand?: string;
  /** Show a location pin above this cargo. */
  pinned?: boolean;
}

// ---------------------------------------------------------------------------
// Vehicles & people

export type Carrier = 'docktor' | 'nordline' | 'cargoviva' | 'bluepeak';

export interface Pose {
  x: number;
  y: number;
  heading: number;
}
