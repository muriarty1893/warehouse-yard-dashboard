import { Ban, Flame, Search, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { planOf, planSource, useLoading, usePlanCargo } from '../../loading/store';
import { useUi } from '../../state/ui';
import { Card, Pill, Segmented, type Tone } from '../kit';
import { fmtKg, stopColor } from './format';
import { filterRows, planRows, type PlanRow, type RowFilter, type RowStatus } from './notes';

const STATUS: Record<RowStatus, { tone: Tone; label: (r: PlanRow) => string }> = {
  planned: { tone: 'blue', label: () => 'Planned' },
  loaded: { tone: 'green', label: () => 'Loaded' },
  overflow: { tone: 'amber', label: (r) => `Overflow → ${r.to}` },
  left: { tone: 'gray', label: () => 'Left out' },
  excluded: { tone: 'gray', label: () => 'Excluded' },
};

/** Every route unit of the plan with its status (spec §2.1); rows and the 3D view select each other. */
export function PlannerTable({ truckId }: { truckId: string }) {
  const t = useLoading((s) => s.trucks[truckId]);
  const plan = useLoading((s) => planOf(s, truckId));
  const cargo = usePlanCargo();
  const selected = useUi((s) => (s.selected?.kind === 'cargo' ? s.selected.id : null));
  const [filter, setFilter] = useState<RowFilter>('all');
  const [query, setQuery] = useState('');
  const rows = useMemo(() => (t && plan ? planRows(t, plan, cargo) : []), [t, plan, cargo]);
  const shown = useMemo(() => filterRows(rows, filter, query), [rows, filter, query]);
  const draft = t?.status === 'draft';

  useEffect(() => {
    if (selected) document.getElementById(`plan-row-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const count = (f: RowFilter) => filterRows(rows, f, '').length;
  const { toggleExclude, addUrgent, clearUrgent } = useLoading.getState();
  return (
    <Card className="flex min-h-0 flex-1 flex-col p-3">
      <div className="mb-2 flex items-center gap-3">
        <div className="w-[420px]">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All ${count('all')}` },
              { value: 'truck', label: `On this truck ${count('truck')}` },
              { value: 'overflow', label: `Overflow ${count('overflow')}` },
              { value: 'fragile', label: `Fragile ${count('fragile')}` },
            ]}
          />
        </div>
        <label className="ml-auto flex h-8 w-[240px] items-center gap-2 rounded-lg border border-line px-2.5 text-faint focus-within:border-brand/50">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search shipments…" className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint" />
        </label>
      </div>
      <div className="grid grid-cols-[1.6fr_100px_1.3fr_120px_76px_44px_1.2fr_56px] gap-2 border-b border-line px-2 pb-1.5 text-[11px] font-medium text-faint">
        <span>Item</span>
        <span>Cargo ID</span>
        <span>Yard location</span>
        <span>Size</span>
        <span className="text-right">Weight</span>
        <span>Stop</span>
        <span>Status</span>
        <span />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 && <div className="px-2 py-4 text-[12px] text-muted">{rows.length ? 'Nothing matches.' : 'No cargo for this route.'}</div>}
        {shown.map((r) => {
          const st = STATUS[r.status];
          return (
            <div
              key={r.id}
              id={`plan-row-${r.id}`}
              role="button"
              tabIndex={0}
              onClick={() => useUi.getState().select({ kind: 'cargo', id: r.id })}
              onKeyDown={(e) => e.key === 'Enter' && useUi.getState().select({ kind: 'cargo', id: r.id })}
              onMouseEnter={() => useUi.getState().hover({ kind: 'cargo', id: r.id })}
              onMouseLeave={() => useUi.getState().unhover({ kind: 'cargo', id: r.id })}
              className={`group grid cursor-pointer grid-cols-[1.6fr_100px_1.3fr_120px_76px_44px_1.2fr_56px] items-center gap-2 border-b border-line px-2 py-1.5 text-[12.5px] last:border-b-0 ${selected === r.id ? 'bg-[#eef3ff]' : 'hover:bg-[#f7f9fc]'}`}
            >
              <span className="truncate text-ink">
                {r.description}
                {r.fragile && <span className="ml-1.5 text-[10.5px] font-semibold text-[#c4640a]">FRAGILE</span>}
                {planSource().papersMissing(r.id) && <span className="ml-1.5 text-[10.5px] font-semibold text-[#d02a25]">PAPERS MISSING</span>}
              </span>
              <span className="truncate font-mono text-[11.5px] text-muted">{r.id}</span>
              <span className="truncate text-muted">{r.location}</span>
              <span className="truncate text-muted tabular-nums">{r.dims}</span>
              <span className="text-right text-ink tabular-nums">{fmtKg(r.weightKg)}</span>
              <span>
                {r.stop && (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold text-white" style={{ background: stopColor(r.stop) }}>
                    {r.stop}
                  </span>
                )}
              </span>
              <span className="flex min-w-0 items-center gap-1" title={r.reason ?? undefined}>
                <Pill tone={st.tone} className="truncate">
                  {st.label(r)}
                </Pill>
                {r.urgent && <Pill tone="red">Urgent</Pill>}
              </span>
              <span className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100">
                {draft && r.status !== 'loaded' && (
                  <>
                    <button
                      type="button"
                      title={r.urgent ? 'Not urgent' : 'Urgent: load it first'}
                      aria-label={r.urgent ? `${r.id} not urgent` : `Make ${r.id} urgent`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (r.urgent) clearUrgent(truckId, r.id);
                        else addUrgent(truckId, r.id, r.stop ?? 1);
                      }}
                      className={`rounded p-1 hover:bg-[#fdecec] ${r.urgent ? 'text-[#d64545]' : 'text-muted'}`}
                    >
                      <Flame size={13} />
                    </button>
                    <button
                      type="button"
                      title={r.status === 'excluded' ? 'Plan it again' : 'Keep it off this truck'}
                      aria-label={r.status === 'excluded' ? `Include ${r.id}` : `Exclude ${r.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExclude(truckId, r.id);
                      }}
                      className="rounded p-1 text-muted hover:bg-[#eef1f6] hover:text-ink"
                    >
                      {r.status === 'excluded' ? <Undo2 size={13} /> : <Ban size={13} />}
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
