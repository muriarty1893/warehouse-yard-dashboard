import { ArrowUpRight, Box, Crosshair, Forklift, HardHat, Truck, Warehouse, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { hashString } from '../domain/seed';
import { useUi, type EntityRef } from '../state/ui';
import { useView } from '../state/view';
import { fmtClock, fmtDuration } from '../world/time';
import { yardBounds } from '../domain/yard';
import { cargo as allCargo, yard } from '../world/snapshot';
import { useWorld } from '../world/store';
import { focusEntity, selectAndFocus } from './focus';
import { Bar, Card, IconButton, IconTile, Pill, Row, type Tone } from './kit';
import { FORKLIFT_STATUS, TRUCK_STATUS, batteryTone } from './status';

function Header({ icon, eyebrow, title, subtitle, entity }: { icon: ReactNode; eyebrow: string; title: string; subtitle: string; entity?: EntityRef }) {
  const select = useUi((s) => s.select);
  const follow = useView((s) => s.follow);
  const setFollow = useView((s) => s.setFollow);
  const send = useView((s) => s.send);
  const following = !!entity && follow?.kind === entity.kind && follow.id === entity.id;
  const movable = entity && entity.kind !== 'cargo';
  return (
    <div className="flex items-start gap-3 px-4 pt-4 pb-3">
      <IconTile tone="soft" size="lg">
        {icon}
      </IconTile>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[10.5px] font-bold tracking-[0.08em] text-brand uppercase">{eyebrow}</div>
        <div className="mt-0.5 truncate text-[17px] font-bold text-ink">{title}</div>
        <div className="mt-0.5 text-[12px] leading-snug text-muted">{subtitle}</div>
      </div>
      <div className="-mr-1.5 flex shrink-0">
        <IconButton title={entity ? 'Locate (F)' : 'Home view (H)'} onClick={() => (entity ? focusEntity(entity) : send({ kind: 'home' }))}>
          <Crosshair size={16} />
        </IconButton>
        {movable && (
          <IconButton
            title={following ? 'Stop following' : 'Follow with camera'}
            active={following}
            onClick={() => {
              if (following) setFollow(null);
              else {
                focusEntity(entity);
                setFollow(entity);
              }
            }}
          >
            <ArrowUpRight size={16} />
          </IconButton>
        )}
        {entity && (
          <IconButton
            title="Close (Esc)"
            onClick={() => {
              select(null);
              setFollow(null);
            }}
          >
            <X size={16} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function StatusLine({ tone, label, detail }: { tone: Tone; label: string; detail: string }) {
  return (
    <div className="mx-4 flex items-center gap-2 rounded-xl bg-[#f5f7fb] px-2 py-1.5">
      <Pill tone={tone}>{label}</Pill>
      <span className="truncate text-[11.5px] text-muted">{detail}</span>
    </div>
  );
}

function Meter({ value, tone, left, right }: { value: number; tone: Tone; left?: string; right: string }) {
  return (
    <div className="mx-4 mt-2.5 flex items-center gap-3">
      {left && <span className="text-[11.5px] text-muted">{left}</span>}
      <Bar value={value} tone={tone} className="flex-1" />
      <span className="text-[11.5px] font-semibold text-muted tabular-nums">{right}</span>
    </div>
  );
}

const Rows = ({ children }: { children: ReactNode }) => <div className="px-4 pt-2 pb-3">{children}</div>;
const Link = ({ children }: { children: ReactNode }) => <span className="text-brand">{children}</span>;

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
      <StatusLine tone={st.tone} label={st.label} detail={t.detail} />
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
      <StatusLine tone={st.tone} label={st.label} detail={f.detail} />
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

function CargoDetail({ id }: { id: string }) {
  const c = allCargo.find((x) => x.id === id);
  if (!c) return null;
  const zone = yard.zones.find((z) => z.id === c.positionId.replace(/\d+$/, ''));
  const h = hashString(c.id);
  const departs = fmtClock(300 + (h % 2400));
  const cm = (m: number) => Math.round(m * 100);
  return (
    <>
      <Header icon={<Box size={20} />} eyebrow={`Cargo · ${c.type.replace('_', ' ')}`} title={c.id} subtitle={c.description} entity={{ kind: 'cargo', id }} />
      <StatusLine tone="green" label="Stored" detail={`${c.positionId} · stack level ${c.stackLevel}`} />
      <Rows>
        <Row label="Destination">{c.destination}</Row>
        <Row label="Weight">{c.weightKg.toLocaleString('en-US')} kg</Row>
        <Row label="Dimensions">
          {cm(c.dims.l)} × {cm(c.dims.w)} × {cm(c.dims.h)} cm
        </Row>
        <Row label="Zone">{zone?.name ?? '—'}</Row>
        <Row label="Expected departure">Today {departs}</Row>
      </Rows>
      <div className="mx-4 mb-4 rounded-xl border border-line p-2.5">
        <div className="mb-1.5 text-[10.5px] font-bold tracking-[0.08em] text-faint uppercase">Placement</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {(['Recommended', 'Assigned', 'Actual'] as const).map((label) => (
            <div key={label}>
              <div className="text-[10.5px] text-muted">{label}</div>
              <div className="text-[13px] font-bold text-ink">{c.positionId}</div>
            </div>
          ))}
        </div>
      </div>
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

function Tile({ label, value, of, bar, tone = 'blue' }: { label: string; value: string; of?: string; bar?: number; tone?: Tone }) {
  return (
    <div className="rounded-xl bg-[#f5f7fb] p-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold text-ink tabular-nums">
        {value}
        {of && <span className="text-[11.5px] font-medium text-muted"> {of}</span>}
      </div>
      {bar !== undefined && <Bar value={bar} tone={tone} className="mt-1.5" />}
    </div>
  );
}

const bounds = yardBounds(yard);

function YardOverview() {
  const k = useWorld((s) => s.kpis);
  const zones = useWorld((s) => s.zones);
  const forklifts = useWorld((s) => s.forklifts);
  const capacity = zones.reduce((s, z) => s + z.total * 2, 0);
  const working = forklifts.filter((f) => f.status !== 'charging' && f.status !== 'idle');
  return (
    <>
      <Header icon={<Warehouse size={20} />} eyebrow={`Logistics yard · ${yard.id}`} title={yard.name} subtitle={`${Math.round(bounds.w)} × ${Math.round(bounds.h)} m · ${zones.length} storage zones`} />
      <StatusLine tone="green" label="Operational" detail={`${k.docksBusy} at loading · ${k.inbound} arriving · ${k.departuresToday} departed`} />
      <div className="grid grid-cols-2 gap-2 px-4 pt-3">
        <Tile label="Cargo units" value={String(k.cargo)} of={`/ ${capacity}`} bar={k.cargo / capacity} />
        <Tile label="Loading spaces" value={`${k.docksBusy}`} of={`/ ${k.docksTotal} busy`} bar={k.docksTotal ? k.docksBusy / k.docksTotal : 0} tone="green" />
        <Tile label="Forklifts" value={`${k.forkliftsWorking}`} of={`/ ${k.forkliftsTotal} working`} bar={k.forkliftsWorking / k.forkliftsTotal} tone="green" />
        <Tile label="Departures today" value={String(k.departuresToday)} of="trucks" />
      </div>
      <div className="px-4 pt-3">
        <div className="mb-1 flex items-center justify-between text-[12px]">
          <span className="font-semibold text-ink">Storage zones</span>
          <span className="text-muted">positions</span>
        </div>
        {zones.map((z) => {
          const full = z.used / z.total;
          return (
            <div key={z.id} className="flex items-center gap-2.5 border-t border-line py-[7px] text-[12.5px] first:border-t-0">
              <span className="h-6 w-6 shrink-0 rounded-md" style={{ background: `${z.color}22`, boxShadow: `inset 0 0 0 1.5px ${z.color}` }} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate font-semibold text-ink">{z.name}</span>
                <span className="block text-[11px] text-muted">{z.kind}</span>
              </span>
              <span className="font-semibold text-ink tabular-nums">
                {z.used}/{z.total}
              </span>
              <Pill tone={full > 0.8 ? 'amber' : 'green'}>{full > 0.8 ? 'Near full' : 'Space'}</Pill>
            </div>
          );
        })}
      </div>
      <div className="px-4 pt-2 pb-4">
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
    <Card className="w-[318px] overflow-y-auto">
      {!selected && <YardOverview />}
      {selected?.kind === 'truck' && <TruckDetail id={selected.id} />}
      {selected?.kind === 'forklift' && <ForkliftDetail id={selected.id} />}
      {selected?.kind === 'cargo' && <CargoDetail id={selected.id} />}
      {selected?.kind === 'worker' && <WorkerDetail id={selected.id} />}
    </Card>
  );
}
