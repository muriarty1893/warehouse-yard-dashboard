import { useState } from 'react';
import { HINTS } from '../../game/recipes';
import { useGame } from '../../game/store';
import { clockLabel } from '../../game/types';
import { clock } from '../../sim/clock';
import { Btn, Num } from './kit';

/** The rules of the game in one list (the hints' texts). */
function HowToPlay({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-[min(560px,92vw)] text-left">
      <Num className="text-[26px] uppercase">How to play</Num>
      <ul className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto pr-2">
        {Object.values(HINTS).map((h) => (
          <li key={h.title} className="border-l-[4px] border-hot bg-white/8 px-3 py-1.5">
            <Num className="text-[14px] uppercase">{h.title}</Num>
            <p className="m-0 text-[12.5px] leading-snug text-pale">{h.text}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 text-right">
        <Btn tone="hot" onClick={onBack} autoFocus>
          Back
        </Btn>
      </div>
    </div>
  );
}

/** Esc: the yard is covered while paused, so pausing can't be used to plan (spec §1.1). */
export function PauseMenu() {
  const g = useGame();
  const [help, setHelp] = useState(false);
  if (!g.paused || g.screen !== 'shift' || !g.shift) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-navy text-white" role="dialog" aria-label="Paused">
      {help ? (
        <HowToPlay onBack={() => setHelp(false)} />
      ) : (
        <div className="flex w-[300px] flex-col items-stretch gap-2.5 text-center">
          <div className="text-[10px] font-bold tracking-[0.14em] text-pale uppercase">
            Shift {g.shift.recipe.no} · {clockLabel(clock.t)}
          </div>
          <Num className="text-[44px] leading-none uppercase">Paused</Num>
          <Btn tone="hot" className="justify-center !py-2" onClick={() => g.setPaused(false)} autoFocus>
            Resume
          </Btn>
          <Btn tone="paper" className="justify-center !py-2" onClick={g.restart}>
            Restart shift
          </Btn>
          <Btn tone="ghost" className="justify-center !py-2" onClick={() => setHelp(true)}>
            How to play
          </Btn>
          <Btn tone="ghost" className="justify-center !py-2" onClick={g.openCampaign}>
            Quit to campaign
          </Btn>
        </div>
      )}
    </div>
  );
}
