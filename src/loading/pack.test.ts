import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../domain/seed';
import { axleReport } from './axles';
import { pack } from './pack';
import type { PackItem, Placement } from './types';
import { vehicleById } from './vehicles';

const pallet = (id: string, stop: number, kg: number, opts: Partial<PackItem> = {}): PackItem => ({
  id,
  stop,
  l: 1.2,
  w: 0.8,
  h: 1.2,
  weightKg: kg,
  stackable: true,
  fragile: false,
  urgent: false,
  ...opts,
});

/** A seeded mix of pallets, crates, drums and machines like the yard's demo cargo. */
function mixed(n: number, seed: number, stops: number): PackItem[] {
  const rng = mulberry32(seed);
  const kinds: Omit<PackItem, 'id' | 'stop' | 'weightKg' | 'urgent' | 'fragile'>[] = [
    { l: 1.2, w: 0.8, h: 0.94, stackable: true },
    { l: 1.2, w: 0.8, h: 1.34, stackable: true },
    { l: 1.6, w: 1.2, h: 1.1, stackable: true },
    { l: 1.5, w: 0.95, h: 1.5, stackable: false },
    { l: 1.1, w: 1.1, h: 1.3, stackable: true },
  ];
  return Array.from({ length: n }, (_, i) => ({
    id: `U${i}`,
    stop: 1 + Math.floor(rng() * stops),
    weightKg: Math.round(200 + rng() * 500),
    urgent: false,
    fragile: rng() < 0.15,
    ...kinds[Math.floor(rng() * kinds.length)],
  }));
}

const GAP = 0.02;
const apart = (a: Placement, b: Placement) =>
  a.x + a.l + GAP - 1e-6 <= b.x ||
  b.x + b.l + GAP - 1e-6 <= a.x ||
  a.y + a.w + GAP - 1e-6 <= b.y ||
  b.y + b.w + GAP - 1e-6 <= a.y ||
  a.z + a.h <= b.z + 1e-6 ||
  b.z + b.h <= a.z + 1e-6;
const yOverlap = (a: Placement, b: Placement) => a.y < b.y + b.w - 1e-6 && b.y < a.y + a.w - 1e-6;
const byId = (ps: Placement[]) => new Map(ps.map((p) => [p.cargoId, p]));

