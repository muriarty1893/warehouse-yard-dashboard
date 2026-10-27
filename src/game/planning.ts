import type { Cargo } from '../domain/types';
import { planAll } from '../loading/candidates';
import type { LoadPlan, TruckPlanInput, VehicleId } from '../loading/types';
import type { ShiftState } from './types';

/**
 * The load planner's view of the shift (spec §1.3): which trucks can be
 * planned and which yard units are free to plan.
 */

/** Units held by a confirmed plan of a truck still in the yard. */
function held(s: ShiftState): Set<string> {
  const out = new Set<string>();
  for (const tr of s.trucks) if (tr.plan && tr.stage !== 'departing' && tr.stage !== 'gone') for (const p of tr.plan.placements) out.add(p.cargoId);
  return out;
}

/** Yard units free to plan: not aboard, not gone, not on the move, not held by a confirmed plan. */
export function planningCargo(s: ShiftState): Cargo[] {
  const taken = held(s);
  return s.cargo.filter((c) => !c.loadedOn && !c.gone && !c.transitJob && !taken.has(c.id));
}

/** Outbound trucks at a bay without a confirmed plan, in docking order. */
export function planTrucks(s: ShiftState): { id: string; route: string[]; vehicle: VehicleId }[] {
  return s.trucks
    .filter((t) => t.kind === 'outbound' && t.stage === 'docked' && !t.plan)
    .sort((a, b) => (a.times.docked ?? 0) - (b.times.docked ?? 0) || a.id.localeCompare(b.id))
    .map((t) => ({ id: t.id, route: t.stops, vehicle: t.vehicle }));
}

/** The solver's plan for one truck, the other draft trucks planned around it in docking order. */
export function recommendPlan(s: ShiftState, truckId: string, overrides: Partial<Pick<TruckPlanInput, 'exclude' | 'urgent' | 'include'>> = {}): LoadPlan {
  const trucks = planTrucks(s);
  if (!trucks.some((t) => t.id === truckId)) {
    const tr = s.trucks.find((t) => t.id === truckId);
    if (tr) trucks.push({ id: tr.id, route: tr.stops, vehicle: tr.vehicle });
  }
  const inputs: TruckPlanInput[] = trucks.map((t) => ({ truckId: t.id, route: t.route, vehicle: t.vehicle, include: [], exclude: [], urgent: [], ...(t.id === truckId ? overrides : {}) }));
  return planAll(inputs, planningCargo(s), {})[truckId];
}
