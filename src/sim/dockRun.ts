import { forklifts } from '../config/fleet';
import type { Pose } from '../domain/types';
import { fingerprint } from '../loading/candidates';
import { bayOfTruck } from '../loading/frame';
import { useLoading } from '../loading/store';
import { vehicleById } from '../loading/vehicles';
import { useUi } from '../state/ui';
import { useInventory, type Result } from '../world/inventory';
import { entityTime, useControl } from './control';
import { useJobs } from './jobs';
import { buildLoadingRun } from './loadingRun';
import { compileRoute, evalRoute, newPose } from './route';

/**
 * Load at dock (spec §3.1–§3.2): start a confirmed plan's loading run, hand
 * the units to the truck as the forklifts set them down, finish or skip it.
 */

/** Forklifts in order of preference: the one serving the bay, the idle one, then the ramp shuttle and the rest. */
function crew(truckId: string): string[] {
  const serving = forklifts.find((f) => f.serves === truckId)?.id;
  return [...new Set([serving, 'FL-03', 'FL-02', ...forklifts.map((f) => f.id)].filter((id): id is string => !!id))];
}

function poseNow(id: string, t: number): Pose {
  const spec = forklifts.find((f) => f.id === id);
  if (spec?.route) {
    const p = evalRoute(compileRoute(spec.route), entityTime(id, t), newPose());
    return { x: p.x, y: p.y, heading: p.heading };
  }
  return spec?.pose ?? { x: 0, y: 0, heading: 0 };
}

export function startLoading(truckId: string, t: number): Result {
  const truck = useLoading.getState().trucks[truckId];
  if (!truck?.confirmed || truck.status !== 'confirmed') return { ok: false, reason: 'Confirm the plan first' };
  const bay = bayOfTruck(truckId);
  if (!bay || bay.kind !== 'loading') return { ok: false, reason: 'Not at a loading bay' };
  const busy = useJobs.getState().run;
  if (busy) return { ok: false, reason: `${busy.truckId} is being loaded` };
  const cargo = useInventory.getState().cargo;
  const placements = truck.confirmed.placements.filter((p) => !cargo.find((c) => c.id === p.cargoId)?.loadedOn);
  const run = buildLoadingRun({
    truckId,
    bay,
    vehicle: vehicleById(truck.confirmed.vehicle),
    placements,
    cargo,
    forklifts: crew(truckId).map((id) => ({ id, start: poseNow(id, t) })),
    t0: t,
  });
  if (!Object.keys(run.routes).length) return { ok: false, reason: run.notes[0] ?? 'No forklift can reach the dock' };
  useJobs.getState().startRun(run);
  useLoading.getState().setStatus(truckId, 'loading');
  return { ok: true };
}

function finish(truckId: string) {
  useJobs.getState().stopRun();
  useLoading.getState().setStatus(truckId, 'loaded');
  const n = useInventory.getState().cargo.filter((c) => c.loadedOn?.truckId === truckId).length;
  useUi.getState().notify(`Loaded ${n} units onto ${truckId}`);
}

/** Hand over every unit whose set-down time has passed; finish when all are in. */
export function tickLoading(t: number) {
  const jobs = useJobs.getState();
  const run = jobs.run;
  if (!run) return;
  const truck = useLoading.getState().trucks[run.truckId];
  // The plan went away (reset, new day, re-opened): the run is over.
  if (!truck || truck.status !== 'loading' || !truck.confirmed) {
    jobs.stopRun();
    return;
  }
  jobs.tick(t);
  const inv = useInventory.getState();
  const stops = new Map(truck.confirmed.placements.map((p) => [p.cargoId, p.stop]));
  const bay = bayOfTruck(run.truckId)?.id ?? '';
  for (const trip of run.trips) {
    if (trip.skipped || trip.setAt > entityTime(trip.forkliftId, t)) continue;
    const c = useInventory.getState().cargo.find((u) => u.id === trip.cargoId);
    if (!c || c.loadedOn) continue;
    const was = truck.confirmed.units[c.id];
    if (was && fingerprint(c).spot !== was.spot) {
      trip.skipped = `${c.id} was moved by hand`;
      run.notes.push(trip.skipped);
      continue;
    }
    inv.loadOnto(c.id, run.truckId, stops.get(c.id) ?? 1, bay);
  }
  if (run.trips.every((trip) => trip.skipped || trip.setAt <= entityTime(trip.forkliftId, t))) finish(run.truckId);
}

/** Skip the animation: every unit still to come goes on now. */
export function skipRun() {
  const run = useJobs.getState().run;
  if (!run) return;
  // Holds no longer matter once the run is skipped.
  useControl.getState().resume(Object.keys(run.routes));
  tickLoading(Math.max(run.t0, ...run.trips.map((trip) => trip.setAt)) + 0.01);
}

/** A run lost to a page reload (the sim clock restarts): back to confirmed, so Load at dock takes the rest. */
export function recoverRuns() {
  const running = useJobs.getState().run?.truckId;
  for (const t of Object.values(useLoading.getState().trucks)) if (t.status === 'loading' && t.truckId !== running) useLoading.getState().setStatus(t.truckId, 'confirmed');
}
