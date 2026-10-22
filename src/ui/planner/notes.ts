import type { Cargo } from '../../domain/types';
import type { TruckPlanState } from '../../loading/store';
import type { AxleStatus, LeftOut, LoadPlan } from '../../loading/types';
import { locationOf } from '../../world/placement';

/** Plain-language summaries for the planner panels. */

/** Units that can never go on a truck as they are (not overflow). */
export const isBlocked = (reason: string) => /^(Container|Under |Too big)/.test(reason);

const units = (n: number) => `${n} unit${n === 1 ? '' : 's'}`;

/** "3 units overflow → TRUCK-110", "2 units wait for the next truck", or null. */
export function overflowNote(leftOut: LeftOut[]): string | null {
  const spill = leftOut.filter((l) => !isBlocked(l.reason));
  if (!spill.length) return null;
  const byTruck = new Map<string, number>();
  for (const l of spill) if (l.to) byTruck.set(l.to, (byTruck.get(l.to) ?? 0) + 1);
  const waiting = spill.filter((l) => !l.to).length;
  const parts = [...byTruck].map(([truck, n]) => `${units(n)} overflow${n === 1 ? 's' : ''} → ${truck}`);
  if (waiting) parts.push(`${units(waiting)} wait${waiting === 1 ? 's' : ''} for the next truck`);
  return parts.join(' · ');
}

const RANK: Record<AxleStatus, number> = { ok: 0, near: 1, light: 2, over: 3 };
export const worstStatus = (statuses: AxleStatus[]): AxleStatus => statuses.reduce<AxleStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), 'ok');

/** Yard seconds of the day → "09:05". */
export function fmtYardTime(seconds: number) {
  const s = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

export type RowStatus = 'planned' | 'loaded' | 'overflow' | 'left' | 'excluded';
export type RowFilter = 'all' | 'truck' | 'overflow' | 'fragile';

export interface PlanRow {
  id: string;
  description: string;
  location: string;
  dims: string;
  weightKg: number;
  stop: number | null;
  status: RowStatus;
  /** Truck an overflow unit goes to. */
  to: string | null;
  reason: string | null;
  urgent: boolean;
  fragile: boolean;
}

/** One row per route unit of a truck's plan: packed (planned / loaded), left out (overflow / left), or excluded by hand. */
export function planRows(
  t: Pick<TruckPlanState, 'truckId' | 'exclude' | 'urgent' | 'include' | 'route'>,
  plan: Pick<LoadPlan, 'placements' | 'leftOut' | 'route'>,
  cargo: Cargo[],
): PlanRow[] {
  const index = new Map(cargo.map((c) => [c.id, c]));
  const urgent = new Set(t.urgent);
  const stopOf = (c: Cargo) => t.include.find((i) => i.cargoId === c.id)?.stop ?? (plan.route.indexOf(c.destination) + 1 || null);
  const row = (id: string, status: RowStatus, extra: Partial<PlanRow> = {}): PlanRow[] => {
    const c = index.get(id);
    if (!c) return [];
    return [
      {
        id,
        description: c.description,
        location: locationOf(c),
        dims: `${+c.dims.l.toFixed(2)}×${+c.dims.w.toFixed(2)}×${+c.dims.h.toFixed(2)} m`,
        weightKg: c.weightKg,
        stop: stopOf(c),
        status,
        to: null,
        reason: null,
        urgent: urgent.has(id),
        fragile: !!c.fragile,
        ...extra,
      },
    ];
  };
  return [
    ...[...plan.placements].sort((a, b) => a.seq - b.seq).flatMap((p) => row(p.cargoId, index.get(p.cargoId)?.loadedOn?.truckId === t.truckId ? 'loaded' : 'planned', { stop: p.stop })),
    ...plan.leftOut.flatMap((l) => row(l.cargoId, l.to ? 'overflow' : 'left', { to: l.to, reason: l.reason })),
    ...t.exclude.flatMap((id) => row(id, 'excluded', { reason: 'Excluded by hand' })),
  ];
}

export function filterRows(rows: PlanRow[], filter: RowFilter, query: string): PlanRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter === 'truck' && r.status !== 'planned' && r.status !== 'loaded') return false;
    if (filter === 'overflow' && r.status !== 'overflow') return false;
    if (filter === 'fragile' && !r.fragile) return false;
    return !q || `${r.id} ${r.description} ${r.location}`.toLowerCase().includes(q);
  });
}
