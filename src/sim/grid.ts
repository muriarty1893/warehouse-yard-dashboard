import { devYard } from '../config/devYard';
import { trucks } from '../config/fleet';
import type { Obb } from '../domain/geometry';
import type { Cargo, Vec2 } from '../domain/types';
import { FORKLIFT, RIGID } from '../domain/vehicles';
import { heightAt, yardBounds } from '../domain/yard';
import { fixtureBox } from '../world/clearance';
import { inYard, stackBase } from '../world/placement';

/**
 * Where a forklift can drive (spec §3.1): a 0.25 m occupancy grid of the yard
 * with walls, buildings, fixtures, parked trucks and cargo blocked, and no
 * step up or down of more than 0.3 m between neighbouring cells (the platform
 * edge; the ramp is gentle enough). A* finds a path, pulled tight by line of
 * sight.
 */

export interface Grid {
  cell: number;
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  /** How many obstacles cover each cell (0 = free), so a unit can be taken out again. */
  blocked: Uint8Array;
  h: Float32Array;
}

const CELL = 0.25;
const STEP = 0.3;
/** Keep this far off the boundary walls. */
const WALL = 0.5;

function fill(g: Grid, b: Obb, grow: number, add = 1) {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const hl = b.hl + grow;
  const hw = b.hw + grow;
  const ex = Math.abs(c) * hl + Math.abs(s) * hw;
  const ey = Math.abs(s) * hl + Math.abs(c) * hw;
  const i0 = Math.max(0, Math.floor((b.x - ex - g.x0) / g.cell));
  const i1 = Math.min(g.nx - 1, Math.floor((b.x + ex - g.x0) / g.cell));
  const j0 = Math.max(0, Math.floor((b.y - ey - g.y0) / g.cell));
  const j1 = Math.min(g.ny - 1, Math.floor((b.y + ey - g.y0) / g.cell));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = g.x0 + (i + 0.5) * g.cell - b.x;
      const dy = g.y0 + (j + 0.5) * g.cell - b.y;
      const k = j * g.nx + i;
      if (Math.abs(dx * c + dy * s) <= hl && Math.abs(-dx * s + dy * c) <= hw) g.blocked[k] = Math.max(0, Math.min(255, g.blocked[k] + add));
    }
  }
}

function wallDistance(x: number, y: number) {
  const pts = devYard.boundary;
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j];
    const [bx, by] = pts[i];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)));
  }
  return best;
}

