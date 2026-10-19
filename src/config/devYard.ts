import type { StorageGrid, TruckBay, YardConfig, Zone } from '../domain/types';

/**
 * The yard, traced from the Figma plan (yardplan.png). All geometry is in
 * meters (x east, y north, origin at the yard's south-west corner). The plan
 * has no dimensions; the scale (≈ 28 px per meter) comes from the road lanes
 * and sidewalks, which makes the yard ≈ 65.5 × 42 m. Adjust numbers here —
 * the 3D twin is generated from this object.
 */

const PLATFORM = 1.2; // raised hold-space floor (dock height)

const pallets = (cols: number, rows: number, extra: Partial<StorageGrid> = {}): StorageGrid => ({
  cols,
  rows,
  slot: [1.8, 1.6],
  colGap: 0.6,
  pairGap: 0.4,
  aisle: 3.6,
  labelSpace: 2.6,
  maxStack: 2,
  ...extra,
});

const zones: Zone[] = [
  {
    id: 'A',
    name: 'Zone A',
    description: 'Open storage · no cover',
    kind: 'storage',
    color: '#0f9f8f',
    rect: { x: 2, y: 2.5, w: 15, h: 15 },
    grid: pallets(6, 4),
  },
  {
    id: 'B',
    name: 'Zone B',
    description: 'Main hold space · covered',
    kind: 'storage',
    color: '#2f5ff0',
    rect: { x: 22.5, y: 33.6, w: 31.5, h: 7.3 },
    elevation: PLATFORM,
    grid: pallets(12, 2),
  },
  {
    id: 'C',
    name: 'Zone C',
    description: 'Hold space 2 · covered',
    kind: 'storage',
    color: '#7a5af0',
    rect: { x: 55.9, y: 14.6, w: 8.4, h: 12 },
    elevation: PLATFORM,
    grid: pallets(3, 4, { aisle: 2.4, labelSpace: 1.4 }),
  },
];

/** Truck parking spaces for loading, rear against the hold-space platform edge. */
const PLATFORM_EDGE = 26.9;
const bays: TruckBay[] = [35.9, 40.5, 45.1, 49.7].map((x, i) => ({
  id: `L${i + 1}`,
  kind: 'loading',
  center: [x, PLATFORM_EDGE - 4.5],
  length: 9,
  width: 4.4,
  heading: -Math.PI / 2,
}));

export const devYard: YardConfig = {
  id: 'YD-01',
  name: 'Docktor Yard',
  boundary: [
    [0, 0],
    [65.5, 0],
    [65.5, 42],
    [0, 42],
  ],
  gates: [
    { id: 'GATE-1', name: 'Main entry', a: [30.5, 0], b: [49.5, 0], parkedPanel: [16, 30.5] },
    { id: 'GATE-2', name: 'Medium garage door', a: [65.5, 16.2], b: [65.5, 25], closed: true },
  ],
  zones,
  bays,
  buildings: [
    { id: 'MB-1', name: 'Main building', subtitle: 'Offices · 3 floors', kind: 'office', rect: { x: 4.2, y: 26.9, w: 15.9, h: 14.2 }, height: 11, floors: 3 },
    { id: 'HS-1', name: 'Main hold space', subtitle: 'Covered · raised floor', kind: 'canopy', rect: { x: 20.2, y: PLATFORM_EDGE, w: 44.5, h: 14.2 }, height: 8, elevation: PLATFORM },
    { id: 'HS-2', name: 'Hold space 2', subtitle: 'Covered · raised floor', kind: 'canopy', rect: { x: 55.5, y: 14.3, w: 9.2, h: 12.6 }, height: 8, elevation: PLATFORM },
    { id: 'SB-1', name: 'Staff building', subtitle: 'Tea room · Lunch room', kind: 'office', rect: { x: 53.8, y: 0.8, w: 10.9, h: 10.1 }, height: 7.4, floors: 2 },
  ],
  ramps: [{ id: 'RAMP-1', rect: { x: 21.6, y: 21, w: 7.1, h: 5.9 }, rise: PLATFORM, up: 'north' }],
  areas: [
    { id: 'LANE-GATE', kind: 'truckLane', rect: { x: 30.5, y: 0, w: 19, h: 9 } },
    { id: 'FK-RAMP', kind: 'forklift', rect: { x: 17.6, y: 17.7, w: 11.6, h: 3.3 }, label: 'FORKLIFTS' },
    { id: 'R-CHARGE', kind: 'restricted', rect: { x: 58.4, y: 27.4, w: 6, h: 5.2 }, label: 'CHARGING', elevation: PLATFORM },
  ],
};

/** The public road along the south edge (two carriageways, sidewalk on the yard side). */
export const road = {
  y0: -14,
  y1: 0,
  westbound: -4.4,
  eastbound: -9.6,
  /** Extent of the drawn road (and wrap length for through-traffic). */
  x0: -300,
  x1: 380,
  /** Where scripted yard visits appear / disappear on the road (beyond the view). */
  spawnEast: 170,
  spawnWest: -100,
};

export const bayById = (id: string): TruckBay => {
  const bay = devYard.bays.find((b) => b.id === id);
  if (!bay) throw new Error(`Unknown bay ${id}`);
  return bay;
};
