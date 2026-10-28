import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { clock } from '../sim/clock';
import { goodBot } from './bots';
import { safeStorage, useProgress } from './progress';
import { adminFlags, onTick, useGame } from './store';

/**
 * Admin / creative mode: tools to look around the game without playing it.
 * Skip time, let the good bot play, spend without a cash limit, hide the
 * hints, open every shift. Kept in the browser like the campaign.
 */

interface AdminState {
  /** The panel is showing. */
  open: boolean;
  /** Every shift can be played, stars or not. */
  unlockAll: boolean;
  /** Spending is never refused for lack of cash (it is still booked). */
  freeCash: boolean;
  /** The good test bot makes the decisions. */
  autopilot: boolean;
  /** First-time hints don't show. */
  noHints: boolean;
  set: (p: Partial<Omit<AdminState, 'set'>>) => void;
}

export const useAdmin = create<AdminState>()(
  persist(
    (set) => ({
      open: false,
      unlockAll: false,
      freeCash: false,
      autopilot: false,
      noHints: false,
      set: (p) => set(p),
    }),
    {
      name: 'docktor.admin',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ open: s.open, unlockAll: s.unlockAll, freeCash: s.freeCash, autopilot: s.autopilot, noHints: s.noHints }),
    },
  ),
);

function syncFlags(s: AdminState) {
  adminFlags.noHints = s.noHints;
  adminFlags.freeCash = s.freeCash;
}
syncFlags(useAdmin.getState());
useAdmin.subscribe(syncFlags);

/** How often (sim seconds) the autopilot looks at the yard, as the bots do in the balance runs. */
const BOT_STEP = 5;
let botAt = -Infinity;

/** One autopilot look: the good bot's decisions, through the store like a player's. */
function botTurn() {
  const s = useGame.getState().shift;
  if (!s || s.over) return;
  botAt = clock.t;
  for (const a of goodBot(s, clock.t)) useGame.getState().act(a);
}

onTick(() => {
  const g = useGame.getState();
  if (!useAdmin.getState().autopilot || !g.shift || g.shift.over || g.paused) return;
  if (clock.t < botAt) botAt = -Infinity; // a restarted shift
  if (clock.t - botAt >= BOT_STEP) botTurn();
});

/** Jump the running shift to engine time `t` (at most its end). With the autopilot on, it plays the skipped time. */
export function skipTo(t: number) {
  const g = useGame.getState();
  const s = g.shift;
  if (!s || s.over || g.screen !== 'shift') return;
  const autopilot = useAdmin.getState().autopilot;
  for (let at = clock.t; autopilot && at < Math.min(t, s.end); at += BOT_STEP) {
    // Each tick gives the autopilot its turn (onTick above).
    clock.t = at;
    g.tick();
    if (s.over) return;
  }
  clock.t = Math.max(clock.t, Math.min(t, s.end));
  g.tick();
}

/** Start any shift straight away, past the briefing. */
export function playShift(recipeId: string) {
  const g = useGame.getState();
  g.openBriefing(recipeId);
  g.startShift();
}

export const resetProgress = () => useProgress.getState().reset();
