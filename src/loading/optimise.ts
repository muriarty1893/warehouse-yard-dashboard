import { CLEARANCES } from './pack';
import { buildPlan } from './plan';
import type { PackItem, PackOptions, PlanCore, VehicleSpec } from './types';

/**
 * Optimise (spec §1.6): try up to 1,000 seeded packing variants within a
 * time budget and keep the best. Seed 0 is the deterministic baseline.
 */

export interface OptimiseArgs {
  vehicle: VehicleSpec;
  items: PackItem[];
  route: string[];
  maxTries?: number;
  budgetMs?: number;
}

export interface OptimiseResult {
  plan: PlanCore;
  tried: number;
  ms: number;
}

const headroom = (p: PlanCore) => Math.min(100, ...p.checks.states.flatMap((s) => s.axles.map((a) => 100 - a.pct)));
const cogOffset = (p: PlanCore) => {
  const w = p.checks.window;
  return w && p.checks.cogX !== null ? Math.abs(p.checks.cogX - (w[0] + w[1]) / 2) : 0;
};

/** Negative when `a` is the better plan: legal, urgent units, units, weight, axle headroom, CoG near the window centre. */
export function rankPlans(a: PlanCore, b: PlanCore): number {
  const key = (p: PlanCore) => [p.checks.ok ? 0 : 1, -p.stats.urgent, -p.stats.units, -p.stats.weightKg, -headroom(p), cogOffset(p)];
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < ka.length; i++) if (Math.abs(ka[i] - kb[i]) > 1e-6) return ka[i] - kb[i];
  return 0;
}

function variant(v: VehicleSpec, seed: number): Partial<PackOptions> {
  if (seed === 0) return {};
  const clearances = CLEARANCES.filter((c) => c < v.inner.l * 0.3);
  return { seed, shuffle: true, yawFirst: seed & 1 ? 90 : 0, side: seed & 2 ? -1 : 1, jitter: 0.2, clearance: clearances[(seed >> 2) % clearances.length] };
}

/** The search, pausing every `chunk` tries so a caller without workers can yield to the page. */
function* search(args: OptimiseArgs, now: () => number, chunk = 50): Generator<void, OptimiseResult> {
  const { vehicle: v, items, route } = args;
  const maxTries = args.maxTries ?? 1000;
  const budget = args.budgetMs ?? 600;
  const t0 = now();
  let best: PlanCore | null = null;
  let tried = 0;
  while (tried < maxTries && (tried === 0 || now() - t0 < budget)) {
    const plan = buildPlan(v, items, route, variant(v, tried));
    if (!best || rankPlans(plan, best) < 0) best = plan;
    tried += 1;
    if (tried % chunk === 0) yield;
  }
  return { plan: best!, tried, ms: now() - t0 };
}

export function optimise(v: VehicleSpec, items: PackItem[], route: string[], opts: { maxTries?: number; budgetMs?: number; now?: () => number } = {}): OptimiseResult {
  const it = search({ vehicle: v, items, route, maxTries: opts.maxTries, budgetMs: opts.budgetMs }, opts.now ?? (() => performance.now()));
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

async function optimiseChunked(args: OptimiseArgs): Promise<OptimiseResult> {
  const it = search(args, () => performance.now());
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Optimise off the main thread so the 3D view keeps running; chunked on the main thread without workers. */
export function optimiseInWorker(args: OptimiseArgs): Promise<OptimiseResult> {
  if (typeof Worker === 'undefined') return optimiseChunked(args);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./optimise.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<OptimiseResult>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      optimiseChunked(args).then(resolve, reject);
    };
    worker.postMessage(args);
  });
}
