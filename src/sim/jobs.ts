import { create } from 'zustand';
import { devYard } from '../config/devYard';
import { heightAt } from '../domain/yard';
import { yardToBox } from '../loading/frame';
import { vehicleById } from '../loading/vehicles';
import { entityTime } from './control';
import type { LoadingRun } from './loadingRun';
import { compileRoute, evalRoute, type CompiledRoute, type RoutePose } from './route';

/**
 * The loading run in progress (spec §3.1): its forklift routes compiled once,
 * and which units have left their yard spot. Forklifts on a job follow it
 * instead of their usual route. Job time is the forklift's own time, so a
 * hold (or Stop all) stops it on its run too.
 */
interface JobsState {
  run: LoadingRun | null;
  compiled: Record<string, CompiledRoute>;
  /** Units picked up so far: no longer drawn at their yard spot. */
  hidden: Set<string>;
  startRun: (run: LoadingRun) => void;
  stopRun: () => void;
  tick: (t: number) => void;
}

export const useJobs = create<JobsState>((set, get) => ({
  run: null,
  compiled: {},
  hidden: new Set(),
  startRun: (run) => set({ run, compiled: Object.fromEntries(Object.entries(run.routes).map(([id, spec]) => [id, compileRoute(spec)])), hidden: new Set() }),
  stopRun: () => set({ run: null, compiled: {}, hidden: new Set() }),
  tick: (t) => {
    const run = get().run;
    if (!run) return;
    const picked = run.trips.filter((trip) => !trip.skipped && trip.pickAt <= entityTime(trip.forkliftId, t)).map((trip) => trip.cargoId);
    const now = get().hidden;
    if (picked.length !== now.size || picked.some((id) => !now.has(id))) set({ hidden: new Set(picked) });
  },
}));

/** A forklift's pose on its job at time t, or null when it has none (or it is over). */
export function jobPose(forkliftId: string, t: number, out: RoutePose): RoutePose | null {
  const route = useJobs.getState().compiled[forkliftId];
  if (!route) return null;
  evalRoute(route, entityTime(forkliftId, t), out);
  return out.visible ? out : null;
}

/** The unit on a forklift's forks at time t. */
export function carriedAt(forkliftId: string, t: number): string | null {
  const run = useJobs.getState().run;
  const own = entityTime(forkliftId, t);
  return run?.trips.find((trip) => trip.forkliftId === forkliftId && !trip.skipped && trip.pickAt <= own && own < trip.setAt)?.cargoId ?? null;
}

/** Floor height for a forklift: the truck's deck inside the box being loaded, else the yard's floor. */
export function floorAt(x: number, y: number): number {
  const run = useJobs.getState().run;
  if (run) {
    const v = vehicleById(run.vehicle);
    const [bx, by] = yardToBox(run.pose, v, x, y);
    if (bx >= -0.1 && bx <= v.inner.l + 0.1 && by >= -0.1 && by <= v.inner.w + 0.1) return v.deck;
  }
  return heightAt(devYard, x, y);
}
