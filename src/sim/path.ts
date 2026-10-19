import type { Vec2 } from '../domain/types';

/**
 * 2D path made of straight lines joined by circular fillets. Vehicles drive
 * along these; parametrized by arc length so motion speed is exact.
 */

type Seg =
  | { kind: 'line'; a: Vec2; b: Vec2; len: number }
  | { kind: 'arc'; c: Vec2; r: number; start: number; sweep: number; len: number };

export interface PathSample {
  x: number;
  y: number;
  /** Tangent direction, radians CCW from east. */
  dir: number;
}

export class Path2 {
  readonly length: number;
  private readonly segs: Seg[];
  private readonly cum: number[];

  /** `radius` may be one value or one per interior corner. */
  constructor(points: Vec2[], radius: number | number[] = 4) {
    if (points.length < 2) throw new Error('Path needs at least two points');
    this.segs = fillet(points, radius);
    this.cum = [];
    let total = 0;
    for (const s of this.segs) {
      this.cum.push(total);
      total += s.len;
    }
    this.length = total;
  }

  /** Sample at arc length s; outside [0, length] the end tangents are extended. */
  at(s: number, out: PathSample = { x: 0, y: 0, dir: 0 }): PathSample {
    if (s <= 0) {
      sampleSeg(this.segs[0], 0, out);
      out.x += Math.cos(out.dir) * s;
      out.y += Math.sin(out.dir) * s;
      return out;
    }
    if (s >= this.length) {
      const last = this.segs[this.segs.length - 1];
      sampleSeg(last, last.len, out);
      const extra = s - this.length;
      out.x += Math.cos(out.dir) * extra;
      out.y += Math.sin(out.dir) * extra;
      return out;
    }
    let lo = 0;
    let hi = this.segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return sampleSeg(this.segs[lo], s - this.cum[lo], out);
  }
}

function sampleSeg(seg: Seg, u: number, out: PathSample): PathSample {
  if (seg.kind === 'line') {
    const t = seg.len > 0 ? u / seg.len : 0;
    out.x = seg.a[0] + (seg.b[0] - seg.a[0]) * t;
    out.y = seg.a[1] + (seg.b[1] - seg.a[1]) * t;
    out.dir = Math.atan2(seg.b[1] - seg.a[1], seg.b[0] - seg.a[0]);
    return out;
  }
  const ang = seg.start + seg.sweep * (u / seg.len);
  out.x = seg.c[0] + seg.r * Math.cos(ang);
  out.y = seg.c[1] + seg.r * Math.sin(ang);
  out.dir = ang + (Math.sign(seg.sweep) * Math.PI) / 2;
  return out;
}

function fillet(points: Vec2[], radius: number | number[]): Seg[] {
  const segs: Seg[] = [];
  let cursor: Vec2 = points[0];
  const last = points.length - 1;

  const pushLine = (a: Vec2, b: Vec2) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 1e-6) segs.push({ kind: 'line', a, b, len });
  };

  for (let i = 1; i < last; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const d1: Vec2 = [(p1[0] - p0[0]) / l1, (p1[1] - p0[1]) / l1];
    const d2: Vec2 = [(p2[0] - p1[0]) / l2, (p2[1] - p1[1]) / l2];
    const theta = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]);
    if (Math.abs(theta) < 1e-4) continue;

    const half = Math.tan(Math.abs(theta) / 2);
    const maxT = Math.min(i === 1 ? l1 : l1 / 2, i === last - 1 ? l2 : l2 / 2);
    const want = Array.isArray(radius) ? (radius[i - 1] ?? radius[radius.length - 1]) : radius;
    let t = want * half;
    let r = want;
    if (t > maxT) {
      t = maxT;
      r = t / half;
    }
    const a: Vec2 = [p1[0] - d1[0] * t, p1[1] - d1[1] * t];
    const b: Vec2 = [p1[0] + d2[0] * t, p1[1] + d2[1] * t];
    pushLine(cursor, a);
    const side = Math.sign(theta);
    const c: Vec2 = [a[0] - d1[1] * side * r, a[1] + d1[0] * side * r];
    segs.push({
      kind: 'arc',
      c,
      r,
      start: Math.atan2(a[1] - c[1], a[0] - c[0]),
      sweep: theta,
      len: r * Math.abs(theta),
    });
    cursor = b;
  }
  pushLine(cursor, points[last]);
  if (segs.length === 0) segs.push({ kind: 'line', a: points[0], b: points[last], len: 0 });
  return segs;
}