export function buildGrid(cargo: Cargo[], opts: { ignore?: Set<string>; inflate?: number } = {}): Grid {
  const grow = opts.inflate ?? 0.6;
  const ignore = opts.ignore ?? new Set<string>();
  const b = yardBounds(devYard);
  const nx = Math.ceil(b.w / CELL);
  const ny = Math.ceil(b.h / CELL);
  const g: Grid = { cell: CELL, x0: b.x0, y0: b.y0, nx, ny, blocked: new Uint8Array(nx * ny), h: new Float32Array(nx * ny) };
  // Floor heights: raised platforms, then ramps over them (as heightAt does).
  const raised = [...devYard.buildings.filter((bl) => bl.elevation).map((bl) => bl.rect), ...devYard.ramps.map((r) => r.rect)];
  for (const r of raised) {
    for (let j = Math.max(0, Math.floor((r.y - b.y0) / CELL)); j <= Math.min(ny - 1, Math.floor((r.y + r.h - b.y0) / CELL)); j++) {
      for (let i = Math.max(0, Math.floor((r.x - b.x0) / CELL)); i <= Math.min(nx - 1, Math.floor((r.x + r.w - b.x0) / CELL)); i++) {
        g.h[j * nx + i] = heightAt(devYard, b.x0 + (i + 0.5) * CELL, b.y0 + (j + 0.5) * CELL);
      }
    }
  }
  // Walls: outside the boundary (scanline per row), or too close to it.
  const poly = devYard.boundary;
  for (let j = 0; j < ny; j++) {
    const y = b.y0 + (j + 0.5) * CELL;
    const xs: number[] = [];
    for (let a = 0, c = poly.length - 1; a < poly.length; c = a++) {
      const [ax, ay] = poly[a];
      const [cx, cy] = poly[c];
      if (ay > y !== cy > y) xs.push(ax + ((y - ay) * (cx - ax)) / (cy - ay));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i < nx; i++) {
      const x = b.x0 + (i + 0.5) * CELL;
      let inside = false;
      for (const cross of xs) if (cross < x) inside = !inside;
      const near = Math.min(x - b.x0, b.x1 - x, y - b.y0, b.y1 - y) < WALL + 1;
      if (!inside || (near && wallDistance(x, y) < WALL)) g.blocked[j * nx + i] = 1;
    }
  }
  for (const bld of devYard.buildings) {
    if (bld.kind === 'canopy') continue;
    const r = bld.rect;
    fill(g, { x: r.x + r.w / 2, y: r.y + r.h / 2, yaw: 0, hl: r.w / 2, hw: r.h / 2 }, grow);
  }
  for (const fx of devYard.fixtures) fill(g, fixtureBox(fx), grow);
  const mid = (RIGID.front - RIGID.rear) / 2;
  for (const t of trucks) {
    if (t.route || !t.pose) continue;
    const { x, y, heading } = t.pose;
    fill(g, { x: x + Math.cos(heading) * mid, y: y + Math.sin(heading) * mid, yaw: heading, hl: (RIGID.front + RIGID.rear) / 2, hw: RIGID.width / 2 }, grow);
  }
  for (const c of cargo) {
    if (c.on || !inYard(c) || ignore.has(c.id)) continue;
    fill(g, cargoBox(c), grow);
  }
  return g;
}

const cargoBox = (c: Cargo): Obb => ({ x: c.x, y: c.y, yaw: c.yaw, hl: c.dims.l / 2, hw: c.dims.w / 2 });

/** Take a unit out of the grid (it has been picked up), freeing its floor. */
export function clearUnit(g: Grid, c: Cargo, inflate = 0.6) {
  if (!c.on) fill(g, cargoBox(c), inflate, -1);
}

/** Put a unit back into the grid (undo clearUnit). */
export function restoreUnit(g: Grid, c: Cargo, inflate = 0.6) {
  if (!c.on) fill(g, cargoBox(c), inflate, 1);
}

const cellOf = (g: Grid, x: number, y: number) => {
  const i = Math.floor((x - g.x0) / g.cell);
  const j = Math.floor((y - g.y0) / g.cell);
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i;
};

export function isFree(g: Grid, x: number, y: number) {
  const k = cellOf(g, x, y);
  return k >= 0 && !g.blocked[k];
}

/** Straight drive from a to b stays on free floor without a step. */
function clear(g: Grid, a: Vec2, b: Vec2) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1));
  let prev = heightAt(devYard, a[0], a[1]);
  for (let k = 0; k <= n; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / n;
    const y = a[1] + ((b[1] - a[1]) * k) / n;
    if (!isFree(g, x, y)) return false;
    const h = heightAt(devYard, x, y);
    if (Math.abs(h - prev) > STEP) return false;
    prev = h;
  }
  return true;
}

/** The free cell nearest to k on the same floor level (within 2 m), or -1. */
function nearestFree(g: Grid, k: number) {
  if (k < 0) return -1;
  if (!g.blocked[k]) return k;
  const i0 = k % g.nx;
  const j0 = Math.floor(k / g.nx);
  for (let r = 1; r <= 8; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue;
        const c = j * g.nx + i;
        if (!g.blocked[c] && Math.abs(g.h[c] - g.h[k]) <= STEP) return c;
      }
    }
  }
  return -1;
}

const center = (g: Grid, k: number): Vec2 => [g.x0 + ((k % g.nx) + 0.5) * g.cell, g.y0 + (Math.floor(k / g.nx) + 0.5) * g.cell];

