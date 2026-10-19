import { Box, FilePlus2, FileText, LogOut, Move, Pencil, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { devYard } from '../config/devYard';
import { useUi } from '../state/ui';
import { docsFor, useInventory } from '../world/inventory';
import { hasOnTop, locationOf, stackBase, stackOf } from '../world/placement';
import { fmtClock } from '../world/time';
import { hashString } from '../domain/seed';
import { releaseCargo, startMove } from './actions';
import { DOC_SHORT, docStatusTone, docTypeLabel } from './documents';
import { selectAndFocus } from './focus';
import { Button, Pill, Row } from './kit';
import { ActionBar, Header, Rows, Section, StatusLine } from './panel';

const cm = (m: number) => Math.round(m * 100);
const timeAgo = (ms: number) => {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} d ago`;
};

export function CargoDetail({ id }: { id: string }) {
  const cargo = useInventory((s) => s.cargo);
  const documents = useInventory((s) => s.documents);
  const events = useInventory((s) => s.events);
  const openDialog = useUi((s) => s.openDialog);
  const c = cargo.find((x) => x.id === id);
  const docs = useMemo(() => docsFor(documents, id), [documents, id]);
  const history = useMemo(() => events.filter((e) => e.cargoId === id).slice(-6).reverse(), [events, id]);
  if (!c) return null;

  const { base, level } = stackBase(cargo, c);
  const stack = stackOf(cargo, base.id);
  const above = hasOnTop(cargo, c.id);
  const area = devYard.storage.find((a) => a.id === c.areaId);
  const confirmed = docs.some((d) => d.status === 'confirmed');
  const departs = fmtClock(300 + (hashString(c.id) % 2400));

  return (
    <>
      <Header icon={<Box size={20} />} eyebrow={`Cargo · ${c.type.replace('_', ' ')}`} title={c.id} subtitle={c.description} entity={{ kind: 'cargo', id }} />
      <StatusLine
        tone={!docs.length ? 'red' : confirmed ? 'green' : 'amber'}
        label={!docs.length ? 'No paperwork' : confirmed ? 'Documented' : 'Draft docs'}
        detail={`${locationOf(c)}${stack.length > 1 ? ` · level ${level + 1} of ${stack.length}` : ''}`}
      />
      <ActionBar>
        <Button onClick={() => startMove(c.id)} disabled={above} title={above ? 'Move the unit on top first' : 'Pick a new spot on the map (M)'}>
          <Move size={14} /> Move
        </Button>
        <Button onClick={() => openDialog({ kind: 'cargo', cargoId: c.id })}>
          <Pencil size={14} /> Edit
        </Button>
        <Button
          tone="ghost"
          disabled={above}
          title="The unit left the yard (loaded / collected)"
          onClick={() => {
            if (window.confirm(`Release ${c.id} from the yard? Its documents stay on record.`)) releaseCargo(c.id);
          }}
        >
          <LogOut size={14} /> Release
        </Button>
      </ActionBar>

      <Section
        title="Source documents"
        aside={
          <button type="button" onClick={() => openDialog({ kind: 'document', cargoId: c.id })} className="flex items-center gap-1 text-[11.5px] font-semibold text-brand">
            <FilePlus2 size={13} /> Add
          </button>
        }
      >
        {docs.length === 0 && (
          <button
            type="button"
            onClick={() => openDialog({ kind: 'document', cargoId: c.id })}
            className="flex w-full items-start gap-2.5 rounded-xl bg-[#fdf3f3] px-3 py-2.5 text-left hover:bg-[#fbe9e9]"
          >
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-[#d64545]" />
            <span className="leading-snug">
              <span className="block text-[12px] font-semibold text-ink">No bill or delivery note yet</span>
              <span className="block text-[11.5px] text-muted">Add the document number and details from the paper.</span>
            </span>
          </button>
        )}
        {docs.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => openDialog({ kind: 'document', cargoId: c.id, docId: d.id })}
            className="flex w-full items-center gap-2.5 border-t border-line py-2 text-left first:border-t-0 hover:bg-[#f7f9fc]"
            title={docTypeLabel(d.type)}
          >
            <span className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8eefe] text-[10px] font-bold text-brand">{DOC_SHORT[d.type]}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[12.5px] font-semibold text-ink">{d.number}</span>
              <span className="block truncate text-[11px] text-muted">
                {d.shipper || '—'} → {d.consignee || '—'}
              </span>
            </span>
            <span className="flex flex-col items-end gap-0.5">
              <Pill tone={docStatusTone(d)}>{d.status === 'confirmed' ? 'Confirmed' : 'Draft'}</Pill>
              <span className="flex items-center gap-1 text-[10.5px] text-faint">
                {d.photo && <FileText size={11} />}
                {d.issuedOn}
              </span>
            </span>
          </button>
        ))}
      </Section>

      <Rows>
        <Row label="Destination">{c.destination}</Row>
        <Row label="Weight">{c.weightKg.toLocaleString('en-US')} kg</Row>
        <Row label="Dimensions">
          {cm(c.dims.l)} × {cm(c.dims.w)} × {cm(c.dims.h)} cm
        </Row>
        <Row label="Area">{area ? `${area.name} · ${area.covered ? 'covered' : 'open'}` : 'Outside storage areas'}</Row>
        <Row label="Stack">
          {stack.length > 1 ? (
            <span className="flex gap-1">
              {stack.map((u) => (
                <button key={u.id} type="button" onClick={() => selectAndFocus({ kind: 'cargo', id: u.id })} className={u.id === c.id ? 'text-ink' : 'text-brand'}>
                  {u.id.replace('CARGO-', '#')}
                </button>
              ))}
            </span>
          ) : (
            'Single unit'
          )}
        </Row>
        <Row label="Expected departure">Today {departs}</Row>
      </Rows>

      <Section title="History">
        {history.length === 0 ? (
          <div className="pb-3 text-[11.5px] text-muted">{c.source === 'manual' ? 'Registered by hand.' : 'In the yard since before this shift.'}</div>
        ) : (
          <div className="pb-3">
            {history.map((e) => (
              <div key={e.id} className="flex gap-2.5 border-t border-line py-1.5 text-[11.5px] first:border-t-0">
                <span className="w-10 shrink-0 font-semibold text-ink tabular-nums">{e.yardTime}</span>
                <span className="min-w-0 flex-1 text-muted">{e.text}</span>
                <span className="shrink-0 text-faint">{timeAgo(e.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
