import { CalendarDays, Forklift, HardHat, Pause, Play, RotateCcw, Truck, Warehouse } from 'lucide-react';
import { devYard } from '../config/devYard';
import { polygonBounds } from '../domain/geometry';
import { yardBounds } from '../domain/yard';
import { useLayers } from '../state/layers';
import { useUi } from '../state/ui';
import { FILL_LEVELS, type FillLevel } from '../world/demo';
import { useInventory } from '../world/inventory';
import { yard } from '../world/snapshot';
import { useWorld } from '../world/store';
import { fmtDuration } from '../world/time';
import { toggleHold } from './actions';
import { CargoDetail } from './CargoDetail';
import { focusPoint, selectAndFocus } from './focus';
import { Bar, Button, Card, Pill, Row, Segmented } from './kit';
import { ActionBar, Header, Link, Meter, Rows, Section, StatusLine, Tile } from './panel';
import { FORKLIFT_STATUS, TRUCK_STATUS, batteryTone } from './status';

/** Hold / resume a scripted vehicle (stops it where it is). */
function HoldButton({ id, held }: { id: string; held: boolean }) {
  return (
    <ActionBar>
      <Button tone={held ? 'primary' : 'secondary'} onClick={() => toggleHold(id)} title={held ? 'Let it carry on (G)' : 'Stop it where it is (G)'}>
        {held ? <Play size={14} /> : <Pause size={14} />} {held ? 'Resume' : 'Hold here'}
      </Button>
    </ActionBar>
  );
}

function TruckDetail({ id }: { id: string }) {
  const t = useWorld((s) => s.trucks.find((x) => x.id === id));
  if (!t) return null;
  const st = TRUCK_STATUS[t.status];
  const sh = t.shipment;
  const eta =
    t.etaSec === null
      ? '—'
      : t.status === 'en-route' || t.status === 'scheduled'
        ? `Arrives in ${fmtDuration(t.etaSec)}`
        : t.status === 'docking'
          ? `At bay in ${fmtDuration(t.etaSec)}`
          : `Done in ${fmtDuration(t.etaSec)}`;
  return (
    <>
      <Header icon={<Truck size={20} />} eyebrow={`${t.carrier} freight`} title={t.id} subtitle={`${t.driver} · ${t.plate}`} entity={{ kind: 'truck', id }} />
      <StatusLine tone={t.held ? 'red' : st.tone} label={t.held ? 'On hold' : st.label} detail={t.detail} />
      {t.scripted && t.onSite && <HoldButton id={t.id} held={t.held} />}
      {t.progress && <Meter value={t.progress.done / t.progress.total} tone="green" right={`${t.progress.done}/${t.progress.total}`} />}
      <Rows>
        <Row label="Shipment">
          <Link>{sh.id}</Link>
        </Row>
        <Row label="Customer">{sh.customer}</Row>
        <Row label={sh.direction === 'inbound' ? 'Origin' : 'Destination'}>{sh.place}</Row>
        <Row label="ETA">{eta}</Row>
        <Row label="Speed">{Math.round(t.speedKmh)} km/h</Row>
        <Row label="Bay">{t.bayId ? <Link>{t.bayId}</Link> : '—'}</Row>
        <Row label="Location">{t.where}</Row>
        <Row label="Cargo">
          {t.progress ? `${t.progress.done}/${sh.pallets}` : sh.pallets} pallets · {sh.weightT} t
        </Row>
      </Rows>
    </>
  );
}

