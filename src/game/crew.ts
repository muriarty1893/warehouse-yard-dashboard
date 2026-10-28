import { bayById, devYard } from '../config/devYard';
import type { Cargo } from '../domain/types';
import { bayRear } from '../domain/vehicles';
import { areaAt } from '../domain/yard';
import type { Placement } from '../loading/types';
import { vehicleById } from '../loading/vehicles';
import { approachFor, buildGrid, clearUnit, reachUnit, restoreUnit, type Grid } from '../sim/grid';
import { recommendSpot } from '../world/placement';
import { loadRoute, moveRoute, unloadRoute, type JobRoute, type YardSpot } from './legs';
import { FORKLIFT_HOMES, TEMP_IN } from './places';
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

// ---------------------------------------------------------------------------
// The yard grid, cached while nothing in the yard changes (derived data, not state)

/** Everything about the yard that paths and spots depend on. */
function yardKey(s: ShiftState): string {
  let k = '';
  for (const c of s.cargo) {
    const job = c.transitJob ? jobOf(s, c.transitJob) : undefined;
    k += `${c.id}:${c.x},${c.y},${c.yaw},${c.on ?? ''},${c.gone ? 1 : 0}${c.loadedOn ? 1 : 0},${c.transitJob ?? ''}${job?.picked ? 1 : 0};`;
  }
  return k;
}

const yardCache = new WeakMap<ShiftState, { key: string; cargo: Cargo[]; grid: Grid }>();

function yard(s: ShiftState) {
  const key = yardKey(s);
  const hit = yardCache.get(s);
  if (hit?.key === key) return hit;
  const cargo = standing(s);
  const fresh = { key, cargo, grid: buildGrid(cargo) };
  yardCache.set(s, fresh);
  return fresh;
}

/** Run `fn` on the yard's cargo and grid, with `without` taken out of both (the grid is restored after). */
function withYard<T>(s: ShiftState, without: string | null, fn: (cargo: Cargo[], grid: Grid) => T): T {
  const y = yard(s);
  const out = without ? y.cargo.find((c) => c.id === without) : undefined;
  const cargo = out ? y.cargo.filter((c) => c !== out) : y.cargo;
  if (out) clearUnit(y.grid, out);
  try {
    return fn(cargo, y.grid);
  } finally {
    if (out) restoreUnit(y.grid, out);
  }
}

/** Where a forklift goes back to after a yard job. */
const parkOf = (f: GameForklift) => FORKLIFT_HOMES[f.id] ?? TEMP_IN;

/** Floor cells a forklift can drive to from `from` (8 neighbours, no steps higher than a ramp). */
function openFloor(g: Grid, from: [number, number]): Uint8Array {
  const seen = new Uint8Array(g.nx * g.ny);
  const i0 = Math.floor((from[0] - g.x0) / g.cell);
  const j0 = Math.floor((from[1] - g.y0) / g.cell);
  if (i0 < 0 || j0 < 0 || i0 >= g.nx || j0 >= g.ny) return seen;
  const queue = [j0 * g.nx + i0];
  seen[queue[0]] = 1;
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q];
    const i = k % g.nx;
    const j = (k - i) / g.nx;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ii = i + di;
        const jj = j + dj;
        if ((!di && !dj) || ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
        const n = jj * g.nx + ii;
        if (seen[n] || g.blocked[n] || Math.abs(g.h[n] - g.h[k]) > 0.3) continue;
        if (di && dj && (g.blocked[j * g.nx + ii] || g.blocked[jj * g.nx + i])) continue;
        seen[n] = 1;
        queue.push(n);
      }
  }
  return seen;
}

const cellIn = (g: Grid, open: Uint8Array, p: [number, number]) => {
  const i = Math.floor((p[0] - g.x0) / g.cell);
  const j = Math.floor((p[1] - g.y0) / g.cell);
  return i >= 0 && j >= 0 && i < g.nx && j < g.ny && !!open[j * g.nx + i];
};

/** Yard units an outbound truck still in play will want: their access must stay open. */
function wanted(s: ShiftState, cargo: Cargo[]): Cargo[] {
  const stops = new Set(s.trucks.filter((t) => t.kind === 'outbound' && t.stage !== 'departing' && t.stage !== 'gone').flatMap((t) => t.stops));
  return cargo.filter((c) => stops.has(c.destination));
}

/**
 * The best spot in the area that a forklift can drive up to, and that
 * doesn't wall in a unit an outbound truck still needs.
 */
const spotMemo = new WeakMap<ShiftState, { yard: string; spots: Map<string, YardSpot | null> }>();

function spotFor(s: ShiftState, unit: GameCargo, areaId: string | null): YardSpot | null {
  const y = yard(s).key;
  let memo = spotMemo.get(s);
  if (memo?.yard !== y) spotMemo.set(s, (memo = { yard: y, spots: new Map() }));
  const inPlay = s.trucks.filter((t) => t.kind === 'outbound' && t.stage !== 'departing' && t.stage !== 'gone').map((t) => t.id).join(',');
  const key = `${unit.id}|${areaId}|${inPlay}`;
  if (!memo.spots.has(key)) memo.spots.set(key, findSpot(s, unit, areaId));
  return memo.spots.get(key)!;
}

