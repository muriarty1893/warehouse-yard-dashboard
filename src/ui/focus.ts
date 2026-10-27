import { useGame } from '../game/store';
import { baseHeight } from '../world/placement';
import type { EntityRef } from '../state/ui';
import { useUi } from '../state/ui';
import { useView } from '../state/view';

/** Fly the camera to an entity of the running shift (moving ones are tracked live by the camera rig). */
export function focusEntity(ref: EntityRef) {
  const shift = useGame.getState().shift;
  if (!shift) return;
  if (ref.kind === 'cargo') {
    const c = shift.cargo.find((item) => item.id === ref.id);
    if (!c) return;
    if (c.loadedOn) return focusEntity({ kind: 'truck', id: c.loadedOn.truckId });
    useView.getState().send({ kind: 'focus', x: c.x, y: c.y, h: baseHeight(shift.cargo, c) + c.dims.h / 2, distance: 22 });
    return;
  }
  const e = ref.kind === 'truck' ? shift.trucks.find((t) => t.id === ref.id) : ref.kind === 'forklift' ? shift.forklifts.find((f) => f.id === ref.id) : undefined;
  if (!e) return;
  useView.getState().send({ kind: 'focus', ref, x: e.pose.x, y: e.pose.y, distance: ref.kind === 'truck' ? 46 : 24 });
}

export function selectAndFocus(ref: EntityRef) {
  useUi.getState().select(ref);
  focusEntity(ref);
}

export function focusPoint(x: number, y: number, distance = 40) {
  useView.getState().send({ kind: 'focus', x, y, distance });
}
