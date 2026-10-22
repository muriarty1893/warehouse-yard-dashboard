import { useEffect } from 'react';
import { useLoading } from '../../loading/store';
import { useView } from '../../state/view';
import { frameTruck } from './camera';
import { PlannerTopBar } from './PlannerTopBar';

/** The load planner's screen over the 3D yard (spec §2.1); replaces the yard dashboard while open. */
export function PlannerDashboard({ truckId }: { truckId: string }) {
  const view = useView((s) => s.plannerView);
  const vehicle = useLoading((s) => s.trucks[truckId]?.vehicle);
  useEffect(() => frameTruck(truckId, view), [truckId, view, vehicle]);
  return <PlannerTopBar truckId={truckId} />;
}
