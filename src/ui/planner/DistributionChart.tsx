import { LineChart } from 'lucide-react';
import { planOf, useLoading } from '../../loading/store';
import type { VehicleSpec } from '../../loading/types';
import { vehicleById } from '../../loading/vehicles';
import { Card } from '../kit';
import { fmtT } from './format';

const W = 320;
const H = 170;
const PAD = { l: 30, r: 10, t: 12, b: 26 };

/** Axle positions inside the box, for the x-axis markers. */
function markers(v: VehicleSpec): { x: number; label: string }[] {
  const s = v.statics;
  const all = s.kind === 'rigid' ? [{ x: s.front, label: 'front' }, { x: s.rear, label: 'rear' }] : [{ x: s.kingpin, label: 'kingpin' }, { x: s.trailer, label: 'trailer' }];
  return all.filter((m) => m.x >= 0 && m.x <= v.inner.l);
}

/**
 * Load-distribution chart (spec §2.1): the most payload the vehicle takes for
 * each centre-of-gravity position, the legal window for this load, the plan's
 * point and how it moves after each drop.
 */
export function DistributionChart({ truckId }: { truckId: string }) {
  const plan = useLoading((s) => planOf(s, truckId));
  if (!plan) return null;
  const v = vehicleById(plan.vehicle);
  const { curve, window, states } = plan.checks;
  const L = v.inner.l;
  const top = Math.max(v.payloadKg, ...curve.map((p) => p.maxKg)) * 1.08;
  const sx = (x: number) => PAD.l + (x / L) * (W - PAD.l - PAD.r);
  const sy = (kg: number) => H - PAD.b - (kg / top) * (H - PAD.t - PAD.b);
  const area = `M${sx(0)},${sy(0)} ${curve.map((p) => `L${sx(p.x).toFixed(1)},${sy(p.maxKg).toFixed(1)}`).join(' ')} L${sx(L)},${sy(0)} Z`;
  const points = states.filter((s) => s.cogX !== null).map((s) => ({ x: s.cogX!, kg: s.payloadKg }));
  const tons = Array.from({ length: 5 }, (_, i) => (top / 1000 / 4) * i);
  const xs = [0, L / 4, L / 2, (3 * L) / 4, L];
  const cog = plan.checks.cogX;
  return (
    <Card className="p-3.5">
      <div className="mb-1 flex items-center gap-2">
        <LineChart size={15} className="text-muted" />
        <span className="text-[13px] font-semibold text-ink">Load distribution</span>
        <span className="ml-auto text-[11px] text-faint">payload vs centre of gravity</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Most payload by centre-of-gravity position, with this plan's point">
        {tons.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t * 1000)} y2={sy(t * 1000)} stroke="#e8ecf3" />
            <text x={PAD.l - 5} y={sy(t * 1000) + 3} textAnchor="end" fontSize="9" fill="#8a94ad">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {window && <rect x={sx(window[0])} y={PAD.t} width={sx(window[1]) - sx(window[0])} height={H - PAD.t - PAD.b} fill="#2f5ff0" opacity="0.07" />}
        <path d={area} fill="#22b35e" opacity="0.14" />
        <path d={area.replace(/ Z$/, '').replace(/^M[^ ]+ /, 'M')} fill="none" stroke="#22b35e" strokeWidth="1.5" />
        {markers(v).map((m) => (
          <g key={m.label}>
            <path d={`M${sx(m.x)},${H - PAD.b + 2} l-4,7 h8 z`} fill="#1b2a4a" />
            <text x={sx(m.x)} y={H - 4} textAnchor="middle" fontSize="8.5" fill="#5b6b8c">
              {m.label}
            </text>
          </g>
        ))}
        {xs.map((x) => (
          <text key={x} x={sx(x)} y={H - PAD.b + 11} textAnchor="middle" fontSize="8.5" fill="#8a94ad">
            {x.toFixed(1)}
          </text>
        ))}
        {points.length > 1 && <polyline points={points.map((p) => `${sx(p.x)},${sy(p.kg)}`).join(' ')} fill="none" stroke="#f0932b" strokeWidth="1.2" strokeDasharray="2 3" />}
        {points.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.kg)} r={i === 0 ? 4.5 : 3} fill={i === 0 ? '#f0932b' : '#fff'} stroke="#f0932b" strokeWidth="1.5" />
        ))}
        <text x={W - PAD.r} y={PAD.t - 2} textAnchor="end" fontSize="8.5" fill="#8a94ad">
          t
        </text>
      </svg>
      <p className="mt-1 text-[11.5px] leading-snug text-muted">
        {cog === null ? (
          'No cargo yet.'
        ) : window ? (
          <>
            Centre of gravity <b className="text-ink">{cog.toFixed(2)} m</b> from the front wall, legal from <b className="text-ink">{window[0].toFixed(2)}</b> to <b className="text-ink">{window[1].toFixed(2)} m</b> for {fmtT(plan.checks.payloadKg)}. Dots: the load after each drop.
          </>
        ) : (
          <>
            Centre of gravity <b className="text-ink">{cog.toFixed(2)} m</b> from the front wall; no legal position for {fmtT(plan.checks.payloadKg)}.
          </>
        )}
      </p>
    </Card>
  );
}
