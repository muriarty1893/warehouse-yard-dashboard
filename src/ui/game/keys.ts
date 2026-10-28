/** Game keys (spec §4.4): 1 / 2 / 3 / 4 for 1× / 2× / 4× / 8×, Esc to pause, ` for the admin panel. Keys typed into fields are ignored. */
export type KeyAction = 'speed1' | 'speed2' | 'speed4' | 'speed8' | 'pause' | 'admin';

const MAP: Record<string, KeyAction> = { '1': 'speed1', '2': 'speed2', '3': 'speed4', '4': 'speed8', Escape: 'pause', '`': 'admin' };

export function keyAction(e: { key: string; target: unknown }): KeyAction | null {
  const tag = (e.target as { tagName?: string } | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null;
  return MAP[e.key] ?? null;
}
