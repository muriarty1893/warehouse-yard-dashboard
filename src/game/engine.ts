import { bayById, devYard } from '../config/devYard';
import type { Pose } from '../domain/types';
import { areaAt } from '../domain/yard';
import { compileRoute, evalRoute, newPose, type RouteSpec } from '../sim/route';
import { recommendSpot } from '../world/placement';
import { addGroup, crewDue, dispatch, inQueue, moveGroup, standing } from './crew';
import { bayClosedUntil, has, hint, incidentDue } from './incidents';
import { cash, gateWaitAmount, lateAmount, post } from './ledger';
import { planningCargo, recommendPlan } from './planning';
import { arriveRoute, departRoute, dockRoute, kerbSlot, parkedPose, queueRoute, TEMP_IN, tempInRoute } from './places';
import { clockLabel, secondsFor, shiftMinutes, type Action, type ActionResult, type Due, type GameEvent, type GameTruck, type ShiftState } from './types';

/**
 * The shift engine (spec §1, §3.1). `act` applies a player decision,
 * `advance` fires everything due up to a time in strict (t, order, id) order.
 * Both change the state they are given and read nothing else.
 */

const ok: ActionResult = { ok: true };
const no = (reason: string): ActionResult => ({ ok: false, reason });
const truckOf = (s: ShiftState, id: string) => s.trucks.find((t) => t.id === id);

// ---------------------------------------------------------------------------
// Motion helpers

const routeEnd = (spec: RouteSpec) => (spec.offset ?? 0) + compileRoute(spec).duration;

function move(tr: { motion: GameTruck['motion'] }, spec: RouteSpec, t: number) {
  tr.motion = { spec, t0: t, until: routeEnd(spec) };
}

/** Where a vehicle is at t: on its route while it lasts, else at rest. */
function poseNow(m: GameTruck['motion'], rest: Pose, t: number): Pose {
  if (!m || t >= m.until) return rest;
  const p = evalRoute(compileRoute(m.spec), Math.min(t, m.until - 1e-6), newPose());
  return p.visible ? { x: p.x, y: p.y, heading: p.heading } : rest;
}

// ---------------------------------------------------------------------------
// Kerb queue

const queued = (s: ShiftState) => s.trucks.filter((t) => (t.stage === 'arriving' || t.stage === 'waiting') && t.slot !== null).sort((a, b) => a.slot! - b.slot!);

function freeSlot(s: ShiftState): number {
  const taken = new Set(queued(s).map((t) => t.slot));
  let k = 0;
  while (taken.has(k)) k++;
  return k;
}

/** Waiting trucks move up to close gaps; no truck overtakes another, arriving ones keep their slot until they arrive. */
function compactQueue(s: ShiftState, t: number) {
  queued(s).forEach((tr, rank) => {
    if (tr.stage !== 'waiting' || tr.motion || tr.slot! <= rank) return;
    const from = tr.pose;
    tr.slot = rank;
    tr.pose = kerbSlot(rank);
    move(tr, queueRoute(from, tr.pose, t), t);
  });
}

// ---------------------------------------------------------------------------
// Bays

