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

/**
 * Free-form storage area (the yellow spaces on the yard plan). There are no
 * fixed slots: cargo goes wherever there is room, and how full an area is
 * changes with the day. An area may be made of several polygons.
 */
export interface StorageArea {
  id: string;
  name: string;
  description?: string;
  /** Polygons in yard meters. */
  parts: Vec2[][];
  /** Floor height (raised hold-space platform). */
  elevation?: number;
  covered?: boolean;
  /** Tint used in the dashboard for this area. */
  color: string;
  /** Highest stack allowed here (units). */
  maxStack: number;
}

/** Where a cargo unit stands: a floor spot (center + rotation), or on top of another unit. */
export type Spot = { x: number; y: number; yaw: number } | { on: string };

export type BayKind = 'dock' | 'loading' | 'staging' | 'parking';

export interface TruckBay {
  id: string;
  kind: BayKind;
  center: Vec2;
  length: number;
  width: number;
  /** Direction (radians, CCW from east) a parked truck faces. */
  heading: number;
}

export interface Door {
  side: 'north' | 'south' | 'east' | 'west';
  /** Distance of the door center from the wall's west / south end (meters). */
  at: number;
  width: number;
  /** Sill height (a door onto the raised platform). */
  sill?: number;
}

export interface Building {
  id: string;
  name: string;
  /** canopy = raised, roofed hold space without walls. */
  kind: 'warehouse' | 'office' | 'gatehouse' | 'canopy';
  rect: Rect;
  height: number;
  /** Raised floor height (canopy platforms). */
  elevation?: number;
  floors?: number;
  doors?: Door[];
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
  /** Painted on a raised floor (platform) instead of the ground. */
  elevation?: number;
  /** For crossings: direction of the stripes. */
  stripes?: 'ns' | 'ew';
}

export interface Gate {
  id: string;
  name: string;
  a: Vec2;
  b: Vec2;
  /** A closed door in the boundary (drawn, not driven through). */
  closed?: boolean;
  /** Sliding gate: where the open gate panel is parked along the boundary (x range). */
  parkedPanel?: [number, number];
}

/** Sloped surface from the ground up to a platform. */
export interface Ramp {
  id: string;
  rect: Rect;
  rise: number;
  /** Direction the ramp climbs towards. */
  up: 'north' | 'south' | 'east' | 'west';
}

/** Furniture and equipment that takes up floor space (manager tables, chargers, empty pallets…). */
export interface Fixture {
  id: string;
  kind: 'desk' | 'charger' | 'pallets' | 'skip' | 'bins' | 'extinguisher' | 'cones' | 'palletJack' | 'lightPole' | 'bollard';
  /** Pallets in a stack / bins in a row. */
  count?: number;
  label?: string;
  x: number;
  y: number;
  /** Direction the front faces (radians, yard frame). */
  heading: number;
}

export interface YardConfig {
  id: string;
  name: string;
  /** Yard boundary polygon (counter-clockwise), walled. */
  boundary: Vec2[];
  /** Height of the boundary wall. */
  wallHeight: number;
  gates: Gate[];
  storage: StorageArea[];
  fixtures: Fixture[];
  bays: TruckBay[];
  buildings: Building[];
  ramps: Ramp[];
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
  /** Footprint center on the floor and rotation (0 = length along east). Same as the unit below for stacked units. */
  x: number;
  y: number;
  yaw: number;
  /** Unit this one is stacked on (null = on the floor). */
  on: string | null;
  /** Storage area the unit stands in (null = elsewhere in the yard). */
  areaId: string | null;
  /** Demo data, or registered by hand. */
  source?: 'demo' | 'manual';
  /** Container livery / pallet tint where relevant. */
  color?: string;
  brand?: string;
  /** Show a location pin above this cargo. */
  pinned?: boolean;
}

// ---------------------------------------------------------------------------
// Source documents (spec §10, §37, §39)

export type DocumentType = 'bill_of_lading' | 'cmr' | 'delivery_note' | 'invoice' | 'packing_list' | 'customs' | 'other';

/**
 * The paper a cargo record comes from: bill, CMR, delivery note, invoice…
 * Entered by hand for now (the spec's manual-entry fallback); OCR extraction
 * will fill the same record later. Drafts are not authoritative until confirmed.
 */
export interface SourceDocument {
  id: string;
  cargoId: string;
  type: DocumentType;
  /** Number as printed on the document (bill no., CMR no., …). */
  number: string;
  /** YYYY-MM-DD */
  issuedOn: string;
  shipper: string;
  consignee: string;
  carrier?: string;
  origin?: string;
  destination?: string;
  pieces?: number;
  grossKg?: number;
  value?: number;
  currency?: string;
  /** Item list / goods description, one item per line. */
  items?: string;
  notes?: string;
  /** Photo of the paper document (downscaled JPEG data URL). */
  photo?: string;
  source: 'manual' | 'demo';
  status: 'draft' | 'confirmed';
  createdBy: string;
  /** Epoch ms. */
  createdAt: number;
  updatedAt: number;
}

export type CargoEventKind = 'registered' | 'moved' | 'edited' | 'released' | 'document';

export interface CargoEvent {
  id: string;
  cargoId: string;
  kind: CargoEventKind;
  text: string;
  /** Epoch ms and the yard clock at the time. */
  at: number;
  yardTime: string;
}

// ---------------------------------------------------------------------------
// Vehicles & people

export type Carrier = 'docktor' | 'nordline' | 'cargoviva' | 'bluepeak';

export interface Pose {
  x: number;
  y: number;
  heading: number;
}
