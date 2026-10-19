import { forklifts, trucks } from '../../config/fleet';
import { polygonBounds } from '../../domain/geometry';
import { hashString, mulberry32 } from '../../domain/seed';
import type { Area, Rect, StorageArea, TruckBay, YardConfig } from '../../domain/types';
import { GRID, yardBounds } from '../../domain/yard';
import { compileRoute, evalRoute, newPose } from '../../sim/route';
import { palette, FONT } from '../kit';

/**
 * Paints the yard's floor markings (lanes, bays, walkways, crossings,
 * restricted areas, labels) onto a canvas straight from the yard config.
 */

/** Canvas extent around the yard (the outside is covered by grass beds and the road). */
export function groundExtent(yard: YardConfig) {
  const b = yardBounds(yard);
  return { x0: b.x0 - 8, x1: b.x1 + 8, y0: b.y0, y1: b.y1 + 8, ppm: 32 };
}

export interface Painter {
  ctx: CanvasRenderingContext2D;
  /** Pixels per meter. */
  k: number;
  X: (x: number) => number;
  Y: (y: number) => number;
}

export function makePainter(ctx: CanvasRenderingContext2D, x0: number, y1: number, ppm: number): Painter {
  return { ctx, k: ppm, X: (x) => (x - x0) * ppm, Y: (y) => (y1 - y) * ppm };
}

function fillRect(p: Painter, r: Rect, color: string) {
  p.ctx.fillStyle = color;
  p.ctx.fillRect(p.X(r.x), p.Y(r.y + r.h), r.w * p.k, r.h * p.k);
}

function line(p: Painter, a: [number, number], b: [number, number], width: number, color: string, dash?: [number, number]) {
  const { ctx } = p;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width * p.k;
  ctx.lineCap = 'butt';
  if (dash) ctx.setLineDash([dash[0] * p.k, dash[1] * p.k]);
  ctx.beginPath();
  ctx.moveTo(p.X(a[0]), p.Y(a[1]));
  ctx.lineTo(p.X(b[0]), p.Y(b[1]));
  ctx.stroke();
  ctx.restore();
}

function strokeRect(p: Painter, r: Rect, width: number, color: string, dash?: [number, number], radius = 0) {
  const { ctx } = p;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width * p.k;
  if (dash) ctx.setLineDash([dash[0] * p.k, dash[1] * p.k]);
  ctx.beginPath();
  ctx.roundRect(p.X(r.x), p.Y(r.y + r.h), r.w * p.k, r.h * p.k, radius * p.k);
  ctx.stroke();
  ctx.restore();
}

