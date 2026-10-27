import { devYard } from '../config/devYard';
import { areaSize } from '../domain/yard';
import { recommendSpot } from '../world/placement';
import { standing } from './crew';
import { isLoaded, validate } from './engine';
import { atRisk, bayClosedUntil } from './incidents';
import { runningFees } from './ledger';
import { clockLabel, secondsFor, shiftMinutes, type Action, type ActionResult, type GameTruck, type Recipe, type ShiftState } from './types';

/** Read-only views of the shift for the HUD (spec §4.2). Times are minutes after 06:00. */

export interface Segment {
  kind: 'plan' | 'wait' | 'dock' | 'late';
  from: number;
  to: number;
}

export interface TimelineRow {
  truckId: string;
  kind: 'inbound' | 'outbound';
  segments: Segment[];
  deadlineMin: number | null;
  selectable: boolean;
}

/** Minutes after 06:00, rounded off float noise (display only). */
const min = (t: number) => Math.round(shiftMinutes(t) * 1000) / 1000;

export function timelineRows(s: ShiftState, t: number): TimelineRow[] {
  const now = min(t);
  const rows: TimelineRow[] = [];
  for (const tr of s.trucks) {
    if (tr.plannedArriveAt === null && tr.stage === 'scheduled') continue;
    const segments: Segment[] = [];
    if (tr.plannedArriveAt !== null) {
      const from = min(tr.plannedArriveAt);
      segments.push({ kind: 'plan', from, to: tr.kind === 'outbound' && tr.deadline !== null ? min(tr.deadline) : from + 60 });
    }
    const { arrived, leftKerb, departed } = tr.times;
    if (arrived !== undefined) segments.push({ kind: 'wait', from: min(arrived), to: leftKerb !== undefined ? min(leftKerb) : now });
    if (leftKerb !== undefined) segments.push({ kind: 'dock', from: min(leftKerb), to: departed !== undefined ? min(departed) : now });
    if (tr.deadline !== null && arrived !== undefined) {
      const until = departed !== undefined ? min(departed) : now;
      if (until > min(tr.deadline)) segments.push({ kind: 'late', from: min(tr.deadline), to: until });
    }
    rows.push({ truckId: tr.id, kind: tr.kind, segments, deadlineMin: tr.deadline === null ? null : min(tr.deadline), selectable: tr.stage !== 'scheduled' && tr.stage !== 'gone' });
  }
  return rows;
}

export function bayInfo(s: ShiftState, t: number) {
  return s.recipe.bays.map((id) => {
    const here = s.trucks.find((tr) => tr.bayId === id && (tr.stage === 'docking' || tr.stage === 'docked'));
    const clearing = s.trucks.some((tr) => tr.bayId === id && tr.stage === 'departing' && t < (tr.times.clearAt ?? -Infinity));
    const closed = bayClosedUntil(s, id, t);
    const total = here ? (here.kind === 'inbound' ? here.load.length : (here.plan?.placements.length ?? 0)) : 0;
    const done = here ? (here.kind === 'inbound' ? here.load.length - here.aboard.length : here.aboard.length) : 0;
    return { id, truckId: here?.id ?? null, closedUntilMin: closed === null ? null : min(closed), clearing, done, total };
  });
}

/** Units standing in each storage area, and how much room that leaves (units per 10 m²). */
export function areaInfo(s: ShiftState) {
  const yard = standing(s);
  return devYard.storage.map((a) => {
    const units = yard.filter((c) => c.areaId === a.id).length;
    return { id: a.id, name: a.name, covered: !!a.covered, units, density: (units * 10) / areaSize(a) };
  });
}

function stageLabel(s: ShiftState, tr: GameTruck, t: number): string {
  switch (tr.stage) {
    case 'scheduled':
      return `Expected at ${clockLabel(tr.arriveAt)}`;
    case 'arriving':
      return 'Arriving';
    case 'waiting':
      return `At the gate · ${Math.floor(min(t - (tr.times.arrived ?? t)))} min`;
    case 'docking':
      return `To ${tr.bayId}`;
    case 'docked': {
      if (tr.kind === 'inbound') {
        if (!tr.areaId) return `Docked at ${tr.bayId} · choose a storage area`;
        return `Docked at ${tr.bayId} · unloading ${tr.load.length - tr.aboard.length}/${tr.load.length}`;
      }
      if (tr.dispatchPending) return 'Leaving once the forklift is out';
      if (isLoaded(tr)) return 'Loaded · ready to dispatch';
      if (tr.plan) return `Docked at ${tr.bayId} · loading ${tr.aboard.length}/${tr.plan.placements.length}`;
      return `Docked at ${tr.bayId} · plan the load`;
    }
    case 'departing':
      return 'Departing';
    case 'gone':
      return 'Gone';
  }
  void s;
}

