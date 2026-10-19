/**
 * Yard clock. The simulation runs in seconds; the dashboard shows yard time,
 * compressed so a truck visit (a few simulated minutes) reads like a real
 * half-hour at the dock.
 */
export const TIME_SCALE = 10;
const SHIFT_START = 8 * 3600 + 30 * 60; // 08:30

export const yardSeconds = (t: number) => SHIFT_START + t * TIME_SCALE;

export function fmtClock(t: number): string {
  const s = ((Math.floor(yardSeconds(t)) % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

/** Simulated seconds → "13 min" / "1 h 20 min" in yard time. */
export function fmtDuration(simSeconds: number): string {
  const min = Math.max(0, Math.round((simSeconds * TIME_SCALE) / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}