export function text(
  p: Painter,
  str: string,
  x: number,
  y: number,
  size: number,
  color: string,
  opts: { rotate?: number; weight?: number; align?: CanvasTextAlign; spacing?: number } = {},
) {
  const { ctx } = p;
  ctx.save();
  ctx.translate(p.X(x), p.Y(y));
  if (opts.rotate) ctx.rotate(opts.rotate);
  ctx.fillStyle = color;
  ctx.font = `${opts.weight ?? 700} ${size * p.k}px ${FONT}`;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  if (opts.spacing) ctx.letterSpacing = `${opts.spacing * p.k}px`;
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

/** Chevron arrow pointing along heading (radians, yard frame). */
function arrow(p: Painter, x: number, y: number, heading: number, size: number, color: string) {
  const { ctx } = p;
  ctx.save();
  ctx.translate(p.X(x), p.Y(y));
  ctx.rotate(-heading);
  const s = size * p.k;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(s * 0.6, 0);
  ctx.lineTo(-s * 0.2, -s * 0.45);
  ctx.lineTo(-s * 0.2, -s * 0.18);
  ctx.lineTo(-s * 0.6, -s * 0.18);
  ctx.lineTo(-s * 0.6, s * 0.18);
  ctx.lineTo(-s * 0.2, s * 0.18);
  ctx.lineTo(-s * 0.2, s * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const WHITE = 'rgba(255,255,255,0.95)';
const YELLOW = palette.yellow;

export function paintArea(p: Painter, a: Area) {
  const r = a.rect;
  switch (a.kind) {
    case 'truckLane': {
      fillRect(p, r, palette.lane);
      const vertical = r.h > r.w;
      if (vertical) {
        line(p, [r.x + 0.3, r.y], [r.x + 0.3, r.y + r.h], 0.15, WHITE);
        line(p, [r.x + r.w - 0.3, r.y], [r.x + r.w - 0.3, r.y + r.h], 0.15, WHITE);
        line(p, [r.x + r.w / 2, r.y], [r.x + r.w / 2, r.y + r.h], 0.15, WHITE, [3, 3]);
        arrow(p, r.x + r.w * 0.75, r.y + r.h * 0.62, Math.PI / 2, 2.6, WHITE);
        arrow(p, r.x + r.w * 0.25, r.y + r.h * 0.62, -Math.PI / 2, 2.6, WHITE);
      } else {
        line(p, [r.x, r.y + 0.3], [r.x + r.w, r.y + 0.3], 0.15, WHITE);
        line(p, [r.x, r.y + r.h - 0.3], [r.x + r.w, r.y + r.h - 0.3], 0.15, WHITE);
        for (const xx of [r.x + r.w * 0.3, r.x + r.w * 0.7]) arrow(p, xx, r.y + r.h / 2, 0, 3, WHITE);
      }
      break;
    }
    case 'forklift': {
      fillRect(p, r, '#f5f2e9');
      strokeRect(p, { x: r.x + 0.15, y: r.y + 0.15, w: r.w - 0.3, h: r.h - 0.3 }, 0.12, YELLOW, [1.2, 0.8]);
      if (a.label) text(p, a.label, r.x + r.w / 2, r.y + r.h / 2, 0.9, '#c9a227', { rotate: -Math.PI / 2, spacing: 0.15 });
      break;
    }
    case 'walkway': {
      fillRect(p, r, '#b5e2c4');
      strokeRect(p, r, 0.12, WHITE);
      break;
    }
    case 'crossing': {
      fillRect(p, r, palette.lane);
      const { ctx } = p;
      ctx.fillStyle = WHITE;
      if (a.stripes === 'ns') {
        for (let x = r.x + 0.3; x < r.x + r.w - 0.3; x += 1.2) ctx.fillRect(p.X(x), p.Y(r.y + r.h), 0.6 * p.k, r.h * p.k);
      } else {
        for (let y = r.y + 0.3; y < r.y + r.h - 0.3; y += 1.2) ctx.fillRect(p.X(r.x), p.Y(y + 0.6), r.w * p.k, 0.6 * p.k);
      }
      break;
    }
    case 'restricted': {
      const { ctx } = p;
      fillRect(p, r, 'rgba(240, 96, 96, 0.10)');
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.X(r.x), p.Y(r.y + r.h), r.w * p.k, r.h * p.k);
      ctx.clip();
      ctx.strokeStyle = 'rgba(232, 84, 84, 0.42)';
      ctx.lineWidth = 0.28 * p.k;
      for (let d = -r.h; d < r.w + r.h; d += 1.3) {
        ctx.beginPath();
        ctx.moveTo(p.X(r.x + d), p.Y(r.y));
        ctx.lineTo(p.X(r.x + d + r.h), p.Y(r.y + r.h));
        ctx.stroke();
      }
      ctx.restore();
      strokeRect(p, r, 0.22, '#e65c5c');
      if (a.label) {
        const tall = r.h > r.w;
        // Along the south / west edge, so equipment inside does not hide it.
        const cx = tall ? r.x + 1.3 : r.x + r.w / 2;
        const cy = tall ? r.y + r.h / 2 : r.y + 1.3;
        const size = 0.9;
        const w = (a.label.length * size * 0.62 + 1.2) * p.k;
        ctx.save();
        ctx.translate(p.X(cx), p.Y(cy));
        if (tall) ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.roundRect(-w / 2, -0.8 * p.k, w, 1.6 * p.k, 0.4 * p.k);
        ctx.fill();
        ctx.restore();
        text(p, a.label, cx, cy, size, '#d64545', { rotate: tall ? -Math.PI / 2 : 0, spacing: 0.08 });
      }
      break;
    }
  }
}

function paintBay(p: Painter, bay: TruckBay) {
  const dx = Math.cos(bay.heading);
  const dy = Math.sin(bay.heading);
  const nx = -dy;
  const ny = dx;
  const [cx, cy] = bay.center;
  const hl = bay.length / 2;
  const hw = bay.width / 2;
  const pt = (along: number, across: number): [number, number] => [cx + dx * along + nx * across, cy + dy * along + ny * across];
  if (bay.kind === 'parking') {
    // Painted box along the wall, with its number.
    const { ctx } = p;
    ctx.save();
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 0.14 * p.k;
    ctx.beginPath();
    [pt(-hl, -hw), pt(hl, -hw), pt(hl, hw), pt(-hl, hw)].forEach(([x, y], i) => (i ? ctx.lineTo(p.X(x), p.Y(y)) : ctx.moveTo(p.X(x), p.Y(y))));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    text(p, bay.id, cx - hl + 1.2, cy, 0.9, 'rgba(255,255,255,0.95)', { weight: 800 });
    return;
  }
  line(p, pt(-hl, -hw), pt(hl, -hw), 0.13, YELLOW);
  line(p, pt(-hl, hw), pt(hl, hw), 0.13, YELLOW);
  if (bay.kind !== 'dock') line(p, pt(-hl, -hw), pt(-hl, hw), 0.35, YELLOW);
  const [lx, ly] = pt(hl + 1.1, 0);
  text(p, bay.id, lx, ly, 0.85, '#8a94ad', { weight: 700 });
}

/** Worn concrete: slab joints, mottling, tyre tracks along the truck and forklift routes, oil drips. */
function paintWear(p: Painter, yard: YardConfig) {
  const { ctx } = p;
  const b = yardBounds(yard);
  const rng = mulberry32(hashString('concrete'));
  ctx.save();
  ctx.beginPath();
  yard.boundary.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(p.X(x), p.Y(y)) : ctx.lineTo(p.X(x), p.Y(y))));
  ctx.closePath();
  ctx.clip();
  // Mottling.
  for (let i = 0; i < 2200; i++) {
    const x = b.x0 + rng() * b.w;
    const y = b.y0 + rng() * b.h;
    const r = (0.4 + rng() * 2.2) * p.k;
    const dark = rng() < 0.6;
    const g = ctx.createRadialGradient(p.X(x), p.Y(y), 0, p.X(x), p.Y(y), r);
    g.addColorStop(0, dark ? `rgba(120,130,152,${0.035 + rng() * 0.04})` : `rgba(255,255,255,${0.05 + rng() * 0.05})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(p.X(x) - r, p.Y(y) - r, r * 2, r * 2);
  }
  // Slab joints every 6 m.
  ctx.strokeStyle = 'rgba(132,142,166,0.22)';
  ctx.lineWidth = 0.045 * p.k;
  for (let x = b.x0 + 6; x < b.x1; x += 6) {
    ctx.beginPath();
    ctx.moveTo(p.X(x), p.Y(b.y0));
    ctx.lineTo(p.X(x), p.Y(b.y1));
    ctx.stroke();
  }
  for (let y = b.y0 + 6; y < b.y1; y += 6) {
    ctx.beginPath();
    ctx.moveTo(p.X(b.x0), p.Y(y));
    ctx.lineTo(p.X(b.x1), p.Y(y));
    ctx.stroke();
  }
  // Tyre tracks: sample each route and stroke the wheel lines.
  const tracks = (route: ReturnType<typeof compileRoute>, half: number, width: number, alpha: number) => {
    const pose = newPose();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      let pen = false;
      for (let t = 0; t <= route.duration; t += 0.08) {
        evalRoute(route, (route.spec.offset ?? 0) + t, pose);
        const x = pose.x - Math.sin(pose.heading) * half * side;
        const y = pose.y + Math.cos(pose.heading) * half * side;
        if (x < b.x0 - 2 || x > b.x1 + 2 || y < b.y0 - 1 || y > b.y1) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(p.X(x), p.Y(y));
        else ctx.moveTo(p.X(x), p.Y(y));
        pen = true;
      }
      ctx.strokeStyle = `rgba(70,80,104,${alpha})`;
      ctx.lineWidth = width * p.k;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  };
  for (const tr of trucks) if (tr.route) tracks(compileRoute(tr.route), 0.95, 0.42, 0.085);
  for (const f of forklifts) if (f.route) tracks(compileRoute(f.route), 0.45, 0.18, 0.06);
  // Oil drips under where trucks stand with the engine running.
  const drip = (x: number, y: number) => {
    for (let i = 0; i < 4; i++) {
      const r = (0.25 + rng() * 0.5) * p.k;
      const g = ctx.createRadialGradient(p.X(x + (rng() - 0.5) * 1.2), p.Y(y + (rng() - 0.5) * 0.8), 0, p.X(x), p.Y(y), r * 1.6);
      g.addColorStop(0, `rgba(40,46,62,${0.1 + rng() * 0.08})`);
      g.addColorStop(1, 'rgba(40,46,62,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.X(x) - r * 2, p.Y(y) - r * 2, r * 4, r * 4);
    }
  };
  for (const bay of yard.bays) drip(bay.center[0] + Math.cos(bay.heading) * 2.5, bay.center[1] + Math.sin(bay.heading) * 2.5);
  ctx.restore();
}

export function paintGround(ctx: CanvasRenderingContext2D, yard: YardConfig) {
  const g = groundExtent(yard);
  const p = makePainter(ctx, g.x0, g.y1, g.ppm);

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Driveway from the road to the entrance.
  for (const gate of yard.gates) {
    if (gate.closed) continue;
    const x0 = Math.min(gate.a[0], gate.b[0]) - 2;
    const x1 = Math.max(gate.a[0], gate.b[0]) + 2;
    fillRect(p, { x: x0, y: g.y0, w: x1 - x0, h: -g.y0 + 0.5 }, palette.lane);
  }

  // Yard surface.
  ctx.beginPath();
  yard.boundary.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(p.X(x), p.Y(y)) : ctx.lineTo(p.X(x), p.Y(y))));
  ctx.closePath();
  ctx.fillStyle = palette.yard;
  ctx.fill();
  paintWear(p, yard);

  const ground = yard.areas.filter((a) => !a.elevation);
  for (const a of ground) if (a.kind !== 'crossing') paintArea(p, a);
  for (const a of ground) if (a.kind === 'crossing') paintArea(p, a);
  for (const b of yard.bays) paintBay(p, b);

  // Entrance: lane arrows, IN / OUT, and the check-in stop line.
  for (const gate of yard.gates) {
    if (gate.closed || gate.a[1] !== gate.b[1]) continue;
    const mid = (gate.a[0] + gate.b[0]) / 2;
    arrow(p, mid + 4, gate.a[1] + 2.4, Math.PI / 2, 2.4, WHITE);
    arrow(p, mid - 4, gate.a[1] + 2.4, -Math.PI / 2, 2.4, WHITE);
    text(p, 'IN', mid + 4, gate.a[1] + 4.4, 1.1, WHITE, { spacing: 0.2 });
    text(p, 'OUT', mid - 4, gate.a[1] + 4.4, 1.1, WHITE, { spacing: 0.2 });
    line(p, [mid + 1.4, 13.6], [mid + 6.4, 13.6], 0.3, WHITE);
    text(p, 'STOP · CHECK-IN', mid + 3.9, 14.5, 0.55, 'rgba(255,255,255,0.95)', { spacing: 0.06 });
    line(p, [mid, gate.a[1] + 0.6], [mid, gate.a[1] + 9], 0.12, WHITE, [1.5, 1.2]);
  }
}

/** Storage-area decal: yellow floor-marking outline (dashed) and the area name. */
export const AREA_PPM = 40;

export function storageDecalRect(area: StorageArea): Rect {
  const b = polygonBounds(area.parts);
  return { x: b.x - 0.5, y: b.y - 0.5, w: b.w + 1, h: b.h + 1 };
}

export function paintStorageArea(ctx: CanvasRenderingContext2D, area: StorageArea) {
  const r = storageDecalRect(area);
  const p = makePainter(ctx, r.x, r.y + r.h, AREA_PPM);
  const { ctx: c } = p;
  for (const part of area.parts) {
    c.save();
    c.beginPath();
    part.forEach(([x, y], i) => (i ? c.lineTo(p.X(x), p.Y(y)) : c.moveTo(p.X(x), p.Y(y))));
    c.closePath();
    c.fillStyle = 'rgba(245, 208, 0, 0.07)';
    c.fill();
    c.strokeStyle = 'rgba(232, 190, 20, 0.95)';
    c.lineWidth = 0.12 * p.k;
    c.setLineDash([0.9 * p.k, 0.55 * p.k]);
    c.lineJoin = 'round';
    c.stroke();
    c.restore();
  }
  const main = area.parts[0];
  // Label near the polygon's south-west corner, along its bottom edge.
  const minY = Math.min(...main.map((q) => q[1]));
  const bottom = main.filter((q) => q[1] < minY + 0.8);
  const lx = Math.min(...bottom.map((q) => q[0])) + 0.6;
  text(p, area.name.toUpperCase(), lx, minY + 0.65, 0.62, '#c9a227', { align: 'left', spacing: 0.08, weight: 800 });
}

/** Reference grid (5 m) with A1-style labels, for reading out free-form locations. */
export function paintGrid(ctx: CanvasRenderingContext2D, yard: YardConfig, ppm: number) {
  const b = yardBounds(yard);
  const p = makePainter(ctx, b.x0, b.y1, ppm);
  const { ctx: c } = p;
  c.strokeStyle = 'rgba(47, 95, 240, 0.32)';
  c.lineWidth = 0.06 * p.k;
  for (let x = b.x0; x <= b.x1 + 0.01; x += GRID) {
    c.beginPath();
    c.moveTo(p.X(x), p.Y(b.y0));
    c.lineTo(p.X(x), p.Y(b.y1));
    c.stroke();
  }
  for (let y = b.y0; y <= b.y1 + 0.01; y += GRID) {
    c.beginPath();
    c.moveTo(p.X(b.x0), p.Y(y));
    c.lineTo(p.X(b.x1), p.Y(y));
    c.stroke();
  }
  for (let x = b.x0; x < b.x1; x += GRID)
    for (let y = b.y0; y < b.y1; y += GRID) text(p, `${String.fromCharCode(65 + Math.round((x - b.x0) / GRID))}${Math.round((y - b.y0) / GRID) + 1}`, x + 0.9, y + 0.6, 0.55, 'rgba(47, 95, 240, 0.7)', { weight: 800 });
}

