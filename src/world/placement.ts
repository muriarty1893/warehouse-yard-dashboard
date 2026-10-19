import { devYard } from '../config/devYard';
import { obbCorners, obbInside, obbOverlap, pointInPolygon, rectObb, type Obb } from '../domain/geometry';
import { isStackable } from '../domain/seed';
import type { Cargo, CargoLook, Dimensions, Spot, StorageArea } from '../domain/types';
import { areaAt, gridRef, heightAt } from '../domain/yard';
import { blockedBy } from './clearance';

/**
 * Free-form placement rules: a unit may stand anywhere on a flat floor inside
 * the walls that is not taken by other cargo, a building or a keep-clear
 * corridor. Inside a storage area is preferred; outside is allowed (it
 * happens on busy days) but flagged.
 */

export interface Placeable {
  id?: string;
  look: CargoLook;
  dims: Dimensions;
}

export interface PlaceCheck {
  ok: boolean;
  reason?: string;
  /** Allowed, but worth a second look. */
  warn?: string;
  /** Resolved floor spot (center/rotation), floor height, stack level. */
  x: number;
  y: number;
  yaw: number;
  /** Height of the unit's base. */
  z: number;
  level: number;
  areaId: string | null;
  on: string | null;
}

export const footprint = (dims: Dimensions, x: number, y: number, yaw: number): Obb => ({ x, y, yaw, hl: dims.l / 2, hw: dims.w / 2 });

const byId = (cargo: Cargo[]) => new Map(cargo.map((c) => [c.id, c]));

/** The floor unit a stacked unit ultimately stands on, and its level (0 = floor). */
export function stackBase(cargo: Cargo[], item: Cargo, index = byId(cargo)) {
  let base = item;
  let level = 0;
  while (base.on) {
    const below = index.get(base.on);
    if (!below) break;
    base = below;
    level += 1;
  }
  return { base, level };
}

/** Units in the stack standing on `baseId`, bottom first. */
export function stackOf(cargo: Cargo[], baseId: string): Cargo[] {
  const out: Cargo[] = [];
  let cur = cargo.find((c) => c.id === baseId);
  while (cur) {
    out.push(cur);
    const id: string = cur.id;
    cur = cargo.find((c) => c.on === id);
  }
  return out;
}

export const hasOnTop = (cargo: Cargo[], id: string) => cargo.some((c) => c.on === id);

/** Height of a unit's base above the yard floor (0 at ground, platform 1.2, + units below). */
export function baseHeight(cargo: Cargo[], item: Cargo, index = byId(cargo)) {
  let z = heightAt(devYard, item.x, item.y);
  let below = item.on ? index.get(item.on) : undefined;
  while (below) {
    z += below.dims.h + 0.02;
    below = below.on ? index.get(below.on) : undefined;
  }
  return z;
}

const solidBuildings = devYard.buildings.filter((b) => b.kind !== 'canopy').map((b) => ({ b, obb: rectObb(b.rect) }));

export function checkFloor(cargo: Cargo[], item: Placeable, x: number, y: number, yaw: number): PlaceCheck {
  const fp = footprint(item.dims, x, y, yaw);
  const fail = (reason: string): PlaceCheck => ({ ok: false, reason, x, y, yaw, z: 0, level: 0, areaId: null, on: null });
  const corners = obbCorners(fp);
  if (!corners.every(([cx, cy]) => pointInPolygon(cx, cy, devYard.boundary))) return fail('Outside the yard walls');
  for (const r of devYard.ramps) if (obbOverlap(fp, rectObb(r.rect), 0.2)) return fail('On the forklift ramp');
  const z = heightAt(devYard, x, y);
  if (corners.some(([cx, cy]) => Math.abs(heightAt(devYard, cx, cy) - z) > 0.05)) return fail('Over the platform edge');
  for (const { b, obb } of solidBuildings) if (obbOverlap(fp, obb, 0.1)) return fail(`Inside the ${b.name.toLowerCase()}`);
  const keep = blockedBy(fp, z);
  if (keep) return fail(keep.reason);
  for (const c of cargo) {
    if (c.on || c.id === item.id) continue;
    if (obbOverlap(fp, footprint(c.dims, c.x, c.y, c.yaw), 0.12)) return fail(`Too close to ${c.id}`);
  }
  const area = devYard.storage.find((a) => obbInside(fp, a.parts)) ?? null;
  return { ok: true, warn: area ? undefined : 'Outside the storage areas', x, y, yaw, z, level: 0, areaId: area?.id ?? null, on: null };
}

