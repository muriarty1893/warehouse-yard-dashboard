/** Game keys (spec §4.4): 1 / 2 / 3 for 1× / 2× / 4×, Esc to pause. Keys typed into fields are ignored. */
export type KeyAction = 'speed1' | 'speed2' | 'speed4' | 'pause';

const MAP: Record<string, KeyAction> = { '1': 'speed1', '2': 'speed2', '3': 'speed4', Escape: 'pause' };

export function keyAction(e: { key: string; target: unknown }): KeyAction | null {
  const tag = (e.target as { tagName?: string } | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null;
  return MAP[e.key] ?? null;
}
