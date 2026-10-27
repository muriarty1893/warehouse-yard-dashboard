import { useMemo, useState } from 'react';
import { planOf, useLoading, usePlanCargo } from '../../loading/store';
import { useUi } from '../../state/ui';
import { inYard, locationOf } from '../../world/placement';
import { Modal } from '../Dialog';
import { Button, Field, inputClass } from '../kit';
import { fmtKg } from './format';

/** Pick a yard unit that must go on this truck now (spec §1.2 urgent override). */
export function UrgentPicker({ truckId }: { truckId: string }) {
  const close = () => useUi.getState().openDialog(null);
  const route = useLoading((s) => s.trucks[truckId]?.route ?? []);
  const trucks = useLoading((s) => s.trucks);
  const cargo = usePlanCargo();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [stop, setStop] = useState(1);

  // Yard units not loaded and not held by another truck's confirmed plan.
  const held = useMemo(() => new Set(Object.values(trucks).flatMap((t) => (t.truckId !== truckId && t.confirmed ? t.confirmed.placements.map((p) => p.cargoId) : []))), [trucks, truckId]);
  const mine = useMemo(() => new Set(planOf({ trucks }, truckId)?.placements.map((p) => p.cargoId) ?? []), [trucks, truckId]);
  const q = query.trim().toLowerCase();
  const hits = cargo
    .filter((c) => inYard(c) && c.look !== 'container' && !held.has(c.id) && (!q || `${c.id} ${c.description} ${c.destination}`.toLowerCase().includes(q)))
    .slice(0, 40);

  const choose = (id: string) => {
    setPicked(id);
    const c = cargo.find((u) => u.id === id);
    const i = c ? route.indexOf(c.destination) : -1;
    setStop(i >= 0 ? i + 1 : 1);
  };
  const add = () => {
    if (!picked) return;
    useLoading.getState().addUrgent(truckId, picked, stop);
    useUi.getState().notify(`${picked} goes on ${truckId} first · stop ${stop} ${route[stop - 1] ?? ''}`);
    close();
  };

  return (
    <Modal title="Urgent unit" subtitle={`Put a yard unit on ${truckId} ahead of the rest; others give way.`} onClose={close} width={520}>
      <div className="space-y-3 p-5">
        <input autoFocus className={inputClass} placeholder="Search cargo ID, goods or destination…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="max-h-[300px] overflow-y-auto rounded-xl border border-line">
          {hits.length === 0 && <div className="px-3 py-4 text-[12px] text-muted">No yard unit matches.</div>}
          {hits.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => choose(c.id)}
              className={`flex w-full items-center gap-3 border-t border-line px-3 py-2 text-left first:border-t-0 ${picked === c.id ? 'bg-[#eef3ff]' : 'hover:bg-[#f7f9fc]'}`}
            >
              <span className="w-[96px] shrink-0 text-[12px] font-bold text-ink">{c.id}</span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[12px] text-ink">{c.description}</span>
                <span className="block truncate text-[11px] text-faint">
                  {c.destination} · {locationOf(c)}
                </span>
              </span>
              <span className="text-[11.5px] text-muted tabular-nums">{fmtKg(c.weightKg)}</span>
              {mine.has(c.id) && <span className="text-[10.5px] font-semibold text-brand">on plan</span>}
            </button>
          ))}
        </div>
        <Field label="Drops at">
          <select className={inputClass} value={stop} onChange={(e) => setStop(Number(e.target.value))}>
            {route.map((city, i) => (
              <option key={city} value={i + 1}>
                Stop {i + 1} · {city}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Cancel</Button>
          <Button tone="primary" disabled={!picked} onClick={add}>
            Add as urgent
          </Button>
        </div>
      </div>
    </Modal>
  );
}
