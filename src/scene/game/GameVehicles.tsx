import { memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { forklifts as fleetForklifts, type ForkliftSpec, type TruckSpec } from '../../config/fleet';
import { carriedBy, motionOf } from '../../game/motion';
import { useGame } from '../../game/store';
import { clock } from '../../sim/clock';
import type { RoutePose } from '../../sim/route';
import { useView } from '../../state/view';
import { usePlannerVehicle } from '../loading/LoadView';
import { Forklift } from '../vehicles/Forklift';
import { Truck } from '../vehicles/Truck';

/** The shift's trucks and forklifts in the 3D yard, posed from the engine every frame (spec §3.2). */

const shift = () => useGame.getState().shift;

const GameTruck = memo(function GameTruck({ id, planned }: { id: string; planned: boolean }) {
  const carrier = useGame((s) => s.shift?.trucks.find((t) => t.id === id)?.carrier ?? 'docktor');
  const plannerVehicle = usePlannerVehicle(planned ? id : null);
  const spec = useMemo<TruckSpec>(() => ({ id, kind: 'rigid', carrier, plate: id.replace('TRUCK-', '34 DKT '), driver: '', status: '', capacity: 12, body: 'rigid-26' }), [id, carrier]);
  const drive = useMemo(
    () => (out: RoutePose) => {
      const tr = shift()?.trucks.find((t) => t.id === id);
      if (!tr) return void (out.visible = false);
      motionOf(tr, clock.t, out);
      out.doors = tr.stage === 'docked';
      // Off the map once it has driven away.
      if (tr.stage === 'gone' || (tr.stage === 'departing' && tr.motion && clock.t >= tr.motion.until)) out.visible = false;
    },
    [id],
  );
  return planned ? <Truck spec={spec} drive={drive} plannerVehicle={plannerVehicle} cutaway /> : <Truck spec={spec} drive={drive} />;
});

export function GameTrucks() {
  const ids = useGame(useShallow((s) => (s.shift?.trucks ?? []).filter((t) => t.stage !== 'scheduled' && t.stage !== 'gone').map((t) => t.id)));
  const planned = useView((s) => s.planner?.truckId ?? null);
  return (
    <>
      {ids.map((id) => (
        <GameTruck key={id} id={id} planned={id === planned} />
      ))}
    </>
  );
}

const GameForklift = memo(function GameForklift({ id }: { id: string }) {
  const spec = useMemo<ForkliftSpec>(() => {
    const fleet = fleetForklifts.find((f) => f.id === id);
    return { id, operator: fleet?.operator ?? 'Temp driver', model: fleet?.model ?? 'Temp forklift', status: '', battery: 100, charger: fleet?.charger ?? 'C1', load: 'cartons' };
  }, [id]);
  const drive = useMemo(
    () => (out: RoutePose) => {
      const f = shift()?.forklifts.find((x) => x.id === id);
      if (!f) return void (out.visible = false);
      motionOf(f, clock.t, out);
    },
    [id],
  );
  const carry = useMemo(
    () => () => {
      const s = shift();
      return s ? carriedBy(s, id, clock.t) : null;
    },
    [id],
  );
  return <Forklift spec={spec} drive={drive} carry={carry} />;
});

export function GameForklifts() {
  const ids = useGame(useShallow((s) => (s.shift?.forklifts ?? []).map((f) => f.id)));
  return (
    <>
      {ids.map((id) => (
        <GameForklift key={id} id={id} />
      ))}
    </>
  );
}
