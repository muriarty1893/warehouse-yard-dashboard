import { create } from 'zustand';
import { clock } from './clock';

/**
 * Manager overrides on scripted vehicles: hold one (or all) in place and
 * resume later. A held vehicle's route time stops; on resume it carries on
 * from where it stopped, so routes stay pure functions of (time − hold time).
 */
interface ControlState {
  /** Sim time at which each held entity stopped. */
  holds: Record<string, number>;
  /** Total sim time each entity has already spent on hold. */
  lost: Record<string, number>;
  hold: (ids: string[]) => void;
  resume: (ids: string[]) => void;
}

export const useControl = create<ControlState>((set, get) => ({
  holds: {},
  lost: {},
  hold: (ids) => {
    const holds = { ...get().holds };
    for (const id of ids) holds[id] ??= clock.t;
    set({ holds });
  },
  resume: (ids) => {
    const holds = { ...get().holds };
    const lost = { ...get().lost };
    for (const id of ids) {
      const since = holds[id];
      if (since === undefined) continue;
      lost[id] = (lost[id] ?? 0) + (clock.t - since);
      delete holds[id];
    }
    set({ holds, lost });
  },
}));

/** An entity's own route time: the sim clock minus the time it spent on hold. */
export function entityTime(id: string, t: number) {
  const { holds, lost } = useControl.getState();
  return (holds[id] ?? t) - (lost[id] ?? 0);
}

export const isHeld = (id: string) => useControl.getState().holds[id] !== undefined;
