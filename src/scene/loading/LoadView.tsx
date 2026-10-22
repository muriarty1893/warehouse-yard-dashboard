import { Html } from '@react-three/drei';
import type { Pose } from '../../domain/types';
import { bayOfTruck, boxToLocal, truckPoseFor } from '../../loading/frame';
import { planOf, useLoading } from '../../loading/store';
import type { AxleId, LoadPlan, VehicleSpec } from '../../loading/types';
import { vehicleById } from '../../loading/vehicles';
import { useView } from '../../state/view';
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

function PlannedLoad({ truckId }: { truckId: string }) {
  const plan = useLoading((s) => planOf(s, truckId));
  const cargo = useInventory((s) => s.cargo);
  const bay = bayOfTruck(truckId);
  if (!plan || !bay) return null;
  const v = vehicleById(plan.vehicle);
  const pose = truckPoseFor(bay, v);
  return (
    <>
      <PackedUnits plan={plan} v={v} pose={pose} truckId={truckId} cargo={cargo} />
      <AxleChips plan={plan} v={v} pose={pose} />
    </>
  );
}

/** Scene pieces of the load planner (spec §2.2); nothing while it is closed. */
export function LoadView() {
  const planner = useView((s) => s.planner);
  if (!planner) return null;
  return <PlannedLoad truckId={planner.truckId} />;
}

/** The vehicle a truck is drawn as while its plan is open (the plan's, else the chosen one). */
export function usePlannerVehicle(truckId: string | null): VehicleSpec | undefined {
  const id = useLoading((s) => (truckId ? (planOf(s, truckId)?.vehicle ?? s.trucks[truckId]?.vehicle) : undefined));
  return id ? vehicleById(id) : undefined;
}
