import type { Vec2 } from '../domain/types';
import { Path2, type PathSample } from './path';

/**
 * Scripted motion as a pure function of simulation time: a route is a list of
 * legs (drive along a path, or wait). Evaluating a route at time t returns the
 * full pose, so pausing, scrubbing and fast-forwarding are free.
 */

/** Operational phase of a leg, read by the World State (dashboard statuses). */
export type Phase =
  | 'arriving'
  | 'gate'
  | 'docking'
  | 'working'
  | 'departing'
  | 'departed'
  | 'picking'
  | 'carrying'
  | 'returning'
  | 'walking';

export interface DriveLeg {
  kind: 'drive';
  phase?: Phase;
  path: Vec2[];
  radius?: number | number[];
  reverse?: boolean;
  speed?: number;
  status?: string;
  /** Fork height while driving (forklifts). */
  fork?: number;
  carry?: boolean;
}

export interface WaitLeg {
  kind: 'wait';
  phase?: Phase;
  seconds: number;
  status?: string;
  /** Fork height animated from → to during the wait. */
  fork?: [number, number];
  carry?: boolean;
  /** Rear doors open while waiting (trucks being loaded/unloaded). */
  doors?: boolean;
}

export type Leg = DriveLeg | WaitLeg;

export interface RouteSpec {
  legs: Leg[];
  /** Cruise speed (m/s) and acceleration (m/s²) for drive legs. */
  speed: number;
  accel: number;
  /** Repeat every `period` seconds; defaults to the route duration (seamless loop). */
  period?: number;
  /** Time shift so several vehicles on similar routes do not overlap. */
  offset?: number;
  /** Distance from the fifth wheel to the trailer axles (semi-trucks). */
  trailerLag?: number;
}

export interface RoutePose {
  visible: boolean;
  x: number;
  y: number;
  heading: number;
  trailerHeading: number;
  /** Signed distance travelled; drives wheel rotation. */
  odometer: number;
  fork: number;
  carry: boolean;
  moving: boolean;
  doors: boolean;
  status: string;
  phase: Phase | null;
  /** Index of the current leg and how far through it we are (0–1). */
  leg: number;
  legT: number;
  /** Seconds since the route (re)started, and until it next starts. */
  local: number;
  untilStart: number;
}

interface CompiledDrive {
  kind: 'drive';
  leg: DriveLeg;
  path: Path2;
  t0: number;
  duration: number;
  odo0: number;
  speed: number;
  accel: number;
  fork: number;
}

interface CompiledWait {
  kind: 'wait';
  leg: WaitLeg;
  t0: number;
  duration: number;
  odo0: number;
  /** Pose the vehicle holds while waiting. */
  hold: { x: number; y: number; heading: number; trailerHeading: number };
  fork: [number, number];
}

type Compiled = CompiledDrive | CompiledWait;

export interface CompiledRoute {
  spec: RouteSpec;
  legs: Compiled[];
  duration: number;
  period: number;
}

/** Trapezoidal velocity profile: time to cover L, and distance at time t. */
function profileTime(L: number, v: number, a: number) {
  const dAcc = (v * v) / (2 * a);
  if (L <= 2 * dAcc) return 2 * Math.sqrt(L / a);
  return (2 * v) / a + (L - 2 * dAcc) / v;
}

function profileDistance(t: number, L: number, v: number, a: number, T: number) {
  const dAcc = (v * v) / (2 * a);
  if (L <= 2 * dAcc) {
    const half = T / 2;
    return t < half ? 0.5 * a * t * t : L - 0.5 * a * (T - t) ** 2;
  }
  const tAcc = v / a;
  if (t < tAcc) return 0.5 * a * t * t;
  if (t > T - tAcc) return L - 0.5 * a * (T - t) ** 2;
  return dAcc + v * (t - tAcc);
}

const tmpA: PathSample = { x: 0, y: 0, dir: 0 };
const tmpB: PathSample = { x: 0, y: 0, dir: 0 };

