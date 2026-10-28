import { useMemo } from 'react';
import { useGame } from '../../game/store';
import type { ShiftState } from '../../game/types';
import { clock } from '../../sim/clock';

/**
 * A view of the running shift at the clock time, re-read on every engine tick
 * (four times a second), never per frame.
 */
export function useShiftView<T>(fn: (s: ShiftState, t: number) => T): T | null {
  const shift = useGame((s) => s.shift);
  const version = useGame((s) => s.version);
  // The shift is mutated in place: `version` is what changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (shift ? fn(shift, clock.t) : null), [shift, version]);
}

/** Act on the shift; returns the engine's answer. */
export const act = (...a: Parameters<ReturnType<typeof useGame.getState>['act']>) => useGame.getState().act(...a);
