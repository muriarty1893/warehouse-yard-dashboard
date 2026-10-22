import { useFrame } from '@react-three/fiber';
import { create } from 'zustand';

/**
 * The single simulation clock. Everything that moves reads `clock.t`; only
 * <SimClock /> advances it, once per frame, before anything else updates.
 */
export const clock = { t: 40, speed: 1 };

export const SPEEDS = [1, 2, 4, 8] as const;

interface SimControls {
  speed: number;
  paused: boolean;
  setSpeed: (speed: number) => void;
  togglePause: () => void;
}

/** Time controls (pause / 1× … 8×); keeps `clock.speed` in step. */
export const useSim = create<SimControls>((set, get) => ({
  speed: 1,
  paused: false,
  setSpeed: (speed) => {
    clock.speed = speed;
    set({ speed, paused: false });
  },
  togglePause: () => {
    const paused = !get().paused;
    clock.speed = paused ? 0 : get().speed;
    set({ paused });
  },
}));

/** Longest frame step the clock takes: frames are rare while the planner's 2D plan covers the view. */
export const frameStep = { max: 0.1 };

export function SimClock() {
  useFrame((_, dt) => {
    clock.t += Math.min(dt, frameStep.max) * clock.speed;
  }, -10);
  return null;
}
