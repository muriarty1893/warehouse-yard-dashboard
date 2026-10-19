import { create } from 'zustand';
import { clock } from '../sim/clock';
import { computeSnapshot, type WorldSnapshot } from './snapshot';

/** The dashboard's view of the World State, refreshed a few times a second. */
export const useWorld = create<WorldSnapshot>(() => computeSnapshot(clock.t));

export function startWorldSync(intervalMs = 250) {
  const id = window.setInterval(() => useWorld.setState(computeSnapshot(clock.t), true), intervalMs);
  return () => window.clearInterval(id);
}
