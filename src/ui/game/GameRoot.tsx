import { useView } from '../../state/view';
import { Dialogs } from '../Dialog';
import { PlannerDashboard } from '../planner/PlannerDashboard';
import { CameraStrip } from './CameraStrip';

/**
 * Everything over the 3D yard while the game runs (spec §4): the load
 * planner when it is open, else the shift HUD. Grows with the HUD and the
 * screens around a shift.
 */
export function GameRoot() {
  const planner = useView((s) => s.planner);
  return (
    <div className="pointer-events-none absolute inset-0">
      {planner ? (
        <PlannerDashboard truckId={planner.truckId} />
      ) : (
        <div className="pointer-events-auto absolute top-1/2 right-4 -translate-y-1/2">
          <CameraStrip />
        </div>
      )}
      <Dialogs />
    </div>
  );
}
