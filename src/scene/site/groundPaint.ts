import type { Area, Rect, StoragePosition, TruckBay, YardConfig, Zone } from '../../domain/types';
import { yardBounds } from '../../domain/yard';
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
  line(p, pt(-hl, -hw), pt(hl, -hw), 0.13, YELLOW);
  line(p, pt(-hl, hw), pt(hl, hw), 0.13, YELLOW);
  if (bay.kind !== 'dock') line(p, pt(-hl, -hw), pt(-hl, hw), 0.35, YELLOW);
  const [lx, ly] = pt(hl + 1.1, 0);
  text(p, bay.id, lx, ly, 0.85, '#8a94ad', { weight: 700 });
}

export function paintGround(ctx: CanvasRenderingContext2D, yard: YardConfig) {
  const g = groundExtent(yard);
  const p = makePainter(ctx, g.x0, g.y1, g.ppm);

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Driveway from the road to the gate.
  for (const gate of yard.gates) {
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
  ctx.strokeStyle = '#d3d9e6';
  ctx.lineWidth = 0.5 * p.k;
  ctx.stroke();

  // Zone floors.
  for (const z of yard.zones) {
    if (z.kind === 'storage' || z.kind === 'container') fillRect(p, z.rect, '#e8ecf6');
  }

  const ground = yard.areas.filter((a) => !a.elevation);
  for (const a of ground) if (a.kind !== 'crossing') paintArea(p, a);
  for (const a of ground) if (a.kind === 'crossing') paintArea(p, a);
  for (const b of yard.bays) paintBay(p, b);

  for (const z of yard.zones) {
    if (z.kind !== 'loading' && z.kind !== 'staging') continue;
    strokeRect(p, z.rect, 0.14, 'rgba(47, 95, 240, 0.35)', [1.6, 1], 0.6);
    text(p, z.name.toUpperCase(), z.rect.x + z.rect.w / 2, z.rect.y + z.rect.h - 1.6, 1.5, 'rgba(47, 95, 240, 0.55)', { spacing: 0.25 });
  }

  // Lane labels just inside each drive-through gate on the south edge.
  for (const gate of yard.gates) {
    if (gate.closed || gate.a[1] !== gate.b[1]) continue;
    const mid = (gate.a[0] + gate.b[0]) / 2;
    text(p, 'IN', mid + 4, gate.a[1] + 2.4, 1.3, WHITE, { spacing: 0.2 });
    text(p, 'OUT', mid - 4, gate.a[1] + 2.4, 1.3, WHITE, { spacing: 0.2 });
  }
}

/** Zone overlay: slot outlines, slot IDs and the zone name, at higher resolution. */
export const ZONE_PPM = 50;

export function paintZone(ctx: CanvasRenderingContext2D, zone: Zone, slots: StoragePosition[]) {
  const r = zone.rect;
  const p = makePainter(ctx, r.x, r.y + r.h, ZONE_PPM);
  strokeRect(p, { x: r.x + 0.1, y: r.y + 0.1, w: r.w - 0.2, h: r.h - 0.2 }, 0.1, `${zone.color}55`, [0.8, 0.5], 0.5);
  text(p, zone.name.toUpperCase(), r.x + 0.9, r.y + r.h - 1.2, 1.1, zone.color, { align: 'left', spacing: 0.12, weight: 800 });

  const idBelow = zone.kind === 'container';
  for (const s of slots) {
    strokeRect(p, { x: s.x - s.w / 2, y: s.y - s.d / 2, w: s.w, h: s.d }, 0.07, YELLOW, undefined, 0.08);
    const below = idBelow || s.face === 'south';
    text(p, s.id, s.x, below ? s.y - s.d / 2 - 0.42 : s.y + s.d / 2 + 0.42, 0.42, '#7d89a6', { weight: 700 });
  }
}
