import { describe, expect, test } from 'vitest';
import { FORKLIFT } from '../domain/vehicles';
import { buildGrid } from '../sim/grid';
import { compileRoute, evalRoute, newPose } from '../sim/route';
import { boxedInFixture, loadFixture, unloadFixture, yardOf } from './fixtures';
import { loadRoute, moveRoute, unloadRoute } from './legs';
import { FORKLIFT_HOMES } from './places';

describe('forklift job routes', () => {
  test('a load trip waits for the truck to be free and ends at the dock face', () => {
    const { s, unit, truck, placement } = loadFixture();
    const r = loadRoute({ from: FORKLIFT_HOMES['FL-01'], grid: buildGrid(yardOf(s)), cargo: yardOf(s), unit, truck, placement, t0: 0, truckFreeAt: 500 })!;
    expect(r).not.toBeNull();
    expect(r.enterAt!).toBeGreaterThanOrEqual(501.5);
    expect(r.pickAt).toBeLessThan(r.setAt);
    expect(r.leaveAt!).toBeGreaterThan(r.setAt - 1e-6);
    expect(r.doneAt).toBeCloseTo(compileRoute(r.spec).duration, 3);
  });

  test('an unload trip sets the unit down at its spot', () => {
    const { s, truck, placement, unit } = unloadFixture();
    const spot = { x: 20, y: 18, yaw: 0 };
    const r = unloadRoute({ from: FORKLIFT_HOMES['FL-02'], grid: buildGrid(yardOf(s)), cargo: yardOf(s), unit, truck, placement, spot, t0: 0, truckFreeAt: -Infinity })!;
    expect(r).not.toBeNull();
    const p = evalRoute(compileRoute(r.spec), r.setAt, newPose());
    expect(Math.hypot(p.x - spot.x, p.y - spot.y)).toBeLessThan(FORKLIFT.carryOffset + 0.3);
    expect(r.enterAt!).toBeLessThan(r.pickAt);
    expect(r.leaveAt!).toBeLessThan(r.setAt);
  });

  test('a move trip carries a yard unit to another spot', () => {
    const { s, unit } = loadFixture();
    const spot = { x: 20, y: 18, yaw: 0 };
    const r = moveRoute({ from: FORKLIFT_HOMES['FL-02'], grid: buildGrid(yardOf(s)), cargo: yardOf(s), unit, spot, t0: 10 })!;
    expect(r).not.toBeNull();
    expect(r.enterAt).toBeNull();
    const p = evalRoute(compileRoute(r.spec), r.setAt, newPose());
    expect(Math.hypot(p.x - spot.x, p.y - spot.y)).toBeLessThan(FORKLIFT.carryOffset + 0.3);
    expect(r.pickAt).toBeGreaterThan(10);
  });

  test('no route to a boxed-in unit', () => expect(loadRoute(boxedInFixture())).toBeNull());
});
