import { describe, expect, it } from 'vitest';
import type { LeftOut } from '../../loading/types';
import { fmtYardTime, isBlocked, overflowNote, worstStatus } from './notes';

const out = (cargoId: string, reason: string, to: string | null = null): LeftOut => ({ cargoId, reason, to });

describe('planner notes', () => {
  it('blocked units are not overflow', () => {
    expect(isBlocked('Container — goes on a chassis, not into a truck')).toBe(true);
    expect(isBlocked('Under CARGO-18401 — move it first')).toBe(true);
    expect(isBlocked('Too big for this vehicle (h 2.9 m > 2.65 m)')).toBe(true);
    expect(isBlocked('Payload: 14.8 t limit reached')).toBe(false);
  });

  it('names the truck that takes the overflow, else the units that wait', () => {
    expect(overflowNote([out('A', 'Payload: 6 t limit reached', 'TRUCK-110'), out('B', 'No floor space left', 'TRUCK-110'), out('C', 'Under X — move it first')])).toBe('2 units overflow → TRUCK-110');
    expect(overflowNote([out('A', 'No floor space left'), out('B', 'Would overload the front axle (9 t)', 'TRUCK-109')])).toBe('1 unit overflows → TRUCK-109 · 1 unit waits for the next truck');
    expect(overflowNote([out('C', 'Under X — move it first')])).toBeNull();
  });

  it('picks the worst axle state across all drops', () => {
    expect(worstStatus(['ok', 'near', 'ok'])).toBe('near');
    expect(worstStatus(['near', 'light'])).toBe('light');
    expect(worstStatus(['light', 'over'])).toBe('over');
    expect(worstStatus([])).toBe('ok');
  });

  it('formats yard seconds as a clock, past midnight too', () => {
    expect(fmtYardTime(9 * 3600 + 5 * 60)).toBe('09:05');
    expect(fmtYardTime(25 * 3600 + 30 * 60)).toBe('01:30');
  });
});
