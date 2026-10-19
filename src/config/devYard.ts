import type { TruckBay, YardConfig, Zone } from '../domain/types';

/**
 * Development yard (spec §5, §44): a representative medium-sized L-shaped
 * logistics yard. All geometry is in meters (x east, y north). The 3D twin is
 * generated from this object — change numbers here, not in the scene.
 */

const storageGrid = {
  cols: 8,
  rows: 6,
  slot: [1.8, 1.6] as [number, number],
  colGap: 0.6,
  pairGap: 0.4,
  aisle: 3.6,
  labelSpace: 2.8,
  maxStack: 2,
};

const zones: Zone[] = [
  { id: 'A', name: 'Zone A', kind: 'storage', color: '#2f5ff0', rect: { x: 106, y: 33, w: 24, h: 21 }, grid: storageGrid },
  { id: 'B', name: 'Zone B', kind: 'storage', color: '#7a5af0', rect: { x: 134, y: 33, w: 24, h: 21 }, grid: storageGrid },
  { id: 'C', name: 'Zone C', kind: 'storage', color: '#0f9f8f', rect: { x: 106, y: 5, w: 24, h: 21 }, grid: storageGrid },
  {
    id: 'D',
    name: 'Zone D · Containers',
    kind: 'container',
    color: '#e0761f',
    rect: { x: 134, y: 5, w: 24, h: 21 },
    grid: { cols: 8, rows: 1, slot: [2.6, 12.4], colGap: 0.4, pairGap: 0, aisle: 0, labelSpace: 2.8, maxStack: 2 },
  },
  { id: 'LZ', name: 'Loading Zone', kind: 'loading', color: '#2f5ff0', rect: { x: 60, y: 3, w: 34, h: 37 } },
  { id: 'TS', name: 'Truck Staging', kind: 'staging', color: '#2f5ff0', rect: { x: 4, y: 5, w: 30, h: 27 } },
];

const dockXs = [16, 25, 34, 43, 52, 61, 70];

const bays: TruckBay[] = [
  ...dockXs.map((x, i) => ({
    id: `DK-0${i + 1}`,
    kind: 'dock' as const,
    center: [x, 77] as [number, number],
    length: 18,
    width: 4.2,
    heading: -Math.PI / 2,
  })),
  ...[0, 1, 2, 3, 4, 5].map((i) => ({
    id: `TS-${i + 1}`,
    kind: 'staging' as const,
    center: [7.25 + 4.5 * i, 18] as [number, number],
    length: 20,
    width: 4.5,
    heading: Math.PI / 2,
  })),
  ...[8, 15, 22, 29].map((y, i) => ({
    id: `L${i + 1}`,
    kind: 'loading' as const,
    center: [81.25, y] as [number, number],
    length: 22.5,
    width: 4.2,
    heading: Math.PI,
  })),
];

export const devYard: YardConfig = {
  id: 'YARD-DEV-01',
  name: 'Docktor Dev Yard',
  boundary: [
    [0, 0],
    [160, 0],
    [160, 60],
    [90, 60],
    [90, 110],
    [0, 110],
  ],
  gates: [{ id: 'GATE-1', a: [36, 0], b: [56, 0] }],
  zones,
  bays,
  buildings: [
    {
      id: 'DC-01',
      name: 'DC-01',
      subtitle: 'Cross-dock · Docktor Dev Yard',
      kind: 'warehouse',
      rect: { x: 10, y: 86, w: 70, h: 20 },
      height: 10,
      docks: dockXs.map((x, i) => ({ id: `DK-0${i + 1}`, x })),
    },
    { id: 'GH-1', name: 'Gatehouse', kind: 'gatehouse', rect: { x: 60.5, y: 0.8, w: 4.4, h: 3.6 }, height: 3.2 },
    { id: 'OF-1', name: 'Yard Office', kind: 'office', rect: { x: 98, y: 72, w: 26, h: 18 }, height: 8 },
  ],
  areas: [
    { id: 'LANE-MAIN', kind: 'truckLane', rect: { x: 36, y: -1, w: 20, h: 45 } },
    { id: 'LANE-CIRC', kind: 'truckLane', rect: { x: 60, y: 45.5, w: 34, h: 9 } },
    { id: 'FK-APRON', kind: 'forklift', rect: { x: 94, y: 3, w: 10, h: 52 }, label: 'FORKLIFT APRON' },
    { id: 'FK-CORRIDOR', kind: 'forklift', rect: { x: 104, y: 26, w: 55, h: 7 } },
    { id: 'FK-AISLE-N', kind: 'forklift', rect: { x: 130, y: 33, w: 4, h: 21 } },
    { id: 'FK-AISLE-S', kind: 'forklift', rect: { x: 130, y: 5, w: 4, h: 21 } },
    { id: 'WALK-GATE', kind: 'walkway', rect: { x: 56.5, y: 1, w: 3, h: 46.5 } },
    { id: 'WALK-SOUTH', kind: 'walkway', rect: { x: 2, y: 44, w: 34, h: 3.5 } },
    { id: 'WALK-WEST', kind: 'walkway', rect: { x: 2, y: 47.5, w: 3, h: 49.5 } },
    { id: 'WALK-DOOR', kind: 'walkway', rect: { x: 5, y: 94, w: 5, h: 3 } },
    { id: 'XING-MAIN', kind: 'crossing', rect: { x: 36, y: 44, w: 20, h: 3.5 }, stripes: 'ns' },
    { id: 'XING-LZ', kind: 'crossing', rect: { x: 56.5, y: 26.5, w: 3, h: 5 }, stripes: 'ew' },
    { id: 'R-FUEL', kind: 'restricted', rect: { x: 4, y: 34, w: 12, h: 8 }, label: 'FUEL · RESTRICTED' },
    { id: 'R-CHARGE', kind: 'restricted', rect: { x: 81, y: 88, w: 8, h: 20 }, label: 'FORKLIFT CHARGING' },
  ],
};

/** Outer road along the south edge of the site (outside the yard). */
export const road = {
  y0: -14,
  y1: -2,
  /** Lane centerlines: westbound on the north half, eastbound on the south half. */
  westbound: -5,
  eastbound: -11,
  /** Extent of the drawn road (and wrap length for through-traffic). */
  x0: -400,
  x1: 560,
  /** Where scripted yard visits appear / disappear on the road (beyond the view). */
  spawnEast: 250,
  spawnWest: -140,
};

export const bayById = (id: string): TruckBay => {
  const bay = devYard.bays.find((b) => b.id === id);
  if (!bay) throw new Error(`Unknown bay ${id}`);
  return bay;
};
