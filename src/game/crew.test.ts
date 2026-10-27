import { describe, expect, test } from 'vitest';
import { buildGrid, reachUnit } from '../sim/grid';
import { recommendSpot } from '../world/placement';
import { addGroup, crewDue, dispatch, moveGroup } from './crew';
import { blocker, dock, dockedInboundFixture, dockedOutboundFixture, loadGroupFor, runAll, truck, unloadGroupFor, yardOf } from './fixtures';
import type { GameCargo, ShiftState } from './types';

const breakAllBut = (s: ShiftState, keep: string[]) => s.forklifts.forEach((f) => (f.brokenUntil = keep.includes(f.id) ? null : 1e9));
const active = (s: ShiftState) => s.jobs.filter((j) => j.status === 'active');

describe('crew dispatcher', () => {
  test('jobs go out in priority order', () => {
    const s = dockedInboundFixture('L1');
    dock(s, 'TRUCK-OUT-1', 'L2');
    breakAllBut(s, ['FL-01']);
    addGroup(s, unloadGroupFor(s, 'HS1'));
    const load = addGroup(s, loadGroupFor(s, 2));
    moveGroup(s, load.id, 0);
    dispatch(s, 0);
    expect(active(s).map((j) => j.groupId)).toEqual([load.id]);
  });

  test('the nearest free forklift takes the job', () => {
    const s = dockedOutboundFixture();
    const def = loadGroupFor(s, 1);
    const unit = yardOf(s).find((c) => c.id === def.units[0].unitId)!;
    const stand = reachUnit(buildGrid(yardOf(s)), yardOf(s), unit)!.stand;
    s.forklifts.find((f) => f.id === 'FL-02')!.pose = { x: stand[0], y: stand[1], heading: 0 };
    addGroup(s, def);
    dispatch(s, 0);
    expect(active(s).map((j) => j.forkliftId)).toEqual(['FL-02']);
  });

  test('only one forklift inside a truck at a time', () => {
    const s = dockedOutboundFixture();
    breakAllBut(s, ['FL-01', 'FL-02']);
    addGroup(s, loadGroupFor(s, 2));
    dispatch(s, 0);
    const [a, b] = active(s).sort((x, y) => x.enterAt! - y.enterAt!);
    expect(b).toBeDefined();
    expect(b.enterAt!).toBeGreaterThanOrEqual(a.leaveAt! + 1.5);
    expect(truck(s, 'TRUCK-OUT-1').busyUntil).toBe(b.leaveAt);
  });

  test('loading order inside a group is kept', () => {
    const s = dockedOutboundFixture();
    breakAllBut(s, ['FL-01', 'FL-02']);
    const g = addGroup(s, loadGroupFor(s, 3));
    dispatch(s, 0);
    const [j1, j2, j3] = g.jobIds.map((id) => s.jobs.find((j) => j.id === id)!);
    expect([j1.status, j2.status, j3.status]).toEqual(['active', 'active', 'queued']);
    runAll(crewDue, s, Math.min(j1.doneAt!, j2.doneAt!), dispatch);
    expect(j3.status).toBe('active');
  });

  test('a full area blocks unloading with a reason', () => {
    const s = dockedInboundFixture();
    // Fill the gate-side space with copies of the truck's own units until none of them fits.
    const inbound = truck(s, 'TRUCK-IN-1').aboard.map((id) => s.cargo.find((c) => c.id === id)!);
    for (let i = 0, progress = true; progress && i < 500; i++) {
      progress = false;
      for (const u of inbound) {
        const spot = recommendSpot(yardOf(s), u, { areaId: 'GS' });
        if (!spot) continue;
        const at = 'on' in spot ? (() => { const b = s.cargo.find((c) => c.id === spot.on)!; return { x: b.x, y: b.y, yaw: b.yaw, on: b.id }; })() : { x: spot.x, y: spot.y, yaw: spot.yaw, on: null };
        s.cargo.push({ ...u, ...at, id: `FILL-${i}-${u.id}`, areaId: 'GS', loadedOn: null, papers: 'ok', transitJob: null, gone: false } as GameCargo);
        progress = true;
      }
    }
    const g = addGroup(s, unloadGroupFor(s, 'GS'));
    dispatch(s, 0);
    const first = s.jobs.find((j) => j.id === g.jobIds[0])!;
    expect(first.blocked).toBe('Area full');
    expect(active(s)).toHaveLength(0);
  });

  test('an unreachable unit blocks its group but not others', () => {
    const s = dockedOutboundFixture();
    const load = loadGroupFor(s, 1);
    const unit = s.cargo.find((c) => c.id === load.units[0].unitId)!;
    let n = 0;
    for (const axis of [0, Math.PI / 2])
      for (const side of [1, -1]) {
        const half = (axis === 0 ? unit.dims.l : unit.dims.w) / 2;
        const d = side * (half + 1.45);
        s.cargo.push(blocker(unit, `BLOCK-${n++}`, unit.x + Math.cos(unit.yaw + axis) * d, unit.y + Math.sin(unit.yaw + axis) * d));
      }
    const lg = addGroup(s, load);
    const yard = yardOf(s);
    const grid = buildGrid(yard);
    const other = yard.find((c) => c.id !== unit.id && !c.on && c.areaId !== 'HS1' && !yard.some((o) => o.on === c.id) && reachUnit(grid, yard, c))!;
    const mg = addGroup(s, { kind: 'move', label: 'Move 1 unit → Main hold', truckId: null, areaId: 'HS1', units: [{ unitId: other.id, placement: null }] });
    dispatch(s, 0);
    expect(s.jobs.find((j) => j.id === lg.jobIds[0])!.blocked).toBe('No forklift access');
    expect(s.jobs.find((j) => j.id === mg.jobIds[0])!.status).toBe('active');
  });

  test('a broken forklift gets no work', () => {
    const s = dockedOutboundFixture();
    breakAllBut(s, []);
    addGroup(s, loadGroupFor(s, 1));
    dispatch(s, 0);
    expect(active(s)).toHaveLength(0);
  });

  test('setting down an unloaded unit pays the handling fee', () => {
    const s = dockedInboundFixture();
    addGroup(s, unloadGroupFor(s, 'HS1'));
    dispatch(s, 0);
    runAll(crewDue, s, 10_000, dispatch);
    expect(s.ledger.filter((e) => e.kind === 'handling').map((e) => e.amount)).toEqual([40, 40, 40, 40]);
    expect(truck(s, 'TRUCK-IN-1').aboard).toEqual([]);
    expect(s.jobs.every((j) => j.status === 'done')).toBe(true);
    for (const id of truck(s, 'TRUCK-IN-1').load.map((p) => p.cargoId)) expect(s.cargo.find((c) => c.id === id)!.loadedOn).toBeNull();
  });
});
