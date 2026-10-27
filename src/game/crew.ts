import { bayById, devYard } from '../config/devYard';
import type { Cargo } from '../domain/types';
import { bayRear } from '../domain/vehicles';
import { areaAt } from '../domain/yard';
import type { Placement } from '../loading/types';
import { vehicleById } from '../loading/vehicles';
import { buildGrid } from '../sim/grid';
import { recommendSpot } from '../world/placement';
import { loadRoute, moveRoute, unloadRoute, type JobRoute, type YardSpot } from './legs';
import { post } from './ledger';
import type { Due, GameCargo, GameEvent, GameForklift, Job, JobGroup, JobKind, ShiftState } from './types';

/**
 * The forklift crew (spec §1.4): jobs grouped per order, groups in the
 * player's priority order, the next job of the highest group that can start
 * goes to the nearest free forklift. Order inside a group is fixed.
 */

const nextId = (s: ShiftState, prefix: string) => `${prefix}${++s.seq}`;
const jobOf = (s: ShiftState, id: string | null) => (id ? s.jobs.find((j) => j.id === id) : undefined);
const unitOf = (s: ShiftState, id: string) => s.cargo.find((c) => c.id === id);

export function addGroup(s: ShiftState, def: { kind: JobKind; label: string; truckId: string | null; areaId: string | null; units: { unitId: string; placement: Placement | null }[] }): JobGroup {
  const group: JobGroup = { id: nextId(s, 'G'), kind: def.kind, label: def.label, truckId: def.truckId, areaId: def.areaId, jobIds: [] };
  for (const u of def.units) {
    const job: Job = {
      id: nextId(s, 'J'),
      kind: def.kind,
      groupId: group.id,
      unitId: u.unitId,
      truckId: def.truckId,
      placement: u.placement,
      areaId: def.areaId,
      status: 'queued',
      blocked: null,
      forkliftId: null,
      pickAt: null,
      setAt: null,
      doneAt: null,
      enterAt: null,
      leaveAt: null,
      end: null,
      picked: false,
      set: false,
    };
    s.jobs.push(job);
    group.jobIds.push(job.id);
  }
  s.groups.push(group);
  return group;
}

export function moveGroup(s: ShiftState, groupId: string, to: number) {
  const from = s.groups.findIndex((g) => g.id === groupId);
  if (from < 0) return;
  const [g] = s.groups.splice(from, 1);
  s.groups.splice(Math.max(0, Math.min(to, s.groups.length)), 0, g);
}

export const forkliftFree = (f: GameForklift, t: number) =>
  !f.jobId && (f.brokenUntil === null || f.brokenUntil <= t) && (f.arrivesAt === null || f.arrivesAt <= t) && (f.leaveAt === null || t < f.leaveAt);

/**
 * What stands on the yard floor for planning paths and spots: units in the
 * yard (not yet lifted for loading) and units an unload has already reserved
 * a spot for, as if they were there.
 */
export function standing(s: ShiftState, except?: string): Cargo[] {
  const out: Cargo[] = [];
  for (const c of s.cargo) {
    if (c.gone || c.id === except) continue;
    const job = jobOf(s, c.transitJob);
    if (job?.kind === 'unload') out.push({ ...c, loadedOn: null });
    else if (!c.loadedOn && !(job?.kind === 'load' && job.picked)) out.push(c);
  }
  return out;
}

function spotFor(s: ShiftState, unit: GameCargo, areaId: string | null): YardSpot | null {
  const spot = recommendSpot(standing(s, unit.id), unit, areaId ? { areaId } : {});
  if (!spot) return null;
  return 'on' in spot ? { on: spot.on } : { x: spot.x, y: spot.y, yaw: spot.yaw };
}

function pickupPoint(s: ShiftState, job: Job, unit: GameCargo): [number, number] {
  if (job.kind === 'unload' && job.truckId) {
    const tr = s.trucks.find((t) => t.id === job.truckId);
    if (tr?.bayId) return bayRear(bayById(tr.bayId));
  }
  return [unit.x, unit.y];
}

function planRoute(s: ShiftState, job: Job, unit: GameCargo, f: GameForklift, spot: YardSpot | null, t: number): JobRoute | null {
  const tr = job.truckId ? s.trucks.find((x) => x.id === job.truckId) : undefined;
  const truckAt = tr?.bayId ? { pose: tr.pose, vehicle: vehicleById(tr.vehicle), bay: bayById(tr.bayId) } : null;
  if (job.kind === 'load') {
    const cargo = standing(s);
    if (!truckAt || !job.placement) return null;
    return loadRoute({ from: f.pose, grid: buildGrid(cargo), cargo, unit, truck: truckAt, placement: job.placement, t0: t, truckFreeAt: tr!.busyUntil });
  }
  const cargo = standing(s, unit.id);
  if (job.kind === 'unload') {
    if (!truckAt || !job.placement || !spot) return null;
    return unloadRoute({ from: f.pose, grid: buildGrid(cargo), cargo, unit, truck: truckAt, placement: job.placement, spot, t0: t, truckFreeAt: tr!.busyUntil });
  }
  if (!spot) return null;
  const withUnit = [...cargo, unit];
  return moveRoute({ from: f.pose, grid: buildGrid(withUnit), cargo: withUnit, unit, spot, t0: t });
}

