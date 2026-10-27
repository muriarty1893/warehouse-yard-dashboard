import { create } from 'zustand';

export type EntityKind = 'cargo' | 'truck' | 'forklift' | 'worker';

export interface EntityRef {
  kind: EntityKind;
  id: string;
}

/** Modal forms: the load planner's urgent unit and confirm-anyway prompt. */
export type Dialog =
  | { kind: 'urgent'; truckId: string }
  | { kind: 'confirm'; truckId: string }
  | null;

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

interface UiState {
  hovered: EntityRef | null;
  selected: EntityRef | null;
  dialog: Dialog;
  toast: Toast | null;
  /** Brief ring where something was just put down. */
  pulse: { x: number; y: number; h: number; id: number } | null;
  hover: (ref: EntityRef | null) => void;
  unhover: (ref: EntityRef) => void;
  select: (ref: EntityRef | null) => void;
  openDialog: (dialog: Dialog) => void;
  notify: (text: string, tone?: Toast['tone']) => void;
  pulseAt: (x: number, y: number, h: number) => void;
}

let toastId = 0;

/** View state only (hover / selection / open forms). Never holds World State. */
export const useUi = create<UiState>((set, get) => ({
  hovered: null,
  selected: null,
  dialog: null,
  toast: null,
  pulse: null,
  hover: (ref) => set({ hovered: ref }),
  unhover: (ref) => {
    const h = get().hovered;
    if (h && h.kind === ref.kind && h.id === ref.id) set({ hovered: null });
  },
  select: (ref) => set({ selected: ref }),
  openDialog: (dialog) => set({ dialog }),
  notify: (text, tone = 'ok') => set({ toast: { id: ++toastId, text, tone } }),
  pulseAt: (x, y, h) => set({ pulse: { x, y, h, id: ++toastId } }),
}));

useUi.subscribe((s) => {
  if (typeof document !== 'undefined') document.body.style.cursor = s.hovered ? 'pointer' : '';
});

/** Is this entity hovered or selected? Components re-render only when it flips. */
export const useHighlight = (kind: EntityKind, id: string) =>
  useUi((s) => {
    const sel = s.selected?.kind === kind && s.selected.id === id;
    const hov = s.hovered?.kind === kind && s.hovered.id === id;
    return sel ? 'selected' : hov ? 'hovered' : null;
  });