export interface ActionView {
  action: Action;
  label: string;
  result: ActionResult;
}

export function truckView(s: ShiftState, id: string, t: number) {
  const tr = s.trucks.find((x) => x.id === id);
  if (!tr) return null;
  const fee = runningFees(s, t).find((f) => f.ref === id) ?? null;
  const perMin = fee ? (fee.kind === 'gateWait' ? s.prices.gatePerMin : s.prices.latePerMin) : null;
  const actions: ActionView[] = [];
  const add = (action: Action, label: string) => actions.push({ action, label, result: validate(s, action, t) });
  if (tr.stage === 'waiting') for (const bayId of s.recipe.bays) add({ kind: 'assignBay', truckId: id, bayId }, `Send to ${bayId}`);
  if (tr.stage === 'docked' && tr.kind === 'inbound' && tr.aboard.length) for (const a of devYard.storage) add({ kind: 'chooseArea', truckId: id, areaId: a.id }, a.name);
  if (tr.stage === 'docked' && tr.kind === 'outbound') add({ kind: 'dispatch', truckId: id }, 'Dispatch');
  if (tr.stage === 'docked') add({ kind: 'urgent', truckId: id }, 'Urgent');
  return {
    id,
    kind: tr.kind,
    stage: tr.stage,
    stageLabel: stageLabel(s, tr, t),
    stops: tr.stops,
    deadline: tr.deadline === null ? null : clockLabel(tr.deadline),
    rush: tr.rush,
    fee: fee ? { kind: fee.kind, perMin: perMin!, total: fee.amount } : null,
    actions,
  };
}

export function crewView(s: ShiftState, t: number) {
  const out = [];
  let rank = 0;
  for (const g of s.groups) {
    const jobs = g.jobIds.map((id) => s.jobs.find((j) => j.id === id)!).filter((j) => j.status !== 'cancelled');
    if (!jobs.length || jobs.every((j) => j.status === 'done')) continue;
    rank += 1;
    const next = jobs.find((j) => j.status === 'queued');
    out.push({
      id: g.id,
      rank,
      label: g.label,
      tag: g.kind === 'load' ? 'LOAD' : g.kind === 'unload' ? 'UNLOAD' : 'MOVE',
      truckId: g.truckId,
      forklifts: jobs.filter((j) => j.status === 'active').map((j) => j.forkliftId!),
      done: jobs.filter((j) => j.status === 'done').length,
      total: jobs.length,
      blocked: next?.blocked ?? null,
    });
  }
  void t;
  return out;
}

export function papersView(s: ShiftState, t: number) {
  const each = secondsFor(s.recipe.clerkMin ?? 20);
  return s.papers.queue.map((unitId, i) => ({
    unitId,
    minutesLeft: i === 0 && s.papers.startedAt !== null ? Math.max(0, Math.ceil(min(s.papers.startedAt + each - t))) : null,
    rush: validate(s, { kind: 'rushPapers', unitId }, t),
  }));
}

/** The trucks on the briefing timeline (planned ones; rush orders are a surprise). */
export function briefingRows(recipe: Recipe) {
  return recipe.trucks
    .filter((e) => e.plannedArriveMin !== null)
    .map((e) => ({ id: e.id, kind: e.kind, fromMin: e.plannedArriveMin!, toMin: e.kind === 'outbound' && e.deadlineMin !== undefined ? e.deadlineMin : e.plannedArriveMin! + 60, deadlineMin: e.deadlineMin ?? null }));
}

/** The rain warning's one-click order: every unit at risk (with what stands on it) to the covered area with the most room. */
export function rainMoveAction(s: ShiftState): Action | null {
  const risk = atRisk(s);
  if (!risk.length) return null;
  const ids = new Set(risk.map((c) => c.id));
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of s.cargo) if (c.on && ids.has(c.on) && !ids.has(c.id) && !c.gone) ids.add(c.id), (grew = true);
  }
  const yard = standing(s);
  const areas = areaInfo(s)
    .filter((a) => a.covered)
    .sort((a, b) => a.density - b.density)
    .filter((a) => recommendSpot(yard, risk[0], { areaId: a.id }));
  return areas.length ? { kind: 'moveUnits', unitIds: [...ids], areaId: areas[0].id } : null;
}
