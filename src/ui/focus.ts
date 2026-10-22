import type { EntityRef } from '../state/ui';
import { useUi } from '../state/ui';
import { useView } from '../state/view';
import { useInventory } from '../world/inventory';
import { baseHeight } from '../world/placement';
import { useWorld } from '../world/store';

/** Fly the camera to an entity (moving ones are tracked live by the camera rig). */
export function focusEntity(ref: EntityRef) {
  const world = useWorld.getState();
  if (ref.kind === 'cargo') {
    const cargo = useInventory.getState().cargo;
    const c = cargo.find((item) => item.id === ref.id);
    if (!c) return;
    if (c.loadedOn) {
      focusEntity({ kind: 'truck', id: c.loadedOn.truckId });
      return;
    }
    useView.getState().send({ kind: 'focus', x: c.x, y: c.y, h: baseHeight(cargo, c) + c.dims.h / 2, distance: 22 });
    return;
  }
  const list = ref.kind === 'truck' ? world.trucks : ref.kind === 'forklift' ? world.forklifts : world.workers;
  const e = list.find((item) => item.id === ref.id);
  if (!e) return;
  useView.getState().send({ kind: 'focus', ref, x: e.x, y: e.y, distance: ref.kind === 'truck' ? 46 : 24 });
}

export function selectAndFocus(ref: EntityRef) {
  useUi.getState().select(ref);
  focusEntity(ref);
}

export function focusPoint(x: number, y: number, distance = 40) {
  useView.getState().send({ kind: 'focus', x, y, distance });
}
