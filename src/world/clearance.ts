import { devYard } from '../config/devYard';
import { forklifts, groundAt, trucks, workers } from '../config/fleet';
import { obbOverlap, pointInPolygon, rectObb, type Obb } from '../domain/geometry';
import type { Fixture, Pose, Vec2 } from '../domain/types';
import { RIGID } from '../domain/vehicles';
import { yardBounds } from '../domain/yard';
import { compileRoute, evalRoute, newPose } from '../sim/route';

/**
 * Space that must stay free of cargo: wherever trucks, forklifts and people
 * move (swept along their routes), parked vehicles, loading bays, the ramp,
 * fixtures. Storage areas have no fixed aisles; these corridors are what
 * keeps the work flowing on a busy day.
 */

export interface Keepout extends Obb {
  reason: string;
  /** Floor height the keep-out applies to. */
  h: number;
  /** Axis-aligned bounds for a quick reject. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function withBounds(b: Obb, reason: string, h: number): Keepout {
  const ex = Math.abs(Math.cos(b.yaw)) * b.hl + Math.abs(Math.sin(b.yaw)) * b.hw;
  const ey = Math.abs(Math.sin(b.yaw)) * b.hl + Math.abs(Math.cos(b.yaw)) * b.hw;
  return { ...b, reason, h, x0: b.x - ex, x1: b.x + ex, y0: b.y - ey, y1: b.y + ey };
}

/** Footprint of a vehicle at a pose: [behind origin, ahead of origin, half width]. */
const TRUCK_BODY: [number, number, number] = [RIGID.rear, RIGID.front, RIGID.width / 2 + 0.35];
const FORKLIFT_BODY: [number, number, number] = [1.45, 2.1, 0.7];
const PERSON: [number, number, number] = [0.35, 0.35, 0.4];

function bodyAt(p: Pose, [back, ahead, hw]: [number, number, number]): Obb {
  const mid = (ahead - back) / 2;
  return { x: p.x + Math.cos(p.heading) * mid, y: p.y + Math.sin(p.heading) * mid, yaw: p.heading, hl: (ahead + back) / 2, hw };
}

const yb = yardBounds(devYard);
const inYard = (b: Obb) => b.x > yb.x0 - 4 && b.x < yb.x1 + 4 && b.y > yb.y0 - 4 && b.y < yb.y1 + 4;

function sweep(route: ReturnType<typeof compileRoute>, body: [number, number, number], reason: string, out: Keepout[]) {
  const pose = newPose();
  let last: Pose | null = null;
  const t0 = route.spec.offset ?? 0;
  for (let t = 0; t <= route.duration; t += 0.05) {
    evalRoute(route, t0 + t, pose);
    if (!pose.visible) continue;
    if (last && Math.hypot(pose.x - last.x, pose.y - last.y) < 0.35 && Math.abs(pose.heading - last.heading) < 0.08) continue;
    last = { x: pose.x, y: pose.y, heading: pose.heading };
    const b = bodyAt(last, body);
    if (inYard(b)) out.push(withBounds(b, reason, groundAt(pose.x, pose.y)));
  }
}

function build(): Keepout[] {
  const out: Keepout[] = [];
  for (const t of trucks) {
    if (t.route) sweep(compileRoute(t.route), TRUCK_BODY, `Keep clear · route of ${t.id}`, out);
    else if (t.pose) out.push(withBounds(bodyAt(t.pose, TRUCK_BODY), `${t.id} is parked here`, 0));
  }
  for (const f of forklifts) {
    if (f.route) sweep(compileRoute(f.route), FORKLIFT_BODY, `Keep clear · route of ${f.id}`, out);
    else if (f.pose) out.push(withBounds(bodyAt(f.pose, FORKLIFT_BODY), `${f.id} is parked here`, groundAt(f.pose.x, f.pose.y)));
  }
  for (const w of workers) {
    if (w.route) sweep(compileRoute(w.route), PERSON, `Keep clear · walkway of ${w.name}`, out);
    else if (w.pose) out.push(withBounds(bodyAt(w.pose, PERSON), `${w.name} works here`, groundAt(w.pose.x, w.pose.y)));
  }
  for (const bay of devYard.bays) {
    const b = { x: bay.center[0], y: bay.center[1], yaw: bay.heading, hl: bay.length / 2, hw: bay.width / 2 };
    out.push(withBounds(b, `${bay.kind === 'parking' ? 'Parking space' : 'Loading space'} ${bay.id}`, 0));
  }
  for (const r of devYard.ramps) out.push(withBounds(rectObb({ x: r.rect.x - 0.6, y: r.rect.y - 1.5, w: r.rect.w + 1.2, h: r.rect.h + 3 }), 'Ramp and its approach', 0));
  for (const a of devYard.areas) if (a.kind === 'restricted' || a.kind === 'forklift') out.push(withBounds(rectObb(a.rect), `${a.label ?? 'Restricted'} area`, a.elevation ?? 0));
  const FIXTURE_SIZE: Record<Fixture['kind'], [number, number]> = {
    desk: [1.5, 1.1],
    charger: [0.6, 0.5],
    pallets: [0.7, 0.5],
    skip: [1.3, 0.9],
    bins: [1.3, 0.45],
    extinguisher: [0.3, 0.3],
    cones: [1.2, 0.35],
    palletJack: [0.9, 0.45],
    lightPole: [0.4, 0.4],
    bollard: [0.2, 0.2],
  };
  for (const fx of devYard.fixtures) {
    const [hl, hw] = FIXTURE_SIZE[fx.kind];
    const n = fx.count ?? 1;
    const along = fx.kind === 'bins' ? hl * (n / 3) : hl;
    out.push(withBounds({ x: fx.x, y: fx.y + (fx.kind === 'desk' ? 0.4 : 0), yaw: fx.kind === 'desk' ? 0 : fx.heading, hl: along, hw }, fx.label ?? fx.id, groundAt(fx.x, fx.y)));
  }
  // In front of every door.
  for (const bld of devYard.buildings) {
    for (const d of bld.doors ?? []) {
      const { x, y, w, h } = bld.rect;
      const along = d.side === 'north' || d.side === 'south';
      const cx = along ? x + d.at : d.side === 'east' ? x + w + 1 : x - 1;
      const cy = along ? (d.side === 'north' ? y + h + 1 : y - 1) : y + d.at;
      out.push(withBounds({ x: cx, y: cy, yaw: along ? Math.PI / 2 : 0, hl: 1.1, hw: d.width / 2 + 0.6 }, `In front of the ${bld.name.toLowerCase()} door`, d.sill ?? 0));
    }
  }
  // The entrance apron and the strip inside the sliding door.
  const gate = devYard.gates.find((g) => !g.closed);
  if (gate) out.push(withBounds(rectObb({ x: Math.min(gate.a[0], gate.b[0]), y: 0, w: Math.abs(gate.b[0] - gate.a[0]), h: 4 }), 'Entrance', 0));
  if (gate?.parkedPanel) out.push(withBounds(rectObb({ x: gate.parkedPanel[0], y: 0, w: gate.parkedPanel[1] - gate.parkedPanel[0], h: 1.2 }), 'Sliding door track', 0));
  return out;
}

export const keepouts: Keepout[] = build();

/** First keep-out a footprint at floor height `h` runs into, if any. */
export function blockedBy(b: Obb, h: number, gap = 0.1): Keepout | null {
  const ex = Math.abs(Math.cos(b.yaw)) * b.hl + Math.abs(Math.sin(b.yaw)) * b.hw + gap;
  const ey = Math.abs(Math.sin(b.yaw)) * b.hl + Math.abs(Math.cos(b.yaw)) * b.hw + gap;
  for (const k of keepouts) {
    if (Math.abs(k.h - h) > 0.4) continue;
    if (b.x + ex < k.x0 || b.x - ex > k.x1 || b.y + ey < k.y0 || b.y - ey > k.y1) continue;
    if (obbOverlap(b, k, gap)) return k;
  }
  return null;
}

/**
 * Usable floor of each storage area (m²): its polygons minus the keep-clear
 * corridors running through them, sampled on a 0.5 m grid.
 */
export function usableFloor(area: { parts: Vec2[][]; elevation?: number }) {
  const step = 0.5;
  let n = 0;
  for (const part of area.parts) {
    const xs = part.map((p) => p[0]);
    const ys = part.map((p) => p[1]);
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
      for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
        if (!pointInPolygon(x, y, part)) continue;
        if (!blockedBy({ x, y, yaw: 0, hl: step / 2, hw: step / 2 }, area.elevation ?? 0, 0)) n += 1;
      }
    }
  }
  return n * step * step;
}
