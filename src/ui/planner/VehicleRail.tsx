import { Container, Truck } from 'lucide-react';
import { trucks as fleet } from '../../config/fleet';
import { useLoading } from '../../loading/store';
import type { VehicleId } from '../../loading/types';
import { VEHICLES } from '../../loading/vehicles';
import { fmtT } from './format';

/** Vehicle choice (spec §2.1): the truck's own body first, then what-if presets. */
export function VehicleRail({ truckId }: { truckId: string }) {
  const chosen = useLoading((s) => s.trucks[truckId]?.vehicle);
  const draft = useLoading((s) => s.trucks[truckId]?.status === 'draft');
  const setVehicle = useLoading((s) => s.setVehicle);
  const own = fleet.find((t) => t.id === truckId)?.body ?? 'rigid-26';
  const ids: VehicleId[] = [own, ...(Object.keys(VEHICLES) as VehicleId[]).filter((id) => id !== own)];
  return (
    <div>
      <div className="mb-1.5 px-1 text-[10.5px] font-bold tracking-[0.08em] text-faint uppercase">Vehicle</div>
      <div className="space-y-1">
        {ids.map((id) => {
          const v = VEHICLES[id];
          const active = id === chosen;
          return (
            <button
              key={id}
              type="button"
              disabled={!draft}
              title={draft ? `Plan with: ${v.label}` : 'Re-open the plan to change the vehicle'}
              onClick={() => setVehicle(truckId, id)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed ${active ? 'bg-[#eef3ff] ring-1 ring-brand/40' : 'hover:bg-[#f5f7fb]'}`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-brand text-white' : 'bg-[#eef1f6] text-muted'}`}>
                {v.model.kind === 'container' ? <Container size={16} /> : <Truck size={16} />}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[12.5px] font-semibold text-ink">{id === own ? `Own body · ${v.label}` : v.label}</span>
                <span className="block truncate text-[11px] text-muted">
                  {v.inner.l} m · {fmtT(v.payloadKg)} payload · {v.axleCount} axles
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
