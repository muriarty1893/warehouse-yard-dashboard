import { Info, TriangleAlert } from 'lucide-react';
import { useGame } from '../../game/store';
import { clockLabel } from '../../game/types';
import { bayFitWarning, bayOfTruck } from '../../loading/frame';
import { outdated, planOf, planSource, useLoading } from '../../loading/store';
import { vehicleById } from '../../loading/vehicles';
import { Button } from '../kit';
import { stopColor } from './format';
import { overflowNote } from './notes';

/** The truck's stops in drop order (spec §1.3: fixed by the shift), and when it has to leave. */
export function RouteRail({ truckId }: { truckId: string }) {
  const t = useLoading((s) => s.trucks[truckId]);
  const deadline = useGame((s) => s.shift?.trucks.find((x) => x.id === truckId)?.deadline ?? null);
  if (!t) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10.5px] font-bold tracking-[0.08em] text-faint uppercase">Stops</span>
        {deadline !== null && <span className="text-[11px] text-muted">leave by {clockLabel(deadline)}</span>}
      </div>
      <div className="space-y-0.5">
        {t.route.map((city, i) => (
          <div key={city} className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white" style={{ background: stopColor(i + 1) }}>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{city}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The one thing worth knowing about this plan right now (spec §2.1 status note). */
export function StatusNote({ truckId }: { truckId: string }) {
  const t = useLoading((s) => s.trucks[truckId]);
  const plan = useLoading((s) => planOf(s, truckId));
  useGame((s) => s.version);
  if (!t || !plan) return null;
  const stale = !t.keptOutdated ? outdated(t, planSource().cargo()) : null;
  const bay = bayOfTruck(truckId);
  const fit = bay ? bayFitWarning(bay, vehicleById(t.vehicle)) : null;
  const overflow = overflowNote(plan.leftOut);
  const empty = plan.placements.length === 0;
  const warn = !!stale || !!fit || empty;
  const text = stale ? `Plan out of date — ${stale}` : fit ?? (empty ? 'No cargo for this route' : overflow);
  if (!text && plan.clearance <= 0) return null;
  return (
    <div className={`rounded-xl px-2.5 py-2 text-[11.5px] leading-snug ${warn ? 'bg-[#fff1df] text-[#8a4a0a]' : 'bg-[#f5f7fb] text-muted'}`}>
      <div className="flex gap-2">
        {warn ? <TriangleAlert size={14} className="mt-px shrink-0 text-[#f0932b]" /> : <Info size={14} className="mt-px shrink-0 text-brand" />}
        <div className="min-w-0">
          {text && <div className="font-semibold text-ink">{text}</div>}
          {plan.clearance > 0 && !stale && <div>{plan.clearance.toFixed(2)} m kept clear at the front wall to take weight off the front axle</div>}
        </div>
      </div>
      {stale && (
        <div className="mt-2 flex gap-1.5">
          <Button className="h-7 px-2.5 text-[11.5px]" onClick={() => useLoading.getState().keep(truckId)}>
            Keep
          </Button>
        </div>
      )}
    </div>
  );
}
