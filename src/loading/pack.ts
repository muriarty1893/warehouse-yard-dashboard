import { mulberry32 } from '../domain/seed';
import type { LeftOut, PackItem, PackOptions, Placement, VehicleSpec } from './types';
import { axleCoefficients } from './vehicles';

/**
 * Extreme-point packer (spec §1.5): last stop at the front wall, floor and
 * heavy units first, stacking only on sturdy units of the same or a later
 * stop, every earlier stop able to come out through the doors. Weight on the
 * axles is kept legal at departure by leaving room at the front wall (the
 * load sits further back) and, if that is not enough, by leaving out the
 * units that load the overloaded axle most. Deterministic for a given input
 * and seed.
 */

const GAP = 0.02;
const EPS = 1e-6;
const SUPPORT = 0.8;
/** Front-wall clearances tried when none is given. */
export const CLEARANCES = [0, 0.3, 0.6, 0.9, 1.2, 1.5];
const DEFAULTS: PackOptions = { seed: 0, shuffle: false, yawFirst: 0, side: 1, jitter: 0, clearance: null };

const tonnes = (kg: number) => `${+(kg / 1000).toFixed(2)} t`;

interface Box {
  item: PackItem;
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  yaw: 0 | 90;
  on: string | null;
}

type Fail = 'space' | 'fragile' | 'door';

export interface PackResult {
  placements: Placement[];
  leftOut: LeftOut[];
  /** Space left clear at the front wall (m). */
  clearance: number;
}

const apart = (a: Omit<Box, 'item' | 'on' | 'yaw'>, b: Box) =>
  a.x + a.l + GAP - EPS <= b.x ||
  b.x + b.l + GAP - EPS <= a.x ||
  a.y + a.w + GAP - EPS <= b.y ||
  b.y + b.w + GAP - EPS <= a.y ||
  a.z + a.h <= b.z + EPS ||
  b.z + b.h <= a.z + EPS;

const yOverlap = (a: { y: number; w: number }, b: { y: number; w: number }) => a.y < b.y + b.w - EPS && b.y < a.y + a.w - EPS;

/** Why a unit can never fit this vehicle, even turned (it is never tipped). */
export function tooBig(v: VehicleSpec, it: Pick<PackItem, 'l' | 'w' | 'h'>): string | null {
  const { l, w, h } = v.inner;
  if (it.h > h + EPS) return `Too big for this vehicle (h ${it.h} m > ${h} m)`;
  const fits = (it.l <= l + EPS && it.w <= w + EPS) || (it.w <= l + EPS && it.l <= w + EPS);
  return fits ? null : `Too big for this vehicle (${Math.min(it.l, it.w)} m wide > ${w} m)`;
}

