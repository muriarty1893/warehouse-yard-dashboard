import type { AxleStatus, LeftOut } from '../../loading/types';

/** Plain-language summaries for the planner panels. */

/** Units that can never go on a truck as they are (not overflow). */
export const isBlocked = (reason: string) => /^(Container|Under |Too big)/.test(reason);

const units = (n: number) => `${n} unit${n === 1 ? '' : 's'}`;

/** "3 units overflow → TRUCK-110", "2 units wait for the next truck", or null. */
export function overflowNote(leftOut: LeftOut[]): string | null {
  const spill = leftOut.filter((l) => !isBlocked(l.reason));
  if (!spill.length) return null;
  const byTruck = new Map<string, number>();
  for (const l of spill) if (l.to) byTruck.set(l.to, (byTruck.get(l.to) ?? 0) + 1);
  const waiting = spill.filter((l) => !l.to).length;
  const parts = [...byTruck].map(([truck, n]) => `${units(n)} overflow${n === 1 ? 's' : ''} → ${truck}`);
  if (waiting) parts.push(`${units(waiting)} wait${waiting === 1 ? 's' : ''} for the next truck`);
  return parts.join(' · ');
}

const RANK: Record<AxleStatus, number> = { ok: 0, near: 1, light: 2, over: 3 };
export const worstStatus = (statuses: AxleStatus[]): AxleStatus => statuses.reduce<AxleStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), 'ok');

/** Yard seconds of the day → "09:05". */
export function fmtYardTime(seconds: number) {
  const s = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}
