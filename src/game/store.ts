import { create } from 'zustand';
import { bayById } from '../config/devYard';
import { setPlanSource, useLoading } from '../loading/store';
import { useView } from '../state/view';
import { clock, useSim } from '../sim/clock';
import { useUi } from '../state/ui';
import { act, advance } from './engine';
import { newShift } from './generate';
import { planningCargo, planTrucks } from './planning';
import { useProgress } from './progress';
import { recipeById } from './recipes';
import { buildReport, type Report } from './report';
import type { Action, ActionResult, GameEvent, HintKey, LedgerEntry, ShiftState } from './types';

/**
 * The bridge between the shift engine and the app (spec §3.1 store.ts):
 * which screen is up, the running shift, and what the HUD shows from its
 * events. The engine moves with the sim clock through `tick`.
 */

export type Screen = 'campaign' | 'briefing' | 'shift' | 'report';

interface GameStore {
  screen: Screen;
  recipeId: string | null;
  shift: ShiftState | null;
  /** Bumped on every change, so views re-read the (mutable) shift. */
  version: number;
  toasts: { id: number; entry: LedgerEntry }[];
  notices: { id: number; text: string; tone: 'info' | 'warn' }[];
  hint: HintKey | null;
  report: Report | null;
  paused: boolean;
  openCampaign: () => void;
  openBriefing: (recipeId: string) => void;
  startShift: () => void;
  restart: () => void;
  act: (a: Action) => ActionResult;
  tick: () => void;
  setPaused: (p: boolean) => void;
  dismissHint: () => void;
  dismissToast: (id: number) => void;
  dismissNotice: (id: number) => void;
}

const MAX_TOASTS = 3;
let serial = 0;
/** Small, frequent earnings that would flood the toasts; they show in the profit. */
const QUIET = new Set(['handling']);

/** Shift-start hooks set by other modules. */
const onStart: (() => void)[] = [];
export const onShiftStart = (fn: () => void) => onStart.push(fn);

/** What the planner depends on: the plannable trucks and the free cargo. A change re-plans the drafts. */
let planKey = '';
function planInputs(s: ShiftState) {
  return planTrucks(s).map((t) => t.id).join(',') + '|' + planningCargo(s).map((c) => `${c.id}:${c.x}:${c.y}:${c.on ?? ''}`).join(';');
}
function syncPlanner(s: ShiftState | null) {
  const key = s ? planInputs(s) : '';
  if (key === planKey) return;
  planKey = key;
  useLoading.getState().replan();
  // A planner open on a truck that can no longer be planned closes.
  const open = useView.getState().planner?.truckId;
  if (open && !useLoading.getState().trucks[open]) useView.getState().closePlanner();
}

export const useGame = create<GameStore>((set, get) => {
  /** Fold engine events into the HUD state. */
  function take(events: GameEvent[]) {
    const s = get();
    let { toasts, notices, hint, report, screen } = s;
    for (const e of events) {
      if (e.kind === 'money' && e.entry.amount !== 0 && !QUIET.has(e.entry.kind)) toasts = [{ id: ++serial, entry: e.entry }, ...toasts].slice(0, MAX_TOASTS);
      else if (e.kind === 'notice') notices = [{ id: ++serial, text: e.text, tone: e.tone }, ...notices].slice(0, 3);
      else if (e.kind === 'hint' && !hint && !useProgress.getState().hintsSeen.includes(e.key)) {
        hint = e.key;
        useProgress.getState().seeHint(e.key);
      } else if (e.kind === 'over' && s.shift) {
        report = buildReport(s.shift);
        useProgress.getState().record(s.shift.recipe.id, report.profit, report.stars);
        screen = 'report';
        clock.speed = 0;
      }
    }
    set({ toasts, notices, hint, report, screen, version: s.version + 1 });
    syncPlanner(get().shift);
  }

  return {
    screen: 'campaign',
    recipeId: null,
    shift: null,
    version: 0,
    toasts: [],
    notices: [],
    hint: null,
    report: null,
    paused: false,
    openCampaign: () => {
      clock.speed = 0;
      set({ screen: 'campaign', shift: null, report: null, toasts: [], notices: [], hint: null, paused: false });
    },
    openBriefing: (recipeId) => set({ screen: 'briefing', recipeId, report: null }),
    startShift: () => {
      const id = get().recipeId;
      if (!id) return;
      const shift = newShift(recipeById(id));
      clock.t = 0;
      useSim.getState().setSpeed(1);
      useUi.getState().select(null);
      set({ screen: 'shift', shift, toasts: [], notices: [], hint: null, report: null, paused: false, version: get().version + 1 });
      useView.getState().closePlanner();
      planKey = planInputs(shift);
      useLoading.getState().resetAll();
      for (const fn of onStart) fn();
      get().tick();
    },
    restart: () => get().startShift(),
    act: (a) => {
      const shift = get().shift;
      if (!shift || get().screen !== 'shift') return { ok: false, reason: 'No shift running' };
      const events: GameEvent[] = [];
      const r = act(shift, a, clock.t, events);
      take(events);
      return r;
    },
    tick: () => {
      const { shift, screen } = get();
      if (!shift || screen !== 'shift') return;
      take(advance(shift, clock.t));
    },
    setPaused: (p) => {
      clock.speed = p ? 0 : useSim.getState().speed;
      useSim.setState({ paused: p });
      set({ paused: p });
    },
    dismissHint: () => set({ hint: null }),
    dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
    dismissNotice: (id) => set({ notices: get().notices.filter((x) => x.id !== id) }),
  };
});

// The load planner plans for the running shift.
const current = () => useGame.getState().shift;
setPlanSource({
  trucks: () => {
    const s = current();
    return s ? planTrucks(s) : [];
  },
  cargo: () => {
    const s = current();
    return s ? planningCargo(s) : [];
  },
  bayOf: (id) => {
    const tr = current()?.trucks.find((t) => t.id === id);
    return tr?.bayId && (tr.stage === 'docking' || tr.stage === 'docked') ? bayById(tr.bayId) : null;
  },
  papersMissing: (id) => current()?.cargo.find((c) => c.id === id)?.papers === 'missing',
  onConfirm: (truckId, plan) => useGame.getState().act({ kind: 'confirmPlan', truckId, plan }),
});