function bayProblem(s: ShiftState, bayId: string, t: number): string | null {
  if (!s.recipe.bays.includes(bayId)) return `Bay ${bayId} is not open today`;
  const closed = bayClosedUntil(s, bayId, t);
  if (closed !== null) return `Bay ${bayId} is closed until ${clockLabel(closed)}`;
  for (const o of s.trucks) {
    if (o.bayId !== bayId) continue;
    if (o.stage === 'docking' || o.stage === 'docked') return `Bay ${bayId} is busy`;
    if (o.stage === 'departing' && t < (o.times.clearAt ?? -Infinity)) return `Bay ${bayId} is still being cleared`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Storage

/** The area to offer for a docked inbound truck: covered when cartons or bags are aboard, else the best spot's area. */
export function suggestArea(s: ShiftState, truckId: string): string {
  const tr = truckOf(s, truckId);
  const units = (tr?.aboard ?? []).map((id) => s.cargo.find((c) => c.id === id)!).filter(Boolean);
  const first = units[0];
  const fallback = devYard.storage[0].id;
  if (!first) return fallback;
  const yard = standing(s);
  const needsCover = units.some((u) => u.look === 'cartons' || u.look === 'bag');
  const spot = recommendSpot(yard, first);
  const best = !spot ? null : 'on' in spot ? (s.cargo.find((c) => c.id === spot.on)?.areaId ?? null) : (areaAt(devYard, spot.x, spot.y)?.id ?? null);
  if (best && (!needsCover || devYard.storage.find((a) => a.id === best)?.covered)) return best;
  for (const a of devYard.storage) if ((!needsCover || a.covered) && recommendSpot(yard, first, { areaId: a.id })) return a.id;
  return best ?? fallback;
}

function startUnload(s: ShiftState, tr: GameTruck, areaId: string) {
  tr.areaId = areaId;
  const area = devYard.storage.find((a) => a.id === areaId)!;
  const existing = s.groups.find((g) => g.kind === 'unload' && g.truckId === tr.id);
  if (existing) {
    existing.areaId = areaId;
    existing.label = `Unload ${tr.id} → ${area.name}`;
    for (const id of existing.jobIds) {
      const j = s.jobs.find((x) => x.id === id)!;
      if (j.status === 'queued') {
        j.areaId = areaId;
        j.blocked = null;
      }
    }
    return;
  }
  const units = [...tr.load].sort((a, b) => b.seq - a.seq).filter((p) => tr.aboard.includes(p.cargoId));
  addGroup(s, { kind: 'unload', label: `Unload ${tr.id} → ${area.name}`, truckId: tr.id, areaId, units: units.map((p) => ({ unitId: p.cargoId, placement: p })) });
}

function startDeparture(tr: GameTruck, t: number) {
  const bay = bayById(tr.bayId!);
  const { spec, clearAt } = departRoute(bay, t);
  tr.stage = 'departing';
  tr.times.departed = t;
  tr.times.clearAt = clearAt;
  move(tr, spec, t);
}

/** Every planned unit aboard. */
export const isLoaded = (tr: GameTruck) => !!tr.plan && tr.plan.placements.every((p) => tr.aboard.includes(p.cargoId));

/** An outbound truck leaves: paid for what is aboard, fined for lateness, missing papers and units left behind. */
function depart(s: ShiftState, tr: GameTruck, t: number): GameEvent[] {
  const events: GameEvent[] = [];
  tr.dispatchPending = false;
  const n = tr.aboard.length;
  if (n) events.push(post(s, { t, kind: 'delivery', amount: n * (tr.rush ? s.prices.rushDelivery : s.prices.delivery), text: `${tr.id} dispatched · ${n} units`, ref: tr.id }));
  if (tr.deadline !== null && t > tr.deadline) {
    const minutes = shiftMinutes(t - tr.deadline);
    events.push(post(s, { t, kind: 'late', amount: lateAmount(s.prices, minutes), text: `${tr.id} left ${Math.round(minutes)} min late`, ref: tr.id }));
  }
  for (const id of tr.aboard) {
    const c = s.cargo.find((u) => u.id === id);
    if (c?.papers === 'missing') events.push(post(s, { t, kind: 'missingPapers', amount: -s.prices.missingPapers, text: `${id} left without papers`, ref: id }));
  }
  // What it came for: the planned units, or with no plan every yard unit bound for its stops that no other truck has planned.
  const heldElsewhere = new Set(s.trucks.filter((o) => o !== tr && o.plan && o.stage !== 'departing' && o.stage !== 'gone').flatMap((o) => o.plan!.placements.map((p) => p.cargoId)));
  const cameFor = tr.plan ? tr.plan.placements.map((p) => p.cargoId) : s.cargo.filter((c) => !c.loadedOn && !c.gone && tr.stops.includes(c.destination) && !heldElsewhere.has(c.id)).map((c) => c.id);
  for (const id of cameFor) {
    const c = s.cargo.find((u) => u.id === id);
    if (tr.aboard.includes(id) || !c || c.gone) continue;
    events.push(post(s, { t, kind: 'missedTruck', amount: -s.prices.missedTruck, text: `${id} left behind by ${tr.id}`, ref: id }));
  }
  for (const id of tr.aboard) {
    const c = s.cargo.find((u) => u.id === id);
    if (c) c.gone = true;
  }
  startDeparture(tr, t);
  return events;
}

// ---------------------------------------------------------------------------
// Validation

export function validate(s: ShiftState, a: Action, t: number): ActionResult {
  if (s.over) return no('The shift is over');
  switch (a.kind) {
    case 'assignBay': {
      const tr = truckOf(s, a.truckId);
      if (!tr) return no(`No truck ${a.truckId}`);
      if (tr.stage !== 'waiting') return no(`${tr.id} is not waiting at the gate`);
      const problem = bayProblem(s, a.bayId, t);
      return problem ? no(problem) : ok;
    }
    case 'chooseArea': {
      const tr = truckOf(s, a.truckId);
      if (!tr) return no(`No truck ${a.truckId}`);
      if (tr.kind !== 'inbound') return no(`${tr.id} has nothing to unload`);
      if (tr.stage !== 'docked') return no(`${tr.id} is not docked yet`);
      if (!devYard.storage.some((x) => x.id === a.areaId)) return no(`No storage area ${a.areaId}`);
      if (!tr.aboard.length) return no(`${tr.id} is already empty`);
      return ok;
    }
    case 'confirmPlan': {
      const tr = truckOf(s, a.truckId);
      if (!tr) return no(`No truck ${a.truckId}`);
      if (tr.kind !== 'outbound') return no(`${tr.id} is not collecting cargo`);
      if (tr.stage !== 'docked') return no(`${tr.id} is not docked`);
      if (tr.plan) return no(`${tr.id} already has a confirmed plan`);
      if (!a.plan.placements.length) return no('The plan has no cargo');
      const free = new Set(planningCargo(s).map((c) => c.id));
      const gone = a.plan.placements.find((p) => !free.has(p.cargoId));
      return gone ? no(`${gone.cargoId} is no longer available`) : ok;
    }
    case 'dispatch': {
      const tr = truckOf(s, a.truckId);
      if (!tr) return no(`No truck ${a.truckId}`);
      if (tr.kind !== 'outbound') return no(`${tr.id} leaves on its own once it is empty`);
      if (tr.stage !== 'docked') return no(`${tr.id} is not docked`);
      if (tr.dispatchPending) return no(`${tr.id} is already leaving`);
      return ok;
    }
    case 'reorder': {
      if (a.queue === 'crew') {
        if (!has(s, 'queue')) return no('The crew queue is fixed in this shift');
        return s.groups.some((g) => g.id === a.id) ? ok : no('No such job');
      }
      if (!has(s, 'papers')) return no('No papers to sort in this shift');
      const i = s.papers.queue.indexOf(a.id);
      if (i < 0) return no(`${a.id} has its papers`);
      if (i === 0 && s.papers.startedAt !== null) return no(`The clerk is already working on ${a.id}`);
      return ok;
    }
    case 'urgent': {
      if (!has(s, 'queue')) return no('The crew queue is fixed in this shift');
      const tr = truckOf(s, a.truckId);
      if (!tr) return no(`No truck ${a.truckId}`);
      return s.groups.some((g) => g.truckId === tr.id) ? ok : no(`${tr.id} has no jobs yet`);
    }
    case 'rushPapers':
      if (!has(s, 'papers')) return no('No papers to rush in this shift');
      if (!s.papers.queue.includes(a.unitId)) return no(`${a.unitId} has its papers`);
      return afford(s, s.prices.rushPapers, t);
    case 'rentForklift':
      if (!has(s, 'tempForklift')) return no('No temp forklifts in this shift');
      if (!Number.isInteger(a.hours) || a.hours < 1 || a.hours > 4) return no('Rent 1 to 4 hours');
      return afford(s, s.prices.tempForkliftPerHour * a.hours, t);
    case 'overtime':
      if (!has(s, 'overtime')) return no('No overtime in this shift');
      if (s.overtimeBought >= 2) return no('Overtime is used up');
      return afford(s, s.prices.overtime, t);
    case 'moveUnits': {
      const area = devYard.storage.find((x) => x.id === a.areaId);
      if (!area) return no(`No storage area ${a.areaId}`);
      if (!a.unitIds.length) return no('No units to move');
      const listed = new Set(a.unitIds);
      for (const id of a.unitIds) {
        const c = s.cargo.find((u) => u.id === id);
        if (!c || c.gone || c.loadedOn) return no(`${id} is not in the yard`);
        if (c.transitJob) return no(`${id} is already on the move`);
        if (inQueue(s, id)) return no(`${id} is already in the crew queue`);
        const top = s.cargo.find((u) => u.on === id && !u.gone && !listed.has(u.id));
        if (top) return no(`${id} has ${top.id} on top`);
      }
      return ok;
    }
  }
}

function afford(s: ShiftState, price: number, t: number): ActionResult {
  return cash(s, t) >= price ? ok : no(`Not enough cash (€${price.toLocaleString('en-US')} needed)`);
}

/** Stack level of a yard unit: 0 on the floor, 1 on one unit, … */
function level(s: ShiftState, id: string): number {
  let n = 0;
  for (let c = s.cargo.find((u) => u.id === id); c?.on && n < 10; c = s.cargo.find((u) => u.id === c!.on)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Actions

/** Apply a player decision at t (after advancing to t). Events from both go into `events`. */
export function act(s: ShiftState, a: Action, t: number, events: GameEvent[] = []): ActionResult {
  events.push(...advance(s, t));
  const r = validate(s, a, t);
  if (!r.ok) return r;
  switch (a.kind) {
    case 'assignBay': {
      const tr = truckOf(s, a.truckId)!;
      const minutes = shiftMinutes(t - (tr.times.arrived ?? t));
      const fee = gateWaitAmount(s.prices, minutes);
      if (fee) events.push(post(s, { t, kind: 'gateWait', amount: fee, text: `${tr.id} waited ${Math.round(minutes)} min at the gate`, ref: tr.id }));
      const from = poseNow(tr.motion, tr.pose, t);
      tr.times.leftKerb = t;
      tr.stage = 'docking';
      tr.bayId = a.bayId;
      tr.slot = null;
      tr.pose = parkedPose(bayById(a.bayId));
      move(tr, dockRoute(from, bayById(a.bayId), t), t);
      compactQueue(s, t);
      break;
    }
    case 'chooseArea':
      startUnload(s, truckOf(s, a.truckId)!, a.areaId);
      break;
    case 'confirmPlan': {
      const tr = truckOf(s, a.truckId)!;
      tr.plan = a.plan;
      tr.load = a.plan.placements;
      const order = [...a.plan.placements].sort((x, y) => x.seq - y.seq);
      addGroup(s, { kind: 'load', label: `Load ${tr.id}`, truckId: tr.id, areaId: null, units: order.map((p) => ({ unitId: p.cargoId, placement: p })) });
      break;
    }
    case 'dispatch': {
      const tr = truckOf(s, a.truckId)!;
      for (const j of s.jobs) if (j.truckId === tr.id && j.status === 'queued') j.status = 'cancelled';
      if (t < tr.busyUntil) tr.dispatchPending = true;
      else events.push(...depart(s, tr, t));
      break;
    }
    case 'reorder':
      if (a.queue === 'crew') moveGroup(s, a.id, a.to);
      else {
        const q = s.papers.queue.filter((id) => id !== a.id);
        q.splice(Math.max(a.to, s.papers.startedAt !== null ? 1 : 0), 0, a.id);
        s.papers.queue = q;
      }
      break;
    case 'urgent': {
      const tr = truckOf(s, a.truckId)!;
      tr.urgent = true;
      s.groups = [...s.groups.filter((g) => g.truckId === tr.id), ...s.groups.filter((g) => g.truckId !== tr.id)];
      break;
    }
    case 'rushPapers': {
      events.push(post(s, { t, kind: 'rushPapers', amount: -s.prices.rushPapers, text: `Papers rushed for ${a.unitId}`, ref: a.unitId }));
      const wasHead = s.papers.queue[0] === a.unitId;
      s.papers.queue = s.papers.queue.filter((id) => id !== a.unitId);
      const c = s.cargo.find((u) => u.id === a.unitId);
      if (c) c.papers = 'ok';
      if (wasHead) s.papers.startedAt = s.papers.queue.length ? t : null;
      break;
    }
    case 'rentForklift': {
      let n = 1;
      while (s.forklifts.some((f) => f.id === `FL-T${n}`)) n++;
      const spec = tempInRoute(t);
      const arrivesAt = routeEnd(spec);
      s.forklifts.push({ id: `FL-T${n}`, temp: true, pose: { ...TEMP_IN }, motion: { spec, t0: t, until: arrivesAt }, jobId: null, brokenUntil: null, breakdownPendingSec: null, arrivesAt, leaveAt: arrivesAt + secondsFor(60 * a.hours) });
      events.push(post(s, { t, kind: 'tempForklift', amount: -s.prices.tempForkliftPerHour * a.hours, text: `Temp forklift FL-T${n} for ${a.hours} h`, ref: `FL-T${n}` }));
      break;
    }
    case 'overtime':
      s.overtimeBought += 1;
      s.end += secondsFor(30);
      events.push(post(s, { t, kind: 'overtime', amount: -s.prices.overtime, text: `Overtime · the yard stays open until ${clockLabel(s.end)}`, ref: 'overtime' }));
      break;
    case 'moveUnits': {
      const area = devYard.storage.find((x) => x.id === a.areaId)!;
      const order = [...a.unitIds].sort((x, y) => level(s, y) - level(s, x));
      addGroup(s, { kind: 'move', label: `Move ${order.length} unit${order.length === 1 ? '' : 's'} → ${area.name}`, truckId: null, areaId: a.areaId, units: order.map((unitId) => ({ unitId, placement: null })) });
      break;
    }
  }
  s.log.push({ t, action: a });
  dispatch(s, t);
  return ok;
}

// ---------------------------------------------------------------------------
// Time

function engineDue(s: ShiftState): Due[] {
  const out: Due[] = [];
  for (const tr of s.trucks) {
    if (tr.stage === 'scheduled') out.push({ t: tr.arriveAt, order: 1, id: tr.id, run: () => arrive(s, tr) });
    if (tr.motion) out.push({ t: tr.motion.until, order: 2, id: tr.id, run: () => motionEnd(s, tr) });
    if (tr.dispatchPending && tr.stage === 'docked') out.push({ t: tr.busyUntil, order: 4, id: tr.id, run: () => depart(s, tr, tr.busyUntil) });
  }
  out.push({ t: s.end, order: 99, id: 'end', run: () => endShift(s) });
  return out;
}

export function allDue(s: ShiftState): Due[] {
  if (s.over) return [];
  return [...engineDue(s), ...crewDue(s), ...incidentDue(s)];
}

const earliest = (dues: Due[]) => dues.reduce<Due | null>((best, d) => (!best || d.t < best.t || (d.t === best.t && (d.order < best.order || (d.order === best.order && d.id < best.id))) ? d : best), null);

export function nextDueTime(s: ShiftState): number | null {
  return earliest(allDue(s))?.t ?? null;
}

export function advance(s: ShiftState, t: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let guard = 0; guard < 100_000; guard++) {
    const due = earliest(allDue(s));
    if (!due || due.t > t) break;
    s.t = Math.max(s.t, due.t);
    events.push(...due.run());
    events.push(...settle(s, due.t));
    dispatch(s, due.t);
  }
  s.t = Math.max(s.t, t);
  return events;
}

/** An action the game takes for the player (a mechanic not yet taught): applied, but not logged. */
function auto(s: ShiftState, a: Action, t: number): GameEvent[] {
  const before = s.log.length;
  const events: GameEvent[] = [];
  act(s, a, t, events);
  s.log.length = before;
  return events;
}

/** State conditions that follow from an event: empty inbound trucks leave, and (before outbound is taught) loaded ones. */
function settle(s: ShiftState, t: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (s.over) return events;
  for (const tr of s.trucks) {
    if (tr.kind === 'outbound' && tr.stage === 'docked' && !has(s, 'outbound') && !tr.dispatchPending && (isLoaded(tr) || !tr.plan)) {
      events.push(...auto(s, { kind: 'dispatch', truckId: tr.id }, t));
      continue;
    }
    if (tr.kind !== 'inbound' || tr.stage !== 'docked' || tr.aboard.length) continue;
    const pending = s.jobs.some((j) => j.truckId === tr.id && (j.status === 'active' || j.status === 'queued') && !j.set);
    if (!pending) startDeparture(tr, t);
  }
  return events;
}

function arrive(s: ShiftState, tr: GameTruck): GameEvent[] {
  tr.stage = 'arriving';
  tr.slot = freeSlot(s);
  tr.pose = kerbSlot(tr.slot);
  move(tr, arriveRoute(tr.pose, tr.arriveAt), tr.arriveAt);
  const events: GameEvent[] = [];
  if (tr.kind === 'outbound') events.push(...hint(s, 'outbound'));
  if (tr.rush) events.push({ kind: 'notice', t: tr.arriveAt, text: `Rush order: ${tr.id} · due ${tr.deadline === null ? '—' : clockLabel(tr.deadline)} · double pay`, tone: 'warn' }, ...hint(s, 'rushOrder'));
  return events;
}

function motionEnd(s: ShiftState, tr: GameTruck): GameEvent[] {
  const t = tr.motion!.until;
  tr.motion = null;
  switch (tr.stage) {
    case 'arriving':
      tr.stage = 'waiting';
      tr.times.arrived = t;
      compactQueue(s, t);
      break;
    case 'waiting':
      compactQueue(s, t);
      break;
    case 'docking':
      tr.stage = 'docked';
      tr.times.docked = t;
      tr.pose = parkedPose(bayById(tr.bayId!));
      if (tr.kind === 'inbound' && !has(s, 'storage')) startUnload(s, tr, suggestArea(s, tr.id));
      if (tr.kind === 'inbound') return hint(s, 'storage');
      // Before outbound trucks are taught, the planner's recommendation is confirmed for the player.
      if (!has(s, 'outbound')) {
        const plan = recommendPlan(s, tr.id);
        if (plan.placements.length) auto(s, { kind: 'confirmPlan', truckId: tr.id, plan }, t);
      }
      break;
    case 'departing':
      tr.stage = 'gone';
      break;
  }
  return [];
}

function endShift(s: ShiftState): GameEvent[] {
  const t = s.end;
  const events: GameEvent[] = [];
  for (const tr of s.trucks) {
    if (tr.stage === 'waiting' && tr.times.arrived !== undefined) {
      const minutes = shiftMinutes(t - tr.times.arrived);
      const fee = gateWaitAmount(s.prices, minutes);
      if (fee) events.push(post(s, { t, kind: 'gateWait', amount: fee, text: `${tr.id} waited ${Math.round(minutes)} min at the gate`, ref: tr.id }));
    }
    if (tr.kind === 'outbound' && tr.deadline !== null && t > tr.deadline && (tr.stage === 'waiting' || tr.stage === 'docking' || tr.stage === 'docked')) {
      const minutes = shiftMinutes(t - tr.deadline);
      events.push(post(s, { t, kind: 'late', amount: lateAmount(s.prices, minutes), text: `${tr.id} still in the yard ${Math.round(minutes)} min after its ${clockLabel(tr.deadline)} deadline`, ref: tr.id }));
    }
  }
  for (const tr of s.trucks) {
    if (tr.stage === 'arriving' || tr.stage === 'waiting' || tr.stage === 'docking' || tr.stage === 'docked') {
      events.push(post(s, { t, kind: 'unserved', amount: -s.prices.unserved, text: `${tr.id} was still ${tr.stage === 'docked' || tr.stage === 'docking' ? 'in the yard' : 'at the gate'} at the end of the shift`, ref: tr.id }));
    }
  }
  s.over = true;
  events.push({ kind: 'over' });
  return events;
}
