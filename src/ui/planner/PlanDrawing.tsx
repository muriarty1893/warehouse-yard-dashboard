import { planOf, useLoading } from '../../loading/store';
import type { LoadPlan, VehicleSpec } from '../../loading/types';
import { vehicleById } from '../../loading/vehicles';
import { Card } from '../kit';
import { fmtKg, fmtT, stopColor } from './format';

const W = 760;
const PAD = 30;

/** Box-frame x of each axle (tractor axles of articulated vehicles sit ahead of the box, at negative x). */
function axles(v: VehicleSpec, plan: LoadPlan) {
  const s = v.statics;
  const xs =
    s.kind === 'rigid'
      ? [s.front, s.rear]
      : [s.kingpin - s.steerAhead, s.kingpin + s.driveBehind, s.trailer];
  return plan.checks.states[0].axles.map((a, i) => ({ ...a, x: xs[i] }));
}

/**
 * The plan on paper (spec §2.3): a top view with the loading order and a
 * side elevation with the axles, drawn to scale from the front wall.
 */
export function PlanDrawing({ truckId }: { truckId: string }) {
  const plan = useLoading((s) => planOf(s, truckId));
  if (!plan) return null;
  const v = vehicleById(plan.vehicle);
  const ax = axles(v, plan);
  const { l: L, w: B, h: H } = v.inner;
  // Seen from above with the front wall on the left, the right wall (y = 0) is at the top.
  const x0 = Math.min(0, ...ax.map((a) => a.x)) - 0.4;
  const x1 = Math.max(L, ...ax.map((a) => a.x)) + 0.4;
  const k = (W - 2 * PAD) / (x1 - x0);
  const X = (x: number) => PAD + (x - x0) * k;
  const topY = 46;
  const topH = B * k;
  const sideBase = topY + topH + 70 + H * k;
  const height = sideBase + 54;
  const sorted = [...plan.placements].sort((a, b) => a.z - b.z);
  // In the top view only the unit on top of a stack is labelled.
  const covered = new Set(sorted.filter((p) => sorted.some((q) => q.z > p.z && Math.abs(q.x + q.l / 2 - (p.x + p.l / 2)) < p.l / 2 && Math.abs(q.y + q.w / 2 - (p.y + p.w / 2)) < p.w / 2)).map((p) => p.cargoId));
  const cog = plan.checks.cogX;
  return (
    <Card className="flex h-full min-h-0 flex-col p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[15px] font-bold text-ink">Load plan · {v.label}</div>
          <div className="mt-0.5 truncate text-[12px] text-muted">
            {plan.placements.length} units, {fmtT(plan.stats.weightKg)} · numbers are the loading order, front wall to doors
          </div>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-x-3 gap-y-1 text-[11.5px] text-muted">
          {plan.route.map((city, i) => (
            <span key={city} className="flex items-center gap-1 whitespace-nowrap">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: stopColor(i + 1) }} />
              {i + 1} {city}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} className="mt-2 min-h-0 w-full flex-1" role="img" aria-label="Top view and side elevation of the planned load">
        <defs>
          <pattern id="clear" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#c9d0de" strokeWidth="1.5" />
          </pattern>
        </defs>
        {/* Top view */}
        <text x={X(0)} y={topY - 10} fontSize="10" fill="#8a94ad" fontWeight="600">
          FRONT WALL
        </text>
        <text x={X(L)} y={topY - 10} fontSize="10" fill="#8a94ad" fontWeight="600" textAnchor="end">
          DOORS
        </text>
        <rect x={X(0)} y={topY} width={L * k} height={topH} fill="#fbfcfe" stroke="#c9d0de" />
        {plan.clearance > 0 && <rect x={X(0)} y={topY} width={plan.clearance * k} height={topH} fill="url(#clear)" />}
        {plan.rows.slice(1).map((r) => (
          <line key={r.index} x1={X(r.x0)} x2={X(r.x0)} y1={topY} y2={topY + topH} stroke="#e1e6ef" strokeDasharray="3 3" />
        ))}
        {plan.checks.window && (
          <rect x={X(plan.checks.window[0])} y={topY} width={(plan.checks.window[1] - plan.checks.window[0]) * k} height={topH} fill="#22b35e" opacity="0.08" />
        )}
        {sorted.map((p) => {
          const color = stopColor(p.stop);
          return (
            <g key={p.cargoId}>
              <rect x={X(p.x)} y={topY + p.y * k} width={p.l * k} height={p.w * k} rx="3" fill={color} fillOpacity={p.z > 0 ? 0.28 : 0.16} stroke={color} strokeDasharray={p.z > 0 ? '4 2' : undefined} />
              {!covered.has(p.cargoId) && (
                <text x={X(p.x) + 5} y={topY + p.y * k + 13} fontSize="11" fontWeight="700" fill={color}>
                  {p.seq}
                </text>
              )}
              {!covered.has(p.cargoId) && p.l * k > 60 && (
                <text x={X(p.x + p.l / 2)} y={topY + (p.y + p.w / 2) * k + 4} fontSize="9.5" textAnchor="middle" fill="#1b2a4a" fontFamily="ui-monospace, monospace">
                  {p.cargoId.replace('CARGO-', '')}
                </text>
              )}
            </g>
          );
        })}
        {cog !== null && (
          <g>
            <circle cx={X(cog)} cy={topY + topH / 2} r="6" fill="#f0932b" stroke="#fff" strokeWidth="2" />
            <text x={X(cog) + 9} y={topY + topH / 2 + 4} fontSize="10" fontWeight="700" fill="#c4640a">
              CoG {cog.toFixed(2)} m
            </text>
          </g>
        )}
        <line x1={X(0)} x2={X(L)} y1={topY + topH + 16} y2={topY + topH + 16} stroke="#c9d0de" />
        <text x={X(L / 2)} y={topY + topH + 28} fontSize="10" textAnchor="middle" fill="#8a94ad">
          {L} m inside
        </text>

        {/* Side elevation */}
        <rect x={X(0)} y={sideBase - H * k} width={L * k} height={H * k} fill="#fbfcfe" stroke="#e1e6ef" />
        {sorted.map((p) => (
          <rect key={p.cargoId} x={X(p.x)} y={sideBase - (p.z + p.h) * k} width={p.l * k} height={p.h * k} rx="2" fill={stopColor(p.stop)} fillOpacity="0.22" stroke={stopColor(p.stop)} strokeOpacity="0.8" />
        ))}
        <line x1={X(x0 + 0.2)} x2={X(x1 - 0.2)} y1={sideBase} y2={sideBase} stroke="#1b2a4a" strokeWidth="1.5" />
        {ax.map((a) => (
          <g key={a.id}>
            <path d={`M${X(a.x)},${sideBase + 2} l-7,12 h14 z`} fill={a.status === 'ok' ? '#1b2a4a' : a.status === 'near' ? '#f0932b' : '#e05252'} />
            <text x={X(a.x)} y={sideBase + 27} fontSize="10" textAnchor="middle" fill="#5b6b8c">
              {a.label}
            </text>
            <text x={X(a.x)} y={sideBase + 40} fontSize="10" textAnchor="middle" fill="#1b2a4a" fontWeight="600">
              {fmtKg(a.kg)} / {fmtKg(a.ratingKg)}
            </text>
          </g>
        ))}
      </svg>
    </Card>
  );
}
