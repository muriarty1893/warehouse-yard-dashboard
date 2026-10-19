import { Bell, Box, ChevronDown, ChevronRight, Forklift, MapPin, Pause, Play, Search, Truck, User, TriangleAlert, Info } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SPEEDS, useSim } from '../sim/clock';
import type { EntityRef } from '../state/ui';
import { cargo, positions, yard } from '../world/snapshot';
import { useWorld } from '../world/store';
import { focusPoint, selectAndFocus } from './focus';
import { Card, Kbd } from './kit';

export function Logo() {
  return (
    <div className="pointer-events-auto flex items-center gap-2.5 pr-2">
      <svg width="30" height="30" viewBox="0 0 28 28" aria-hidden>
        <rect width="28" height="28" rx="7" fill="#2f5ff0" />
        <path d="M14 6.5l6.5 3.75L14 14 7.5 10.25z" fill="#fff" />
        <path d="M7.5 10.25L14 14v7.5l-6.5-3.75z" fill="#fff" fillOpacity=".7" />
        <path d="M20.5 10.25L14 14v7.5l6.5-3.75z" fill="#fff" fillOpacity=".45" />
      </svg>
      <span className="text-[20px] font-bold tracking-tight text-ink">Docktor</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search

type HitKind = 'Truck' | 'Forklift' | 'Worker' | 'Cargo' | 'Position';

interface Hit {
  key: string;
  kind: HitKind;
  title: string;
  subtitle: string;
  text: string;
  pick: () => void;
}

const HIT_ICONS: Record<HitKind, ReactNode> = {
  Truck: <Truck size={15} />,
  Forklift: <Forklift size={15} />,
  Worker: <User size={15} />,
  Cargo: <Box size={15} />,
  Position: <MapPin size={15} />,
};

/** Everything searchable, built on demand from the current World State. */
function searchIndex(): Hit[] {
  const { trucks, forklifts, workers } = useWorld.getState();
  const go = (ref: EntityRef) => () => selectAndFocus(ref);
  return [
    ...trucks.map((t) => ({ key: t.id, kind: 'Truck' as const, title: t.id, subtitle: `${t.carrier} · ${t.plate} · ${t.where}`, text: `${t.id} ${t.carrier} ${t.plate} ${t.driver} ${t.shipment.id}`, pick: go({ kind: 'truck', id: t.id }) })),
    ...forklifts.map((f) => ({ key: f.id, kind: 'Forklift' as const, title: f.id, subtitle: `${f.operator} · ${f.model}`, text: `${f.id} ${f.operator} ${f.model}`, pick: go({ kind: 'forklift', id: f.id }) })),
    ...workers.map((w) => ({ key: w.id, kind: 'Worker' as const, title: w.name, subtitle: `${w.id} · ${w.role}`, text: `${w.id} ${w.name} ${w.role}`, pick: go({ kind: 'worker', id: w.id }) })),
    ...cargo.map((c) => ({ key: c.id, kind: 'Cargo' as const, title: c.id, subtitle: `${c.description} · ${c.positionId}`, text: `${c.id} ${c.description} ${c.destination} ${c.type}`, pick: go({ kind: 'cargo', id: c.id }) })),
    ...[...positions.values()].map((p) => {
      const top = cargo.filter((c) => c.positionId === p.id).sort((a, b) => b.stackLevel - a.stackLevel)[0];
      return {
        key: `pos-${p.id}`,
        kind: 'Position' as const,
        title: p.id,
        subtitle: top ? `Position · ${top.id}` : 'Position · empty',
        text: p.id,
        pick: top ? go({ kind: 'cargo', id: top.id }) : () => focusPoint(p.x, p.y, 24),
      };
    }),
  ];
}

function SearchBox() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const index = searchIndex();
    const exact = index.filter((h) => h.title.toLowerCase() === q);
    const rest = index.filter((h) => h.title.toLowerCase() !== q && h.text.toLowerCase().includes(q));
    return [...exact, ...rest].slice(0, 8);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (hit: Hit | undefined) => {
    if (!hit) return;
    hit.pick();
    setQuery('');
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="pointer-events-auto relative w-[min(380px,32vw)]">
      <div className="flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 shadow-[0_2px_8px_rgba(27,42,74,0.04)] focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15">
        <Search size={16} className="shrink-0 text-faint" />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              choose(hits[active]);
            } else if (e.key === 'Escape') {
              setQuery('');
              input.current?.blur();
            }
          }}
          placeholder="Search trucks, forklifts, cargo, positions…"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
          aria-label="Search the yard"
        />
        <Kbd>/</Kbd>
      </div>
      {open && hits.length > 0 && (
        <Card className="absolute top-12 right-0 left-0 z-30 overflow-hidden p-1.5">
          {hits.map((h, i) => (
            <button
              key={h.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(h)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${i === active ? 'bg-[#eef3ff]' : ''}`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e8eefe] text-brand">{HIT_ICONS[h.kind]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink">{h.title}</span>
                <span className="block truncate text-[11.5px] text-muted">{h.subtitle}</span>
              </span>
              <span className="text-[10.5px] font-semibold tracking-wide text-faint uppercase">{h.kind}</span>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function YardChip() {
  const kpis = useWorld((s) => s.kpis);
  return (
    <div className="pointer-events-auto hidden h-11 items-center gap-2.5 rounded-xl border border-line bg-white py-1 pr-2 pl-1.5 shadow-[0_2px_8px_rgba(27,42,74,0.04)] lg:flex">
      <span className="rounded-lg bg-brand px-1.5 py-1 text-[11px] font-bold text-white">{yard.id}</span>
      <span className="leading-tight">
        <span className="block text-[13px] font-semibold text-ink">{yard.name}</span>
        <span className="block text-[11px] text-muted">
          {Math.round(kpis.storagePct)}% used · {kpis.docksBusy}/{kpis.docksTotal} bays busy
        </span>
      </span>
      <ChevronRight size={16} className="text-faint" />
    </div>
  );
}

function TimeControls() {
  const { speed, paused, setSpeed, togglePause } = useSim();
  const clock = useWorld((s) => s.clock);
  return (
    <div className="pointer-events-auto flex h-11 items-center gap-1 rounded-xl border border-line bg-white p-1 shadow-[0_2px_8px_rgba(27,42,74,0.04)]">
      <button
        type="button"
        onClick={togglePause}
        title={paused ? 'Resume (Space)' : 'Pause (Space)'}
        aria-label={paused ? 'Resume simulation' : 'Pause simulation'}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-[#eef1f6]"
      >
        {paused ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}
      </button>
      {SPEEDS.map((s, i) => (
        <button
          key={s}
          type="button"
          onClick={() => setSpeed(s)}
          title={`${s}× speed (${i + 1})`}
          className={`h-8 rounded-lg px-2 text-[12px] font-semibold ${!paused && speed === s ? 'bg-[#e8eefe] text-brand' : 'text-muted hover:bg-[#eef1f6]'}`}
        >
          {s}×
        </button>
      ))}
      <span className={`ml-1 flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold ${paused ? 'bg-[#eef1f6] text-muted' : 'bg-[#e5f6ec] text-[#1f9254]'}`} title="Simulated yard time">
        <span className={`h-2 w-2 rounded-full ${paused ? 'bg-faint' : 'animate-pulse bg-[#22b35e]'}`} />
        Sim {clock}
      </span>
    </div>
  );
}

function Alerts() {
  const alerts = useWorld((s) => s.alerts);
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-ink hover:bg-white"
      >
        <Bell size={19} />
        {alerts.length > 0 && <span className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-[#e05252] ring-2 ring-white" />}
      </button>
      {open && (
        <Card className="absolute top-12 right-0 z-30 w-80 p-2">
          <div className="px-2 py-1.5 text-[12px] font-semibold text-ink">Alerts · {alerts.length}</div>
          {alerts.length === 0 && <div className="px-2 py-3 text-[12px] text-muted">All clear.</div>}
          {alerts.map((a) => (
            <div key={a.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-[#f5f7fb]">
              {a.level === 'warn' ? <TriangleAlert size={15} className="mt-0.5 shrink-0 text-[#f0932b]" /> : <Info size={15} className="mt-0.5 shrink-0 text-brand" />}
              <span className="text-[12px] text-ink">{a.text}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function UserChip() {
  return (
    <div className="pointer-events-auto hidden items-center gap-2.5 pl-1 xl:flex">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#5b7cff] to-[#2f5ff0] text-[12px] font-bold text-white">DK</span>
      <span className="leading-tight">
        <span className="block text-[13px] font-semibold text-ink">Deniz Kaya</span>
        <span className="block text-[11px] text-muted">Yard Manager</span>
      </span>
      <ChevronDown size={16} className="text-faint" />
    </div>
  );
}

export function TopBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-16 items-center gap-4 bg-gradient-to-b from-white/90 to-white/50 px-4">
      <Logo />
      <SearchBox />
      <div className="flex-1" />
      <YardChip />
      <TimeControls />
      <Alerts />
      <UserChip />
    </div>
  );
}
