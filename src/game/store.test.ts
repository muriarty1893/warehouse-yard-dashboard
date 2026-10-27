import { beforeEach, describe, expect, test, vi } from 'vitest';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });

const { clock, useSim } = await import('../sim/clock');
const { useGame } = await import('./store');
const { useProgress } = await import('./progress');
const { profit } = await import('./ledger');

beforeEach(() => {
  mem.clear();
  useProgress.getState().reset();
});

describe('game store', () => {
  test('starting a shift resets everything from the last one', () => {
    const g = useGame.getState();
    g.openBriefing('opening-gate');
    g.startShift();
    clock.t = 400;
    useGame.getState().tick();
    useGame.setState({ hint: 'basics', toasts: [{ id: 1, entry: { t: 1, kind: 'late', amount: -1, text: 'x', rule: 'r', ref: 'a' } }] });
    useGame.getState().setPaused(true);
    useSim.getState().setSpeed(4);
    useGame.getState().restart();
    const s = useGame.getState();
    expect([s.shift!.t, s.toasts.length, s.hint, s.paused, clock.t, useSim.getState().speed, s.screen]).toEqual([0, 0, null, false, 0, 1, 'shift']);
  });

  test('ticking turns money events into toasts, at most three, newest first', () => {
    const g = useGame.getState();
    g.openBriefing('opening-gate');
    g.startShift();
    clock.t = useGame.getState().shift!.end - 1;
    useGame.getState().tick();
    clock.t = useGame.getState().shift!.end + 1;
    useGame.getState().tick();
    const s = useGame.getState();
    expect(s.toasts.length).toBeLessThanOrEqual(3);
    expect(s.toasts.length).toBeGreaterThan(0);
    expect(s.toasts[0].id).toBeGreaterThan(s.toasts.at(-1)!.id - 1);
  });

  test('the first hint shows once and is remembered', () => {
    const g = useGame.getState();
    g.openBriefing('opening-gate');
    g.startShift();
    useGame.getState().tick();
    expect(useGame.getState().hint).toBe('basics');
    expect(useProgress.getState().hintsSeen).toContain('basics');
    useGame.getState().restart();
    useGame.getState().tick();
    expect(useGame.getState().hint).toBeNull();
  });

  test('the end of the shift opens the report and records progress', () => {
    const g = useGame.getState();
    g.openBriefing('opening-gate');
    g.startShift();
    const shift = useGame.getState().shift!;
    clock.t = shift.end + 1;
    useGame.getState().tick();
    const s = useGame.getState();
    expect(s.screen).toBe('report');
    expect(s.report!.profit).toBe(profit(shift, shift.end));
    expect(useProgress.getState().shifts['opening-gate']).toBeDefined();
    expect(clock.speed).toBe(0);
  });

  test('actions go to the engine at the clock time', () => {
    const g = useGame.getState();
    g.openBriefing('opening-gate');
    g.startShift();
    expect(useGame.getState().act({ kind: 'overtime' })).toEqual({ ok: false, reason: 'No overtime in this shift' });
  });
});