function ForkliftDetail({ id }: { id: string }) {
  const f = useWorld((s) => s.forklifts.find((x) => x.id === id));
  if (!f) return null;
  const st = FORKLIFT_STATUS[f.status];
  return (
    <>
      <Header icon={<Forklift size={20} />} eyebrow="Forklift · YD-01" title={f.id} subtitle={`${f.operator} · ${f.model}`} entity={{ kind: 'forklift', id }} />
      <StatusLine tone={f.held ? 'red' : st.tone} label={f.held ? 'On hold' : st.label} detail={f.detail} />
      {f.scripted && <HoldButton id={f.id} held={f.held} />}
      <Meter value={f.battery / 100} tone={batteryTone(f.battery)} left="Battery" right={`${Math.round(f.battery)}%`} />
      <Rows>
        <Row label="Carrying">
          {f.carrying ? (
            <button type="button" className="text-brand" onClick={() => selectAndFocus({ kind: 'cargo', id: f.carrying! })}>
              {f.carrying}
            </button>
          ) : (
            'Empty'
          )}
        </Row>
        <Row label="Moves today">{f.movesToday}</Row>
        <Row label="Speed">{f.speedKmh.toFixed(1)} km/h</Row>
        <Row label="Charger">
          <Link>{f.charger}</Link>
        </Row>
        <Row label="Location">{f.where}</Row>
        <Row label="Yard">{yard.name}</Row>
      </Rows>
    </>
  );
}

function WorkerDetail({ id }: { id: string }) {
  const w = useWorld((s) => s.workers.find((x) => x.id === id));
  if (!w) return null;
  return (
    <>
      <Header icon={<HardHat size={20} />} eyebrow="Worker · YD-01" title={w.name} subtitle={`${w.id} · ${w.role}`} entity={{ kind: 'worker', id }} />
      <StatusLine tone={w.moving ? 'blue' : 'gray'} label={w.moving ? 'Walking' : 'On station'} detail={w.where} />
      <Rows>
        <Row label="Location">{w.where}</Row>
        <Row label="Shift">06:00 – 14:00</Row>
        <Row label="Radio">Channel 2</Row>
        <Row label="Yard">{yard.name}</Row>
      </Rows>
    </>
  );
}

const bounds = yardBounds(yard);

function Workload() {
  const day = useInventory((s) => s.day);
  const fill = useInventory((s) => s.fill);
  const newDay = useInventory((s) => s.newDay);
  const reset = useInventory((s) => s.reset);
  const notify = useUi((s) => s.notify);
  return (
    <Section title={`Workload · day ${day}`} aside={<span className="text-[11px] text-muted">demo cargo</span>}>
      <Segmented
        value={fill}
        onChange={(v: FillLevel) => {
          newDay(v);
          notify(`${FILL_LEVELS[v].label} day · storage refilled`);
        }}
        options={(Object.keys(FILL_LEVELS) as FillLevel[]).map((k) => ({ value: k, label: FILL_LEVELS[k].label }))}
      />
      <div className="mt-2 flex gap-1.5">
        <Button
          className="flex-1"
          onClick={() => {
            newDay();
            notify('Next day · cargo rearranged');
          }}
          title="A new day: demo cargo in different places. Your own entries stay."
        >
          <CalendarDays size={14} /> Next day
        </Button>
        <Button
          tone="ghost"
          onClick={() => {
            if (window.confirm('Reset all cargo and documents to the demo data? Your own entries will be lost.')) {
              reset();
              notify('Demo data restored');
            }
          }}
          title="Back to the original demo data"
        >
          <RotateCcw size={14} /> Reset
        </Button>
      </div>
    </Section>
  );
}

