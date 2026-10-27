import { describe, expect, test } from 'vitest';
import { bayById } from '../config/devYard';
import { compileRoute, evalRoute, newPose } from '../sim/route';
import { departRoute, dockRoute, kerbSlot, parkedPose } from './places';

describe('truck places', () => {
  test('kerb slots line up east of the gate, facing west', () => {
    expect(kerbSlot(0)).toEqual({ x: 57, y: -1.8, heading: Math.PI });
    expect(kerbSlot(2).x).toBe(82);
  });

  test.each(['L1', 'L2', 'L3', 'L4'])('a docking truck ends parked in bay %s', (id) => {
    const bay = bayById(id);
    const r = compileRoute(dockRoute(kerbSlot(0), bay, 100));
    const p = evalRoute(r, 100 + r.duration - 1e-6, newPose()); // a once-route is invisible past its end; float drift can put the exact end past it
    expect(p.x).toBeCloseTo(parkedPose(bay).x, 1);
    expect(p.y).toBeCloseTo(parkedPose(bay).y, 1);
  });

  test('a departing truck clears its bay before it reaches the gate', () => {
    const { spec, clearAt } = departRoute(bayById('L1'), 50);
    expect(clearAt).toBeGreaterThan(50);
    expect(clearAt).toBeLessThan(50 + compileRoute(spec).duration);
  });
});
