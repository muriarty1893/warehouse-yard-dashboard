import { Clock } from 'lucide-react';
import { profit } from '../../game/ledger';
import { starsFor } from '../../game/report';
import { clockLabel, shiftMinutes } from '../../game/types';
import { SPEEDS, useSim } from '../../sim/clock';
import { useShiftView } from './hooks';
import { fmtMoney } from './format';
import { Num, Slant, Stars } from './kit';

/** Top of the HUD (spec §4.2): the shift, the clock with its speeds, and profit against the star targets. */
export function Scoreboard({ compact = false }: { compact?: boolean }) {
  const v = useShiftView((s, t) => {
    const p = profit(s, t);
    const next = s.recipe.targets.find((x) => x > p) ?? null;
    return { no: s.recipe.no, name: s.recipe.name, clock: clockLabel(t), end: clockLabel(s.end), done: Math.min(1, shiftMinutes(t) / shiftMinutes(s.end)), profit: p, stars: starsFor(p, s.recipe.targets), next };
  });
  const speed = useSim((s) => s.speed);
  const setSpeed = useSim((s) => s.setSpeed);
  if (!v) return null;
  return (
    <div className="pointer-events-none flex items-start justify-between gap-3">
      {!compact && (
        <Slant className="pointer-events-auto bg-brand px-3.5 py-1 text-white shadow-[0_6px_14px_rgba(11,29,79,0.3)]" inner="flex items-center gap-2.5">
          <Slant className="bg-hot px-2 text-navy">
            <Num className="text-[17px]">{v.no}/9</Num>
          </Slant>
          <span className="leading-none">
            <span className="block text-[9px] font-semibold tracking-[0.12em] uppercase opacity-85">Shift</span>
            <Num className="text-[18px] uppercase">{v.name}</Num>
          </span>
        </Slant>
      )}
      <Slant className="pointer-events-auto bg-navy px-3.5 pt-1 text-white shadow-[0_6px_14px_rgba(11,29,79,0.3)]">
        <div className="flex items-center gap-2.5">
          <Clock size={16} className="text-hot" aria-hidden />
          <Num className="text-[28px] leading-none" aria-live="off">
            {v.clock}
          </Num>
          <span className="text-[10px] font-semibold text-pale">→ {v.end}</span>
          <div className="flex gap-0.5" role="group" aria-label="Speed">
            {SPEEDS.map((x, i) => (
              <button key={x} type="button" onClick={() => setSpeed(x)} aria-pressed={speed === x} title={`${x}× (key ${i + 1})`} className={`cursor-pointer px-1.5 font-display text-[13px] font-extrabold italic ${speed === x ? 'bg-paper text-navy' : 'bg-white/12 text-white hover:bg-white/20'}`}>
                {x}×
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-3.5 mt-1 h-[3px] bg-white/15">
          <div className="h-full bg-hot" style={{ width: `${v.done * 100}%` }} />
        </div>
      </Slant>
      <Slant className="pointer-events-auto border-r-[7px] border-brand bg-paper px-3.5 py-1 text-navy shadow-[0_6px_14px_rgba(11,29,79,0.3)]" inner="flex items-center gap-2.5">
        <Num className={`text-[28px] leading-none ${v.profit < 0 ? 'text-stop' : ''}`}>{fmtMoney(v.profit, { sign: false })}</Num>
        <span className="leading-tight">
          <Stars n={v.stars} className="text-[14px] text-faint" />
          <span className="block text-[10px] font-semibold text-muted">{v.next === null ? 'all three stars' : `next ★ at ${fmtMoney(v.next, { sign: false })}`}</span>
        </span>
      </Slant>
    </div>
  );
}
