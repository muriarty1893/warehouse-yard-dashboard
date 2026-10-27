import { useMemo } from 'react';
import { create } from 'zustand';
import type { Cargo, TruckBay } from '../domain/types';
import { fingerprint, inputsHash, planAll } from './candidates';
import type { LoadPlan, PlanCore, TruckPlanInput, VehicleId } from './types';

/**
 * Load plans per truck (spec §1.3). The recommended plan is the solver's,
 * the confirmed plan is the manager's decision (a copy, never re-planned).
 * Which trucks can be planned and which cargo is free come from a plan
 * source: the running shift.
 */

export type PlanStatus = 'draft' | 'confirmed' | 'loading' | 'loaded' | 'dispatched';

export interface ConfirmedPlan extends LoadPlan {
  confirmedAt: number;
  by: string;
  overriddenChecks: string[];
  reason: string | null;
}

export interface TruckPlanState {
  truckId: string;
  route: string[];
  vehicle: VehicleId;
  include: { cargoId: string; stop: number }[];
  exclude: string[];
  urgent: string[];
  recommended: LoadPlan | null;
  confirmed: ConfirmedPlan | null;
  keptOutdated: boolean;
  status: PlanStatus;
}

export type Result = { ok: true } | { ok: false; reason: string };

/** What the planner plans for (the game's shift). */
export interface PlanSource {
  /** Plannable trucks in planning order. */
  trucks(): { id: string; route: string[]; vehicle: VehicleId }[];
  /** Yard units free to plan. */
  cargo(): Cargo[];
  bayOf(truckId: string): TruckBay | null;
  papersMissing(cargoId: string): boolean;
  /** The manager's decision goes back to the source, which may refuse it. */
  onConfirm(truckId: string, plan: ConfirmedPlan): Result;
}

const EMPTY: PlanSource = { trucks: () => [], cargo: () => [], bayOf: () => null, papersMissing: () => false, onConfirm: () => ({ ok: false, reason: 'Nothing to plan' }) };
let source: PlanSource = EMPTY;
export const setPlanSource = (src: PlanSource) => {
  source = src;
};
export const planSource = () => source;

interface LoadingState {
  trucks: Record<string, TruckPlanState>;
  /** Bumped when the plan source's cargo may have changed (views re-read it). */
  cargoVersion: number;
  toggleExclude: (truckId: string, cargoId: string) => void;
  addUrgent: (truckId: string, cargoId: string, stop: number) => void;
  clearUrgent: (truckId: string, cargoId: string) => void;
  /** Follow the source's trucks and cargo: new trucks as drafts, gone ones dropped, drafts re-planned. */
  replan: () => void;
  applyOptimised: (truckId: string, plan: PlanCore, tried: number, ms: number) => void;
  confirm: (truckId: string, opts?: { overrideReason: string }) => Result;
  keep: (truckId: string) => void;
  /** Old Load-at-dock run only; goes with it (plan Task 13). */
  setStatus: (truckId: string, status: PlanStatus) => void;
  resetAll: () => void;
}

function fresh(t: { id: string; route: string[]; vehicle: VehicleId }): TruckPlanState {
  return { truckId: t.id, route: [...t.route], vehicle: t.vehicle, include: [], exclude: [], urgent: [], recommended: null, confirmed: null, keptOutdated: false, status: 'draft' };
}

const toInput = (t: TruckPlanState): TruckPlanInput => ({ truckId: t.truckId, route: t.route, vehicle: t.vehicle, include: t.include, exclude: t.exclude, urgent: t.urgent });

/** The source's trucks, keeping what the manager already set for the ones still there. */
function synced(trucks: Record<string, TruckPlanState>): Record<string, TruckPlanState> {
  return Object.fromEntries(source.trucks().map((t) => [t.id, trucks[t.id] ?? fresh(t)]));
}

/** Re-plan the drafts around the confirmed plans; a fixed (optimised) draft keeps its plan, with its overflow re-read. */
function replanned(trucks: Record<string, TruckPlanState>, fixed: Record<string, LoadPlan> = {}): Record<string, TruckPlanState> {
  const ids = Object.keys(trucks);
  const held: Record<string, LoadPlan | null> = { ...fixed };
  for (const t of Object.values(trucks)) if (t.status !== 'draft' && t.confirmed) held[t.truckId] = t.confirmed;
  const plans = planAll(
    ids.map((id) => toInput(trucks[id])),
    source.cargo(),
    held,
  );
  const placedBy = new Map<string, string>();
  for (const [id, plan] of Object.entries(plans)) for (const p of plan.placements) placedBy.set(p.cargoId, id);
  const out = { ...trucks };
  for (const id of ids) {
    const t = trucks[id];
    if (t.status !== 'draft') continue;
    const plan = plans[id];
    out[id] = { ...t, recommended: fixed[id] ? { ...plan, leftOut: plan.leftOut.map((l) => ({ ...l, to: placedBy.get(l.cargoId) ?? null })) } : plan };
  }
  return out;
}

