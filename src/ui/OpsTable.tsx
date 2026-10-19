import { ChevronRight, Download, FilePlus2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useUi } from '../state/ui';
import { useInventory } from '../world/inventory';
import { locationOf } from '../world/placement';
import { yard } from '../world/snapshot';
import { DOC_SHORT, docStatusTone, documentsCsv, download } from './documents';
import { fmtDuration } from '../world/time';
import { useWorld } from '../world/store';
import { focusPoint, selectAndFocus } from './focus';
import { Bar, Card, Pill } from './kit';
import { BAY_STATUS, CARRIER_COLORS, FORKLIFT_STATUS, TRUCK_STATUS, batteryTone } from './status';

type Tab = 'docks' | 'forklifts' | 'trucks' | 'cargo' | 'docs';

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
  const docks = bays.filter((b) => b.kind === 'loading' || b.kind === 'dock');
  const cargo = useInventory((s) => s.cargo);
  const documents = useInventory((s) => s.documents);
  const openDialog = useUi((s) => s.openDialog);
  const [missingOnly, setMissingOnly] = useState(false);
  const docByCargo = useMemo(() => {
    const m = new Map<string, typeof documents>();
    for (const d of documents) m.set(d.cargoId, [...(m.get(d.cargoId) ?? []), d]);
    return m;
  }, [documents]);
  const cargoRows = useMemo(
    () => cargo.filter((c) => !missingOnly || !docByCargo.get(c.id)?.some((d) => d.status === 'confirmed')).sort((a, b) => a.id.localeCompare(b.id)),
    [cargo, docByCargo, missingOnly],
  );
  const docRows = useMemo(() => [...documents].sort((a, b) => b.updatedAt - a.updatedAt), [documents]);
  const tabs: { id: Tab; label: string; count: string }[] = [
    { id: 'docks', label: 'Bays', count: `${k.docksBusy}/${k.docksTotal}` },
    { id: 'forklifts', label: 'Forklifts', count: `${k.forkliftsWorking}/${k.forkliftsTotal}` },
    { id: 'trucks', label: 'Trucks', count: String(trucks.length) },
    { id: 'cargo', label: 'Cargo', count: String(cargo.length) },
    { id: 'docs', label: 'Docs', count: String(documents.length) },
  ];
  return (
    <Card className="w-[480px] p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex gap-0.5 rounded-xl bg-[#f0f3f8] p-0.5">
          {tabs.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-[10px] px-1.5 py-1 text-[12px] font-semibold whitespace-nowrap ${tab === t.id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {t.label} <span className="text-faint">{t.count}</span>
            </button>
          ))}
        </div>
        {tab === 'cargo' ? (
          <button type="button" onClick={() => setMissingOnly((v) => !v)} className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${missingOnly ? 'bg-[#fdecec] text-[#d64545]' : 'text-muted hover:bg-[#f0f3f8]'}`}>
            {missingOnly ? 'Missing paperwork' : 'All units'}
          </button>
        ) : tab === 'docs' ? (
          <span className="flex">
            <button type="button" title="Export documents as CSV" onClick={() => download('docktor-documents.csv', documentsCsv(documents), 'text/csv')} className="flex items-center gap-0.5 rounded-lg px-1 py-1 text-[10.5px] font-semibold text-brand hover:bg-[#eef3ff]">
              <Download size={12} /> CSV
            </button>
            <button
              type="button"
              title="Export cargo + documents as JSON"
              onClick={() => download('docktor-inventory.json', JSON.stringify({ cargo, documents: documents.map(({ photo, ...d }) => ({ ...d, hasPhoto: !!photo })) }, null, 2), 'application/json')}
              className="flex items-center gap-0.5 rounded-lg px-1 py-1 text-[10.5px] font-semibold text-brand hover:bg-[#eef3ff]"
            >
              <Download size={12} /> JSON
            </button>
          </span>
        ) : (
          <span className="text-[11.5px] font-medium text-muted">{yard.name}</span>
        )}
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
        {tab === 'cargo' &&
          cargoRows.map((c) => {
            const docs = docByCargo.get(c.id) ?? [];
            const ok = docs.some((d) => d.status === 'confirmed');
            return (
              <TableRow
                key={c.id}
                head={c.id.replace('CARGO-', '#')}
                sub={c.destination}
                middle={
                  <span className="block leading-tight">
                    <span className="block truncate">{c.description}</span>
                    <span className="block truncate text-[10.5px] text-faint">{locationOf(c)}</span>
                  </span>
                }
                status={<Pill tone={!docs.length ? 'red' : ok ? 'green' : 'amber'}>{!docs.length ? 'No doc' : ok ? DOC_SHORT[docs[0].type] : 'Draft'}</Pill>}
                right={
                  !docs.length ? (
                    <span
                      role="button"
                      tabIndex={0}
                      title="Add the source document"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDialog({ kind: 'document', cargoId: c.id });
                      }}
                      className="flex items-center gap-1 font-semibold text-brand"
                    >
                      <FilePlus2 size={12} /> Add
                    </span>
                  ) : (
                    `${c.weightKg} kg`
                  )
                }
                onClick={() => selectAndFocus({ kind: 'cargo', id: c.id })}
              />
            );
          })}
        {tab === 'docs' &&
          docRows.map((d) => {
            const inYard = cargo.some((c) => c.id === d.cargoId);
            return (
              <TableRow
                key={d.id}
                head={DOC_SHORT[d.type]}
                sub={d.issuedOn.slice(5)}
                middle={
                  <span className="block leading-tight">
                    <span className="block truncate font-semibold">{d.number}</span>
                    <span className="block truncate text-[10.5px] text-faint">
                      {d.cargoId} · {d.shipper || '—'}
                    </span>
                  </span>
                }
                status={<Pill tone={inYard ? docStatusTone(d) : 'gray'}>{!inYard ? 'Released' : d.status === 'confirmed' ? 'Confirmed' : 'Draft'}</Pill>}
                right={d.source === 'manual' ? 'by hand' : ''}
                onClick={() => (inYard ? selectAndFocus({ kind: 'cargo', id: d.cargoId }) : openDialog({ kind: 'document', cargoId: d.cargoId, docId: d.id }))}
              />
            );
          })}
      </div>
    </Card>
  );
}
