import { create } from 'zustand';
import type { EntityRef } from './ui';

/** Camera requests from the UI / keyboard, carried out by <CameraRig /> in the scene. */
export type CameraCommand =
  | { kind: 'zoom'; factor: number }
  | { kind: 'rotate'; angle: number }
  | { kind: 'home' }
  | { kind: 'top' }
  | { kind: 'focus'; ref?: EntityRef; x: number; y: number; h?: number; distance?: number };

interface ViewState {
  command: (CameraCommand & { id: number }) | null;
  follow: EntityRef | null;
  help: boolean;
  layers: boolean;
  send: (command: CameraCommand) => void;
  setFollow: (ref: EntityRef | null) => void;
  toggleHelp: (open?: boolean) => void;
  toggleLayers: (open?: boolean) => void;
}

let nextId = 1;

export const useView = create<ViewState>((set, get) => ({
  command: null,
  follow: null,
  help: false,
  layers: false,
  send: (command) => set({ command: { ...command, id: nextId++ } }),
  setFollow: (follow) => set({ follow }),
  toggleHelp: (open) => set({ help: open ?? !get().help, layers: false }),
  toggleLayers: (open) => set({ layers: open ?? !get().layers, help: false }),
}));
