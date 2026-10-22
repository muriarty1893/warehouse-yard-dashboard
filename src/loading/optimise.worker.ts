import { optimise, type OptimiseArgs } from './optimise';

/** Runs Optimise off the main thread (see optimiseInWorker). */
const ctx = self as unknown as { onmessage: ((e: MessageEvent<OptimiseArgs>) => void) | null; postMessage: (message: unknown) => void };

ctx.onmessage = (e) => {
  const { vehicle, items, route, maxTries, budgetMs } = e.data;
  ctx.postMessage(optimise(vehicle, items, route, { maxTries, budgetMs }));
};
