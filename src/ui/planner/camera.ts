import { devYard } from '../../config/devYard';
import type { TruckBay } from '../../domain/types';
import { bayOfTruck, boxToYard, truckPoseFor } from '../../loading/frame';
import { useLoading } from '../../loading/store';
import { vehicleById } from '../../loading/vehicles';
import { useView, type PlannerView } from '../../state/view';

const DEG = Math.PI / 180;

/** Camera presets relative to the truck (spec §2.2–§2.3): direction from the truck's heading, tilt, distance, field of view. */
// The 3D view looks from the yard side: from the platform side the hold-space canopy is in the way.
const PRESETS: Record<Exclude<PlannerView, 'plan'>, { yaw: number; pitch: number; distance: number; fov: number }> = {
  '3d': { yaw: 60 * DEG, pitch: 30 * DEG, distance: 24, fov: 30 },
  side: { yaw: 90 * DEG, pitch: 4 * DEG, distance: 46, fov: 15 },
  top: { yaw: 90 * DEG, pitch: 89 * DEG, distance: 60, fov: 15 },
};

/** The side of a bay (1 = left of the truck's heading, -1 = right) with fewer bays next to it: nothing parked in the way. */
function openSide(bay: TruckBay): 1 | -1 {
  const rx = Math.sin(bay.heading);
  const ry = -Math.cos(bay.heading);
  let left = 0;
  let right = 0;
  for (const b of devYard.bays) {
    const dx = b.center[0] - bay.center[0];
    const dy = b.center[1] - bay.center[1];
    if (b === bay || Math.hypot(dx, dy) > 12) continue;
    const d = dx * rx + dy * ry;
    if (d > 0.5) right += 1;
    else if (d < -0.5) left += 1;
  }
  return left > right ? -1 : 1;
}

/** Fly the camera to the planned truck for a view (the plan view is a drawing; the camera stays). */
export function frameTruck(truckId: string, view: PlannerView) {
  if (view === 'plan') return;
  const t = useLoading.getState().trucks[truckId];
  const bay = bayOfTruck(truckId);
  if (!t || !bay) return;
  const v = vehicleById(t.vehicle);
  const pose = truckPoseFor(bay, v);
  const [x, y] = boxToYard(pose, v, v.inner.l / 2, v.inner.w / 2);
  const p = PRESETS[view];
  // Longer vehicles need the camera further back to fit.
  const scale = Math.max(1, v.inner.l / 7.5);
  const distance = p.distance * scale;
  // Side and top views clip whatever stands between the camera and the truck (neighbouring trucks, posts).
  const near = view === 'side' ? distance - v.inner.w / 2 - 2.2 : view === 'top' ? distance - v.inner.h - 2.5 : undefined;
  useView.getState().send({ kind: 'frame', x, y, h: v.deck + 1.2, yaw: pose.heading + openSide(bay) * p.yaw, pitch: p.pitch, distance, fov: p.fov, near });
}
