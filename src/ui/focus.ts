import type { EntityRef } from '../state/ui';
import { useUi } from '../state/ui';
import { useView } from '../state/view';
import { cargo, positions } from '../world/snapshot';
import { useWorld } from '../world/store';

/** Fly the camera to an entity (moving ones are tracked live by the camera rig). */
export function focusEntity(ref: EntityRef) {
  const world = useWorld.getState();
  let x = 0;
  let y = 0;
  let h = 0;
  let distance = 40;
  if (ref.kind === 'cargo') {
    const c = cargo.find((item) => item.id === ref.id);
    const p = c && positions.get(c.positionId);
    if (!p) return;
    x = p.x;
    y = p.y;
    h = 1;
    distance = 24;
  } else {
    const list = ref.kind === 'truck' ? world.trucks : ref.kind === 'forklift' ? world.forklifts : world.workers;
    const e = list.find((item) => item.id === ref.id);
    if (!e) return;
    x = e.x;
    y = e.y;
    distance = ref.kind === 'truck' ? 46 : 24;
  }
  useView.getState().send({ kind: 'focus', ref, x, y, h, distance });
}

export function selectAndFocus(ref: EntityRef) {
  useUi.getState().select(ref);
  focusEntity(ref);
}

export function focusPoint(x: number, y: number, distance = 40) {
  useView.getState().send({ kind: 'focus', x, y, distance });
}