export function pack(v: VehicleSpec, items: PackItem[], opts: Partial<PackOptions> = {}): PackResult {
  const o = { ...DEFAULTS, ...opts };
  const rng = mulberry32(o.seed * 7919 + 17);
  const spread = (k: number) => k * (1 + o.jitter * (2 * rng() - 1));
  const weights = { x: spread(1), z: spread(0.3), y: spread(0.05) };
  // Weight as the planner ranks it: near-equal units trade places when shuffling.
  const rank = new Map(items.map((it) => [it.id, it.weightKg * (o.shuffle ? 1 + (rng() - 0.5) * 0.3 : 1)]));
  const leftOut: LeftOut[] = [];
  const leave = (it: PackItem, reason: string) => leftOut.push({ cargoId: it.id, reason, to: null });

  // 1. Selection: urgent first, then route order, heaviest first, while the payload lasts.
  const selectable = items.filter((it) => {
    const big = tooBig(v, it);
    if (big) leave(it, big);
    return !big;
  });
  selectable.sort((a, b) => +b.urgent - +a.urgent || a.stop - b.stop || rank.get(b.id)! - rank.get(a.id)!);
  const chosen: PackItem[] = [];
  let total = 0;
  for (const it of selectable) {
    if (total + it.weightKg > v.payloadKg + EPS) leave(it, `Payload: ${tonnes(v.payloadKg)} limit reached`);
    else {
      chosen.push(it);
      total += it.weightKg;
    }
  }

  // 2. Packing order: last stop first, urgent, floor-only units, heaviest, biggest footprint.
  chosen.sort((a, b) => b.stop - a.stop || +b.urgent - +a.urgent || +a.stackable - +b.stackable || rank.get(b.id)! - rank.get(a.id)! || b.l * b.w - a.l * a.w);

  // 3–4. Pack at each clearance, keep the one that carries most (urgent, units, weight), least clearance on a tie.
  const tries = (o.clearance === null ? CLEARANCES.filter((c) => c < v.inner.l * 0.3) : [o.clearance]).map((c) => packAt(v, chosen, c, weights, o.yawFirst));
  const score = (r: Attempt) => [r.boxes.filter((b) => b.item.urgent).length, r.boxes.length, r.boxes.reduce((s, b) => s + b.item.weightKg, 0)];
  let best = tries[0];
  for (const t of tries.slice(1)) {
    const [a, b] = [score(t), score(best)];
    if (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2] + EPS)))) best = t;
  }
  leftOut.push(...best.leftOut);

  // Loading order: front wall to doors, bottom to top; a unit always after the one it stands on.
  const sorted = [...best.boxes].sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
  for (let i = 0; i < sorted.length; i++) {
    const j = sorted.findIndex((b) => b.item.id === sorted[i].on);
    if (j > i) {
      const [moved] = sorted.splice(i, 1);
      sorted.splice(j, 0, moved);
      i -= 1;
    }
  }
  const W = v.inner.w;
  const placements = sorted.map(
    (b, i): Placement => ({
      cargoId: b.item.id,
      stop: b.item.stop,
      seq: i + 1,
      x: b.x,
      y: o.side === 1 ? b.y : W - b.y - b.w,
      z: b.z,
      l: b.l,
      w: b.w,
      h: b.h,
      yaw: b.yaw,
      weightKg: b.item.weightKg,
      on: b.on,
    }),
  );
  return { placements, leftOut, clearance: best.clearance };
}

interface Attempt {
  boxes: Box[];
  leftOut: LeftOut[];
  clearance: number;
}

