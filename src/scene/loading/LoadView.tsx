import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Pose } from '../../domain/types';
import { bayOfTruck, boxToLocal, boxToYard, truckPoseFor } from '../../loading/frame';
import { planOf, useLoading } from '../../loading/store';
import type { AxleId, LoadPlan, VehicleSpec } from '../../loading/types';
import { vehicleById } from '../../loading/vehicles';
import { useView } from '../../state/view';
import { freeArea, rowAnchors } from '../../ui/planner/anchors';
import { fmtT } from '../../ui/planner/format';
import { useInventory } from '../../world/inventory';
import { yardToWorld } from '../kit';
import { PackedUnits } from './PackedUnits';

/** Model-local x (forward) of an axle; articulated vehicles: tractor axles relative to the fifth wheel. */
function axleX(v: VehicleSpec, id: AxleId): number {
  const s = v.statics;
  if (s.kind === 'rigid') return boxToLocal(v, id === 'front' ? s.front : s.rear);
  if (id === 'steer') return s.steerAhead;
  if (id === 'drive') return -s.driveBehind;
  return boxToLocal(v, s.trailer);
}

const CHIP_TONE = { ok: 'tag-light', near: 'tag-amber', over: 'tag-red', light: 'tag-violet' } as const;

/** "6.52 t / 7.5" under each axle, coloured by its state at departure. */
function AxleChips({ plan, v, pose }: { plan: LoadPlan; v: VehicleSpec; pose: Pose }) {
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  return (
    <>
      {plan.checks.states[0].axles.map((a) => {
        const x = axleX(v, a.id);
        return (
          <Html key={a.id} position={yardToWorld(pose.x + c * x, pose.y + s * x, 0.15)} center zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
            <div className={`tag ${CHIP_TONE[a.status]}`} style={{ transform: 'none', fontVariantNumeric: 'tabular-nums' }}>
              <b>{fmtT(a.kg)}</b>
              <span>/ {+(a.ratingKg / 1000).toFixed(1)}</span>
            </div>
          </Html>
        );
      })}
    </>
  );
}

/** Screen position of the top of each row, for the row cards; only recomputed when the camera or plan moves. */
function RowAnchors({ plan, v, pose }: { plan: LoadPlan; v: VehicleSpec; pose: Pose }) {
  const seen = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Matrix4(), plan: null as LoadPlan | null, w: 0, h: 0 }), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    if (seen.plan === plan && seen.m.equals(camera.matrixWorld) && seen.p.equals(camera.projectionMatrix) && seen.w === size.width && seen.h === size.height) return;
    seen.plan = plan;
    seen.m.copy(camera.matrixWorld);
    seen.p.copy(camera.projectionMatrix);
    seen.w = size.width;
    seen.h = size.height;
    rowAnchors.points = plan.rows.map((r) => {
      const [x, y] = boxToYard(pose, v, (r.x0 + r.x1) / 2, v.inner.w / 2);
      tmp.set(...yardToWorld(x, y, v.deck + v.inner.h + 0.35)).project(camera);
      return { x: ((tmp.x + 1) / 2) * size.width, y: ((1 - tmp.y) / 2) * size.height, visible: tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 };
    });
    rowAnchors.version += 1;
  });
  return null;
}

/** Keep the truck in the middle of the space the planner panels leave free, not the middle of the window. */
function Viewport() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    const apply = () => {
      const a = freeArea();
      const cx = (a.left + a.right) / 2;
      const cy = (a.top + a.bottom) / 2;
      camera.setViewOffset(size.width, size.height, size.width / 2 - cx, size.height / 2 - cy, size.width, size.height);
    };
    // The panels mount alongside this one; measure once they are laid out.
    const id = window.setTimeout(apply, 60);
    return () => {
      window.clearTimeout(id);
      camera.clearViewOffset();
    };
  }, [camera, size]);
  return null;
}

function PlannedLoad({ truckId }: { truckId: string }) {
  const plan = useLoading((s) => planOf(s, truckId));
  const cargo = useInventory((s) => s.cargo);
  const vehicle = plan?.vehicle;
  const bay = useMemo(() => bayOfTruck(truckId), [truckId]);
  const v = vehicle ? vehicleById(vehicle) : null;
  const pose = useMemo(() => (bay && v ? truckPoseFor(bay, v) : null), [bay, v]);
  if (!plan || !v || !pose) return null;
  return (
    <>
      <PackedUnits plan={plan} v={v} pose={pose} truckId={truckId} cargo={cargo} />
      <AxleChips plan={plan} v={v} pose={pose} />
      <RowAnchors plan={plan} v={v} pose={pose} />
    </>
  );
}

/** Scene pieces of the load planner (spec §2.2); nothing while it is closed. */
export function LoadView() {
  const planner = useView((s) => s.planner);
  if (!planner) return null;
  return (
    <>
      <Viewport />
      <PlannedLoad truckId={planner.truckId} />
    </>
  );
}

/** The vehicle a truck is drawn as while its plan is open (the plan's, else the chosen one). */
export function usePlannerVehicle(truckId: string | null): VehicleSpec | undefined {
  const id = useLoading((s) => (truckId ? (planOf(s, truckId)?.vehicle ?? s.trucks[truckId]?.vehicle) : undefined));
  return id ? vehicleById(id) : undefined;
}
