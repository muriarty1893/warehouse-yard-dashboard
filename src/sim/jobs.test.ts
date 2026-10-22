import { afterEach, describe, expect, it } from 'vitest';
import { bayById, devYard } from '../config/devYard';
import { DEFAULT_ROUTES } from '../config/routes';
import { heightAt } from '../domain/yard';
import { planAll } from '../loading/candidates';
import { boxToYard, truckPoseFor } from '../loading/frame';
import { vehicleById } from '../loading/vehicles';
import { demoCargo } from '../world/demo';
import { useControl } from './control';
import { carriedAt, floorAt, jobPose, useJobs } from './jobs';
import { buildLoadingRun } from './loadingRun';
import { newPose } from './route';

const cargo = demoCargo('normal', 1);
const v = vehicleById('rigid-26');
const plan = planAll([{ truckId: 'TRUCK-102', route: DEFAULT_ROUTES['TRUCK-102'], vehicle: 'rigid-26', include: [], exclude: [], urgent: [] }], cargo, {})['TRUCK-102'];
const run = buildLoadingRun({ truckId: 'TRUCK-102', bay: bayById('L1'), vehicle: v, placements: plan.placements, cargo, forklifts: [{ id: 'FL-01', start: { x: 33, y: 31.2, heading: 0 } }], t0: 10 });

afterEach(() => {
  useJobs.getState().stopRun();
  useControl.setState({ holds: {}, lost: {} });
});

describe('jobs', () => {
  it('drives the forklift and carries the unit between pick and set-down', () => {
    useJobs.getState().startRun(run);
    const trip = run.trips.find((t) => !t.skipped)!;
    const t = (trip.pickAt + trip.setAt) / 2;
    expect(jobPose('FL-01', t, newPose())).not.toBeNull();
    expect(carriedAt('FL-01', t)).toBe(trip.cargoId);
    expect(carriedAt('FL-01', trip.pickAt - 1)).toBeNull();
    useJobs.getState().tick(t);
    expect(useJobs.getState().hidden.has(trip.cargoId)).toBe(true);
    useJobs.getState().tick(trip.pickAt - 1);
    expect(useJobs.getState().hidden.has(trip.cargoId)).toBe(false);
  });

  it('no job, no pose', () => {
    expect(jobPose('FL-01', 20, newPose())).toBeNull();
    expect(jobPose('FL-02', 20, newPose())).toBeNull();
  });

  it('the floor inside the truck is its deck', () => {
    useJobs.getState().startRun(run);
    const pose = truckPoseFor(bayById('L1'), v);
    const [x, y] = boxToYard(pose, v, 3, 1);
    expect(floorAt(x, y)).toBeCloseTo(v.deck, 6);
    expect(floorAt(44, 30.4)).toBeCloseTo(heightAt(devYard, 44, 30.4), 6);
    useJobs.getState().stopRun();
    expect(floorAt(x, y)).toBeCloseTo(heightAt(devYard, x, y), 6);
  });

  it('a held forklift stops on its run too', () => {
    useJobs.getState().startRun(run);
    const trip = run.trips.find((t) => !t.skipped)!;
    const t = (trip.pickAt + trip.setAt) / 2;
    useControl.setState({ holds: { 'FL-01': t }, lost: {} });
    const a = jobPose('FL-01', t, newPose())!;
    const at = { x: a.x, y: a.y };
    const b = jobPose('FL-01', t + 20, newPose())!;
    expect(Math.hypot(b.x - at.x, b.y - at.y)).toBeLessThan(1e-9);
    expect(carriedAt('FL-01', trip.setAt + 5)).toBe(trip.cargoId);
  });
});
