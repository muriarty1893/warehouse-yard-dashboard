import { useEffect } from 'react';
import { useGame } from '../../game/store';
import { useSim } from '../../sim/clock';
import { useView } from '../../state/view';
import { Dialogs } from '../Dialog';
import { PlannerDashboard } from '../planner/PlannerDashboard';
import { Briefing } from './Briefing';
import { CameraStrip } from './CameraStrip';
import { Campaign } from './Campaign';
import { CrewQueue } from './CrewQueue';
import { Hint } from './Hint';
import { keyAction } from './keys';
import { MoneyToasts } from './MoneyToasts';
import { Notices } from './Notices';
import { PapersPanel } from './PapersPanel';
import { PauseMenu } from './PauseMenu';
import { Report } from './Report';
import { Scoreboard } from './Scoreboard';
import { SelectionCard } from './SelectionCard';
import { SpendBar } from './SpendBar';
import { Timeline } from './Timeline';
import { WorldTags } from './WorldTags';

/** Game keys: 1 / 2 / 3 speed; Esc closes the planner, else pauses (spec §4.4). */
function useGameKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const a = keyAction(e);
      const g = useGame.getState();
      if (!a || g.screen !== 'shift') return;
      if (a === 'pause') {
        const view = useView.getState();
        if (view.planner) view.closePlanner();
        else g.setPaused(!g.paused);
        return;
      }
      if (g.paused) return;
      useSim.getState().setSpeed(a === 'speed1' ? 1 : a === 'speed2' ? 2 : 4);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);
}

/** The shift HUD (spec §4.2, layout 3): scoreboard on top, truck timeline along the bottom, crew/papers/spending on the right. */
function Hud() {
  return (
    <>
      <WorldTags />
      <SelectionCard />
      <div className="absolute inset-x-[2%] top-[2.5%] z-20">
        <Scoreboard />
      </div>
      <div className="absolute top-[13%] left-[2%] z-20 w-[min(30%,440px)]">
        <MoneyToasts />
      </div>
      <div className="absolute top-[13%] right-[2%] bottom-[3%] z-10 flex w-[24%] min-w-[280px] flex-col gap-1.5 overflow-y-auto">
        <CrewQueue />
        <PapersPanel />
        <SpendBar />
      </div>
      <div className="absolute right-[28%] bottom-[3%] left-[2%] z-10 flex flex-col gap-1.5">
        <Notices />
        <Timeline />
      </div>
      <div className="pointer-events-auto absolute top-1/2 left-[2%] z-10 -translate-y-1/2">
        <CameraStrip />
      </div>
      <Hint />
    </>
  );
}

/** Everything over the 3D yard while the game runs (spec §4): the planner when it is open, else the HUD. */
export function GameRoot() {
  useGameKeys();
  const planner = useView((s) => s.planner);
  const screen = useGame((s) => s.screen);
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-navy">
      {screen === 'shift' && (planner ? <PlannerDashboard truckId={planner.truckId} /> : <Hud />)}
      {screen === 'campaign' && <Campaign />}
      {screen === 'briefing' && <Briefing />}
      {screen === 'report' && <Report />}
      <Dialogs />
      <PauseMenu />
    </div>
  );
}
