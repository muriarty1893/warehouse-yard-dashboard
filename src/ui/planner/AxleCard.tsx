import { Scale } from 'lucide-react';
import { planOf, useLoading } from '../../loading/store';
import type { AxleStatus } from '../../loading/types';
import { Card, Pill, type Tone } from '../kit';
import { fmtKg } from './format';
import { worstStatus } from './notes';

export const STATUS_TONE: Record<AxleStatus, Tone> = { ok: 'green', near: 'amber', over: 'red', light: 'violet' };
const STATUS_LABEL: Record<AxleStatus, string> = { ok: 'Legal', near: 'Near limit', over: 'Over', light: 'Steer too light' };
const BAR: Record<AxleStatus, string> = { ok: 'bg-[#22b35e]', near: 'bg-[#f0932b]', over: 'bg-[#e05252]', light: 'bg-[#7a5af0]' };
const CELL: Record<AxleStatus, string> = { ok: 'bg-[#e5f6ec] text-[#1f9254]', near: 'bg-[#fff1df] text-[#c4640a]', over: 'bg-[#fdecec] text-[#d64545]', light: 'bg-[#f0ebfe] text-[#6b4ee6]' };

/** Axle loads at departure and after every drop (spec §2.1). */
export function AxleCard({ truckId }: { truckId: string }) {
  const plan = useLoading((s) => planOf(s, truckId));
  if (!plan) return null;
  const { states } = plan.checks;
  const depart = states[0];
  const worst = worstStatus(states.flatMap((s) => s.axles.map((a) => a.status)));
  return (
    <Card className="p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <Scale size={15} className="text-muted" />
        <span className="text-[13px] font-semibold text-ink">Axle loads</span>
        <Pill tone={STATUS_TONE[worst]}>{STATUS_LABEL[worst]}</Pill>
        <span className="ml-auto text-[11px] text-faint">at departure</span>
      </div>
      <div className="space-y-2">
        {depart.axles.map((a) => (
          <div key={a.id}>
            <div className="mb-1 flex items-baseline justify-between text-[12px]">
              <span className="text-muted">{a.label}</span>
              <span className="font-semibold text-ink tabular-nums">
                {fmtKg(a.kg).replace(' kg', '')} <span className="font-normal text-faint">/ {fmtKg(a.ratingKg)}</span>
              </span>
            </div>
            <div className="relative h-1.5 rounded-full bg-[#e9edf4]">
              <div className={`h-full rounded-full transition-[width] duration-500 ${BAR[a.status]}`} style={{ width: `${Math.min(100, a.pct) * 0.9}%` }} />
              {/* The rating, at 90% of the track so an overload still shows past it. */}
              <span className="absolute top-[-3px] h-3 w-px bg-ink/50" style={{ left: '90%' }} />
            </div>
          </div>
        ))}
      </div>
      {states.length > 1 && (
        <div className="mt-3 grid gap-1 text-[10.5px]" style={{ gridTemplateColumns: `48px repeat(${states.length}, minmax(0, 1fr))` }}>
          <span />
          {states.map((s) => (
            <span key={s.label} className="text-center font-semibold text-faint uppercase">
              {s.label}
            </span>
          ))}
          {depart.axles.map((a, i) => (
            <div key={a.id} className="contents">
              <span className="truncate text-muted">{a.label.split(' ')[0]}</span>
              {states.map((s) => {
                const x = s.axles[i];
                return (
                  <span key={s.label} className={`rounded py-0.5 text-center font-semibold tabular-nums ${CELL[x.status]}`} title={`${x.label} ${s.label.toLowerCase()}: ${fmtKg(x.kg)}`}>
                    {Math.round(x.pct)}%
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {!plan.checks.ok && (
        <ul className="mt-2.5 space-y-0.5 text-[11px] text-[#d64545]">
          {plan.checks.issues.map((i) => (
            <li key={i}>· {i}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
