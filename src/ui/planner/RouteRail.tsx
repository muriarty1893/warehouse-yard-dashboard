import { ArrowDown, ArrowUp, GripVertical, Info, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { stopEtas } from '../../config/cities';
import { bayFitWarning, bayOfTruck } from '../../loading/frame';
import { outdated, planOf, useLoading } from '../../loading/store';
import { vehicleById } from '../../loading/vehicles';
import { useInventory } from '../../world/inventory';
import { inYard } from '../../world/placement';
import { yardSeconds } from '../../world/time';
import { useJobs } from '../../sim/jobs';
import { useWorld } from '../../world/store';
import { Button } from '../kit';
import { stopColor } from './format';
import { fmtYardTime, overflowNote } from './notes';

/** Simulated seconds per unit with two forklifts sharing the trips, for the planned departure time. */
const SECONDS_PER_UNIT = 35;

/** Route editor (spec §2.1): drop order with ETAs; drag or use the arrows to reorder. */
export function RouteRail({ truckId }: { truckId: string }) {
  const t = useLoading((s) => s.trucks[truckId]);
  const plan = useLoading((s) => planOf(s, truckId));
  const { moveStop, addStop, removeStop } = useLoading.getState();
  const cargo = useInventory((s) => s.cargo);
  const minute = useWorld((s) => Math.floor(s.t / 6));
  const [dragging, setDragging] = useState<number | null>(null);
  const draft = t?.status === 'draft';

  const destinations = useMemo(
    () => [...new Set(cargo.filter((c) => inYard(c) && c.look !== 'container').map((c) => c.destination))].sort((a, b) => a.localeCompare(b, 'tr')),
    [cargo],
  );
  if (!t) return null;
  const depart = yardSeconds(minute * 6 + (plan?.stats.units ?? 0) * SECONDS_PER_UNIT);
  const etas = stopEtas(depart, t.route);
  const addable = destinations.filter((d) => !t.route.includes(d));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10.5px] font-bold tracking-[0.08em] text-faint uppercase">Route</span>
        <span className="text-[11px] text-muted">departs ≈ {fmtYardTime(depart)}</span>
      </div>
      <div className="space-y-0.5">
        {t.route.map((city, i) => (
          <div
            key={city}
            draggable={draft}
            onDragStart={() => setDragging(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging !== null) moveStop(truckId, dragging, i);
              setDragging(null);
            }}
            className={`group flex items-center gap-2 rounded-lg py-1 pr-1 pl-0.5 ${dragging === i ? 'opacity-40' : 'hover:bg-[#f5f7fb]'}`}
          >
            <GripVertical size={13} className={draft ? 'cursor-grab text-faint' : 'text-transparent'} />
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white" style={{ background: stopColor(i + 1) }}>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{city}</span>
            <span className="text-[11.5px] text-muted tabular-nums group-hover:hidden">{fmtYardTime(etas[i])}</span>
            {draft && (
              <span className="hidden items-center group-hover:flex">
                <button type="button" title="Earlier" aria-label={`Move ${city} earlier`} disabled={i === 0} onClick={() => moveStop(truckId, i, i - 1)} className="rounded p-0.5 text-muted hover:text-ink disabled:opacity-30">
                  <ArrowUp size={13} />
                </button>
                <button type="button" title="Later" aria-label={`Move ${city} later`} disabled={i === t.route.length - 1} onClick={() => moveStop(truckId, i, i + 1)} className="rounded p-0.5 text-muted hover:text-ink disabled:opacity-30">
                  <ArrowDown size={13} />
                </button>
                <button type="button" title="Remove stop" aria-label={`Remove ${city}`} disabled={t.route.length === 1} onClick={() => removeStop(truckId, i)} className="rounded p-0.5 text-muted hover:text-[#d64545] disabled:opacity-30">
                  <X size={13} />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
      {draft && t.route.length < 5 && addable.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && addStop(truckId, e.target.value)}
          className="mt-1.5 h-8 w-full rounded-lg border border-line bg-white px-2 text-[12px] text-muted outline-none focus:border-brand/50"
          aria-label="Add a stop"
        >
          <option value="">+ Add stop…</option>
          {addable.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** The one thing worth knowing about this plan right now (spec §2.1 status note). */
export function StatusNote({ truckId }: { truckId: string }) {
  const t = useLoading((s) => s.trucks[truckId]);
  const plan = useLoading((s) => planOf(s, truckId));
  const cargo = useInventory((s) => s.cargo);
  const runNotes = useJobs((s) => (s.run?.truckId === truckId ? s.run.notes : null));
  if (!t || !plan) return null;
  const stale = !t.keptOutdated ? outdated(t, cargo) : null;
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
          {runNotes?.map((n) => (
            <div key={n}>Loading run: {n}</div>
          ))}
        </div>
      </div>
      {stale && (
        <div className="mt-2 flex gap-1.5">
          <Button tone="primary" className="h-7 px-2.5 text-[11.5px]" onClick={() => useLoading.getState().reopen(truckId)}>
            Re-plan
          </Button>
          <Button className="h-7 px-2.5 text-[11.5px]" onClick={() => useLoading.getState().keep(truckId)}>
            Keep
          </Button>
        </div>
      )}
    </div>
  );
}
