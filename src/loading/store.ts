import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { trucks as fleet } from '../config/fleet';
import { DEFAULT_ROUTES, PLAN_QUEUE } from '../config/routes';
import type { Cargo } from '../domain/types';
import { CURRENT_USER, LAYOUT, safeStorage, useInventory, type Result } from '../world/inventory';
import { fingerprint, inputsHash, planAll } from './candidates';
import type { LoadPlan, PlanCore, TruckPlanInput, VehicleId } from './types';

/**
 * Load plans per truck (spec §1.8). The recommended plan is the solver's,
 * the confirmed plan is the manager's decision (a copy, never re-planned),
 * and what was actually loaded lives on the cargo records (`loadedOn`).
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

interface Saved {
  layout: number;
  epoch: number;
  trucks: Record<string, TruckPlanState>;
}

interface LoadingState extends Saved {
  setRoute: (truckId: string, route: string[]) => void;
  moveStop: (truckId: string, from: number, to: number) => void;
  addStop: (truckId: string, city: string) => void;
  removeStop: (truckId: string, index: number) => void;
  setVehicle: (truckId: string, id: VehicleId) => void;
  toggleExclude: (truckId: string, cargoId: string) => void;
  addUrgent: (truckId: string, cargoId: string, stop: number) => void;
  clearUrgent: (truckId: string, cargoId: string) => void;
  /** Baseline plans for every draft truck, from the current yard. */
  replan: () => void;
  applyOptimised: (truckId: string, plan: PlanCore, tried: number, ms: number) => void;
  confirm: (truckId: string, opts?: { overrideReason: string }) => Result;
  keep: (truckId: string) => void;
  reopen: (truckId: string) => void;
  setStatus: (truckId: string, status: PlanStatus) => void;
  newPlan: (truckId: string) => void;
  resetAll: () => void;
}

const MAX_STOPS = 5;

function fresh(truckId: string): TruckPlanState {
  const spec = fleet.find((t) => t.id === truckId);
  return { truckId, route: [...(DEFAULT_ROUTES[truckId] ?? [])], vehicle: spec?.body ?? 'rigid-26', include: [], exclude: [], urgent: [], recommended: null, confirmed: null, keptOutdated: false, status: 'draft' };
}

const queue = () => PLAN_QUEUE.filter((id) => fleet.some((t) => t.id === id && t.plannable));
const toInput = (t: TruckPlanState): TruckPlanInput => ({ truckId: t.truckId, route: t.route, vehicle: t.vehicle, include: t.include, exclude: t.exclude, urgent: t.urgent });

/** Plans that hold their units: confirmed (loading, loaded) ones, plus any fixed plans passed in. */
function heldPlans(trucks: Record<string, TruckPlanState>, fixed: Record<string, LoadPlan> = {}): Record<string, LoadPlan | null> {
  const held: Record<string, LoadPlan | null> = { ...fixed };
  for (const t of Object.values(trucks)) if (t.status !== 'draft' && t.status !== 'dispatched' && t.confirmed) held[t.truckId] = t.confirmed;
  return held;
}

