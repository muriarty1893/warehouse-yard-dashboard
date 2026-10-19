import type { Rect, Vec2 } from './types';

/** 2D helpers for free-form placement: polygons and oriented rectangles (yard meters). */

export function pointInPolygon(x: number, y: number, poly: Vec2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly: Vec2[]) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a) / 2;
}

export function polygonBounds(polys: Vec2[][]) {
  const pts = polys.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

export const rectPolygon = (r: Rect): Vec2[] => [
  [r.x, r.y],
  [r.x + r.w, r.y],
  [r.x + r.w, r.y + r.h],
  [r.x, r.y + r.h],
];

export const inRect = (r: Rect, x: number, y: number, margin = 0) => x >= r.x - margin && x <= r.x + r.w + margin && y >= r.y - margin && y <= r.y + r.h + margin;

/** Oriented rectangle: center, rotation and half extents (along its own x / y). */
export interface Obb {
  x: number;
  y: number;
  yaw: number;
  hl: number;
  hw: number;
}

export function obbCorners(b: Obb): Vec2[] {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return [
    [b.x + c * b.hl - s * b.hw, b.y + s * b.hl + c * b.hw],
    [b.x - c * b.hl - s * b.hw, b.y - s * b.hl + c * b.hw],
    [b.x - c * b.hl + s * b.hw, b.y - s * b.hl - c * b.hw],
    [b.x + c * b.hl + s * b.hw, b.y + s * b.hl - c * b.hw],
  ];
}

/** Separating-axis test; `gap` grows both boxes (keep-clear margin). */
export function obbOverlap(a: Obb, b: Obb, gap = 0) {
  const axes: Vec2[] = [
    [Math.cos(a.yaw), Math.sin(a.yaw)],
    [-Math.sin(a.yaw), Math.cos(a.yaw)],
    [Math.cos(b.yaw), Math.sin(b.yaw)],
    [-Math.sin(b.yaw), Math.cos(b.yaw)],
  ];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [ux, uy] of axes) {
    const ra = (a.hl + gap / 2) * Math.abs(Math.cos(a.yaw) * ux + Math.sin(a.yaw) * uy) + (a.hw + gap / 2) * Math.abs(-Math.sin(a.yaw) * ux + Math.cos(a.yaw) * uy);
    const rb = (b.hl + gap / 2) * Math.abs(Math.cos(b.yaw) * ux + Math.sin(b.yaw) * uy) + (b.hw + gap / 2) * Math.abs(-Math.sin(b.yaw) * ux + Math.cos(b.yaw) * uy);
    if (Math.abs(dx * ux + dy * uy) > ra + rb) return false;
  }
  return true;
}

/** Oriented rectangle around an axis-aligned rect. */
export const rectObb = (r: Rect): Obb => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, yaw: 0, hl: r.w / 2, hw: r.h / 2 });

/** Is the whole box inside one of the polygons (corners and center)? */
export function obbInside(b: Obb, polys: Vec2[][]) {
  const pts = [...obbCorners(b), [b.x, b.y] as Vec2];
  return polys.some((poly) => pts.every(([x, y]) => pointInPolygon(x, y, poly)));
}
