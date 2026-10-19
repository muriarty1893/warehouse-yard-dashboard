import { devYard } from '../config/devYard';
import { PICKS } from '../config/fleet';
import { pointInPolygon } from '../domain/geometry';
import { hashString, isStackable, makeUnit, mulberry32, type UnitLook } from '../domain/seed';
import type { Cargo } from '../domain/types';
import { checkFloor, checkStack } from './placement';

/**
 * Demo cargo for a simulated day: the storage areas filled to the day's
 * workload, in clusters of similar goods with gaps and aisles between them —
 * no fixed slots. Another day (or a busier one) gives a different layout.
 */

export type FillLevel = 'quiet' | 'normal' | 'busy' | 'peak';

export const FILL_LEVELS: Record<FillLevel, { label: string; floor: number; stack: number }> = {
  quiet: { label: 'Quiet', floor: 0.3, stack: 0.1 },
  normal: { label: 'Normal', floor: 0.52, stack: 0.25 },
  busy: { label: 'Busy', floor: 0.72, stack: 0.4 },
  peak: { label: 'Peak', floor: 0.9, stack: 0.55 },
};

const MIX: Record<string, Partial<Record<UnitLook, number>>> = {
  HS1: { cartons: 0.42, 'wrap-blue': 0.24, 'wrap-white': 0.16, crate: 0.1, bag: 0.08 },
  HS2: { cartons: 0.4, 'wrap-white': 0.3, 'wrap-blue': 0.3 },
  OY: { drum: 0.2, pipes: 0.16, crate: 0.22, bag: 0.22, machine: 0.12, cartons: 0.08 },
  GS: { bag: 0.35, crate: 0.25, cartons: 0.25, drum: 0.15 },
};

/** Smooth value noise in [0, 1] with feature size `scale` meters. */
function noise(seed: number, x: number, y: number, scale: number) {
  const lattice = (i: number, j: number) => mulberry32(hashString(`${seed}|${i}|${j}`))();
  const fx = x / scale;
  const fy = y / scale;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const u = fx - i;
  const v = fy - j;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = lattice(i, j) + (lattice(i + 1, j) - lattice(i, j)) * s(u);
  const b = lattice(i, j + 1) + (lattice(i + 1, j + 1) - lattice(i, j + 1)) * s(u);
  return a + (b - a) * s(v);
}

/** Weighted choice driven by a given uniform value (so neighbours pick alike). */
function choose<T extends string>(u: number, weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  let r = u * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) if ((r -= w) <= 0) return k;
  return entries[entries.length - 1][0];
}

export function demoCargo(fill: FillLevel, day: number, keep: Cargo[] = []): Cargo[] {
  const level = FILL_LEVELS[fill];
  const rng = mulberry32(18492 + day * 7919);
  const taken = new Set(keep.map((c) => c.id));
  let serial = 18400;
  const nextId = () => {
    do serial += 1;
    while (serial === 18492 || taken.has(`CARGO-${serial}`));
    return `CARGO-${serial}`;
  };
  const cargo: Cargo[] = [...keep];
  const put = (unit: ReturnType<typeof makeUnit>, x: number, y: number, yaw: number, extra: Partial<Cargo> = {}) => {
    const c: Cargo = { ...unit, x, y, yaw, on: null, areaId: null, source: 'demo', ...extra };
    cargo.push(c);
    taken.add(c.id);
    return c;
  };

  // Fixed demo items: the spec's worked example, a box group, and the pallets the scripted forklifts work.
  const fixed: [ReturnType<typeof makeUnit>, number, number, number, string, boolean][] = [
    [{ ...makeUnit(rng, 'CARGO-18492', 'cartons', { destination: 'Ankara', description: 'Pallet · Ankara' }), weightKg: 720, dims: { l: 1.2, w: 0.8, h: 1.0 } }, 41.6, 33.3, 0, 'HS1', true],
    [makeUnit(rng, 'GROUP-0042', 'group-cartons', { description: '20 identical boxes' }), 46.4, 36.6, 0, 'HS1', true],
    [makeUnit(rng, nextId(), 'cartons'), PICKS.platform[0], PICKS.platform[1], Math.PI / 2, 'HS1', false],
    [makeUnit(rng, nextId(), 'bag'), PICKS.ground[0], PICKS.ground[1], 0, 'OY', false],
  ];
  for (const [unit, x, y, yaw, areaId, pinned] of fixed) {
    if (taken.has(unit.id)) continue;
    put(unit, x, y, yaw, { areaId, pinned });
  }

  for (const area of devYard.storage) {
    const mix = MIX[area.id] ?? MIX.HS1;
    for (const part of area.parts) {
      const xs = part.map((p) => p[0]);
      const ys = part.map((p) => p[1]);
      const candidates: { x: number; y: number; n: number }[] = [];
      for (let x = Math.min(...xs) + 1; x < Math.max(...xs); x += 1.95) {
        for (let y = Math.max(...ys) - 0.95; y > Math.min(...ys); y -= 1.72) {
          if (pointInPolygon(x, y, part)) candidates.push({ x, y, n: noise(day, x, y, 6.5) });
        }
      }
      // Fill the lowest-noise share of the area: clustered goods, open pockets elsewhere.
      candidates.sort((a, b) => a.n - b.n);
      for (const cand of candidates.slice(0, Math.round(candidates.length * level.floor))) {
        const look = choose(noise(day + 101, cand.x, cand.y, 5), mix);
        const unit = makeUnit(rng, nextId(), look);
        const along = noise(day + 31, cand.x, cand.y, 9) > 0.62 ? Math.PI / 2 : 0;
        const x = cand.x + (rng() - 0.5) * 0.16;
        const y = cand.y + (rng() - 0.5) * 0.16;
        const yaw = along + (rng() - 0.5) * 0.06;
        const r = checkFloor(cargo, unit, x, y, yaw);
        if (!r.ok || r.areaId !== area.id) {
          serial -= 1;
          continue;
        }
        const base = put(unit, x, y, yaw, { areaId: area.id });
        if (isStackable(look) && rng() < level.stack) {
          const top = makeUnit(rng, nextId(), rng() < 0.8 ? look : choose(rng(), mix));
          if (checkStack(cargo, top, base.id).ok) put(top, x, y, yaw, { areaId: area.id, on: base.id });
          else serial -= 1;
        }
      }
    }
  }
  return cargo;
}
