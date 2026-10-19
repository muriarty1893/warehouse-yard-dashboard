import { create } from 'zustand';

export type EntityKind = 'cargo' | 'truck' | 'forklift' | 'worker';

export interface EntityRef {
  kind: EntityKind;
  id: string;
}

interface UiState {
  hovered: EntityRef | null;
  selected: EntityRef | null;
  hover: (ref: EntityRef | null) => void;
  unhover: (ref: EntityRef) => void;
  select: (ref: EntityRef | null) => void;
}

/** View state only (hover / selection). Never holds World State. */
export const useUi = create<UiState>((set, get) => ({
  hovered: null,
  selected: null,
  hover: (ref) => set({ hovered: ref }),
  unhover: (ref) => {
    const h = get().hovered;
    if (h && h.kind === ref.kind && h.id === ref.id) set({ hovered: null });
  },
  select: (ref) => set({ selected: ref }),
}));

useUi.subscribe((s) => {
  document.body.style.cursor = s.hovered ? 'pointer' : '';
});

/** Is this entity hovered or selected? Components re-render only when it flips. */
export const useHighlight = (kind: EntityKind, id: string) =>
  useUi((s) => {
    const sel = s.selected?.kind === kind && s.selected.id === id;
    const hov = s.hovered?.kind === kind && s.hovered.id === id;
    return sel ? 'selected' : hov ? 'hovered' : null;
  });
