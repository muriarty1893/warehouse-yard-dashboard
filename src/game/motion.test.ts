import { describe, expect, test } from 'vitest';
import { newPose } from '../sim/route';
import { act } from './engine';
import { dock, TEST_RECIPE } from './fixtures';
import { newShift } from './generate';
import { carriedBy, poseAt, yardUnitsAt } from './motion';
import { recommendPlan } from './planning';

describe('motion', () => {
  test('a unit is not drawn in the yard while carried', () => {
    const s = newShift(TEST_RECIPE);
    dock(s, 'TRUCK-OUT-1', 'L1');
    act(s, { kind: 'confirmPlan', truckId: 'TRUCK-OUT-1', plan: recommendPlan(s, 'TRUCK-OUT-1') }, 0);
    const job = s.jobs.find((j) => j.status === 'active')!;
    const before = (job.pickAt! + 0) / 2;
    expect(yardUnitsAt(s, before).map((c) => c.id)).toContain(job.unitId);
    const during = (job.pickAt! + job.setAt!) / 2;
    expect(yardUnitsAt(s, during).map((c) => c.id)).not.toContain(job.unitId);
    expect(carriedBy(s, job.forkliftId!, during)).toBe(job.unitId);
    expect(carriedBy(s, job.forkliftId!, before)).toBeNull();
  });

  test('a vehicle stays at its route end until the engine catches up, then rests', () => {
    const s = newShift(TEST_RECIPE);
    dock(s, 'TRUCK-OUT-1', 'L1');
    act(s, { kind: 'confirmPlan', truckId: 'TRUCK-OUT-1', plan: recommendPlan(s, 'TRUCK-OUT-1') }, 0);
    const f = s.forklifts.find((x) => x.motion)!;
    const job = s.jobs.find((j) => j.forkliftId === f.id)!;
    const late = poseAt(f.motion, f.pose, f.motion!.until + 5, newPose());
    expect([late.x, late.y]).toEqual([expect.closeTo(job.end!.x, 3), expect.closeTo(job.end!.y, 3)]);
    const rest = poseAt(null, f.pose, 0, newPose());
    expect([rest.x, rest.y, rest.visible]).toEqual([f.pose.x, f.pose.y, true]);
  });
});
