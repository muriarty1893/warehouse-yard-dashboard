import { beforeEach, describe, expect, it } from 'vitest';
import { PICKS } from '../config/fleet';
import type { Cargo } from '../domain/types';
import { demoCargo } from './demo';
import { migrateInventory, useInventory } from './inventory';
import { checkFloor, hasOnTop, inYard, locationOf } from './placement';

const isPick = (c: Cargo) => [PICKS.platform, PICKS.ground].some((p) => Math.hypot(p[0] - c.x, p[1] - c.y) < 0.01);
/** Floor units nothing stands on, away from the scripted forklifts' pick spots. */
const freeFloorUnits = () => {
  const { cargo } = useInventory.getState();
  return cargo.filter((c) => !c.on && !c.pinned && c.areaId && !isPick(c) && !hasOnTop(cargo, c.id) && c.look !== 'container');
};

beforeEach(() => {
  useInventory.setState({ cargo: demoCargo('normal', 1), documents: [], events: [], epoch: 0 });
});

describe('loading cargo onto trucks', () => {
  it('loadOnto takes a unit out of the yard', () => {
    const unit = freeFloorUnits()[0];
    expect(useInventory.getState().loadOnto(unit.id, 'TRUCK-102', 2, 'L1').ok).toBe(true);
    const after = useInventory.getState().cargo.find((c) => c.id === unit.id)!;
    expect(after.loadedOn).toEqual({ truckId: 'TRUCK-102', stop: 2 });
    expect(after.areaId).toBeNull();
    expect(inYard(after)).toBe(false);
    expect(locationOf(after)).toBe('TRUCK-102');
    const last = useInventory.getState().events.at(-1)!;
    expect(last.kind).toBe('loaded');
    expect(last.text).toBe('Loaded onto TRUCK-102 at L1');
  });

  it('loaded units do not block placement', () => {
    const unit = freeFloorUnits()[0];
    const probe = { look: unit.look, dims: unit.dims };
    expect(checkFloor(useInventory.getState().cargo, probe, unit.x, unit.y, unit.yaw).ok).toBe(false);
    useInventory.getState().loadOnto(unit.id, 'TRUCK-102', 1, 'L1');
    expect(checkFloor(useInventory.getState().cargo, probe, unit.x, unit.y, unit.yaw).ok).toBe(true);
  });

  it("dispatch releases only that truck's units", () => {
    const [a, b, c] = freeFloorUnits();
    const inv = useInventory.getState();
    inv.loadOnto(a.id, 'TRUCK-102', 1, 'L1');
    inv.loadOnto(b.id, 'TRUCK-102', 2, 'L1');
    inv.loadOnto(c.id, 'TRUCK-109', 1, 'L4');
    expect(useInventory.getState().dispatch('TRUCK-102')).toBe(2);
    const ids = useInventory.getState().cargo.map((u) => u.id);
    expect(ids).not.toContain(a.id);
    expect(ids).not.toContain(b.id);
    expect(ids).toContain(c.id);
    expect(useInventory.getState().events.filter((e) => e.text === 'Left the yard on TRUCK-102').length).toBe(2);
  });

  it('a loaded unit cannot be moved in the yard', () => {
    const unit = freeFloorUnits()[0];
    useInventory.getState().loadOnto(unit.id, 'TRUCK-102', 1, 'L1');
    expect(useInventory.getState().move(unit.id, { x: unit.x, y: unit.y, yaw: unit.yaw }).ok).toBe(false);
  });

  it('logPlanned writes one planned event per unit', () => {
    const [a, b] = freeFloorUnits();
    useInventory.getState().logPlanned([a.id, b.id], 'TRUCK-102', () => 'stop 2 Ankara');
    const planned = useInventory.getState().events.filter((e) => e.kind === 'planned');
    expect(planned.map((e) => e.cargoId)).toEqual([a.id, b.id]);
    expect(planned[0].text).toBe('Planned for TRUCK-102 · stop 2 Ankara');
  });
});

describe('saved data', () => {
  it('migration from v2 keeps manual records and flags fragile goods', () => {
    const cargo = demoCargo('normal', 1).map(({ fragile: _f, ...c }) => c as Cargo);
    const tiles = { ...cargo[5], description: 'Ceramic Tiles' };
    const manual: Cargo = { ...cargo[6], id: 'CARGO-99001', source: 'manual', description: 'Hand-entered' };
    const v2 = { layout: 1, day: 2, fill: 'normal', cargo: [...cargo.slice(0, 5), tiles, manual], documents: [], events: [], cargoSerial: 99001, docSerial: 1200 };
    const out = migrateInventory(v2, 2);
    expect(out.cargo.find((c) => c.id === 'CARGO-99001')).toBeTruthy();
    expect(out.cargo.find((c) => c.id === tiles.id)?.fragile).toBe(true);
    expect(out.epoch).toBe(0);
    expect(out.day).toBe(2);
  });

  it('reset and newDay bump epoch', () => {
    const inv = useInventory.getState();
    inv.reset();
    expect(useInventory.getState().epoch).toBe(1);
    useInventory.getState().newDay();
    expect(useInventory.getState().epoch).toBe(2);
  });
});
