import { CloudRain, Info, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { atRisk } from '../../game/incidents';
import { rainMoveAction } from '../../game/select';
import { useGame } from '../../game/store';
import { useUi } from '../../state/ui';
import { act, useShiftView } from './hooks';
import { Btn } from './kit';

const LIFE_MS = 8000;

/**
 * Warnings and news from the shift (rain, breakdowns, rush orders) and the
 * planner's messages, as a strip above the timeline. The rain warning carries
 * the one-click "Move under cover".
 */
export function Notices() {
  const notices = useGame((s) => s.notices);
  const dismiss = useGame((s) => s.dismissNotice);
  const toast = useUi((s) => s.toast);
  // Cheap check per tick; the move itself (a spot search) is only worked out on click.
  const atRiskNow = useShiftView((s) => atRisk(s).length) ?? 0;
  useEffect(() => {
    const timers = notices.map((n) => window.setTimeout(() => dismiss(n.id), LIFE_MS));
    return () => timers.forEach(clearTimeout);
  }, [notices, dismiss]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => useUi.setState({ toast: null }), LIFE_MS);
    return () => clearTimeout(id);
  }, [toast]);
  return (
    <ul className="flex flex-col items-start gap-1" aria-live="polite">
      {toast && (
        <li className={`slide-in pointer-events-auto flex items-center gap-2 px-3 py-1 text-[12px] font-semibold shadow-[0_6px_14px_rgba(11,29,79,0.3)] ${toast.tone === 'error' ? 'bg-stop text-white' : 'bg-paper text-navy'}`}>
          <Info size={13} aria-hidden /> {toast.text}
        </li>
      )}
      {notices.map((n) => (
        <li key={n.id} className={`slide-in pointer-events-auto flex items-center gap-2 px-3 py-1 text-[12px] font-semibold shadow-[0_6px_14px_rgba(11,29,79,0.3)] ${n.tone === 'warn' ? 'bg-hot text-navy' : 'bg-paper text-navy'}`}>
          {n.text.startsWith('Rain') ? <CloudRain size={14} aria-hidden /> : n.tone === 'warn' ? <TriangleAlert size={14} aria-hidden /> : <Info size={13} aria-hidden />}
          {n.text}
          {n.text.startsWith('Rain at') && (
            <Btn
              tone="paper"
              className="ml-1 !py-0"
              disabledReason={atRiskNow ? null : 'Nothing left out in the open'}
              onClick={() => {
                const shift = useGame.getState().shift;
                const move = shift && rainMoveAction(shift);
                if (move) act(move);
                else useUi.getState().notify('No covered space left for them', 'error');
              }}
            >
              Move under cover
            </Btn>
          )}
        </li>
      ))}
    </ul>
  );
}
