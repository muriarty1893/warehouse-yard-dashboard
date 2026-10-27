import { useEffect } from 'react';
import { useGame } from '../../game/store';

/** Moves the shift engine with the sim clock, four times a second, while a shift runs. */
export function GameClock() {
  const running = useGame((s) => s.screen === 'shift');
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => useGame.getState().tick(), 250);
    return () => window.clearInterval(id);
  }, [running]);
  return null;
}
