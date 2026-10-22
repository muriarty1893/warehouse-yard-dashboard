import { devYard } from '../config/devYard';
import { trucks } from '../config/fleet';
import type { Pose, TruckBay, Vec2 } from '../domain/types';
import { bayRear, parkInBay } from '../domain/vehicles';
import type { VehicleSpec } from './types';

/**
 * Coordinates of a planned truck: where it stands in its bay, and how the box
 * frame (x from the front wall towards the doors, y across from the right
 * wall) maps to the model and to the yard.
 */

/** Pose of a vehicle parked with its doors 0.25 m off the bay's back edge. */
export function truckPoseFor(bay: TruckBay, v: VehicleSpec): Pose {
  const [rx, ry] = bayRear(bay);
  const back = v.model.doorsToOrigin + 0.25;
  return { x: rx + Math.cos(bay.heading) * back, y: ry + Math.sin(bay.heading) * back, heading: bay.heading };
}

/** Model-local x (forward) of a box-frame x. */
export const boxToLocal = (v: VehicleSpec, x: number) => v.model.frontWall - x;

/** Yard point of a box-frame point for a truck at `pose`. */
export function boxToYard(pose: Pose, v: VehicleSpec, x: number, y: number): Vec2 {
  const fwd = boxToLocal(v, x);
  const left = y - v.inner.w / 2;
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  return [pose.x + c * fwd - s * left, pose.y + s * fwd + c * left];
}

/** Warning when a what-if vehicle is much longer than the bay (spec §1.3). */
export function bayFitWarning(bay: TruckBay, v: VehicleSpec): string | null {
  if (v.overallLength <= bay.length + 1.5) return null;
  return `${v.overallLength.toFixed(1)} m — longer than bay ${bay.id} (${bay.length} m), blocks the lane`;
}

/** The bay a parked truck stands in (scripted visitors have none). */
export function bayOfTruck(truckId: string): TruckBay | null {
  const spec = trucks.find((t) => t.id === truckId);
  if (!spec?.pose || spec.route) return null;
  const { x, y } = spec.pose;
  return devYard.bays.find((b) => {
    const p = parkInBay(b, spec.kind);
    return Math.hypot(p.x - x, p.y - y) < 1.5;
  }) ?? null;
}

/** Proportions of a rigid truck model (model-local x forward, origin on the first rear axle). */
export function rigidLayout(v: VehicleSpec) {
  const front = v.model.frontWall + 0.1;
  const rearX = -v.model.doorsToOrigin;
  const boxHeight = v.inner.h + 0.2;
  const start = Math.min(...v.model.rearAxles) - 1.1;
  const end = v.model.frontAxle + 0.9;
  return {
    boxCenter: (front + rearX) / 2,
    boxLength: front - rearX,
    boxHeight,
    /** Height of the box centre (the floor sits just under the deck). */
    boxY: v.deck - 0.045 + boxHeight / 2,
    rearX,
    frontAxle: v.model.frontAxle,
    rearAxles: v.model.rearAxles,
    cabFront: v.model.frontWall + 2.85,
    frame: { x: (start + end) / 2, l: end - start },
  };
}
