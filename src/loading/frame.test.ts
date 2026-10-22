import { describe, expect, it } from 'vitest';
import { bayById } from '../config/devYard';
import { bayRear, parkInBay } from '../domain/vehicles';
import { bayFitWarning, bayOfTruck, boxToLocal, boxToYard, truckPoseFor } from './frame';
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

  it("finds a parked truck's bay", () => {
    expect(bayOfTruck('TRUCK-102')?.id).toBe('L1');
    expect(bayOfTruck('TRUCK-110')?.id).toBe('P2');
    expect(bayOfTruck('TRUCK-104')).toBeNull();
  });
});
