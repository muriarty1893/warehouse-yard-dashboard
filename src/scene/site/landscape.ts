import { road } from '../../config/devYard';
import { hashString, mulberry32 } from '../../domain/seed';
import type { Rect } from '../../domain/types';

/**
 * Landscaping around the yard: raised grass beds and where trees, bushes,
 * grass tufts, flowers and rocks go. Seeded, so the layout is stable.
 */

export interface GrassBed {
  rect: Rect;
  holes?: Rect[];
}

/** Top of the raised grass beds (slab height + bevel). */
export const GRASS_TOP = 0.26;

export const GRASS_BEDS: GrassBed[] = [
  { rect: { x: -17, y: -0.6, w: 16.4, h: 127 } },
  { rect: { x: -0.4, y: 110.6, w: 177, h: 16 } },
  { rect: { x: 160.6, y: -0.6, w: 16, h: 111 } },
  {
    rect: { x: 90.6, y: 60.6, w: 69.6, h: 49.6 },
    holes: [
      { x: 96, y: 70, w: 30, h: 22 },
      { x: 128, y: 64, w: 29, h: 43 },
      { x: 108, y: 61.4, w: 6, h: 9 },
    ],
  },
  { rect: { x: road.x0, y: -29, w: road.x1 - road.x0, h: 12.6 } },
];

export interface Spot {
  x: number;
  y: number;
  /** Scale multiplier around the model's base scale. */
  s: number;
  rot: number;
  /** Which model of the family. */
  k: number;
}

const inside = (r: Rect, x: number, y: number, margin = 0) =>
  x > r.x + margin && x < r.x + r.w - margin && y > r.y + margin && y < r.y + r.h - margin;

export function onGrass(x: number, y: number, margin = 0.6) {
  return GRASS_BEDS.some((b) => inside(b.rect, x, y, margin) && !(b.holes ?? []).some((h) => inside(h, x, y, -margin)));
}

export function treeSpots(): Spot[] {
  const rng = mulberry32(hashString('trees'));
  const spots: Spot[] = [];
  const add = (x: number, y: number) => {
    if (onGrass(x, y, 1.2)) spots.push({ x, y, s: 0.85 + rng() * 0.35, rot: rng() * Math.PI * 2, k: rng() });
  };
  const jitter = (v: number, k: number) => v + (rng() - 0.5) * k;
  const row = (x0: number, x1: number, y: number, step: number) => {
    for (let x = x0; x <= x1; x += step) if (rng() > 0.12) add(jitter(x, 3), jitter(y, 2.5));
  };
  const col = (y0: number, y1: number, x: number, step: number) => {
    for (let y = y0; y <= y1; y += step) if (rng() > 0.12) add(jitter(x, 2.5), jitter(y, 3));
  };
  row(-160, 320, -21, 10);
  row(-150, 310, -26.5, 15);
  col(4, 120, -5, 11);
  col(10, 116, -12.5, 14);
  row(-4, 172, 115.5, 10);
  row(4, 168, 122, 15);
  col(6, 104, 165.5, 11);
  col(12, 100, 172, 14);
  // Around the office and car park.
  row(94, 124, 66.5, 7);
  col(74, 104, 93.5, 8);
  row(96, 124, 96, 7);
  return spots;
}

/** Random points on the grass beds within an x-range, `density` per m². */
export function scatter(seed: string, density: number, xRange: [number, number], margin = 0.6): Spot[] {
  const rng = mulberry32(hashString(seed));
  const out: Spot[] = [];
  for (const bed of GRASS_BEDS) {
    const x0 = Math.max(bed.rect.x, xRange[0]);
    const x1 = Math.min(bed.rect.x + bed.rect.w, xRange[1]);
    if (x1 <= x0) continue;
    const n = Math.round((x1 - x0) * bed.rect.h * density);
    for (let i = 0; i < n; i++) {
      const x = x0 + rng() * (x1 - x0);
      const y = bed.rect.y + rng() * bed.rect.h;
      if (onGrass(x, y, margin)) out.push({ x, y, s: 0.75 + rng() * 0.5, rot: rng() * Math.PI * 2, k: rng() });
    }
  }
  return out;
}

/** Clusters of points (flower patches, rock groups). */
export function clusters(seed: string, count: number, perCluster: number, radius: number, xRange: [number, number]): Spot[] {
  const rng = mulberry32(hashString(seed));
  const centers = scatter(`${seed}|c`, 1, xRange, 2).sort(() => rng() - 0.5).slice(0, count);
  const out: Spot[] = [];
  for (const c of centers) {
    const kind = rng();
    for (let i = 0; i < perCluster; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      const x = c.x + Math.cos(a) * r;
      const y = c.y + Math.sin(a) * r;
      if (onGrass(x, y, 0.4)) out.push({ x, y, s: 0.8 + rng() * 0.4, rot: rng() * Math.PI * 2, k: kind });
    }
  }
  return out;
}
