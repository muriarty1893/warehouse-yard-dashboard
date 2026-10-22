import { create } from 'zustand';
import type { CargoInput, DocumentInput } from '../world/inventory';

export type EntityKind = 'cargo' | 'truck' | 'forklift' | 'worker';

export interface EntityRef {
  kind: EntityKind;
  id: string;
}

/** Modal forms: a source document, registering / editing a cargo unit, the load planner's urgent unit and confirm-anyway prompt. */
export type Dialog =
  | { kind: 'document'; cargoId: string; docId?: string }
  | { kind: 'cargo'; cargoId?: string; draft?: RegisterDraft }
  | { kind: 'urgent'; truckId: string }
  | { kind: 'confirm'; truckId: string }
  | null;

/** A cargo unit filled in on the register form, waiting to be put down on the map. */
export interface RegisterDraft {
  input: CargoInput;
  doc?: DocumentInput;
}

/** Map placement mode: moving a unit, or putting down a newly registered one. */
export type Placing = { kind: 'move'; cargoId: string } | { kind: 'register'; draft: RegisterDraft };

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

interface UiState {
  hovered: EntityRef | null;
  selected: EntityRef | null;
  placing: Placing | null;
  /** Rotation of the unit being placed (R turns it). */
  placeYaw: number;
  dialog: Dialog;
  toast: Toast | null;
  /** Brief ring where something was just put down. */
  pulse: { x: number; y: number; h: number; id: number } | null;
  hover: (ref: EntityRef | null) => void;
  unhover: (ref: EntityRef) => void;
  select: (ref: EntityRef | null) => void;
  setPlacing: (placing: Placing | null, yaw?: number) => void;
  rotatePlacing: () => void;
  openDialog: (dialog: Dialog) => void;
  notify: (text: string, tone?: Toast['tone']) => void;
  pulseAt: (x: number, y: number, h: number) => void;
}

let toastId = 0;

/** View state only (hover / selection / open forms). Never holds World State. */
export const useUi = create<UiState>((set, get) => ({
  hovered: null,
  selected: null,
  placing: null,
  placeYaw: 0,
  dialog: null,
  toast: null,
  pulse: null,
  hover: (ref) => set({ hovered: ref }),
  unhover: (ref) => {
    const h = get().hovered;
    if (h && h.kind === ref.kind && h.id === ref.id) set({ hovered: null });
  },
  select: (ref) => set({ selected: ref }),
  setPlacing: (placing, yaw) => set({ placing, placeYaw: yaw ?? get().placeYaw }),
  rotatePlacing: () => set({ placeYaw: (get().placeYaw + Math.PI / 2) % (2 * Math.PI) }),
  openDialog: (dialog) => set({ dialog }),
  notify: (text, tone = 'ok') => set({ toast: { id: ++toastId, text, tone } }),
  pulseAt: (x, y, h) => set({ pulse: { x, y, h, id: ++toastId } }),
}));

useUi.subscribe((s) => {
  document.body.style.cursor = s.hovered ? 'pointer' : s.placing ? 'crosshair' : '';
});

/** Is this entity hovered or selected? Components re-render only when it flips. */
export const useHighlight = (kind: EntityKind, id: string) =>
  useUi((s) => {
    const sel = s.selected?.kind === kind && s.selected.id === id;
    const hov = s.hovered?.kind === kind && s.hovered.id === id;
    return sel ? 'selected' : hov ? 'hovered' : null;
  });
