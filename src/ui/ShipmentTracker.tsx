import { Check, ChevronRight, ClipboardCheck, MapPin, Package, Truck, CircleCheck } from 'lucide-react';
import { useUi } from '../state/ui';
import { fmtDuration } from '../world/time';
import type { TruckState } from '../world/snapshot';
import { useWorld } from '../world/store';
import { selectAndFocus } from './focus';
import { Card, Pill } from './kit';
import { TRUCK_STATUS } from './status';

const ACTIVE: TruckState['status'][] = ['loading', 'unloading', 'docking', 'at-gate', 'departing'];
const STEP_ICONS = [ClipboardCheck, MapPin, Package, Truck, CircleCheck];

/** The truck to track: the selected one, else a scripted truck that is busy, else one being loaded. */
function useTrackedTruck(): TruckState | undefined {
  const selected = useUi((s) => (s.selected?.kind === 'truck' ? s.selected.id : null));
  const trucks = useWorld((s) => s.trucks);
  return (
    trucks.find((t) => t.id === selected) ??
    trucks.find((t) => t.scripted && ACTIVE.includes(t.status)) ??
    trucks.find((t) => t.status === 'loading') ??
    trucks[0]
  );
}

function TruckArt() {
  return (
    <svg width="58" height="34" viewBox="0 0 58 34" aria-hidden>
      <rect x="1" y="4" width="36" height="20" rx="3" fill="#ffffff" stroke="#c9d3ea" />
      <rect x="4" y="9" width="18" height="6" rx="1.5" fill="#2f5ff0" opacity=".9" />
      <path d="M38 10h9.5c1.2 0 2.3.6 3 1.6l4.5 6.4c.3.5.5 1 .5 1.6V24H38z" fill="#2f5ff0" />
      <path d="M41 12.5h6l3.4 4.8H41z" fill="#cfe0ff" />
      <rect x="0" y="23" width="57" height="3" rx="1.5" fill="#1b2a4a" opacity=".85" />
      <circle cx="11" cy="28" r="4" fill="#1b2a4a" />
      <circle cx="11" cy="28" r="1.6" fill="#c3cad8" />
      <circle cx="46" cy="28" r="4" fill="#1b2a4a" />
      <circle cx="46" cy="28" r="1.6" fill="#c3cad8" />
    </svg>
  );
}

export function ShipmentTracker() {
  const t = useTrackedTruck();
  if (!t) return null;
  const st = TRUCK_STATUS[t.status];
  const sh = t.shipment;
  const left =
    t.etaSec === null ? '' : t.status === 'en-route' || t.status === 'scheduled' ? `arrives in ${fmtDuration(t.etaSec)}` : `${fmtDuration(t.etaSec)} left`;
  return (
    <Card className="flex w-[790px] max-w-full gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="mb-3.5 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[14px] font-bold text-ink">
            <Truck size={17} className="text-brand" /> Shipment tracking
          </span>
          <span className="text-[11.5px] font-medium text-muted">
            {t.id} · {t.carrier}
          </span>
        </div>
        <div className="relative grid grid-cols-5">
          {t.steps.map((step, i) => {
            const Icon = step.state === 'done' && i < 4 ? Check : STEP_ICONS[i];
            const label = i === 2 && t.progress ? `${step.label} ${t.progress.done}/${t.progress.total}` : step.label;
            return (
              <div key={step.label} className="relative flex flex-col items-center text-center">
                {i > 0 && (
                  <div className="absolute top-[15px] right-1/2 left-[-50%] h-[3px] rounded-full bg-[#e3e8f2]">
                    <div className={`h-full rounded-full bg-brand transition-all duration-500 ${step.state === 'pending' ? 'w-0' : 'w-full'}`} />
                  </div>
                )}
                <div
                  className={`relative z-10 flex h-[33px] w-[33px] items-center justify-center rounded-full ${
                    step.state === 'pending' ? 'bg-[#eef1f6] text-faint' : 'bg-brand text-white'
                  } ${step.state === 'active' ? 'ring-4 ring-brand/20' : ''}`}
                >
                  <Icon size={15} strokeWidth={2.4} />
                </div>
                <div className={`mt-2 text-[12px] font-semibold ${step.state === 'pending' ? 'text-muted' : 'text-ink'}`}>{label}</div>
                <div className="text-[11px] text-faint tabular-nums">{step.eta ? `ETA ${step.time}` : step.time}</div>
              </div>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => selectAndFocus({ kind: 'truck', id: t.id })}
        className="flex w-[250px] shrink-0 items-center gap-3 rounded-xl bg-[#f5f7fb] p-3 text-left hover:bg-[#eef2fa]"
      >
        <TruckArt />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[13.5px] font-bold text-ink">{sh.id}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-muted">
            {sh.direction === 'inbound' ? 'From' : 'To'}: {sh.place}
          </span>
          <Pill tone={st.tone} className="mt-1.5">
            {st.label}
          </Pill>
          <span className="mt-1.5 block text-[11px] leading-snug text-faint">
            YD-01 · {t.bayId ?? 'Gate 1'}
            {left && <span className="block">{left}</span>}
          </span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-faint" />
      </button>
    </Card>
  );
}
