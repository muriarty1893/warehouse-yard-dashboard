import type { StorageArea, TruckBay, YardConfig } from '../domain/types';

/**
 * The yard, traced from the plan (yardplan.png). All geometry is in meters
 * (x east, y north, origin at the yard's south-west corner). The plan has no
 * dimensions; the scale (≈ 25 px per meter on the current drawing) comes from
 * the road lanes and sidewalks, which makes the yard ≈ 65.5 × 42 m. Adjust
 * numbers here — the 3D twin is generated from this object.
 *
 * Storage is free-form: the yellow spaces on the plan are where cargo may go.
 * They are never fully filled; aisles for people and forklifts open and close
 * with the day's workload.
 */

const PLATFORM = 1.2; // raised hold-space floor (dock height)
const PLATFORM_EDGE = 26.9;

const storage: StorageArea[] = [
  {
    id: 'HS1',
    name: 'Main hold space',
    description: 'Covered · raised floor',
    color: '#2f5ff0',
    elevation: PLATFORM,
    covered: true,
    maxStack: 2,
    parts: [
      [
        [20.65, 28.15],
        [23.3, 28.15],
        [23.3, 31.95],
        [56.75, 31.95],
        [56.75, PLATFORM_EDGE],
        [63.6, PLATFORM_EDGE],
        [63.6, 40.35],
        [20.65, 40.35],
      ],
      // Strip along the platform edge between the ramp and the first bay.
      [
        [28.1, 27.35],
        [32.75, 27.35],
        [32.75, 28.65],
        [28.1, 28.65],
      ],
    ],
  },
  {
    id: 'HS2',
    name: 'Hold space 2',
    description: 'Covered · raised floor',
    color: '#7a5af0',
    elevation: PLATFORM,
    covered: true,
    maxStack: 2,
    parts: [
      [
        [56.75, 16.05],
        [63.6, 16.05],
        [63.6, PLATFORM_EDGE],
        [56.75, PLATFORM_EDGE],
      ],
    ],
  },
  {
    id: 'OY',
    name: 'Open yard',
    description: 'Hold space · no cover',
    color: '#0f9f8f',
    maxStack: 2,
    parts: [
      [
        [0.4, 9.2],
        [2.5, 5.4],
        [27.1, 5.4],
        [28.3, 6.8],
        [28.4, 13.2],
        [27.3, 16.5],
        [18.6, 18.5],
        [16.6, 24.7],
        [1.3, 24.9],
        [0.3, 22.1],
      ],
    ],
  },
  {
    id: 'GS',
    name: 'Gate-side space',
    description: 'Hold space · no cover',
    color: '#e8762b',
    maxStack: 2,
    parts: [
      [
        [46.0, 5.3],
        [48.9, 4.0],
        [51.9, 4.2],
        [53.5, 6.0],
        [53.6, 16.6],
        [45.4, 16.4],
        [45.4, 7.0],
      ],
    ],
  },
];

/** Truck parking spaces for loading, rear against the hold-space platform edge. */
const bays: TruckBay[] = [
  ...[35.9, 40.5, 45.1, 49.7].map((x, i) => ({
    id: `L${i + 1}`,
    kind: 'loading' as const,
    center: [x, PLATFORM_EDGE - 4.5] as [number, number],
    length: 9,
    width: 4.4,
    heading: -Math.PI / 2,
  })),
  // Parking along the south wall, west of the entrance (waiting trucks).
  { id: 'P1', kind: 'parking', center: [8.5, 3.0], length: 11.7, width: 3.1, heading: 0 },
  { id: 'P2', kind: 'parking', center: [23.8, 3.0], length: 11.0, width: 3.1, heading: 0 },
];