export const useLoading = create<LoadingState>()((set, get) => {
  /** Change one truck's planning inputs, then re-plan every draft. */
  const change = (truckId: string, patch: (t: TruckPlanState) => Partial<TruckPlanState> | null) => {
    const t = get().trucks[truckId];
    if (!t) return;
    const p = patch(t);
    if (!p) return;
    set({ trucks: replanned({ ...get().trucks, [truckId]: { ...t, ...p } }) });
  };

  return {
    trucks: {},
    cargoVersion: 0,

    toggleExclude: (truckId, cargoId) => change(truckId, (t) => ({ exclude: t.exclude.includes(cargoId) ? t.exclude.filter((x) => x !== cargoId) : [...t.exclude, cargoId] })),
    addUrgent: (truckId, cargoId, stop) =>
      change(truckId, (t) => {
        const unit = source.cargo().find((c) => c.id === cargoId);
        const onRoute = unit ? t.route.indexOf(unit.destination) + 1 : 0;
        return {
          urgent: t.urgent.includes(cargoId) ? t.urgent : [...t.urgent, cargoId],
          include: onRoute === stop ? t.include : [...t.include.filter((i) => i.cargoId !== cargoId), { cargoId, stop }],
          exclude: t.exclude.filter((x) => x !== cargoId),
        };
      }),
    clearUrgent: (truckId, cargoId) => change(truckId, (t) => ({ urgent: t.urgent.filter((x) => x !== cargoId), include: t.include.filter((i) => i.cargoId !== cargoId) })),

    replan: () => set({ trucks: replanned(synced(get().trucks)), cargoVersion: get().cargoVersion + 1 }),

    applyOptimised: (truckId, core, tried, ms) => {
      const t = get().trucks[truckId];
      if (!t || t.status !== 'draft') return;
      const cargo = new Map(source.cargo().map((c) => [c.id, c]));
      const units: LoadPlan['units'] = {};
      for (const p of core.placements) {
        const c = cargo.get(p.cargoId);
        if (c) units[p.cargoId] = fingerprint(c);
      }
      const blocked = t.recommended?.leftOut.filter((l) => !core.leftOut.some((x) => x.cargoId === l.cargoId) && !units[l.cargoId]) ?? [];
      const plan: LoadPlan = { ...core, leftOut: [...blocked, ...core.leftOut], stats: { ...core.stats, candidates: core.stats.candidates + blocked.length }, tried, ms, inputsHash: inputsHash(toInput(t)), units };
      set({ trucks: replanned(get().trucks, { [truckId]: plan }) });
    },

    confirm: (truckId, opts) => {
      const t = get().trucks[truckId];
      const plan = t?.recommended;
      if (!t || !plan || t.status !== 'draft') return { ok: false, reason: 'No plan to confirm' };
      if (!plan.placements.length) return { ok: false, reason: 'No cargo for this route' };
      const reason = opts?.overrideReason.trim() || null;
      if (!plan.checks.ok && !reason) return { ok: false, reason: 'The plan breaks a rule — give a reason to confirm it anyway' };
      const confirmed: ConfirmedPlan = { ...plan, confirmedAt: Date.now(), by: 'Yard manager', overriddenChecks: plan.checks.ok ? [] : plan.checks.issues, reason: plan.checks.ok ? null : reason };
      const r = source.onConfirm(truckId, confirmed);
      if (!r.ok) return r;
      // The source may have dropped the truck already (it no longer needs planning).
      set({ trucks: replanned(synced({ ...get().trucks, [truckId]: { ...t, confirmed, status: 'confirmed', keptOutdated: false } })) });
      return { ok: true };
    },

    keep: (truckId) => {
      const t = get().trucks[truckId];
      if (!t || !outdated(t, source.cargo())) return;
      set({ trucks: { ...get().trucks, [truckId]: { ...t, keptOutdated: true } } });
    },

    setStatus: (truckId, status) => {
      const t = get().trucks[truckId];
      if (t) set({ trucks: { ...get().trucks, [truckId]: { ...t, status } } });
    },

    resetAll: () => set({ trucks: replanned(synced({})), cargoVersion: get().cargoVersion + 1 }),
  };
});

/** The plan source's free cargo, re-read whenever the store re-plans. */
export function usePlanCargo(): Cargo[] {
  const v = useLoading((s) => s.cargoVersion);
  return useMemo(() => planSource().cargo(), [v]);
}

/** The plan to show for a truck: the confirmed one once there is one, else the recommendation. */
export const planOf = (s: Pick<LoadingState, 'trucks'>, truckId: string): LoadPlan | null => {
  const t = s.trucks[truckId];
  return t ? (t.confirmed ?? t.recommended) : null;
};

/** Why a confirmed plan no longer matches the yard ("CARGO-18452 moved"), or null. */
export function outdated(t: TruckPlanState, cargo: Cargo[]): string | null {
  if (!t.confirmed || t.status === 'dispatched') return null;
  const index = new Map(cargo.map((c) => [c.id, c]));
  for (const [id, was] of Object.entries(t.confirmed.units)) {
    const c = index.get(id);
    if (!c) return `${id} released`;
    if (c.loadedOn?.truckId === t.truckId) continue;
    const now = fingerprint(c);
    if (now.goods !== was.goods) return `${id} edited`;
    if (now.spot !== was.spot || c.loadedOn) return `${id} moved`;
  }
  return null;
}
