import { axleReport } from './axles';
import { pack } from './pack';
import type { PackItem, PackOptions, PlanCore, RowStat, VehicleSpec } from './types';

/** Pack, then check the axles at every stop and describe the result (rows, fill, what limits it). */
export function buildPlan(v: VehicleSpec, items: PackItem[], route: string[], opts: Partial<PackOptions> = {}): PlanCore {
  const { placements, leftOut, clearance } = pack(v, items, opts);
  const checks = axleReport(
    v,
    placements.map((p) => ({ x: p.x + p.l / 2, kg: p.weightKg, stop: p.stop })),
    route.length,
  );
  const { l: L, w: W, h: H } = v.inner;

  const n = Math.max(1, Math.round(L / 1.2));
  const rows: RowStat[] = Array.from({ length: n }, (_, i) => {
    const x0 = (i * L) / n;
    const x1 = ((i + 1) * L) / n;
    let volume = 0;
    let kg = 0;
    let top: { id: string; kg: number } | null = null;
    for (const p of placements) {
      const along = Math.min(x1, p.x + p.l) - Math.max(x0, p.x);
      if (along <= 0) continue;
      volume += along * p.w * p.h;
      const share = (p.weightKg * along) / p.l;
      kg += share;
      if (!top || share > top.kg) top = { id: p.cargoId, kg: share };
    }
    return { index: i + 1, x0, x1, fillPct: (volume / ((x1 - x0) * W * H)) * 100, kg, topId: top?.id ?? null };
  });

  const weightKg = placements.reduce((s, p) => s + p.weightKg, 0);
  const volumePct = (placements.reduce((s, p) => s + p.l * p.w * p.h, 0) / (L * W * H)) * 100;
  const worst = checks.states.flatMap((s) => s.axles).reduce<{ label: string; pct: number } | null>((m, a) => (!m || a.pct > m.pct ? a : m), null);
  const limitedBy =
    worst && worst.pct >= 90 ? worst.label.toLowerCase() : volumePct >= 85 || leftOut.some((l) => /space|No room/.test(l.reason)) ? 'floor space' : 'payload';

  return {
    vehicle: v.id,
    route,
    placements,
    leftOut,
    checks,
    rows,
    clearance,
    seed: opts.seed ?? 0,
    stats: {
      units: placements.length,
      candidates: items.length,
      weightKg,
      remainingKg: v.payloadKg - weightKg,
      volumePct,
      weightPct: (weightKg / v.payloadKg) * 100,
      rowsUsed: rows.filter((r) => r.kg > 0).length,
      rows: n,
      limitedBy,
    },
  };
}
