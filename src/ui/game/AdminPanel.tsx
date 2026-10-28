import { Wrench, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { playShift, resetProgress, skipTo, useAdmin } from '../../game/admin';
import { RECIPES } from '../../game/recipes';
import { useGame } from '../../game/store';
import { clockLabel, LUNCH, secondsFor } from '../../game/types';
import { clock, useSim } from '../../sim/clock';
import { useShiftView } from './hooks';
import { Btn, Num, PanelHead } from './kit';

/** Fast-forward speeds past the scoreboard's 1× … 8×. */
const FAST = [16, 32, 64];

function Toggle({ on, onChange, children, note }: { on: boolean; onChange: (on: boolean) => void; children: ReactNode; note: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-0.5">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-hot" />
      <span className="leading-tight">
        <span className="block text-[12.5px] font-semibold">{children}</span>
        <span className="block text-[10.5px] text-pale">{note}</span>
      </span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-white/10 px-2.5 py-2">
      <div className="mb-1 text-[9.5px] font-bold tracking-[0.14em] text-pale uppercase">{title}</div>
      {children}
    </div>
  );
}

/** Time tools for the running shift. */
function TimeTools() {
  const v = useShiftView((s, t) => ({ t, clock: clockLabel(t), end: s.end, lunchOver: secondsFor(LUNCH.toMin) }));
  const speed = useSim((s) => s.speed);
  const setSpeed = useSim((s) => s.setSpeed);
  if (!v) return null;
  return (
    <Section title={`Time · ${v.clock}`}>
      <div className="flex flex-wrap gap-1">
        <Btn tone="ghost" onClick={() => skipTo(clock.t + secondsFor(15))}>
          +15 min
        </Btn>
        <Btn tone="ghost" onClick={() => skipTo(clock.t + secondsFor(60))}>
          +1 h
        </Btn>
        {v.t < v.lunchOver && (
          <Btn tone="ghost" onClick={() => skipTo(v.lunchOver)}>
            To 13:00
          </Btn>
        )}
        <Btn tone="hot" onClick={() => skipTo(v.end)}>
          End shift
        </Btn>
      </div>
      <div className="mt-1.5 flex items-center gap-1" role="group" aria-label="Fast forward">
        <span className="mr-1 text-[11px] text-pale">Fast</span>
        {FAST.map((x) => (
          <button key={x} type="button" onClick={() => setSpeed(x)} aria-pressed={speed === x} className={`cursor-pointer px-1.5 font-display text-[13px] font-extrabold italic ${speed === x ? 'bg-paper text-navy' : 'bg-white/12 text-white hover:bg-white/20'}`}>
            {x}×
          </button>
        ))}
      </div>
    </Section>
  );
}

/** Admin / creative mode (` key): skip time, autopilot, no cash limit, every shift open. */
export function AdminPanel() {
  const a = useAdmin();
  const screen = useGame((s) => s.screen);
  const running = useGame((s) => s.recipeId);
  if (!a.open) {
    return (
      <button
        type="button"
        onClick={() => a.set({ open: true })}
        title="Creative mode (` key)"
        aria-label="Open creative mode"
        className="pointer-events-auto absolute top-[13%] left-0 z-30 flex cursor-pointer flex-col items-center gap-1 bg-navy/90 px-1 py-2 text-pale hover:text-white"
      >
        <Wrench size={14} aria-hidden />
        <span className="font-display text-[10px] font-extrabold tracking-[0.12em] uppercase italic [writing-mode:vertical-rl]">Creative</span>
      </button>
    );
  }
  return (
    <aside className="pointer-events-auto absolute top-[13%] left-[2%] z-30 max-h-[80%] w-[260px] overflow-y-auto bg-navy/95 text-white shadow-[0_8px_20px_rgba(11,29,79,0.35)]" aria-label="Creative mode">
      <div className="flex items-center">
        <div className="flex-1">
          <PanelHead icon={<Wrench size={14} aria-hidden />} title="Creative mode" />
        </div>
        <button type="button" onClick={() => a.set({ open: false })} aria-label="Close creative mode" title="Close (` key)" className="cursor-pointer self-stretch bg-brand px-2 hover:brightness-110">
          <X size={14} aria-hidden />
        </button>
      </div>
      {screen === 'shift' && <TimeTools />}
      <Section title="Switches">
        <Toggle on={a.autopilot} onChange={(on) => a.set({ autopilot: on })} note="The good bot assigns bays, plans loads, dispatches.">
          Autopilot
        </Toggle>
        <Toggle on={a.freeCash} onChange={(on) => a.set({ freeCash: on })} note="Temp forklifts, overtime and rush papers never refused.">
          No cash limit
        </Toggle>
        <Toggle on={a.noHints} onChange={(on) => a.set({ noHints: on })} note="First-time tips stay hidden.">
          Hide hints
        </Toggle>
        <Toggle on={a.unlockAll} onChange={(on) => a.set({ unlockAll: on })} note="Play any shift without earning stars first.">
          All shifts open
        </Toggle>
      </Section>
      <Section title="Play a shift now">
        <div className="grid grid-cols-5 gap-1">
          {RECIPES.map((r) => (
            <button key={r.id} type="button" onClick={() => playShift(r.id)} title={r.name} aria-label={`Play shift ${r.no}, ${r.name}`} className={`cursor-pointer py-0.5 hover:bg-white/20 ${running === r.id && screen === 'shift' ? 'bg-hot text-navy' : 'bg-white/12'}`}>
              <Num className="text-[14px]">{r.no}</Num>
            </button>
          ))}
        </div>
        <div className="mt-2 text-right">
          <Btn tone="ghost" onClick={() => window.confirm('Reset all stars and seen hints?') && resetProgress()}>
            Reset progress
          </Btn>
        </div>
      </Section>
    </aside>
  );
}
