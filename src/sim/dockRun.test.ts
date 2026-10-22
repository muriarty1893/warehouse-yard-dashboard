import { beforeEach, describe, expect, it } from 'vitest';
import { useLoading } from '../loading/store';
import { demoCargo } from '../world/demo';
import { useInventory } from '../world/inventory';
import { recoverRuns, skipRun, startLoading, tickLoading } from './dockRun';
import { useJobs } from './jobs';

const truck = () => useLoading.getState().trucks['TRUCK-102'];
const loaded = () => useInventory.getState().cargo.filter((c) => c.loadedOn?.truckId === 'TRUCK-102').length;

beforeEach(() => {
  useJobs.getState().stopRun();
  useInventory.setState({ cargo: demoCargo('normal', 1), documents: [], events: [], epoch: 0 });
  useLoading.getState().resetAll();
  const plan = truck().recommended!;
  useLoading.getState().confirm('TRUCK-102', plan.checks.ok ? undefined : { overrideReason: 'test' });
});

describe('load at dock', () => {
  it('only a confirmed plan at a loading bay can be loaded, one truck at a time', () => {
    expect(startLoading('TRUCK-110', 0).ok).toBe(false);
    expect(startLoading('TRUCK-102', 0).ok).toBe(true);
    expect(truck().status).toBe('loading');
    expect(startLoading('TRUCK-102', 0).ok).toBe(false);
  });

  it('units are loaded as the forklifts set them down, then the truck is loaded', () => {
    startLoading('TRUCK-102', 0);
    const run = useJobs.getState().run!;
    const trips = run.trips.filter((t) => !t.skipped);
    tickLoading(trips[0].setAt + 0.01);
    expect(loaded()).toBe(1);
    tickLoading(Math.max(...trips.map((t) => t.setAt)) + 0.01);
    expect(loaded()).toBe(trips.length);
    expect(truck().status).toBe('loaded');
    expect(useJobs.getState().run).toBeNull();
  });

  it('a unit moved by hand mid-run is not loaded', () => {
    startLoading('TRUCK-102', 0);
    const trip = useJobs.getState().run!.trips.find((t) => !t.skipped)!;
    const unit = useInventory.getState().cargo.find((c) => c.id === trip.cargoId)!;
    useInventory.setState({ cargo: useInventory.getState().cargo.map((c) => (c.id === unit.id ? { ...c, x: c.x + 0.5 } : c)) });
    tickLoading(trip.setAt + 0.01);
    expect(useInventory.getState().cargo.find((c) => c.id === unit.id)?.loadedOn ?? null).toBeNull();
    expect(trip.skipped).toBe(`${unit.id} was moved by hand`);
  });

  it('skip loads everything left at once', () => {
    startLoading('TRUCK-102', 0);
    const n = useJobs.getState().run!.trips.filter((t) => !t.skipped).length;
    skipRun();
    expect(loaded()).toBe(n);
    expect(truck().status).toBe('loaded');
  });

  it('a run lost to a reload goes back to confirmed and loads the rest', () => {
    startLoading('TRUCK-102', 0);
    const first = useJobs.getState().run!.trips.find((t) => !t.skipped)!;
    tickLoading(first.setAt + 0.01);
    useJobs.getState().stopRun();
    recoverRuns();
    expect(truck().status).toBe('confirmed');
    expect(startLoading('TRUCK-102', 0).ok).toBe(true);
    expect(useJobs.getState().run!.trips.map((t) => t.cargoId)).not.toContain(first.cargoId);
  });
});
