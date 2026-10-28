import { jobStuck } from './crew';
import { act, advance, isLoaded, suggestArea, validate } from './engine';
import { newShift } from './generate';
import { atRisk, has } from './incidents';
import { cash } from './ledger';
import { recommendPlan } from './planning';
import { buildReport, type Report } from './report';
import { rainMoveAction } from './select';
import { secondsFor, type Action, type GameTruck, type Recipe, type ShiftState } from './types';

/**
 * Test-only players (spec §5.2) that set each shift's star targets: a basic
 * one (a new hire: first come first served, slow to react) and a good one
 * (deadline first, uses every tool).
 */

export type Policy = (s: ShiftState, t: number) => Action[];

/** How long the basic bot takes to notice something new. */
const REACT = secondsFor(15);

/** Bays for waiting trucks in the given order, one truck per free bay. */
function assignBays(s: ShiftState, t: number, waiting: GameTruck[]): Action[] {
  const out: Action[] = [];
  const used = new Set<string>();
  for (const tr of waiting) {
    const bayId = s.recipe.bays.find((b) => !used.has(b) && validate(s, { kind: 'assignBay', truckId: tr.id, bayId: b }, t).ok);
    if (!bayId) break;
    used.add(bayId);
    out.push({ kind: 'assignBay', truckId: tr.id, bayId });
  }
  return out;
}

function confirmOrLeave(s: ShiftState, tr: GameTruck): Action {
  const plan = recommendPlan(s, tr.id);
  return plan.placements.length ? { kind: 'confirmPlan', truckId: tr.id, plan } : { kind: 'dispatch', truckId: tr.id };
}

const docked = (s: ShiftState) => s.trucks.filter((tr) => tr.stage === 'docked');

export const basicBot: Policy = (s, t) => {
  const waiting = s.trucks.filter((tr) => tr.stage === 'waiting' && t - (tr.times.arrived ?? t) >= REACT).sort((a, b) => a.times.arrived! - b.times.arrived!);
  const out = assignBays(s, t, waiting);
  for (const tr of docked(s)) {
    if (t - (tr.times.docked ?? t) < REACT) continue;
    if (tr.kind === 'inbound' && !tr.areaId && has(s, 'storage')) out.push({ kind: 'chooseArea', truckId: tr.id, areaId: suggestArea(s, tr.id) });
    if (tr.kind === 'outbound' && has(s, 'outbound') && !tr.dispatchPending) {
      if (!tr.plan) out.push(confirmOrLeave(s, tr));
      else if (isLoaded(tr)) out.push({ kind: 'dispatch', truckId: tr.id });
    }
  }
  return out;
};


const deadlineOf = (tr: GameTruck | undefined) => tr?.deadline ?? Infinity;

/** A shortcut-taker (a review check, not used for targets): first-come bays, suggested areas, outbound trucks sent off the moment they dock. */
export const lazyBot: Policy = (s, t) => {
  const waiting = s.trucks.filter((tr) => tr.stage === 'waiting').sort((a, b) => a.times.arrived! - b.times.arrived!);
  const out = assignBays(s, t, waiting);
  for (const tr of docked(s)) {
    if (tr.kind === 'inbound' && !tr.areaId && has(s, 'storage')) out.push({ kind: 'chooseArea', truckId: tr.id, areaId: suggestArea(s, tr.id) });
    if (tr.kind === 'outbound' && has(s, 'outbound') && !tr.dispatchPending) out.push({ kind: 'dispatch', truckId: tr.id });
  }
  return out;
};

export const goodBot: Policy = (s, t) => {
  const out: Action[] = [];
  const truckOf = (id: string | null) => s.trucks.find((x) => x.id === id);

  // Bays: outbound by deadline first, then inbound by how long they have waited.
  const waiting = s.trucks.filter((tr) => tr.stage === 'waiting').sort((a, b) => deadlineOf(a) - deadlineOf(b) || a.times.arrived! - b.times.arrived!);
  out.push(...assignBays(s, t, waiting));

  for (const tr of docked(s)) {
    if (tr.kind === 'inbound' && !tr.areaId && has(s, 'storage')) out.push({ kind: 'chooseArea', truckId: tr.id, areaId: suggestArea(s, tr.id) });
    if (tr.kind === 'outbound' && has(s, 'outbound') && !tr.dispatchPending) {
      if (!tr.plan) out.push(confirmOrLeave(s, tr));
      else if (isLoaded(tr) || jobStuck(s, tr.id, t)) out.push({ kind: 'dispatch', truckId: tr.id });
    }
  }

  // Rain: everything at risk under cover as soon as the warning is out.
  const warned = s.recipe.incidents.some((inc, i) => inc.kind === 'rain' && s.fired.includes(`inc-${i}-warn`) && !s.fired.includes(`inc-${i}-damage`));
  if (warned && atRisk(s).length && !s.groups.some((g) => g.kind === 'move' && g.jobIds.some((id) => s.jobs.find((j) => j.id === id)?.status !== 'done'))) {
    const move = rainMoveAction(s);
    if (move) out.push(move);
  }

  // Queue: moves first while rain is coming, then loads by deadline, then unloads.
  if (has(s, 'queue')) {
    const rank = (g: ShiftState['groups'][number]) => (g.kind === 'move' ? -1 : g.kind === 'load' ? deadlineOf(truckOf(g.truckId)) : 1e9);
    const want = [...s.groups].sort((a, b) => rank(a) - rank(b));
    const i = want.findIndex((g, k) => s.groups[k] !== g);
    if (i >= 0) out.push({ kind: 'reorder', queue: 'crew', id: want[i].id, to: i });
  }

  // Papers: rush units that are planned onto a truck (cheaper than the fine).
  if (has(s, 'papers')) {
    const planned = new Set(s.trucks.flatMap((tr) => (tr.plan && tr.stage === 'docked' ? tr.plan.placements.map((p) => p.cargoId) : [])));
    let money = cash(s, t);
    for (const id of s.papers.queue) {
      if (!planned.has(id) || money < s.prices.rushPapers) continue;
      out.push({ kind: 'rushPapers', unitId: id });
      money -= s.prices.rushPapers;
    }
  }

  // A forklift down: rent one for two hours.
  if (has(s, 'tempForklift') && s.forklifts.some((f) => (f.brokenUntil ?? 0) > t || f.breakdownPendingSec !== null) && !s.forklifts.some((f) => f.temp)) {
    out.push({ kind: 'rentForklift', hours: 2 });
  }

  // Trucks still to serve near the end: buy overtime.
  const open = s.trucks.some((tr) => tr.stage === 'arriving' || tr.stage === 'waiting' || tr.stage === 'docking' || (tr.stage === 'docked' && !tr.dispatchPending));
  if (has(s, 'overtime') && open && t > s.end - secondsFor(20)) out.push({ kind: 'overtime' });

  return out;
};

/** Play a whole shift headless; the policy is asked every `step` seconds. */
export function runShift(recipe: Recipe, policy: Policy, step = 5): { state: ShiftState; report: Report } {
  const s = newShift(recipe);
  advance(s, 0);
  for (let t = 0; !s.over; t += step) {
    for (const a of policy(s, t)) act(s, a, t);
    advance(s, t + step);
  }
  return { state: s, report: buildReport(s) };
}