/** Re-plan the drafts around the held plans; a fixed (optimised) draft keeps its plan, with its overflow re-read. */
function replanned(trucks: Record<string, TruckPlanState>, fixed: Record<string, LoadPlan> = {}): Record<string, TruckPlanState> {
  const ids = queue();
  const plans = planAll(
    ids.map((id) => toInput(trucks[id])),
    useInventory.getState().cargo,
    heldPlans(trucks, fixed),
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

function initialTrucks() {
  return Object.fromEntries(queue().map((id) => [id, fresh(id)]));
}

const cityOf = (plan: LoadPlan, stop: number) => plan.route[stop - 1] ?? '';

export const useLoading = create<LoadingState>()(
  persist(
    (set, get) => {
      /** Change one truck's planning inputs, then re-plan every draft. */
      const change = (truckId: string, patch: (t: TruckPlanState) => Partial<TruckPlanState> | null) => {
        const t = get().trucks[truckId];
        if (!t) return;
        const p = patch(t);
        if (!p) return;
        set({ trucks: replanned({ ...get().trucks, [truckId]: { ...t, ...p } }) });
      };

      return {
        layout: LAYOUT,
        epoch: useInventory.getState().epoch,
        trucks: replanned(initialTrucks()),

        setRoute: (truckId, route) => change(truckId, () => (route.length >= 1 && route.length <= MAX_STOPS ? { route: [...route] } : null)),
        moveStop: (truckId, from, to) =>
          change(truckId, (t) => {
            if (from === to || from < 0 || to < 0 || from >= t.route.length || to >= t.route.length) return null;
            const route = [...t.route];
            const [city] = route.splice(from, 1);
            route.splice(to, 0, city);
            return { route };
          }),
        addStop: (truckId, city) => change(truckId, (t) => (t.route.length < MAX_STOPS && !t.route.includes(city) ? { route: [...t.route, city] } : null)),
        removeStop: (truckId, index) => change(truckId, (t) => (t.route.length > 1 && index >= 0 && index < t.route.length ? { route: t.route.filter((_, i) => i !== index) } : null)),
        setVehicle: (truckId, id) => change(truckId, () => ({ vehicle: id })),
        toggleExclude: (truckId, cargoId) => change(truckId, (t) => ({ exclude: t.exclude.includes(cargoId) ? t.exclude.filter((x) => x !== cargoId) : [...t.exclude, cargoId] })),
        addUrgent: (truckId, cargoId, stop) =>
          change(truckId, (t) => {
            const unit = useInventory.getState().cargo.find((c) => c.id === cargoId);
            const onRoute = unit ? t.route.indexOf(unit.destination) + 1 : 0;
            return {
              urgent: t.urgent.includes(cargoId) ? t.urgent : [...t.urgent, cargoId],
              include: onRoute === stop ? t.include : [...t.include.filter((i) => i.cargoId !== cargoId), { cargoId, stop }],
              exclude: t.exclude.filter((x) => x !== cargoId),
            };
          }),
        clearUrgent: (truckId, cargoId) => change(truckId, (t) => ({ urgent: t.urgent.filter((x) => x !== cargoId), include: t.include.filter((i) => i.cargoId !== cargoId) })),

        replan: () => set({ trucks: replanned(get().trucks) }),

        applyOptimised: (truckId, core, tried, ms) => {
          const t = get().trucks[truckId];
          if (!t || t.status !== 'draft') return;
          const cargo = new Map(useInventory.getState().cargo.map((c) => [c.id, c]));
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
          const confirmed: ConfirmedPlan = { ...plan, confirmedAt: Date.now(), by: CURRENT_USER, overriddenChecks: plan.checks.ok ? [] : plan.checks.issues, reason: plan.checks.ok ? null : reason };
          const stops = new Map(plan.placements.map((p) => [p.cargoId, p.stop]));
          const suffix = confirmed.reason ? ` · checks overridden: ${confirmed.reason}` : '';
          useInventory.getState().logPlanned(
            plan.placements.map((p) => p.cargoId),
            truckId,
            (id) => `stop ${stops.get(id)} ${cityOf(plan, stops.get(id) ?? 0)}${suffix}`,
          );
          set({ trucks: replanned({ ...get().trucks, [truckId]: { ...t, confirmed, status: 'confirmed', keptOutdated: false } }) });
          return { ok: true };
        },

        keep: (truckId) => {
          const t = get().trucks[truckId];
          if (!t) return;
          const why = outdated(t, useInventory.getState().cargo);
          if (!why) return;
          useInventory.getState().logNote(why.split(' ')[0], `Plan for ${truckId} kept after ${why}`);
          set({ trucks: { ...get().trucks, [truckId]: { ...t, keptOutdated: true } } });
        },

        reopen: (truckId) => change(truckId, () => ({ status: 'draft', confirmed: null, keptOutdated: false })),
        setStatus: (truckId, status) => {
          const t = get().trucks[truckId];
          if (t) set({ trucks: { ...get().trucks, [truckId]: { ...t, status } } });
        },
        newPlan: (truckId) => {
          if (!get().trucks[truckId]) return;
          set({ trucks: replanned({ ...get().trucks, [truckId]: fresh(truckId) }) });
        },
        resetAll: () => set({ epoch: useInventory.getState().epoch, trucks: replanned(initialTrucks()) }),
      };
    },
    {
      name: 'docktor.loading',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): Saved => ({ layout: s.layout, epoch: s.epoch, trucks: s.trucks }),
      merge: (saved, current) => {
        const data = saved as Partial<Saved> | undefined;
        if (!data || data.layout !== LAYOUT || data.epoch !== useInventory.getState().epoch || !data.trucks) return current;
        // Saved trucks that are still plannable; anything new starts fresh.
        const trucks = Object.fromEntries(Object.keys(current.trucks).map((id) => [id, data.trucks?.[id] ?? current.trucks[id]]));
        return { ...current, epoch: data.epoch, trucks };
      },
    },
  ),
);

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

// Keep drafts in step with the yard; a new day or a reset starts planning over.
useInventory.subscribe((s, prev) => {
  if (s.epoch !== prev.epoch) useLoading.getState().resetAll();
  else if (s.cargo !== prev.cargo) useLoading.getState().replan();
});
useLoading.getState().replan();
