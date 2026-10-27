import { Boxes, Gauge, Layers, Rows3, Weight } from 'lucide-react';
import type { ReactNode } from 'react';
import { planOf, useLoading } from '../../loading/store';
import { vehicleById } from '../../loading/vehicles';
import { Card } from '../kit';
import { fmtT } from './format';

function Kpi({ icon, label, value, unit, sub }: { icon: ReactNode; label: string; value: string; unit?: string; sub: ReactNode }) {
  return (
    <Card className="min-w-0 p-3">
      <div className="flex items-center gap-1.5 border-b border-line pb-1.5 text-[11.5px] font-medium text-muted">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 truncate text-[22px] font-bold text-ink tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-[13px] font-semibold text-muted">{unit}</span>}
      </div>
      <div className="truncate text-[11px] text-muted">{sub}</div>
    </Card>
  );
}

/** The plan in five numbers (spec §2.1). */
export function PlannerKpis({ truckId }: { truckId: string }) {
  const plan = useLoading((s) => planOf(s, truckId));
  if (!plan) return null;
  const v = vehicleById(plan.vehicle);
  const st = plan.stats;
  const fullest = plan.rows.reduce((m, r) => (r.fillPct > m.fillPct ? r : m), plan.rows[0]);
  const [weight, wUnit] = fmtT(st.weightKg).split(' ');
  const [left, lUnit] = fmtT(Math.max(0, st.remainingKg)).split(' ');
  return (
    <div className="grid grid-cols-5 gap-3">
      <Kpi icon={<Weight size={13} />} label="Total cargo weight" value={weight} unit={wUnit} sub={`${Math.round(st.weightPct)} % of the ${fmtT(v.payloadKg)} payload`} />
      <Kpi icon={<Gauge size={13} />} label="Remaining capacity" value={left} unit={lUnit} sub={<>the <b className="text-ink">{st.limitedBy}</b> limits it here</>} />
      <Kpi icon={<Layers size={13} />} label="Fill, volume and weight" value={`${Math.round(st.volumePct)}% · ${Math.round(st.weightPct)}%`} sub={`${st.units} units in ${v.inner.l} m`} />
      <Kpi icon={<Rows3 size={13} />} label="Rows used" value={`${st.rowsUsed} / ${st.rows}`} sub={fullest && fullest.kg > 0 ? `fullest R${fullest.index} at ${Math.round(fullest.fillPct)} %` : 'empty'} />
      <Kpi icon={<Boxes size={13} />} label="Units on this truck" value={`${st.units}`} unit={`of ${st.candidates}`} sub={`${st.candidates - st.units} stay in the yard`} />
    </div>
  );
}
