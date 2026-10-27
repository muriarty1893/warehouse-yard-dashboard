import { describe, expect, it } from 'vitest';
import { bayById } from '../config/devYard';
import { bayRear, parkInBay } from '../domain/vehicles';
import { bayFitWarning, bayOfTruck, boxToLocal, boxToYard, rigidLayout, truckPoseFor, yardToBox } from './frame';
import { setPlanSource } from './store';
import { vehicleById } from './vehicles';

const L1 = bayById('L1');

describe('box frame', () => {
  it("rigid-26 parks where the yard's trucks park", () => {
    const a = truckPoseFor(L1, vehicleById('rigid-26'));
    const b = parkInBay(L1, 'rigid');
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.001);
    expect(a.heading).toBe(b.heading);
  });

  it("box front wall and doors map to the truck's ends", () => {
    const v = vehicleById('rigid-26');
    const pose = truckPoseFor(L1, v);
    const [dx, dy] = boxToYard(pose, v, v.inner.l, v.inner.w / 2);
    const [rx, ry] = bayRear(L1);
    const want = [rx + Math.cos(L1.heading) * 0.25, ry + Math.sin(L1.heading) * 0.25];
    expect(Math.hypot(dx - want[0], dy - want[1])).toBeLessThan(0.15);
    const [fx, fy] = boxToYard(pose, v, 0, v.inner.w / 2);
    expect(Math.hypot(fx - dx, fy - dy)).toBeCloseTo(v.inner.l, 6);
    expect(boxToLocal(v, 0)).toBe(4.2);
  });

  it('y runs across the box from the right wall', () => {
    const v = vehicleById('rigid-26');
    const pose = truckPoseFor(L1, v);
    const [ax, ay] = boxToYard(pose, v, 1, 0);
    const [bx, by] = boxToYard(pose, v, 1, v.inner.w);
    expect(Math.hypot(ax - bx, ay - by)).toBeCloseTo(v.inner.w, 6);
    // Facing south (L1), the right wall is to the west.
    expect(ax).toBeLessThan(bx);
  });

  it('semi overhangs bay L1', () => {
    expect(bayFitWarning(L1, vehicleById('semi-136'))).toMatch(/longer than bay L1/);
    expect(bayFitWarning(L1, vehicleById('rigid-26'))).toBeNull();
  });

  it("asks the plan source for a truck's bay", () => {
    setPlanSource({ trucks: () => [], cargo: () => [], bayOf: (id) => (id === 'T-1' ? bayById('L2') : null), papersMissing: () => false, onConfirm: () => ({ ok: true }) });
    expect(bayOfTruck('T-1')?.id).toBe('L2');
    expect(bayOfTruck('T-2')).toBeNull();
  });

  it("rigid model for rigid-26 keeps today's proportions", () => {
    const r = rigidLayout(vehicleById('rigid-26'));
    expect(r.boxCenter).toBeCloseTo(0.45, 2);
    expect(r.boxLength).toBeCloseTo(7.7, 2);
    expect(r.boxHeight).toBeCloseTo(2.85, 2);
    expect(r.boxY).toBeCloseTo(2.48, 2);
    expect(r.frontAxle).toBeCloseTo(5.3, 2);
    expect(r.rearAxles).toEqual([0, -1.3]);
    expect(r.cabFront).toBeCloseTo(7.05, 2);
    expect(r.rearX).toBeCloseTo(-3.4, 2);
    expect(r.frame).toEqual({ x: expect.closeTo(1.9, 2), l: expect.closeTo(8.6, 2) });
  });

  it('shorter rigids keep their doors and axles where the statics put them', () => {
    const v = vehicleById('rigid-18');
    const r = rigidLayout(v);
    expect(r.rearX).toBeCloseTo(-v.model.doorsToOrigin, 6);
    // The rear axle stands at box x 4.6 (statics) — model x 0.
    expect(boxToLocal(v, 4.6)).toBeCloseTo(r.rearAxles[0], 6);
    expect(boxToLocal(v, -1.2)).toBeCloseTo(r.frontAxle, 6);
  });

  it('yardToBox undoes boxToYard', () => {
    const v = vehicleById('rigid-26');
    const pose = truckPoseFor(L1, v);
    const [x, y] = boxToYard(pose, v, 2.5, 0.7);
    const [bx, by] = yardToBox(pose, v, x, y);
    expect(bx).toBeCloseTo(2.5, 9);
    expect(by).toBeCloseTo(0.7, 9);
  });
});
