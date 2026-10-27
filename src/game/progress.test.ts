import { beforeEach, describe, expect, test, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const { useProgress, freshProgress, migrateProgress } = await import('./progress');
await import('./recipes'); // registers the campaign order

beforeEach(() => {
  store.clear();
  useProgress.getState().reset();
});

describe('campaign progress', () => {
  test('record keeps the best stars and the best profit independently', () => {
    const p = useProgress.getState();
    expect(p.record('opening-gate', 4000, 2)).toEqual({ best: true });
    expect(p.record('opening-gate', 5000, 1)).toEqual({ best: true });
    expect(p.record('opening-gate', 3000, 3)).toEqual({ best: false });
    expect(useProgress.getState().shifts['opening-gate']).toEqual({ stars: 3, bestProfit: 5000 });
    expect(useProgress.getState().totalStars()).toBe(3);
  });

  test('a shift unlocks once the one before it has a star', () => {
    const p = useProgress.getState();
    expect(p.isUnlocked(1)).toBe(true);
    expect(p.isUnlocked(2)).toBe(false);
    p.record('opening-gate', 100, 0);
    expect(useProgress.getState().isUnlocked(2)).toBe(false);
    p.record('opening-gate', 3000, 1);
    expect(useProgress.getState().isUnlocked(2)).toBe(true);
  });

  test('hints are remembered and saved', () => {
    useProgress.getState().seeHint('basics');
    useProgress.getState().seeHint('basics');
    expect(useProgress.getState().hintsSeen).toEqual(['basics']);
    expect(store.get('docktor.campaign')).toContain('basics');
  });

  test('corrupt or unknown saved data loads as fresh progress', () => {
    expect(migrateProgress(5, 0)).toEqual(freshProgress());
    expect(migrateProgress({ shifts: 'nope' }, 1)).toEqual(freshProgress());
    expect(migrateProgress({ version: 1, shifts: { a: { stars: 2, bestProfit: 10 } }, hintsSeen: ['basics'] }, 1)).toEqual({ version: 1, shifts: { a: { stars: 2, bestProfit: 10 } }, hintsSeen: ['basics'] });
  });
});
