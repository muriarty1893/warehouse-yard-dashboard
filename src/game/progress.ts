import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { HintKey } from './types';

/**
 * Campaign progress (spec §2): best stars and profit per shift, and which
 * hints the player has seen. Kept in the browser; a bad saved value starts over.
 */

export interface Progress {
  version: 1;
  shifts: Record<string, { stars: 0 | 1 | 2 | 3; bestProfit: number }>;
  hintsSeen: HintKey[];
}

interface ProgressState extends Progress {
  record: (recipeId: string, profit: number, stars: 0 | 1 | 2 | 3) => { best: boolean };
  seeHint: (key: HintKey) => void;
  isUnlocked: (no: number) => boolean;
  totalStars: () => number;
  reset: () => void;
}

export const freshProgress = (): Progress => ({ version: 1, shifts: {}, hintsSeen: [] });

/** Saved data as Progress, or fresh progress when it isn't recognisable. */
export function migrateProgress(saved: unknown, version: number): Progress {
  const p = saved as Partial<Progress> | null;
  if (version !== 1 || !p || typeof p !== 'object' || !p.shifts || typeof p.shifts !== 'object' || Array.isArray(p.shifts) || !Array.isArray(p.hintsSeen)) return freshProgress();
  return { version: 1, shifts: p.shifts, hintsSeen: p.hintsSeen };
}

/** localStorage that never throws (private mode, full storage). */
export const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Progress just isn't saved this time.
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to clean up.
    }
  },
};

/** Shift ids in campaign order, set by the recipes module (kept out of here to avoid an import cycle). */
let order: string[] = [];
export const setCampaignOrder = (ids: string[]) => {
  order = ids;
};

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...freshProgress(),
      record: (recipeId, profit, stars) => {
        const was = get().shifts[recipeId];
        const best = !was || profit > was.bestProfit;
        const next = { stars: Math.max(was?.stars ?? 0, stars) as 0 | 1 | 2 | 3, bestProfit: Math.max(was?.bestProfit ?? -Infinity, profit) };
        set({ shifts: { ...get().shifts, [recipeId]: next } });
        return { best };
      },
      seeHint: (key) => {
        if (!get().hintsSeen.includes(key)) set({ hintsSeen: [...get().hintsSeen, key] });
      },
      isUnlocked: (no) => {
        if (no <= 1) return true;
        const prev = order[no - 2];
        return !!prev && (get().shifts[prev]?.stars ?? 0) >= 1;
      },
      totalStars: () => Object.values(get().shifts).reduce((sum, x) => sum + x.stars, 0),
      reset: () => set(freshProgress()),
    }),
    {
      name: 'docktor.campaign',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): Progress => ({ version: 1, shifts: s.shifts, hintsSeen: s.hintsSeen }),
      migrate: (saved, version) => migrateProgress(saved, version),
      merge: (saved, current) => ({ ...current, ...migrateProgress(saved, 1) }),
    },
  ),
);
