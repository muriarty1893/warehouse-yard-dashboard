import { create } from 'zustand';
import { clock } from '../sim/clock';
import { recoverRuns, tickLoading } from '../sim/dockRun';
import { computeSnapshot, type WorldSnapshot } from './snapshot';

/** The dashboard's view of the World State, refreshed a few times a second. */
export const useWorld = create<WorldSnapshot>(() => computeSnapshot(clock.t));

export function startWorldSync(intervalMs = 250) {
  recoverRuns();
  const id = window.setInterval(() => {
    tickLoading(clock.t);
    useWorld.setState(computeSnapshot(clock.t), true);
  }, intervalMs);
  return () => window.clearInterval(id);
}
