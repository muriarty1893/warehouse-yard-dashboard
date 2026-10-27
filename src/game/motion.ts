import type { Pose } from '../domain/types';
import { compileRoute, evalRoute, type CompiledRoute, type RoutePose, type RouteSpec } from '../sim/route';
import type { GameCargo, Motion, ShiftState } from './types';

/**
 * Where things are at a moment, for the 3D scene (spec §3.2): vehicles on
 * their one-shot routes, units on the forks or in the yard.
 */

const compiled = new WeakMap<RouteSpec, CompiledRoute>();
const routeOf = (spec: RouteSpec) => {
  let r = compiled.get(spec);
  if (!r) compiled.set(spec, (r = compileRoute(spec)));
  return r;
};

/**
 * A vehicle's pose at t: on its route while it lasts (held at the route's end
 * until the engine catches up), else at rest.
 */
export function poseAt(m: Motion | null, rest: Pose, t: number, out: RoutePose): RoutePose {
  if (m) {
    evalRoute(routeOf(m.spec), Math.max(m.t0, Math.min(t, m.until - 1e-6)), out);
    if (out.visible) return out;
  }
  out.visible = true;
  out.x = rest.x;
  out.y = rest.y;
  out.heading = rest.heading;
  out.trailerHeading = rest.heading;
  out.moving = false;
  out.carry = false;
  out.fork = 0.12;
  out.doors = false;
  out.status = '';
  out.phase = null;
  return out;
}

/** A truck's or forklift's pose at t. */
export const motionOf = (v: { motion: Motion | null; pose: Pose }, t: number, out: RoutePose) => poseAt(v.motion, v.pose, t, out);

/** The unit on a forklift's forks at t, if any. */
export function carriedBy(s: ShiftState, forkliftId: string, t: number): string | null {
  const f = s.forklifts.find((x) => x.id === forkliftId);
  const job = f?.jobId ? s.jobs.find((j) => j.id === f.jobId) : undefined;
  if (!job || job.pickAt === null || job.setAt === null) return null;
  return job.pickAt <= t && t < job.setAt ? job.unitId : null;
}

/** Units to draw in the yard at t: not aboard, not gone, not on the forks, and unloads only once set down. */
export function yardUnitsAt(s: ShiftState, t: number): GameCargo[] {
  return s.cargo.filter((c) => {
    if (c.gone) return false;
    const job = c.transitJob ? s.jobs.find((j) => j.id === c.transitJob) : undefined;
    if (job?.kind === 'unload') return job.setAt !== null && t >= job.setAt;
    if (c.loadedOn) return false;
    if (job && job.pickAt !== null && t >= job.pickAt) return job.kind === 'move' && job.setAt !== null && t >= job.setAt;
    return true;
  });
}
