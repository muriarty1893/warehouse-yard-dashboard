import { describe, expect, test } from 'vitest';
import { fmtClockMin, minuteX } from './format';

describe('HUD formatting', () => {
  test('minutes after 06:00 to a timeline position', () => {
    expect(minuteX(0, 480)).toBe(0);
    expect(minuteX(240, 480)).toBe(50);
    expect(minuteX(600, 510)).toBe(100);
    expect(minuteX(-10, 480)).toBe(0);
  });
  test('minutes after 06:00 as a clock', () => {
    expect(fmtClockMin(282)).toBe('10:42');
    expect(fmtClockMin(0)).toBe('06:00');
  });
});
