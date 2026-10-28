import { CheckCircle2, Flame, Sparkles, Truck, X } from 'lucide-react';
import { useState } from 'react';
import { candidatesFor } from '../../loading/candidates';
import { bayOfTruck } from '../../loading/frame';
import { optimiseInWorker } from '../../loading/optimise';
import { planOf, planSource, useLoading } from '../../loading/store';
import { vehicleById } from '../../loading/vehicles';
import { useUi } from '../../state/ui';
import { useView, type PlannerView } from '../../state/view';
import { frameTruck } from './camera';
import { Scoreboard } from '../game/Scoreboard';
import { Button, IconButton, Logo, Segmented } from '../kit';

const VIEWS: { value: PlannerView; label: string }[] = [
  { value: '3d', label: '3D' },
  { value: 'side', label: 'Side' },
  { value: 'top', label: 'Top' },
  { value: 'plan', label: 'Plan' },
];

/** Best of ~1,000 seeded layouts for this truck, off the main thread (spec §1.6). */
async function optimiseTruck(truckId: string) {
  const s = useLoading.getState();
  const t = s.trucks[truckId];
  if (!t) return;
  const others = new Set(Object.keys(s.trucks).filter((id) => id !== truckId).flatMap((id) => planOf(s, id)?.placements.map((p) => p.cargoId) ?? []));
  const { items } = candidatesFor({ truckId, route: t.route, vehicle: t.vehicle, include: t.include, exclude: t.exclude, urgent: t.urgent }, planSource().cargo(), others);
  const r = await optimiseInWorker({ vehicle: vehicleById(t.vehicle), items, route: t.route });
  useLoading.getState().applyOptimised(truckId, r.plan, r.tried, Math.round(r.ms));
  useUi.getState().notify(`${r.tried.toLocaleString('en-US')} layouts in ${Math.round(r.ms)} ms · best kept`);
}

function Actions({ truckId }: { truckId: string }) {
  const status = useLoading((s) => s.trucks[truckId]?.status);
  const plan = useLoading((s) => planOf(s, truckId));
  const [busy, setBusy] = useState(false);
  const notify = useUi((s) => s.notify);
  const openDialog = useUi((s) => s.openDialog);
  if (!plan || status !== 'draft') return null;
  const confirm = () => {
    if (!plan.checks.ok) return openDialog({ kind: 'confirm', truckId });
    const r = useLoading.getState().confirm(truckId);
    notify(r.ok ? `Plan for ${truckId} confirmed · ${plan.placements.length} units go to the crew queue` : r.reason, r.ok ? 'ok' : 'error');
    if (r.ok) useView.getState().closePlanner();
  };
  return (
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl bg-white/90 p-1 shadow-[0_2px_8px_rgba(27,42,74,0.04)]">
      <Button tone="ghost" onClick={() => openDialog({ kind: 'urgent', truckId })} title="Put a yard unit on this truck first">
        <Flame size={15} /> Urgent unit
      </Button>
      <Button
        tone="ghost"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          optimiseTruck(truckId).finally(() => setBusy(false));
        }}
        title="Try ~1,000 layouts and keep the best"
      >
        <Sparkles size={15} /> {busy ? 'Optimising…' : 'Optimise'}
      </Button>
      <Button tone="primary" disabled={!plan.placements.length} onClick={confirm} title={plan.placements.length ? 'Accept this plan: the crew starts loading' : 'No cargo for this route'}>
        <CheckCircle2 size={15} /> Confirm plan
      </Button>
    </div>
  );
}

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
      <div className="flex-1" />
      <Scoreboard compact />
      <div className="pointer-events-auto w-[240px]">
        <Segmented value={view} options={VIEWS} onChange={(v) => (v === view ? frameTruck(truckId, v) : setView(v))} />
      </div>
      <Actions truckId={truckId} />
      <div className="pointer-events-auto rounded-xl bg-white/90">
        <IconButton title="Close the planner (Esc)" onClick={close}>
          <X size={18} />
        </IconButton>
      </div>
    </div>
  );
}
