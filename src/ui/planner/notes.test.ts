import { describe, expect, it } from 'vitest';
import type { LeftOut } from '../../loading/types';
import { demoCargo } from '../../world/demo';
import { filterRows, fmtYardTime, isBlocked, overflowNote, planRows, worstStatus } from './notes';

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

describe('cargo table rows', () => {
  const base = demoCargo('normal', 1).filter((c) => !c.on && c.look !== 'container');
  const [a, b, c, d, e] = base;
  const cargo = [{ ...a, fragile: false, loadedOn: { truckId: 'TRUCK-102', stop: 1 } }, { ...b, fragile: false }, { ...c, fragile: true }, { ...d, fragile: false }, { ...e, fragile: false }];
  const placement = (cargoId: string, seq: number, stop: number) => ({ cargoId, seq, stop, x: 0, y: 0, z: 0, l: 1, w: 1, h: 1, yaw: 0 as const, weightKg: 100, on: null });
  const plan = {
    placements: [placement(a.id, 1, 1), placement(b.id, 2, 2)],
    leftOut: [out(c.id, 'No floor space left', 'TRUCK-110'), out(d.id, 'Under CARGO-1 — move it first')],
    route: ['Eskişehir', 'Ankara'],
  };
  const truck = { truckId: 'TRUCK-102', exclude: [e.id], urgent: [b.id], include: [] as { cargoId: string; stop: number }[], route: plan.route };

  it('gives every route unit its status', () => {
    const rows = planRows(truck, plan, cargo);
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      [a.id, 'loaded'],
      [b.id, 'planned'],
      [c.id, 'overflow'],
      [d.id, 'left'],
      [e.id, 'excluded'],
    ]);
    expect(rows[1].urgent).toBe(true);
    expect(rows[1].stop).toBe(2);
    expect(rows[2].to).toBe('TRUCK-110');
    expect(rows[3].reason).toBe('Under CARGO-1 — move it first');
    expect(rows[2].fragile).toBe(true);
  });

  it('filters by tab and search', () => {
    const rows = planRows(truck, plan, cargo);
    expect(filterRows(rows, 'truck', '').map((r) => r.id)).toEqual([a.id, b.id]);
    expect(filterRows(rows, 'overflow', '').map((r) => r.id)).toEqual([c.id]);
    expect(filterRows(rows, 'fragile', '').map((r) => r.id)).toEqual([c.id]);
    expect(filterRows(rows, 'all', b.id.toLowerCase()).map((r) => r.id)).toEqual([b.id]);
  });
});
