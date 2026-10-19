import { pointInPolygon, polygonArea } from './geometry';
import type { Rect, StorageArea, YardConfig } from './types';

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Floor height at a yard point: raised platforms and ramps, else ground (0). */
export function heightAt(yard: YardConfig, x: number, y: number): number {
  for (const ramp of yard.ramps) {
    if (!inside(ramp.rect, x, y)) continue;
    const r = ramp.rect;
    const t = ramp.up === 'north' ? (y - r.y) / r.h : ramp.up === 'south' ? (r.y + r.h - y) / r.h : ramp.up === 'east' ? (x - r.x) / r.w : (r.x + r.w - x) / r.w;
    return ramp.rise * Math.max(0, Math.min(1, t));
  }
  for (const b of yard.buildings) if (b.elevation && inside(b.rect, x, y)) return b.elevation;
  return 0;
}

export function yardBounds(yard: YardConfig) {
  const xs = yard.boundary.map((p) => p[0]);
  const ys = yard.boundary.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const x1 = Math.max(...xs);
  const y1 = Math.max(...ys);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

export const insideYard = (yard: YardConfig, x: number, y: number) => pointInPolygon(x, y, yard.boundary);

/** Storage area containing a point, if any. */
export function areaAt(yard: YardConfig, x: number, y: number): StorageArea | null {
  return yard.storage.find((a) => a.parts.some((p) => pointInPolygon(x, y, p))) ?? null;
}

export const areaSize = (a: StorageArea) => a.parts.reduce((s, p) => s + polygonArea(p), 0);

/**
 * Map-style reference grid (5 m cells, columns A… from the west, rows 1…
 * from the south), so a free-form location can be read out: "Open yard · C3".
 */
export const GRID = 5;
export function gridRef(yard: YardConfig, x: number, y: number) {
  const b = yardBounds(yard);
  const col = Math.max(0, Math.floor((x - b.x0) / GRID));
  const row = Math.max(0, Math.floor((y - b.y0) / GRID));
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}