/** Extreme-point placement with the load starting `clearance` from the front wall, then the axle repair. */
function packAt(v: VehicleSpec, chosen: PackItem[], clearance: number, weights: { x: number; y: number; z: number }, yawFirst: 0 | 90): Attempt {
  const { l: L, w: W, h: H } = v.inner;
  const boxes: Box[] = [];
  const leftOut: LeftOut[] = [];
  const leave = (it: PackItem, reason: string) => leftOut.push({ cargoId: it.id, reason, to: null });
  let points: [number, number, number][] = [[clearance, 0, 0]];
  const score = (p: [number, number, number]) => weights.x * p[0] + weights.z * p[2] + weights.y * p[1];

  const check = (it: PackItem, x: number, y: number, z: number, l: number, w: number): { fail: Fail } | { on: string | null } => {
    const cand = { x, y, z, l, w, h: it.h };
    if (x + l > L + EPS || y + w > W + EPS || z + it.h > H + EPS) return { fail: 'space' };
    for (const b of boxes) if (!apart(cand, b)) return { fail: 'space' };
    let on: string | null = null;
    if (z > EPS) {
      if (!it.stackable) return { fail: 'space' };
      let area = 0;
      let best = 0;
      for (const b of boxes) {
        if (Math.abs(b.z + b.h - z) > 0.01) continue;
        const ox = Math.min(x + l, b.x + b.l) - Math.max(x, b.x);
        const oy = Math.min(y + w, b.y + b.w) - Math.max(y, b.y);
        if (ox <= EPS || oy <= EPS) continue;
        if (b.item.fragile) return { fail: 'fragile' };
        if (!b.item.stackable || b.item.weightKg < it.weightKg) return { fail: 'space' };
        if (b.item.stop < it.stop) return { fail: 'door' };
        area += ox * oy;
        if (ox * oy > best) {
          best = ox * oy;
          on = b.item.id;
        }
      }
      if (area < SUPPORT * l * w - EPS) return { fail: 'space' };
    }
    // Every stop must be able to come out through the doors: no later-stop unit between it and the doors.
    for (const b of boxes) {
      if (b.item.stop < it.stop && x >= b.x + b.l - 0.01 && yOverlap(cand, b)) return { fail: 'door' };
      if (b.item.stop > it.stop && b.x >= x + l - 0.01 && yOverlap(cand, b)) return { fail: 'door' };
    }
    return { on };
  };

  for (const it of chosen) {
    const yaws: (0 | 90)[] = Math.abs(it.l - it.w) < EPS ? [0] : yawFirst === 0 ? [0, 90] : [90, 0];
    const order = [...points].sort((a, b) => score(a) - score(b));
    const fails = new Set<Fail>();
    let placed: Box | null = null;
    for (const [x, y, z] of order) {
      for (const yaw of yaws) {
        const l = yaw === 0 ? it.l : it.w;
        const w = yaw === 0 ? it.w : it.l;
        const r = check(it, x, y, z, l, w);
        if ('fail' in r) fails.add(r.fail);
        else {
          placed = { item: it, x, y, z, l, w, h: it.h, yaw, on: r.on };
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) {
      if (fails.has('door')) leave(it, `No room by the doors for stop ${it.stop}`);
      else if (fails.has('fragile')) leave(it, 'Fragile units below');
      else leave(it, 'No floor space left');
      continue;
    }
    boxes.push(placed);
    const b = placed;
    const seen = new Set(points.map((p) => p.map((n) => n.toFixed(4)).join()));
    for (const p of [
      [b.x + b.l + GAP, b.y, b.z],
      [b.x, b.y + b.w + GAP, b.z],
      [b.x, b.y, b.z + b.h],
    ] as [number, number, number][]) {
      const key = p.map((n) => n.toFixed(4)).join();
      if (p[0] < L - EPS && p[1] < W - EPS && p[2] < H - EPS && !seen.has(key)) {
        seen.add(key);
        points.push(p);
      }
    }
    points = points.filter((p) => !boxes.some((q) => p[0] > q.x - EPS && p[0] < q.x + q.l - EPS && p[1] > q.y - EPS && p[1] < q.y + q.w - EPS && p[2] > q.z - EPS && p[2] < q.z + q.h - EPS));
  }

  // Axle repair: while an axle is over its rating at departure, leave out the unit (with nothing on
  // top, urgent last) that loads that axle most.
  const coefs = axleCoefficients(v);
  let payload = boxes.reduce((s, b) => s + b.item.weightKg, 0);
  let moment = boxes.reduce((s, b) => s + b.item.weightKg * (b.x + b.l / 2), 0);
  for (;;) {
    const c = coefs.find((k) => k.tareKg + k.a * payload + k.b * moment > k.ratingKg * (1 + 1e-9));
    if (!c) break;
    const free = boxes.filter((b) => !boxes.some((q) => q.on === b.item.id));
    const pool = free.some((b) => !b.item.urgent) ? free.filter((b) => !b.item.urgent) : free;
    const share = (b: Box) => b.item.weightKg * (c.a + c.b * (b.x + b.l / 2));
    const worst = pool.reduce<Box | null>((m, b) => (!m || share(b) > share(m) ? b : m), null);
    if (!worst || share(worst) <= 0) break;
    boxes.splice(boxes.indexOf(worst), 1);
    payload -= worst.item.weightKg;
    moment -= worst.item.weightKg * (worst.x + worst.l / 2);
    leave(worst.item, `Would overload the ${c.label.toLowerCase()} (${tonnes(c.ratingKg)})`);
  }
  return { boxes, leftOut, clearance };
}
