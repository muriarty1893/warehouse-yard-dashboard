import { useEffect } from 'react';
import { useLoading } from '../../loading/store';
import { useView } from '../../state/view';
import { Card } from '../kit';
import { AxleCard } from './AxleCard';
import { frameTruck } from './camera';
import { DistributionChart } from './DistributionChart';
import { PlanDrawing } from './PlanDrawing';
import { PlannerKpis } from './PlannerKpis';
import { PlannerTable } from './PlannerTable';
import { PlannerTopBar } from './PlannerTopBar';
import { RowCards } from './RowCards';
import { RouteRail, StatusNote } from './RouteRail';
import { VehicleRail } from './VehicleRail';

/**
 * The load planner's screen over the 3D yard (spec §2.1); replaces the yard
 * dashboard while open. Panels marked `data-planner-rail` are what the 3D
 * view keeps the truck clear of.
 */
export function PlannerDashboard({ truckId }: { truckId: string }) {
  const view = useView((s) => s.plannerView);
  const vehicle = useLoading((s) => s.trucks[truckId]?.vehicle);
  useEffect(() => frameTruck(truckId, view), [truckId, view, vehicle]);
  return (
    <>
      <RowCards truckId={truckId} />
      <PlannerTopBar truckId={truckId} />
      <div data-planner-rail className="pointer-events-none absolute top-[76px] bottom-4 left-4 z-10 flex w-[264px] flex-col">
        <Card className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
          <VehicleRail truckId={truckId} />
          <RouteRail truckId={truckId} />
          <div className="mt-auto">
            <StatusNote truckId={truckId} />
          </div>
        </Card>
      </div>
      <div data-planner-rail className="pointer-events-none absolute top-[76px] right-4 bottom-[328px] z-10 flex w-[300px] flex-col gap-3 overflow-y-auto xl:w-[360px]">
        <AxleCard truckId={truckId} />
        <DistributionChart truckId={truckId} />
      </div>
      {view === 'plan' && (
        <div className="pointer-events-auto absolute top-[76px] right-[328px] bottom-[328px] left-[292px] z-10 xl:right-[388px]">
          <PlanDrawing truckId={truckId} />
        </div>
      )}
      <div data-planner-rail className="pointer-events-none absolute right-4 bottom-4 left-[292px] z-10 flex h-[300px] flex-col gap-3">
        <PlannerKpis truckId={truckId} />
        <PlannerTable truckId={truckId} />
      </div>
    </>
  );
}
