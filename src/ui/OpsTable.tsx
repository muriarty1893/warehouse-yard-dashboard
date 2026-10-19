import { ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { yard } from '../world/snapshot';
import { fmtDuration } from '../world/time';
import { useWorld } from '../world/store';
import { focusPoint, selectAndFocus } from './focus';
import { Bar, Card, Pill } from './kit';
import { BAY_STATUS, CARRIER_COLORS, FORKLIFT_STATUS, TRUCK_STATUS, batteryTone } from './status';

type Tab = 'docks' | 'forklifts' | 'trucks';

function TableRow({ head, sub, middle, status, right, onClick }: { head: string; sub: string; middle: ReactNode; status: ReactNode; right: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="grid w-full grid-cols-[68px_1fr_auto_62px_14px] items-center gap-2.5 border-t border-line py-2 text-left first:border-t-0 hover:bg-[#f7f9fc]">
      <span className="leading-tight">
        <span className="block text-[12.5px] font-bold text-ink">{head}</span>
        <span className="block truncate text-[10.5px] text-faint">{sub}</span>
      </span>
      <span className="min-w-0 truncate text-[12px] text-ink">{middle}</span>
      <span>{status}</span>
      <span className="text-[11px] text-muted tabular-nums">{right}</span>
      <ChevronRight size={14} className="text-faint" />
    </button>
  );
}

const Dot = ({ carrier }: { carrier: string | null }) => (
  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: carrier ? (CARRIER_COLORS[carrier] ?? '#8a94ad') : '#c9d0de' }} />
);

const Progress = ({ done, total }: { done: number; total: number }) => (
  <span className="flex items-center gap-1.5">
    <Bar value={done / total} className="w-8" />
    {done}/{total}
  </span>
);

export function OpsTable() {
  const [tab, setTab] = useState<Tab>('docks');
  const bays = useWorld((s) => s.bays);
  const forklifts = useWorld((s) => s.forklifts);
  const trucks = useWorld((s) => s.trucks);
  const k = useWorld((s) => s.kpis);
  const docks = bays.filter((b) => b.kind !== 'staging');
  const tabs: { id: Tab; label: string; count: string }[] = [
    { id: 'docks', label: 'Docks', count: `${k.docksBusy + k.baysBusy}/${k.docksTotal + k.baysTotal}` },
    { id: 'forklifts', label: 'Forklifts', count: `${k.forkliftsWorking}/${k.forkliftsTotal}` },
    { id: 'trucks', label: 'Trucks', count: String(trucks.length) },
  ];
  return (
    <Card className="w-[430px] p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex gap-0.5 rounded-xl bg-[#f0f3f8] p-0.5">
          {tabs.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-[10px] px-2.5 py-1 text-[12px] font-semibold ${tab === t.id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {t.label} <span className="text-faint">{t.count}</span>
            </button>
          ))}
        </div>
        <span className="text-[11.5px] font-medium text-muted">{yard.name.replace('Docktor ', '')}</span>
      </div>
      <div className="max-h-[172px] overflow-y-auto pr-1">
        {tab === 'docks' &&
          docks.map((b) => {
            const st = BAY_STATUS[b.status];
            return (
              <TableRow
                key={b.id}
                head={b.id}
                sub={b.kind === 'dock' ? 'Dock door' : 'Loading bay'}
                middle={
                  b.truckId ? (
                    <>
                      <Dot carrier={b.carrier} />
                      {b.truckId} · {b.carrier}
                    </>
                  ) : (
                    <span className="text-muted">No truck assigned</span>
                  )
                }
                status={<Pill tone={st.tone}>{st.label}</Pill>}
                right={b.progress ? <Progress {...b.progress} /> : ''}
                onClick={() => (b.truckId ? selectAndFocus({ kind: 'truck', id: b.truckId }) : focusPoint(b.x, b.y, 36))}
              />
            );
          })}
        {tab === 'forklifts' &&
          forklifts.map((f) => {
            const st = FORKLIFT_STATUS[f.status];
            return (
              <TableRow
                key={f.id}
                head={f.id}
                sub={f.where}
                middle={f.detail}
                status={<Pill tone={st.tone}>{st.label}</Pill>}
                right={
                  <span className="flex items-center gap-1.5">
                    <Bar value={f.battery / 100} tone={batteryTone(f.battery)} className="w-8" />
                    {Math.round(f.battery)}%
                  </span>
                }
                onClick={() => selectAndFocus({ kind: 'forklift', id: f.id })}
              />
            );
          })}
        {tab === 'trucks' &&
          trucks.map((t) => {
            const st = TRUCK_STATUS[t.status];
            return (
              <TableRow
                key={t.id}
                head={t.id}
                sub={t.carrier}
                middle={
                  <>
                    <Dot carrier={t.carrier} />
                    {t.bayId && t.onSite ? `YD-01 · ${t.bayId}` : t.where}
                  </>
                }
                status={<Pill tone={st.tone}>{st.label}</Pill>}
                right={t.progress ? <Progress {...t.progress} /> : t.etaSec !== null ? fmtDuration(t.etaSec) : ''}
                onClick={() => selectAndFocus({ kind: 'truck', id: t.id })}
              />
            );
          })}
      </div>
    </Card>
  );
}