function findSpot(s: ShiftState, unit: GameCargo, areaId: string | null): YardSpot | null {
  return withYard(s, unit.id, (cargo, grid) => {
    const dock = bayRear(bayById(s.recipe.bays[0]));
    const from: [number, number] = [dock[0], dock[1] + 2.5];
    const before = openFloor(grid, from);
    // Units an outbound truck still wants, that a forklift can get to from the bays today.
    const keep = wanted(s, cargo)
      .filter((c) => !c.on)
      .map((c) => ({ c, a: reachUnit(grid, cargo, c) }))
      .filter((k) => k.a && cellIn(grid, before, k.a.stand));
    const accept = (sp: YardSpot) => {
      if ('on' in sp) {
        const base = cargo.find((c) => c.id === sp.on);
        return !!base && !keep.some((k) => k.c === base) && !!reachUnit(grid, cargo, base);
      }
      const ghost: Cargo = { ...unit, x: sp.x, y: sp.y, yaw: sp.yaw, on: null };
      const own = approachFor(grid, ghost, true);
      if (!own || !cellIn(grid, before, own.stand)) return false;
      restoreUnit(grid, ghost);
      try {
        const after = openFloor(grid, from);
        return keep.every((k) => {
          const a = Math.hypot(k.c.x - sp.x, k.c.y - sp.y) < 4.5 ? reachUnit(grid, cargo, k.c) : k.a;
          return !!a && cellIn(grid, after, a.stand);
        });
      } finally {
        clearUnit(grid, ghost);
      }
    };
    const spot = recommendSpot(cargo, unit, { ...(areaId ? { areaId } : {}), accept });
    if (!spot) return null;
    return 'on' in spot ? { on: spot.on } : { x: spot.x, y: spot.y, yaw: spot.yaw };
  });
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
    if (!truckAt || !job.placement) return null;
    return withYard(s, null, (cargo, grid) => loadRoute({ from: f.pose, grid, cargo, unit, truck: truckAt, placement: job.placement!, t0: t, truckFreeAt: tr!.busyUntil }));
  }
  if (job.kind === 'unload') {
    if (!truckAt || !job.placement || !spot) return null;
    return withYard(s, unit.id, (cargo, grid) => unloadRoute({ from: f.pose, grid, cargo, unit, truck: truckAt, placement: job.placement!, spot, t0: t, truckFreeAt: tr!.busyUntil, park: parkOf(f) }));
  }
  if (!spot) return null;
  return withYard(s, null, (cargo, grid) => moveRoute({ from: f.pose, grid, cargo, unit, spot, t0: t, park: parkOf(f) }));
}

/**
 * A truck's next job can't be done and won't be by waiting: it was tried just
 * now, with the yard as it is and every forklift free, and nothing could do it.
 */
export function jobStuck(s: ShiftState, truckId: string, t: number): boolean {
  const next = s.jobs.find((j) => j.truckId === truckId && j.kind === 'load' && j.status === 'queued');
  if (!next?.blocked || s.jobs.some((j) => j.truckId === truckId && j.status === 'active')) return false;
  const free = s.forklifts.filter((f) => forkliftFree(f, t));
  return free.length === s.forklifts.filter((f) => !f.temp || f.arrivesAt === null).length && lastTry.get(next) === tryKey(s, free);
}

/** Inputs a blocked job was last tried with; the same inputs give the same answer, so it isn't retried. */
const lastTry = new WeakMap<Job, string>();
const tryKey = (s: ShiftState, free: GameForklift[]) => `${yard(s).key}|${free.map((f) => `${f.id}@${f.pose.x},${f.pose.y}`).join(';')}`;

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
/**
 * The jobs of a group that may start now: the first queued one (loads and
 * unloads keep their order), or for moves any queued unit with nothing left
 * on top of it (a boxed-in unit doesn't hold up the rest).
 */
function startable(s: ShiftState, group: JobGroup): Job[] {
  const queued = group.jobIds.map((id) => jobOf(s, id)!).filter((j) => j.status === 'queued');
  if (group.kind !== 'move') return queued.slice(0, 1);
  const waiting = new Set(queued.map((j) => j.unitId));
  return queued.filter((j) => !s.cargo.some((c) => c.on === j.unitId && !c.gone && waiting.has(c.id)));
}

/** Try one job: spot, nearest forklift that can route it, assign. Returns whether it started. */
function tryJob(s: ShiftState, job: Job, free: GameForklift[], t: number): boolean {
  const tr = job.truckId ? s.trucks.find((x) => x.id === job.truckId) : undefined;
  if (tr && (tr.stage !== 'docked' || tr.dispatchPending)) return false;
  const unit = unitOf(s, job.unitId);
  if (!unit || unit.gone) return false;
  const key = tryKey(s, free);
  if (job.blocked && lastTry.get(job) === key) return false;
  lastTry.set(job, key);
  let spot: YardSpot | null = null;
  if (job.kind !== 'load') {
    spot = spotFor(s, unit, job.areaId);
    if (!spot) {
      job.blocked = 'Area full';
      return false;
    }
  }
  const [px, py] = pickupPoint(s, job, unit);
  const order = [...free].sort((a, b) => Math.hypot(a.pose.x - px, a.pose.y - py) - Math.hypot(b.pose.x - px, b.pose.y - py) || a.id.localeCompare(b.id));
  for (const f of order) {
    const route = planRoute(s, job, unit, f, spot, t);
    if (route) {
      assign(s, job, unit, f, route, spot, t);
      return true;
    }
  }
  job.blocked = 'No forklift access';
  return false;
}

/** Give free forklifts the next startable job of the highest group, nearest forklift first. */
export function dispatch(s: ShiftState, t: number) {
  if (s.over) return;
  for (let assigned = true; assigned; ) {
    assigned = false;
    const free = s.forklifts.filter((f) => forkliftFree(f, t));
    if (!free.length) return;
    for (const group of s.groups) {
      if (startable(s, group).some((job) => tryJob(s, job, free, t))) {
        assigned = true;
        break;
      }
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