function drivePose(c: CompiledDrive, s: number, lag: number) {
  const p = c.path.at(s, tmpA);
  const heading = c.leg.reverse ? p.dir + Math.PI : p.dir;
  let trailerHeading = heading;
  if (lag > 0 && !c.leg.reverse) {
    const q = c.path.at(s - lag, tmpB);
    trailerHeading = Math.atan2(p.y - q.y, p.x - q.x);
  }
  return { x: p.x, y: p.y, heading, trailerHeading };
}

export function compileRoute(spec: RouteSpec): CompiledRoute {
  const legs: Compiled[] = [];
  const lag = spec.trailerLag ?? 0;
  let t = 0;
  let odo = 0;
  let fork = 0.12;
  let lastHold: CompiledWait['hold'] | null = null;

  for (const leg of spec.legs) {
    if (leg.kind === 'drive') {
      const path = new Path2(leg.path, leg.radius ?? 4);
      const speed = leg.speed ?? spec.speed;
      const duration = profileTime(path.length, speed, spec.accel);
      fork = leg.fork ?? fork;
      const c: CompiledDrive = { kind: 'drive', leg, path, t0: t, duration, odo0: odo, speed, accel: spec.accel, fork };
      legs.push(c);
      lastHold = drivePose(c, path.length, lag);
      t += duration;
      odo += leg.reverse ? -path.length : path.length;
    } else {
      if (!lastHold) throw new Error('A route cannot start with a wait leg');
      const forkRange: [number, number] = leg.fork ?? [fork, fork];
      fork = forkRange[1];
      legs.push({ kind: 'wait', leg, t0: t, duration: leg.seconds, odo0: odo, hold: { ...lastHold }, fork: forkRange });
      t += leg.seconds;
    }
  }
  // A period shorter than the route would cut it off mid-way; never allow that.
  return { spec, legs, duration: t, period: Math.max(spec.period ?? t, t) };
}

const smooth = (u: number) => u * u * (3 - 2 * u);

export function evalRoute(route: CompiledRoute, time: number, out: RoutePose): RoutePose {
  const { period } = route;
  let local = (time - (route.spec.offset ?? 0)) % period;
  if (local < 0) local += period;

  out.local = local;
  out.untilStart = period - local;
  if (local > route.duration) {
    out.visible = false;
    out.phase = null;
    return out;
  }
  out.visible = true;

  let index = route.legs.length - 1;
  for (let i = 0; i < route.legs.length; i++) {
    if (local < route.legs[i].t0 + route.legs[i].duration) {
      index = i;
      break;
    }
  }
  const leg = route.legs[index];
  const u = Math.min(local - leg.t0, leg.duration);
  out.leg = index;
  out.legT = leg.duration > 0 ? u / leg.duration : 1;
  out.phase = leg.leg.phase ?? null;

  if (leg.kind === 'drive') {
    const s = profileDistance(u, leg.path.length, leg.speed, leg.accel, leg.duration);
    const pose = drivePose(leg, s, route.spec.trailerLag ?? 0);
    out.x = pose.x;
    out.y = pose.y;
    out.heading = pose.heading;
    out.trailerHeading = pose.trailerHeading;
    out.odometer = leg.odo0 + (leg.leg.reverse ? -s : s);
    out.fork = leg.fork;
    out.carry = leg.leg.carry ?? false;
    out.moving = u > 0 && u < leg.duration;
    out.doors = false;
    out.status = leg.leg.status ?? '';
  } else {
    out.x = leg.hold.x;
    out.y = leg.hold.y;
    out.heading = leg.hold.heading;
    out.trailerHeading = leg.hold.trailerHeading;
    out.odometer = leg.odo0;
    const k = leg.duration > 0 ? smooth(u / leg.duration) : 1;
    out.fork = leg.fork[0] + (leg.fork[1] - leg.fork[0]) * k;
    out.carry = leg.leg.carry ?? false;
    out.moving = false;
    out.doors = leg.leg.doors ?? false;
    out.status = leg.leg.status ?? '';
  }
  return out;
}

export const newPose = (): RoutePose => ({
  visible: true,
  x: 0,
  y: 0,
  heading: 0,
  trailerHeading: 0,
  odometer: 0,
  fork: 0.12,
  carry: false,
  moving: false,
  doors: false,
  status: '',
  phase: null,
  leg: 0,
  legT: 0,
  local: 0,
  untilStart: 0,
});