export function checkStack(cargo: Cargo[], item: Placeable, onId: string): PlaceCheck {
  const index = byId(cargo);
  const below = index.get(onId);
  const fail = (reason: string): PlaceCheck => ({ ok: false, reason, x: below?.x ?? 0, y: below?.y ?? 0, yaw: below?.yaw ?? 0, z: 0, level: 0, areaId: null, on: onId });
  if (!below) return fail('Unknown unit');
  if (below.id === item.id) return fail('Cannot stack a unit on itself');
  if (cargo.some((c) => c.on === below.id && c.id !== item.id)) return fail(`Something is already on ${below.id}`);
  if (item.id && stackBase(cargo, below, index).base.id === item.id) return fail('Cannot stack a unit on itself');
  if (!isStackable(below.look)) return fail(`Nothing can go on top of ${below.id}`);
  if (!isStackable(item.look)) return fail('This unit must stand on the floor');
  const level = stackBase(cargo, below, index).level + 1;
  const area = below.areaId ? devYard.storage.find((a) => a.id === below.areaId) : undefined;
  const max = area?.maxStack ?? 2;
  if (level >= max) return fail(`Stacks here are limited to ${max} high`);
  if (item.dims.l > below.dims.l + 0.25 || item.dims.w > below.dims.w + 0.25) return fail(`Larger than ${below.id}`);
  const z = baseHeight(cargo, below, index) + below.dims.h + 0.02;
  if (z + item.dims.h - heightAt(devYard, below.x, below.y) > 3.2) return fail('Stack would be over 3.2 m');
  return { ok: true, x: below.x, y: below.y, yaw: below.yaw, z, level, areaId: below.areaId, on: below.id };
}

export function checkSpot(cargo: Cargo[], item: Placeable, spot: Spot): PlaceCheck {
  const others = item.id ? cargo.filter((c) => c.id !== item.id) : cargo;
  return 'on' in spot ? checkStack(others, item, spot.on) : checkFloor(others, item, spot.x, spot.y, spot.yaw);
}

/** Near the loading strip, where most outbound cargo leaves from. */
const LOADING: [number, number] = [42.8, 31];

/**
 * Placement recommendation (spec §37 step 13): the free floor spot nearest
 * the loading strip, covered areas first, else on top of a matching stack.
 */
export function recommendSpot(cargo: Cargo[], item: Placeable): (Spot & { label: string }) | null {
  let best: { x: number; y: number; yaw: number; score: number; area: StorageArea } | null = null;
  for (const area of devYard.storage) {
    for (const part of area.parts) {
      const xs = part.map((p) => p[0]);
      const ys = part.map((p) => p[1]);
      for (let x = Math.min(...xs) + 0.5; x < Math.max(...xs); x += 0.5) {
        for (let y = Math.min(...ys) + 0.5; y < Math.max(...ys); y += 0.5) {
          if (!pointInPolygon(x, y, part)) continue;
          const score = Math.hypot(x - LOADING[0], y - LOADING[1]) + (area.covered ? 0 : 25);
          if (best && score >= best.score) continue;
          for (const yaw of [0, Math.PI / 2]) {
            const r = checkFloor(cargo, item, x, y, yaw);
            if (r.ok && r.areaId) {
              best = { x, y, yaw, score, area };
              break;
            }
          }
        }
      }
    }
  }
  if (best) return { x: best.x, y: best.y, yaw: best.yaw, label: `${best.area.name} · ${gridRef(devYard, best.x, best.y)}` };
  for (const c of cargo) {
    if (checkStack(cargo, item, c.id).ok) return { on: c.id, label: `On top of ${c.id}` };
  }
  return null;
}

/** Human-readable location of a unit: "Open yard · C3" (+ "on CARGO-…" when stacked). */
export function locationOf(item: Cargo) {
  const area = item.areaId ? devYard.storage.find((a) => a.id === item.areaId) : areaAt(devYard, item.x, item.y);
  const ref = gridRef(devYard, item.x, item.y);
  return `${area?.name ?? 'Yard floor'} · ${ref}`;
}