function YardOverview() {
  const k = useWorld((s) => s.kpis);
  const areas = useWorld((s) => s.areas);
  const forklifts = useWorld((s) => s.forklifts);
  const setLayers = useLayers((s) => s.set);
  const working = forklifts.filter((f) => f.status !== 'charging' && f.status !== 'idle');
  const units = useInventory((s) => s.cargo.length);
  const documented = units - k.docsMissing - k.docsDraft;
  return (
    <>
      <Header icon={<Warehouse size={20} />} eyebrow={`Logistics yard · ${yard.id}`} title={yard.name} subtitle={`${Math.round(bounds.w)} × ${Math.round(bounds.h)} m · walled · ${areas.length} storage spaces`} />
      <StatusLine tone="green" label="Operational" detail={`${k.docksBusy} at loading · ${k.inbound} arriving · ${k.departuresToday} departed`} />
      <div className="grid grid-cols-2 gap-2 px-4 pt-3">
        <Tile label="Cargo units" value={String(units)} of="in the yard" />
        <Tile label="Storage used" value={`${Math.round(k.storagePct)}%`} of={`${k.spotsUsed}/${k.spotsTotal} spots`} bar={k.storagePct / 100} tone={k.storagePct > 85 ? 'amber' : 'blue'} />
        <Tile label="Paperwork done" value={`${units ? Math.round((documented / units) * 100) : 100}%`} of={`${k.docsMissing} missing`} bar={units ? documented / units : 1} tone={k.docsMissing ? 'amber' : 'green'} />
        <Tile label="Loading spaces" value={`${k.docksBusy}`} of={`/ ${k.docksTotal} busy`} bar={k.docksTotal ? k.docksBusy / k.docksTotal : 0} tone="green" />
      </div>
      <Section title="Storage spaces" aside={<span className="text-[11px] text-muted">spots used</span>}>
        {areas.map((a) => {
          const pct = Math.min(1, a.used / a.capacity);
          const def = devYard.storage.find((s) => s.id === a.id)!;
          const b = polygonBounds(def.parts);
          return (
            <button
              type="button"
              key={a.id}
              onClick={() => {
                setLayers({ overlay: 'areas' });
                focusPoint(b.x + b.w / 2, b.y + b.h / 2, Math.max(28, Math.max(b.w, b.h) * 1.5));
              }}
              className="flex w-full items-center gap-2.5 border-t border-line py-[7px] text-left text-[12.5px] first:border-t-0 hover:bg-[#f7f9fc]"
            >
              <span className="h-6 w-6 shrink-0 rounded-md" style={{ background: '#f5d00033', boxShadow: `inset 0 0 0 1.5px ${a.color}` }} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate font-semibold text-ink">{a.name}</span>
                <span className="block text-[11px] text-muted">
                  {a.kind} · {a.units} units
                </span>
              </span>
              <span className="w-9 text-right font-semibold text-ink tabular-nums">{Math.round(pct * 100)}%</span>
              <Pill tone={pct > 0.85 ? 'amber' : 'green'}>{pct > 0.85 ? 'Tight' : 'Room'}</Pill>
            </button>
          );
        })}
      </Section>
      <Workload />
      <div className="px-4 pt-3 pb-4">
        <div className="mb-1 flex items-center justify-between text-[12px]">
          <span className="font-semibold text-ink">Forklift fleet</span>
          <span className="text-muted">
            {working.length}/{forklifts.length} working
          </span>
        </div>
        {working.map((f) => (
          <button
            type="button"
            key={f.id}
            onClick={() => selectAndFocus({ kind: 'forklift', id: f.id })}
            className="flex w-full items-center gap-2.5 border-t border-line py-[7px] text-left text-[12px] first:border-t-0"
          >
            <span className="font-semibold text-ink">{f.id}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{f.detail}</span>
            <Bar value={f.battery / 100} tone={batteryTone(f.battery)} className="w-12" />
            <span className="w-8 text-right font-semibold text-muted tabular-nums">{Math.round(f.battery)}%</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function DetailPanel() {
  const selected = useUi((s) => s.selected);
  return (
    <Card className="w-[330px] overflow-y-auto">
      {!selected && <YardOverview />}
      {selected?.kind === 'truck' && <TruckDetail id={selected.id} />}
      {selected?.kind === 'forklift' && <ForkliftDetail id={selected.id} />}
      {selected?.kind === 'cargo' && <CargoDetail id={selected.id} />}
      {selected?.kind === 'worker' && <WorkerDetail id={selected.id} />}
    </Card>
  );
}