export const devYard: YardConfig = {
  id: 'YD-01',
  name: 'Docktor Yard',
  boundary: [
    [0, 0],
    [65.5, 0],
    [65.5, 42],
    [0, 42],
  ],
  wallHeight: 4.2,
  gates: [
    { id: 'GATE-1', name: 'Main entrance', a: [30.5, 0], b: [49.5, 0], parkedPanel: [16, 30.6] },
    { id: 'GATE-2', name: 'Medium garage door', a: [65.5, 16.2], b: [65.5, 25], closed: true },
  ],
  storage,
  fixtures: [
    { id: 'DESK-1', kind: 'desk', label: 'Manager table · L1–L2', x: 38.2, y: 28.1, heading: -Math.PI / 2 },
    { id: 'DESK-2', kind: 'desk', label: 'Manager table · L3–L4', x: 47.5, y: 28.1, heading: -Math.PI / 2 },
    { id: 'C1', kind: 'charger', label: 'Charger C1', x: 53.2, y: 31.65, heading: -Math.PI / 2 },
    { id: 'C2', kind: 'charger', label: 'Charger C2', x: 55.6, y: 31.65, heading: -Math.PI / 2 },
    { id: 'EP-1', kind: 'pallets', label: 'Empty pallets', x: 6.2, y: 25.9, heading: 0, count: 9 },
    { id: 'EP-2', kind: 'pallets', label: 'Empty pallets', x: 7.6, y: 25.9, heading: 0.05, count: 6 },
    { id: 'EP-3', kind: 'pallets', label: 'Empty pallets', x: 9.0, y: 25.95, heading: -0.04, count: 11 },
    { id: 'EP-4', kind: 'pallets', label: 'Empty pallets', x: 50.6, y: 29.4, heading: Math.PI / 2, count: 7 },
    { id: 'SKIP-1', kind: 'skip', label: 'Waste skip', x: 12.6, y: 25.85, heading: 0 },
    { id: 'BINS-1', kind: 'bins', label: 'Bins', x: 61.4, y: 11.7, heading: 0, count: 3 },
    { id: 'FX-1', kind: 'extinguisher', label: 'Fire extinguisher', x: 33.15, y: 27.25, heading: 0 },
    { id: 'FX-2', kind: 'extinguisher', label: 'Fire extinguisher', x: 52.45, y: 27.3, heading: 0 },
    { id: 'FX-3', kind: 'extinguisher', label: 'Fire extinguisher', x: 55.95, y: 14.75, heading: 0 },
    { id: 'FX-4', kind: 'extinguisher', label: 'Fire extinguisher', x: 18.0, y: 1.25, heading: 0 },
    { id: 'CONES-1', kind: 'cones', label: 'Traffic cones', x: 29.7, y: 19.8, heading: Math.PI / 2, count: 2 },
    { id: 'PJ-1', kind: 'palletJack', label: 'Pallet jack', x: 50.7, y: 27.75, heading: Math.PI },
    ...[
      [1.0, 26.3, 0],
      [29.8, 1.0, Math.PI / 2],
      [50.2, 3.4, Math.PI / 2],
      [53.0, 17.3, Math.PI],
      [64.6, 13.2, Math.PI],
    ].map(([x, y, heading], i) => ({ id: `LP-${i + 1}`, kind: 'lightPole' as const, label: 'Light pole', x, y, heading })),
    ...[
      [30.9, 0.95],
      [49.1, 0.95],
      [29.2, 21.3],
      [53.3, 11.4],
      [20.0, 26.4],
      [33.4, 26.4],
      [52.2, 26.4],
    ].map(([x, y], i) => ({ id: `BL-${i + 1}`, kind: 'bollard' as const, label: 'Bollard', x, y, heading: 0 })),
  ],
  bays,
  buildings: [
    {
      id: 'MB-1',
      name: 'Main building',
      subtitle: 'Offices · 3 floors',
      kind: 'office',
      rect: { x: 4.2, y: 26.9, w: 15.9, h: 14.2 },
      height: 11,
      floors: 3,
      doors: [
        { side: 'west', at: 10.6, width: 1.8 },
        { side: 'east', at: 11, width: 1.8, sill: PLATFORM },
      ],
    },
    { id: 'HS-1', name: 'Main hold space', subtitle: 'Covered · raised floor', kind: 'canopy', rect: { x: 20.2, y: PLATFORM_EDGE, w: 44.5, h: 14.2 }, height: 8, elevation: PLATFORM },
    { id: 'HS-2', name: 'Hold space 2', subtitle: 'Covered · raised floor', kind: 'canopy', rect: { x: 55.5, y: 14.3, w: 9.2, h: 12.6 }, height: 8, elevation: PLATFORM },
    {
      id: 'SB-1',
      name: 'Staff building',
      subtitle: 'Tea room · Lunch room',
      kind: 'office',
      rect: { x: 53.8, y: 0.8, w: 10.9, h: 10.1 },
      height: 7.4,
      floors: 2,
      doors: [
        { side: 'west', at: 2.3, width: 1.6 },
        { side: 'north', at: 2.3, width: 1.6 },
      ],
    },
  ],
  ramps: [{ id: 'RAMP-1', rect: { x: 21.6, y: 21, w: 7.1, h: 5.9 }, rise: PLATFORM, up: 'north' }],
  areas: [
    { id: 'FK-RAMP', kind: 'forklift', rect: { x: 19.6, y: 18.7, w: 9.6, h: 2.3 }, label: 'FORKLIFTS' },
    { id: 'R-CHARGE', kind: 'restricted', rect: { x: 52.1, y: 28.3, w: 4.6, h: 3.65 }, label: 'CHARGING', elevation: PLATFORM },
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