function assign(s: ShiftState, job: Job, unit: GameCargo, f: GameForklift, r: JobRoute, spot: YardSpot | null, t: number) {
  Object.assign(job, { status: 'active', forkliftId: f.id, pickAt: r.pickAt, setAt: r.setAt, doneAt: r.doneAt, enterAt: r.enterAt, leaveAt: r.leaveAt, end: r.end, blocked: null });
  f.jobId = job.id;
  f.motion = { spec: r.spec, t0: t, until: r.doneAt };
  const tr = job.truckId ? s.trucks.find((x) => x.id === job.truckId) : undefined;
  if (tr && r.leaveAt !== null) tr.busyUntil = Math.max(tr.busyUntil, r.leaveAt);
  unit.transitJob = job.id;
  if (spot) {
    if ('on' in spot) {
      const base = unitOf(s, spot.on)!;
      Object.assign(unit, { x: base.x, y: base.y, yaw: base.yaw, on: base.id, areaId: base.areaId });
    } else {
      Object.assign(unit, { x: spot.x, y: spot.y, yaw: spot.yaw, on: null, areaId: areaAt(devYard, spot.x, spot.y)?.id ?? null });
    }
  }
}

/** Give free forklifts the next startable job of the highest group, nearest forklift first. */
export function dispatch(s: ShiftState, t: number) {
  if (s.over) return;
  for (let assigned = true; assigned; ) {
    assigned = false;
    const free = s.forklifts.filter((f) => forkliftFree(f, t));
    if (!free.length) return;
    for (const group of s.groups) {
      const job = group.jobIds.map((id) => jobOf(s, id)!).find((j) => j.status === 'queued');
      if (!job) continue;
      const tr = job.truckId ? s.trucks.find((x) => x.id === job.truckId) : undefined;
      if (tr && (tr.stage !== 'docked' || tr.dispatchPending)) continue;
      const unit = unitOf(s, job.unitId);
      if (!unit || unit.gone) continue;
      let spot: YardSpot | null = null;
      if (job.kind !== 'load') {
        spot = spotFor(s, unit, job.areaId);
        if (!spot) {
          job.blocked = 'Area full';
          continue;
        }
      }
      const [px, py] = pickupPoint(s, job, unit);
      const order = [...free].sort((a, b) => Math.hypot(a.pose.x - px, a.pose.y - py) - Math.hypot(b.pose.x - px, b.pose.y - py) || a.id.localeCompare(b.id));
      let route: JobRoute | null = null;
      let by: GameForklift | null = null;
      for (const f of order) {
        route = planRoute(s, job, unit, f, spot, t);
        if (route) {
          by = f;
          break;
        }
      }
      if (!route || !by) {
        job.blocked = 'No forklift access';
        continue;
      }
      assign(s, job, unit, by, route, spot, t);
      assigned = true;
      break;
    }
  }
}

/** The next step of every active job: lift (order 10), set down (11), forklift free (12). */
export function crewDue(s: ShiftState): Due[] {
  const out: Due[] = [];
  for (const job of s.jobs) {
    if (job.status !== 'active') continue;
    if (!job.picked) out.push({ t: job.pickAt!, order: 10, id: job.id, run: () => pick(s, job) });
    else if (!job.set) out.push({ t: job.setAt!, order: 11, id: job.id, run: () => setDown(s, job) });
    else out.push({ t: job.doneAt!, order: 12, id: job.id, run: () => done(s, job) });
  }
  return out;
}

function pick(s: ShiftState, job: Job): GameEvent[] {
  job.picked = true;
  if (job.kind === 'unload') {
    const tr = s.trucks.find((x) => x.id === job.truckId);
    if (tr) tr.aboard = tr.aboard.filter((id) => id !== job.unitId);
  }
  return [];
}

function setDown(s: ShiftState, job: Job): GameEvent[] {
  job.set = true;
  const unit = unitOf(s, job.unitId);
  if (!unit) return [];
  unit.transitJob = null;
  if (job.kind === 'load') {
    const tr = s.trucks.find((x) => x.id === job.truckId);
    unit.loadedOn = { truckId: job.truckId!, stop: job.placement?.stop ?? 1 };
    unit.areaId = null;
    if (tr && !tr.aboard.includes(unit.id)) tr.aboard.push(unit.id);
    return [];
  }
  if (job.kind === 'unload') {
    unit.loadedOn = null;
    const area = devYard.storage.find((a) => a.id === unit.areaId);
    return [post(s, { t: job.setAt!, kind: 'handling', amount: s.prices.handling, text: `${unit.id} stored in ${area?.name ?? 'the yard'}`, ref: unit.id })];
  }
  return [];
}

function done(s: ShiftState, job: Job): GameEvent[] {
  job.status = 'done';
  const f = s.forklifts.find((x) => x.id === job.forkliftId);
  if (!f) return [];
  f.jobId = null;
  f.motion = null;
  if (job.end) f.pose = job.end;
  if (f.breakdownPendingSec !== null) {
    f.brokenUntil = job.doneAt! + f.breakdownPendingSec;
    f.breakdownPendingSec = null;
  }
  return [];
}
