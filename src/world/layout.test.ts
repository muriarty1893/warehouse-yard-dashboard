import { describe, expect, it } from 'vitest';
import { devYard } from '../config/devYard';
import { forklifts, PICKS, trucks } from '../config/fleet';
import { obbOverlap, pointInPolygon, rectObb, type Obb } from '../domain/geometry';
import { RIGID } from '../domain/vehicles';
import { compileRoute, evalRoute, newPose } from '../sim/route';
import { blockedBy } from './clearance';
import { demoCargo, FILL_LEVELS, type FillLevel } from './demo';
import { checkFloor, checkStack, footprint } from './placement';

const truckBody = (x: number, y: number, h: number): Obb => {
  const mid = (RIGID.front - RIGID.rear) / 2;
  return { x: x + Math.cos(h) * mid, y: y + Math.sin(h) * mid, yaw: h, hl: (RIGID.front + RIGID.rear) / 2, hw: RIGID.width / 2 };
};
const isPick = (x: number, y: number) => [PICKS.platform, PICKS.ground].some((p) => Math.hypot(p[0] - x, p[1] - y) < 0.01);

describe('demo cargo', () => {
  it.each(Object.keys(FILL_LEVELS) as FillLevel[])('%s day: units stay in the yard, off corridors and apart', (fill) => {
    const cargo = demoCargo(fill, 3);
    expect(new Set(cargo.map((c) => c.id)).size).toBe(cargo.length);
    const floor = cargo.filter((c) => !c.on);
    for (const c of floor) {
      const fp = footprint(c.dims, c.x, c.y, c.yaw);
      expect(pointInPolygon(c.x, c.y, devYard.boundary)).toBe(true);
      if (!isPick(c.x, c.y) && !c.pinned) expect(blockedBy(fp, devYard.storage.find((a) => a.id === c.areaId)?.elevation ?? 0)?.reason ?? null).toBeNull();
      for (const o of floor) if (o !== c) expect(obbOverlap(fp, footprint(o.dims, o.x, o.y, o.yaw))).toBe(false);
    }
    for (const c of cargo.filter((u) => u.on)) expect(cargo.some((b) => b.id === c.on && b.x === c.x && b.y === c.y)).toBe(true);
  });

  it('a busier day stores more', () => {
    const counts = (Object.keys(FILL_LEVELS) as FillLevel[]).map((f) => demoCargo(f, 1).length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
  });
});

describe('placement rules', () => {
  const cargo = demoCargo('normal', 1);
  const pallet = { look: 'cartons' as const, dims: { l: 1.2, w: 0.8, h: 1.0 } };

  it('refuses buildings, the ramp and truck corridors', () => {
    expect(checkFloor(cargo, pallet, 12, 33, 0).ok).toBe(false); // main building
    expect(checkFloor(cargo, pallet, 25, 23, 0).ok).toBe(false); // ramp
    expect(checkFloor(cargo, pallet, 44, 10, 0).reason).toMatch(/Keep clear/);
  });

  it('allows a free floor spot outside storage areas but flags it', () => {
    const r = checkFloor([], pallet, 2.4, 27.3, 0);
    expect(r.ok).toBe(true);
    expect(r.warn).toBeTruthy();
  });

  it('stacks only on stackable units and up to the area limit', () => {
    const drum = cargo.find((c) => c.look === 'drum' && !c.on && !cargo.some((o) => o.on === c.id));
    if (drum) expect(checkStack(cargo, pallet, drum.id).ok).toBe(false);
    const base = cargo.find((c) => c.look === 'cartons' && !c.on && !cargo.some((o) => o.on === c.id));
    expect(base).toBeTruthy();
    expect(checkStack(cargo, pallet, base!.id).ok).toBe(true);
    const stacked = [...cargo, { ...base!, id: 'TOP', on: base!.id }];
    expect(checkStack(stacked, pallet, 'TOP').ok).toBe(false);
  });
});

describe('truck routes', () => {
  const solid = devYard.buildings.map((b) => ({ b, obb: rectObb(b.rect) }));
  const ramp = devYard.ramps.map((r) => rectObb(r.rect));
  const parked = trucks.filter((t) => t.pose).map((t) => ({ id: t.id, obb: truckBody(t.pose!.x, t.pose!.y, t.pose!.heading) }));
  const scripted = trucks.filter((t) => t.route).map((t) => ({ id: t.id, route: compileRoute(t.route!) }));
  const gate = devYard.gates.find((g) => !g.closed)!;

  it.each(scripted.map((s) => [s.id, s] as const))('%s keeps clear of buildings, platforms, the ramp and parked trucks', (_, s) => {
    const pose = newPose();
    for (let t = 0; t < s.route.duration; t += 0.1) {
      evalRoute(s.route, (s.route.spec.offset ?? 0) + t, pose);
      if (!pose.visible) continue;
      const body = truckBody(pose.x, pose.y, pose.heading);
      for (const { b, obb } of solid) expect(obbOverlap(body, obb), `${b.name} at t=${t.toFixed(1)}`).toBe(false);
      for (const r of ramp) expect(obbOverlap(body, r)).toBe(false);
      for (const p of parked) expect(obbOverlap(body, p.obb), `${p.id} at t=${t.toFixed(1)}`).toBe(false);
      // Through the walls only at the entrance.
      if (pose.y > -1 && pose.y < 1) expect(pose.x > gate.a[0] + 1.3 && pose.x < gate.b[0] - 1.3).toBe(true);
    }
  });

  it('scripted trucks never run into each other', () => {
    const a = newPose();
    const b = newPose();
    const [s1, s2] = scripted;
    for (let t = 0; t < Math.max(s1.route.period, s2.route.period) * 2; t += 0.2) {
      evalRoute(s1.route, t, a);
      evalRoute(s2.route, t, b);
      if (!a.visible || !b.visible || a.y < -2 || b.y < -2) continue;
      expect(obbOverlap(truckBody(a.x, a.y, a.heading), truckBody(b.x, b.y, b.heading)), `t=${t.toFixed(1)}`).toBe(false);
    }
  });

  it('forklifts stay off buildings and manager tables', () => {
    const desks = devYard.fixtures.filter((f) => f.kind === 'desk').map((f) => ({ x: f.x, y: f.y, yaw: 0, hl: 1.3, hw: 0.48 }));
    const pose = newPose();
    for (const f of forklifts.filter((x) => x.route)) {
      const r = compileRoute(f.route!);
      for (let t = 0; t < r.duration; t += 0.1) {
        evalRoute(r, (r.spec.offset ?? 0) + t, pose);
        const body = { x: pose.x - Math.cos(pose.heading) * 0.25, y: pose.y - Math.sin(pose.heading) * 0.25, yaw: pose.heading, hl: 1.15, hw: 0.6 };
        for (const { b, obb } of solid) if (b.kind !== 'canopy') expect(obbOverlap(body, obb), `${f.id} in ${b.name}`).toBe(false);
        for (const d of desks) expect(obbOverlap(body, d), `${f.id} hits a table at t=${t.toFixed(1)}`).toBe(false);
      }
    }
  });
});