describe('packer', () => {
  it('no overlaps and inside the interior', () => {
    const v = vehicleById('rigid-26');
    const { placements } = pack(v, mixed(18, 3, 3));
    expect(placements.length).toBeGreaterThan(8);
    for (const p of placements) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.z).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x + p.l).toBeLessThanOrEqual(v.inner.l + 1e-9);
      expect(p.y + p.w).toBeLessThanOrEqual(v.inner.w + 1e-9);
      expect(p.z + p.h).toBeLessThanOrEqual(v.inner.h + 1e-9);
    }
    for (let i = 0; i < placements.length; i++) for (let j = i + 1; j < placements.length; j++) expect(apart(placements[i], placements[j])).toBe(true);
  });

  it('last stop goes to the front wall', () => {
    const items = [1, 2, 3].flatMap((stop) => [0, 1, 2, 3].map((k) => pallet(`S${stop}-${k}`, stop, 300)));
    const { placements } = pack(vehicleById('rigid-26'), items);
    expect(placements.length).toBe(12);
    const xs = (stop: number) => placements.filter((p) => p.stop === stop).map((p) => p.x);
    expect(Math.max(...xs(3))).toBeLessThan(Math.min(...xs(1)));
  });

  it('door access holds for every pair', () => {
    const { placements } = pack(vehicleById('rigid-26'), mixed(20, 7, 4), { seed: 7, shuffle: true });
    for (const u of placements) {
      for (const p of placements) {
        if (p.stop <= u.stop) continue;
        // A later-stop unit may not stand between u and the doors, nor rest on u.
        expect(p.x >= u.x + u.l - 0.01 && yOverlap(p, u)).toBe(false);
        expect(p.on).not.toBe(u.cargoId);
      }
    }
  });

  it('nothing rests on fragile or non-stackable units', () => {
    const items = mixed(20, 11, 2).map((it, i) => ({ ...it, fragile: i % 3 === 0 }));
    const { placements } = pack(vehicleById('semi-136'), items);
    const info = new Map(items.map((i) => [i.id, i]));
    const stacked = placements.filter((p) => p.on);
    expect(stacked.length).toBeGreaterThan(0);
    for (const p of stacked) {
      const below = info.get(p.on!)!;
      expect(below.stackable).toBe(true);
      expect(below.fragile).toBe(false);
      expect(info.get(p.cargoId)!.stackable).toBe(true);
    }
  });

  it('heavier never on lighter', () => {
    const { placements } = pack(vehicleById('semi-136'), mixed(24, 5, 2));
    const ps = byId(placements);
    for (const p of placements) if (p.on) expect(ps.get(p.on)!.weightKg).toBeGreaterThanOrEqual(p.weightKg);
  });

  it('support at least 80%', () => {
    const { placements } = pack(vehicleById('semi-136'), mixed(24, 9, 3));
    for (const p of placements) {
      if (p.z < 1e-6) continue;
      let area = 0;
      for (const q of placements) {
        if (Math.abs(q.z + q.h - p.z) > 0.01) continue;
        const ox = Math.max(0, Math.min(p.x + p.l, q.x + q.l) - Math.max(p.x, q.x));
        const oy = Math.max(0, Math.min(p.y + p.w, q.y + q.w) - Math.max(p.y, q.y));
        area += ox * oy;
      }
      expect(area / (p.l * p.w)).toBeGreaterThanOrEqual(0.8 - 1e-9);
    }
  });

  it('yaw only 0 or 90 and never tipped', () => {
    const items = mixed(16, 2, 2);
    const info = new Map(items.map((i) => [i.id, i]));
    for (const p of pack(vehicleById('rigid-26'), items, { yawFirst: 90 }).placements) {
      const it = info.get(p.cargoId)!;
      expect([0, 90]).toContain(p.yaw);
      expect(p.h).toBe(it.h);
      expect(p.yaw === 0 ? [p.l, p.w] : [p.w, p.l]).toEqual([it.l, it.w]);
    }
  });

  it('unit heavier than the payload is left out', () => {
    const r = pack(vehicleById('rigid-12'), [pallet('BIG', 1, 7000)]);
    expect(r.placements).toEqual([]);
    expect(r.leftOut[0].reason).toMatch(/Payload/);
  });

  it('too big for the interior is left out', () => {
    const r = pack(vehicleById('rigid-26'), [pallet('TALL', 1, 500, { h: 2.9 })]);
    expect(r.leftOut[0].reason).toMatch(/Too big/);
  });

  it('urgent units are selected first when payload runs out', () => {
    const items = Array.from({ length: 12 }, (_, i) => pallet(`P${i}`, 1, 900, { urgent: i === 11 }));
    const r = pack(vehicleById('rigid-12'), items);
    expect(r.placements.map((p) => p.cargoId)).toContain('P11');
    expect(r.leftOut.length).toBeGreaterThan(0);
  });

  it('same seed, same result', () => {
    const items = mixed(20, 4, 3);
    expect(pack(vehicleById('rigid-26'), items, { seed: 3, shuffle: true })).toEqual(pack(vehicleById('rigid-26'), items, { seed: 3, shuffle: true }));
  });

  it('leaves room at the front wall to keep the front axle legal', () => {
    const v = vehicleById('rigid-26');
    const machine = (id: string): PackItem => ({ id, stop: 3, l: 1.7, w: 1.4, h: 1.55, weightKg: 3000, stackable: false, fragile: false, urgent: false });
    const items = [machine('M1'), machine('M2'), ...[1, 2].flatMap((stop) => [0, 1, 2, 3].map((k) => pallet(`S${stop}-${k}`, stop, 400)))];
    const r = pack(v, items);
    expect(r.placements.map((p) => p.cargoId)).toEqual(expect.arrayContaining(['M1', 'M2']));
    expect(r.placements.length).toBe(10);
    expect(r.clearance).toBeGreaterThan(0);
    expect(Math.min(...r.placements.map((p) => p.x))).toBeGreaterThanOrEqual(r.clearance - 1e-9);
    const report = axleReport(v, r.placements.map((p) => ({ x: p.x + p.l / 2, kg: p.weightKg, stop: p.stop })), 3);
    expect(report.states[0].issues).toEqual([]);
  });

  it('an axle that cannot be saved names itself', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ ...pallet(`H${i}`, 1, 1900), h: 1.0 }));
    const r = pack(vehicleById('rigid-12'), items);
    const report = axleReport(vehicleById('rigid-12'), r.placements.map((p) => ({ x: p.x + p.l / 2, kg: p.weightKg, stop: p.stop })), 1);
    expect(report.states[0].axles.every((a) => a.status !== 'over')).toBe(true);
    expect(r.leftOut.some((l) => /Would overload the (front|rear) axle/.test(l.reason) || /Payload/.test(l.reason))).toBe(true);
  });

  it('loading order runs from the front wall to the doors', () => {
    const { placements } = pack(vehicleById('rigid-26'), mixed(14, 6, 3));
    const sorted = [...placements].sort((a, b) => a.seq - b.seq);
    expect(sorted.map((p) => p.seq)).toEqual(sorted.map((_, i) => i + 1));
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].x).toBeGreaterThanOrEqual(sorted[i - 1].x - 1e-9);
  });
});
