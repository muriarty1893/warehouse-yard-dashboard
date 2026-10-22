import { create } from 'zustand';
import type { EntityRef } from './ui';

/** Camera requests from the UI / keyboard, carried out by <CameraRig /> in the scene. */
export type CameraCommand =
  | { kind: 'zoom'; factor: number }
  | { kind: 'rotate'; angle: number }
  | { kind: 'home' }
  | { kind: 'top' }
  | { kind: 'focus'; ref?: EntityRef; x: number; y: number; h?: number; distance?: number }
  /** Look at a yard point from a direction (yaw CCW from east, pitch up from level), with a field of view. */
  | { kind: 'frame'; x: number; y: number; h: number; yaw: number; pitch: number; distance: number; fov: number; near?: number }
  /** Fly back to where the camera was before the first `frame`. */
  | { kind: 'restore' };

export type PlannerView = '3d' | 'side' | 'top' | 'plan';

interface ViewState {
  command: (CameraCommand & { id: number }) | null;
  follow: EntityRef | null;
  help: boolean;
  layers: boolean;
  /** Load planner open for this truck (spec §2.1). */
  planner: { truckId: string } | null;
  plannerView: PlannerView;
  send: (command: CameraCommand) => void;
  setFollow: (ref: EntityRef | null) => void;
  toggleHelp: (open?: boolean) => void;
  toggleLayers: (open?: boolean) => void;
  openPlanner: (truckId: string) => void;
  closePlanner: () => void;
  setPlannerView: (view: PlannerView) => void;
}

let nextId = 1;

export const useView = create<ViewState>((set, get) => ({
  command: null,
  follow: null,
  help: false,
  layers: false,
  planner: null,
  plannerView: '3d',
  send: (command) => set({ command: { ...command, id: nextId++ } }),
  setFollow: (follow) => set({ follow }),
  toggleHelp: (open) => set({ help: open ?? !get().help, layers: false }),
  toggleLayers: (open) => set({ layers: open ?? !get().layers, help: false }),
  openPlanner: (truckId) => set({ planner: { truckId }, plannerView: '3d', follow: null, help: false, layers: false }),
  closePlanner: () => {
    if (!get().planner) return;
    set({ planner: null, follow: null });
    get().send({ kind: 'restore' });
  },
  setPlannerView: (plannerView) => set({ plannerView }),
}));
