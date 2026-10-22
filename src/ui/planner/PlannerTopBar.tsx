import { Truck, X } from 'lucide-react';
import { bayOfTruck } from '../../loading/frame';
import { useLoading } from '../../loading/store';
import { useView, type PlannerView } from '../../state/view';
import { IconButton, Segmented } from '../kit';
import { Logo, TimeControls } from '../TopBar';

const VIEWS: { value: PlannerView; label: string }[] = [
  { value: '3d', label: '3D' },
  { value: 'side', label: 'Side' },
  { value: 'top', label: 'Top' },
  { value: 'plan', label: 'Plan' },
];

/** Planner header: which truck, sim time, view switch and the plan's actions. */
export function PlannerTopBar({ truckId }: { truckId: string }) {
  const stops = useLoading((s) => s.trucks[truckId]?.route.length ?? 0);
  const view = useView((s) => s.plannerView);
  const setView = useView((s) => s.setPlannerView);
  const close = useView((s) => s.closePlanner);
  const bay = bayOfTruck(truckId)?.id ?? '—';
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-16 items-center gap-3 bg-gradient-to-b from-white/90 to-white/50 px-4">
      <Logo />
      <div className="pointer-events-auto flex h-11 items-center gap-2.5 rounded-xl border border-line bg-white py-1 pr-3 pl-1.5 whitespace-nowrap shadow-[0_2px_8px_rgba(27,42,74,0.04)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8eefe] text-brand">
          <Truck size={16} />
        </span>
        <span className="leading-tight">
          <span className="block text-[13px] font-semibold text-ink">
            {truckId} · {bay} · {stops} stop{stops === 1 ? '' : 's'}
          </span>
          <span className="block text-[11px] text-muted">Load plan</span>
        </span>
      </div>
      <TimeControls />
      <div className="flex-1" />
      <div className="pointer-events-auto w-[240px]">
        <Segmented value={view} options={VIEWS} onChange={setView} />
      </div>
      <div className="pointer-events-auto rounded-xl bg-white/90">
        <IconButton title="Close the planner (Esc)" onClick={close}>
          <X size={18} />
        </IconButton>
      </div>
    </div>
  );
}
