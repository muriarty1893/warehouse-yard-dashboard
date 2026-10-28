import { clock } from '../sim/clock';
import { basicBot, goodBot } from './bots';
import { useGame } from './store';

/** Dev only: let a test bot play the running shift up to `until` (engine seconds), through the store like a player. */
export function devPlay(bot: string, until: number) {
  const policy = bot === 'basic' ? basicBot : goodBot;
  const g = useGame.getState();
  for (let t = 0; t < until; t += 5) {
    clock.t = t;
    g.tick();
    const shift = useGame.getState().shift;
    if (!shift || shift.over) break;
    for (const a of policy(shift, t)) useGame.getState().act(a);
  }
  clock.t = until;
  useGame.getState().tick();
}
