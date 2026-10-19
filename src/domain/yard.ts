import type { Rect, StoragePosition, YardConfig, Zone } from './types';

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Generate storage positions from a zone's grid. Rows run east–west and are
 * laid out north → south, back-to-back in pairs with forklift aisles between
 * pairs. IDs are row-major from the north-west corner: A01, A02, … (B17 = row
 * 3, column 1 for an 8-column grid).
 */
export function zonePositions(zone: Zone): StoragePosition[] {
  const g = zone.grid;
  if (!g) return [];
  const [w, d] = g.slot;
  const totalW = g.cols * w + (g.cols - 1) * g.colGap;
  const x0 = zone.rect.x + (zone.rect.w - totalW) / 2;
  const out: StoragePosition[] = [];
  let cursor = zone.rect.y + zone.rect.h - g.labelSpace;
  for (let r = 0; r < g.rows; r++) {
    if (r > 0) cursor -= r % 2 === 1 ? g.pairGap : g.aisle;
    const cy = cursor - d / 2;
    cursor -= d;
    for (let c = 0; c < g.cols; c++) {
      out.push({
        id: `${zone.id}${pad2(r * g.cols + c + 1)}`,
        zoneId: zone.id,
        x: x0 + w / 2 + c * (w + g.colGap),
        y: cy,
        w,
        d,
        maxStack: g.maxStack,
        z: zone.elevation ?? 0,
        face: r % 2 === 0 ? 'north' : 'south',
      });
    }
  }
  return out;
}

export function allPositions(yard: YardConfig): StoragePosition[] {
  return yard.zones.flatMap(zonePositions);
}

export function positionIndex(yard: YardConfig): Map<string, StoragePosition> {
  return new Map(allPositions(yard).map((p) => [p.id, p]));
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Floor height at a yard point: raised platforms and ramps, else ground (0). */
export function heightAt(yard: YardConfig, x: number, y: number): number {
  for (const ramp of yard.ramps) {
    if (!inside(ramp.rect, x, y)) continue;
    const r = ramp.rect;
    const t = ramp.up === 'north' ? (y - r.y) / r.h : ramp.up === 'south' ? (r.y + r.h - y) / r.h : ramp.up === 'east' ? (x - r.x) / r.w : (r.x + r.w - x) / r.w;
    return ramp.rise * Math.max(0, Math.min(1, t));
  }
  for (const b of yard.buildings) if (b.elevation && inside(b.rect, x, y)) return b.elevation;
  return 0;
}

export function yardBounds(yard: YardConfig) {
  const xs = yard.boundary.map((p) => p[0]);
  const ys = yard.boundary.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const x1 = Math.max(...xs);
  const y1 = Math.max(...ys);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
