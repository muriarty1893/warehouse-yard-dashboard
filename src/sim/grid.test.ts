import { describe, expect, it } from 'vitest';
import { devYard } from '../config/devYard';
import { PICKS } from '../config/fleet';
import type { Cargo, Vec2 } from '../domain/types';
import { heightAt } from '../domain/yard';
import { demoCargo } from '../world/demo';
import { hasOnTop } from '../world/placement';
import { approachFor, buildGrid, findPath, isFree, type Grid } from './grid';

const cargo = demoCargo('normal', 1);
const STRIP: Vec2 = [44, 30.4];
const ramp = devYard.ramps[0].rect;

/** Every 0.1 m along the path: on free cells, never stepping up or down more than 0.3 m. */
function walkable(grid: Grid, path: Vec2[]) {
  let prevH: number | null = null;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.1));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const y = ay + ((by - ay) * k) / n;
      if (!isFree(grid, x, y)) return `blocked at ${x.toFixed(2)},${y.toFixed(2)}`;
      const h = heightAt(devYard, x, y);
      if (prevH !== null && Math.abs(h - prevH) > 0.3) return `step at ${x.toFixed(2)},${y.toFixed(2)}`;
      prevH = h;
    }
  }
  return null;
}

/** The nearest free spot to (x, y): test endpoints must not start inside cargo. */
function freeNear(grid: Grid, x: number, y: number): Vec2 {
  for (let r = 0; r < 6; r += 0.25) for (let a = 0; a < 6.28; a += 0.4) if (isFree(grid, x + r * Math.cos(a), y + r * Math.sin(a))) return [x + r * Math.cos(a), y + r * Math.sin(a)];
  throw new Error(`no free floor near ${x},${y}`);
}

describe('forklift grid', () => {
  it('builds quickly', () => {
    buildGrid(cargo);
    const t0 = performance.now();
    buildGrid(cargo);
    expect(performance.now() - t0).toBeLessThan(150);
  });

  it('reaches a platform unit from the loading strip', () => {
    const units = cargo.filter((c) => c.areaId === 'HS1' && !c.on && !hasOnTop(cargo, c.id));
    let found: { path: Vec2[]; grid: Grid } | null = null;
    for (const u of units) {
      const grid = buildGrid(cargo, { ignore: new Set([u.id]) });
      const a = approachFor(grid, u, true);
      const path = a && findPath(grid, STRIP, a.stand);
      if (path) {
        found = { path, grid };
        break;
      }
    }
    expect(found).not.toBeNull();
    expect(walkable(found!.grid, found!.path)).toBeNull();
  });

  it('reaches an open-yard unit via the ramp', () => {
    const unit = cargo.find((c) => Math.hypot(c.x - PICKS.ground[0], c.y - PICKS.ground[1]) < 0.01)!;
    const grid = buildGrid(cargo, { ignore: new Set([unit.id]) });
    const path = findPath(grid, STRIP, PICKS.ground);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual(STRIP);
    expect(path!.at(-1)).toEqual(PICKS.ground);
    // Down the ramp: the straight line from the platform to the open yard crosses the platform edge elsewhere.
    expect(path!.some(([x, y]) => x >= ramp.x && x <= ramp.x + ramp.w && y >= ramp.y && y <= ramp.y + ramp.h)).toBe(true);
    expect(walkable(grid, path!)).toBeNull();
  });

  it('never crosses cargo or the platform edge', () => {
    const grid = buildGrid(cargo);
    for (const [from, to] of [
      [STRIP, [10, 15]],
      [[50, 12], [60, 35]],
      [[30, 8], [45, 38]],
    ] as [Vec2, Vec2][]) {
      const path = findPath(grid, freeNear(grid, ...from), freeNear(grid, ...to));
      expect(path).not.toBeNull();
      expect(walkable(grid, path!)).toBeNull();
    }
  });

  it('boxed-in unit has no approach', () => {
    const base = cargo[0];
    const unit = (id: string, x: number, y: number): Cargo => ({ ...base, id, x, y, yaw: 0, on: null, areaId: 'OY', loadedOn: null, dims: { l: 1.2, w: 0.8, h: 1 } });
    const target = unit('T', 10, 12);
    const ring = [unit('N', 10, 12 + 0.8 + 0.3), unit('S', 10, 12 - 0.8 - 0.3), unit('E', 10 + 1.2 + 0.3, 12), unit('W', 10 - 1.2 - 0.3, 12)];
    const grid = buildGrid([target, ...ring], { ignore: new Set(['T']) });
    expect(approachFor(grid, target, true)).toBeNull();
    const open = buildGrid([target], { ignore: new Set(['T']) });
    const a = approachFor(open, target, true);
    expect(a).not.toBeNull();
    expect(Math.hypot(a!.stand[0] - 10, a!.stand[1] - 12)).toBeCloseTo(1.45 + 0.6, 6);
  });
});
