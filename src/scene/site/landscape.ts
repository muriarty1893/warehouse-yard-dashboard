import { devYard, road } from '../../config/devYard';
import { yardBounds } from '../../domain/yard';
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

const yb = yardBounds(devYard);
const STRIP = 14;

/** Grass strips around the yard, plus a verge south of the road. */
export const GRASS_BEDS: GrassBed[] = [
  { rect: { x: yb.x0 - 0.6 - STRIP, y: yb.y0 + 0.05, w: STRIP, h: yb.h + 0.6 + STRIP } },
  { rect: { x: yb.x0 - 0.4, y: yb.y1 + 0.6, w: yb.w + 0.8, h: STRIP } },
  { rect: { x: yb.x1 + 0.6, y: yb.y0 + 0.05, w: STRIP, h: yb.h + 0.6 + STRIP } },
  { rect: { x: road.x0, y: road.y0 - 13, w: road.x1 - road.x0, h: 12.6 } },
];

/** x-range around the yard that gets detailed planting. */
export const NEAR: [number, number] = [yb.x0 - 70, yb.x1 + 70];

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
  row(NEAR[0], NEAR[1], road.y0 - 5, 10);
  row(NEAR[0] + 5, NEAR[1] - 5, road.y0 - 10.5, 15);
  col(yb.y0 + 4, yb.y1 + 10, yb.x0 - 5, 9);
  col(yb.y0 + 8, yb.y1 + 10, yb.x0 - 11.5, 12);
  row(yb.x0 - 4, yb.x1 + 4, yb.y1 + 4.5, 9);
  row(yb.x0, yb.x1, yb.y1 + 11, 13);
  col(yb.y0 + 4, yb.y1 + 10, yb.x1 + 5, 9);
  col(yb.y0 + 8, yb.y1 + 10, yb.x1 + 11.5, 12);
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