/** A* over the grid (8 neighbours, no corner cutting), then pulled tight. Null when there is no way. */
export function findPath(g: Grid, from: Vec2, to: Vec2): Vec2[] | null {
  const s = nearestFree(g, cellOf(g, from[0], from[1]));
  const t = nearestFree(g, cellOf(g, to[0], to[1]));
  if (s < 0 || t < 0) return null;
  const n = g.nx * g.ny;
  const cost = new Float32Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const ti = t % g.nx;
  const tj = Math.floor(t / g.nx);
  const guess = (k: number) => {
    const dx = Math.abs((k % g.nx) - ti);
    const dy = Math.abs(Math.floor(k / g.nx) - tj);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  // Binary heap of [f, cell].
  const heap: [number, number][] = [];
  const push = (f: number, k: number) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const passable = (a: number, b: number) => !g.blocked[b] && Math.abs(g.h[a] - g.h[b]) <= STEP;
  cost[s] = 0;
  push(guess(s), s);
  while (heap.length) {
    const [, k] = pop();
    if (done[k]) continue;
    if (k === t) break;
    done[k] = 1;
    const i = k % g.nx;
    const j = Math.floor(k / g.nx);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
        const c = jj * g.nx + ii;
        if (done[c] || !passable(k, c)) continue;
        // Diagonals only when both side cells are open too (no cutting corners).
        if (di && dj && !(passable(k, j * g.nx + ii) && passable(k, jj * g.nx + i))) continue;
        const next = cost[k] + (di && dj ? Math.SQRT2 : 1);
        if (next < cost[c]) {
          cost[c] = next;
          prev[c] = k;
          push(next + guess(c), c);
        }
      }
    }
  }
  if (s !== t && prev[t] < 0) return null;
  const cells: number[] = [];
  for (let k = t; k !== -1; k = k === s ? -1 : prev[k]) cells.push(k);
  cells.reverse();
  const pts: Vec2[] = [from, ...cells.map((k) => center(g, k)), to];
  // String pulling: from each point, jump to the furthest one in plain sight.
  const out: Vec2[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; ) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(g, pts[i], pts[j])) j -= 1;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/**
 * Where a forklift stands to pick a unit: in line with one of its axes,
 * forks pointing at it, far enough out to drive the forks in. Tries both ends
 * of the preferred axis, then the other axis. The grid must ignore the unit.
 */
export function approachFor(g: Grid, c: Cargo, alongLength: boolean): { stand: Vec2; heading: number } | null {
  const h = heightAt(devYard, c.x, c.y);
  for (const axis of alongLength ? [0, 1] : [1, 0]) {
    const yaw = c.yaw + (axis === 0 ? 0 : Math.PI / 2);
    const half = (axis === 0 ? c.dims.l : c.dims.w) / 2;
    for (const side of [1, -1]) {
      const ux = Math.cos(yaw) * side;
      const uy = Math.sin(yaw) * side;
      const stand: Vec2 = [c.x + ux * (FORKLIFT.carryOffset + half), c.y + uy * (FORKLIFT.carryOffset + half)];
      const pick: Vec2 = [c.x + ux * FORKLIFT.carryOffset, c.y + uy * FORKLIFT.carryOffset];
      if (!isFree(g, stand[0], stand[1]) || Math.abs(heightAt(devYard, stand[0], stand[1]) - h) > STEP || !clear(g, stand, pick)) continue;
      return { stand, heading: Math.atan2(-uy, -ux) };
    }
  }
  return null;
}

/**
 * Approach to a unit as if it (and, when stacked, the unit under it) were not
 * in the grid; the grid is left as it was. Null when other cargo boxes it in.
 */
export function reachUnit(g: Grid, cargo: Cargo[], c: Cargo, alongLength = true): { stand: Vec2; heading: number } | null {
  const below = c.on ? stackBase(cargo, c).base : null;
  clearUnit(g, c);
  if (below) clearUnit(g, below);
  const a = approachFor(g, c, alongLength);
  if (below) restoreUnit(g, below);
  restoreUnit(g, c);
  return a;
}
