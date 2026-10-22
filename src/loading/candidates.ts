import { hashString, isStackable } from '../domain/seed';
import type { Cargo } from '../domain/types';
import { inYard } from '../world/placement';
import { tooBig } from './pack';
import { buildPlan } from './plan';
import type { LeftOut, LoadPlan, PackItem, TruckPlanInput } from './types';
import { vehicleById } from './vehicles';

/**
 * Which yard units a truck can take (spec §1.2), and planning every truck in
 * queue order with overflow to the next one (spec §1.7).
 */

/** What the goods are, and where they stand: a confirmed plan is out of date when either changes. */
export function fingerprint(c: Cargo): { goods: number; spot: number } {
  return {
    goods: hashString(JSON.stringify([c.dims, c.weightKg, c.look, !!c.fragile, c.destination])),
    spot: hashString(JSON.stringify([c.x, c.y, c.yaw, c.on])),
  };
}

export const inputsHash = (input: TruckPlanInput) => hashString(JSON.stringify([input.route, input.vehicle, input.include, input.exclude, input.urgent]));

export function candidatesFor(input: TruckPlanInput, cargo: Cargo[], taken: Set<string>): { items: PackItem[]; blocked: LeftOut[] } {
  const v = vehicleById(input.vehicle);
  const included = new Map(input.include.map((i) => [i.cargoId, i.stop]));
  const exclude = new Set(input.exclude);
  const urgent = new Set(input.urgent);
  const items: PackItem[] = [];
  const blocked: LeftOut[] = [];
  for (const c of cargo) {
    if (!inYard(c) || taken.has(c.id) || exclude.has(c.id)) continue;
    const onRoute = input.route.indexOf(c.destination) + 1;
    const stop = included.get(c.id) ?? onRoute;
    if (!stop) continue;
    const block = (reason: string) => blocked.push({ cargoId: c.id, reason, to: null });
    const top = cargo.find((o) => o.on === c.id);
    if (c.look === 'container') block('Container — goes on a chassis, not into a truck');
    else if (top) block(`Under ${top.id} — move it first`);
    else {
      const big = tooBig(v, c.dims);
      if (big) block(big);
      else items.push({ id: c.id, stop, l: c.dims.l, w: c.dims.w, h: c.dims.h, weightKg: c.weightKg, stackable: isStackable(c.look), fragile: !!c.fragile, urgent: urgent.has(c.id) });
    }
  }
  return { items, blocked };
}

/**
 * Plan every truck in queue order. A confirmed plan stays as it is and keeps
 * its units; a draft takes what is left. Units a truck leaves out go to the
 * truck that took them further down the queue, else they wait.
 */
export function planAll(inputs: TruckPlanInput[], cargo: Cargo[], confirmed: Record<string, LoadPlan | null>): Record<string, LoadPlan> {
  const placedBy = new Map<string, string>();
  for (const [truckId, plan] of Object.entries(confirmed)) for (const p of plan?.placements ?? []) placedBy.set(p.cargoId, truckId);
  const byId = new Map(cargo.map((c) => [c.id, c]));
  const plans: Record<string, LoadPlan> = {};

  for (const input of inputs) {
    const kept = confirmed[input.truckId];
    if (kept) {
      plans[input.truckId] = kept;
      continue;
    }
    const taken = new Set([...placedBy.keys()]);
    const { items, blocked } = candidatesFor(input, cargo, taken);
    const core = buildPlan(vehicleById(input.vehicle), items, input.route);
    const units: LoadPlan['units'] = {};
    for (const p of core.placements) {
      placedBy.set(p.cargoId, input.truckId);
      const c = byId.get(p.cargoId);
      if (c) units[p.cargoId] = fingerprint(c);
    }
    plans[input.truckId] = {
      ...core,
      leftOut: [...blocked, ...core.leftOut],
      stats: { ...core.stats, candidates: items.length + blocked.length },
      tried: 1,
      ms: 0,
      inputsHash: inputsHash(input),
      units,
    };
  }

  for (const [truckId, plan] of Object.entries(plans)) {
    if (confirmed[truckId]) continue;
    plan.leftOut = plan.leftOut.map((l) => ({ ...l, to: placedBy.get(l.cargoId) ?? null }));
  }
  return plans;
}
