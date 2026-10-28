import { SHIFT_START_MIN } from '../../game/types';

export { fmtMoney } from '../../game/ledger';

/** A time in minutes after 06:00 as a position along the timeline (0–100 %), clamped. */
export function minuteX(min: number, endMin: number): number {
  return Math.max(0, Math.min(100, (min / endMin) * 100));
}

/** Minutes after 06:00 as "HH:MM". */
export function fmtClockMin(min: number): string {
  const total = Math.floor(SHIFT_START_MIN + min + 1e-9);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
