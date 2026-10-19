import type { Cargo, Spot } from '../domain/types';
import { useControl } from '../sim/control';
import { useUi, type RegisterDraft } from '../state/ui';
import { useInventory } from '../world/inventory';
import { baseHeight, checkSpot, hasOnTop, type PlaceCheck } from '../world/placement';
import { useWorld } from '../world/store';

/** User actions shared by buttons, keyboard shortcuts and the 3D view. */

export function startMove(cargoId: string) {
  const inv = useInventory.getState();
  const item = inv.cargo.find((c) => c.id === cargoId);
  const ui = useUi.getState();
  if (!item) return;
  if (hasOnTop(inv.cargo, cargoId)) {
    ui.notify('Move the unit on top of it first', 'error');
    return;
  }
  ui.openDialog(null);
  ui.setPlacing({ kind: 'move', cargoId }, item.yaw);
}

/** Put a filled-in register form on the map (click where the unit goes). */
export function startRegisterPlacement(draft: RegisterDraft) {
  const ui = useUi.getState();
  ui.openDialog(null);
  ui.setPlacing({ kind: 'register', draft }, 0);
}

/** The unit being placed (moved, or about to be registered). */
export function placingUnit(): (Pick<Cargo, 'look' | 'dims'> & { id?: string }) | null {
  const p = useUi.getState().placing;
  if (!p) return null;
  if (p.kind === 'register') return p.draft.input;
  return useInventory.getState().cargo.find((c) => c.id === p.cargoId) ?? null;
}

export function placeCheck(spot: Spot): PlaceCheck | null {
  const unit = placingUnit();
  if (!unit) return null;
  return checkSpot(useInventory.getState().cargo, unit, spot);
}

/** Drop the unit being placed at a spot. */
export function placeAt(spot: Spot) {
  const ui = useUi.getState();
  const p = ui.placing;
  if (!p) return;
  const inv = useInventory.getState();
  const id = p.kind === 'move' ? p.cargoId : p.draft.input.id;
  const result = p.kind === 'move' ? inv.move(id, spot) : inv.register(p.draft.input, spot, p.draft.doc);
  if (!result.ok) {
    ui.notify(result.reason, 'error');
    return;
  }
  const after = useInventory.getState().cargo;
  const placed = after.find((c) => c.id === id);
  if (placed) ui.pulseAt(placed.x, placed.y, baseHeight(after, placed));
  ui.setPlacing(null);
  ui.select({ kind: 'cargo', id });
  ui.notify(p.kind === 'move' ? `${id} moved` : `${id} registered`);
}

export function cancelPlacing() {
  const ui = useUi.getState();
  const p = ui.placing;
  ui.setPlacing(null);
  // Back to the form, so a registration in progress is not lost.
  if (p?.kind === 'register') ui.openDialog({ kind: 'cargo', draft: p.draft });
}

export function releaseCargo(cargoId: string) {
  const ui = useUi.getState();
  const result = useInventory.getState().release(cargoId);
  if (result.ok) {
    ui.select(null);
    ui.notify(`${cargoId} released from the yard`);
  } else ui.notify(result.reason, 'error');
}

/** Hold or resume one vehicle. */
export function toggleHold(id: string) {
  const c = useControl.getState();
  if (c.holds[id] !== undefined) c.resume([id]);
  else c.hold([id]);
}

const scriptedVehicles = () => {
  const w = useWorld.getState();
  return [...w.trucks.filter((t) => t.scripted), ...w.forklifts.filter((f) => f.scripted)].map((v) => v.id);
};

export const anyHeld = () => Object.keys(useControl.getState().holds).length > 0;

/** Emergency stop: hold every moving vehicle; again to resume them all. */
export function toggleStopAll() {
  const c = useControl.getState();
  const ids = scriptedVehicles();
  if (anyHeld()) c.resume(Object.keys(c.holds));
  else c.hold(ids);
  useUi.getState().notify(anyHeld() ? 'All vehicles stopped' : 'All vehicles resumed');
}
