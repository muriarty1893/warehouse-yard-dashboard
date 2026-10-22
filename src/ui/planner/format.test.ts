import { describe, expect, it } from 'vitest';
import { fmtKg, fmtT, STOP_COLORS, stopColor } from './format';

describe('planner formatting', () => {
  it('formats tonnes and kilograms', () => {
    expect(fmtT(6521)).toBe('6.52 t');
    expect(fmtT(0)).toBe('0.00 t');
    expect(fmtKg(6521)).toBe('6,521 kg');
    expect(fmtKg(734.4)).toBe('734 kg');
  });

  it('gives each stop its colour', () => {
    expect(STOP_COLORS).toEqual(['#f0932b', '#2f5ff0', '#22b35e', '#7a5af0', '#e0527a']);
    expect(stopColor(1)).toBe('#f0932b');
    expect(stopColor(5)).toBe('#e0527a');
  });
});
