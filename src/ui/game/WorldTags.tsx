import { useEffect, useRef } from 'react';
import { bayById } from '../../config/devYard';
import { motionOf } from '../../game/motion';
import { bayInfo } from '../../game/select';
import { runningFees } from '../../game/ledger';
import { useGame } from '../../game/store';
import { yardToWorld } from '../../scene/kit';
import { track } from '../../scene/game/Projector';
import { clock } from '../../sim/clock';
import { newPose } from '../../sim/route';
import { useShiftView } from './hooks';
import { Num } from './kit';

/** A slanted label that follows a world point. */
function Floating({ id, at, className, children }: { id: string; at: () => [number, number, number] | null; className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const where = useRef(at);
  where.current = at;
  useEffect(
    () =>
      track(
        id,
        () => where.current(),
        (x, y, visible) => {
          const el = ref.current;
          if (!el) return;
          el.style.display = visible ? '' : 'none';
          el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        },
      ),
    [id],
  );
  return (
    <div ref={ref} className="absolute top-0 left-0" style={{ display: 'none' }}>
      <div className={`slant px-1.5 whitespace-nowrap shadow-[0_3px_8px_rgba(11,29,79,0.3)] ${className}`}>
        <Num className="unslant block text-[10.5px] uppercase">{children}</Num>
      </div>
    </div>
  );
}

const pose = newPose();

/** Truck position above its roof, at the clock time. */
const truckTop = (id: string) => (): [number, number, number] | null => {
  const tr = useGame.getState().shift?.trucks.find((x) => x.id === id);
  if (!tr || tr.stage === 'scheduled' || tr.stage === 'gone') return null;
  motionOf(tr, clock.t, pose);
  return pose.visible ? yardToWorld(pose.x, pose.y, 4.6) : null;
};

const bayTop = (id: string) => {
  const b = bayById(id);
  const p = yardToWorld(b.center[0], b.center[1], 0.4);
  return (): [number, number, number] => p;
};

/** Tags over the bays (L1 · 3/8, L3 · FREE) and over trucks running a fee (spec §4.2). */
export function WorldTags() {
  const v = useShiftView((s, t) => ({ bays: bayInfo(s, t), fees: runningFees(s, t).map((f) => ({ id: f.ref, perMin: f.kind === 'gateWait' ? s.prices.gatePerMin : s.prices.latePerMin })) }));
  if (!v) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {v.bays.map((b) => (
        <Floating key={b.id} id={`bay-${b.id}`} at={bayTop(b.id)} className={b.closedUntilMin !== null ? 'bg-stop text-white' : b.truckId ? 'bg-brand text-white' : 'bg-navy/85 text-white'}>
          {b.id} · {b.closedUntilMin !== null ? 'CLOSED' : b.clearing ? 'CLEARING' : b.truckId ? (b.total ? `${b.done}/${b.total}` : b.truckId.replace('TRUCK-', '')) : 'FREE'}
        </Floating>
      ))}
      {v.fees.map((f) => (
        <Floating key={f.id} id={`fee-${f.id}`} at={truckTop(f.id)} className="bg-stop text-white">
          €{f.perMin}/min
        </Floating>
      ))}
    </div>
  );
}
