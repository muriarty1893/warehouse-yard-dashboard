import { useEffect } from 'react';
import { useGame } from '../../game/store';
import { fmtMoney } from './format';
import { Num } from './kit';

const LIFE_MS = 4000;

/** Money pop-ups in TV lower-third style (spec §4.2): amount, what happened, the rule. */
export function MoneyToasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  useEffect(() => {
    const timers = toasts.map((t) => window.setTimeout(() => dismiss(t.id), LIFE_MS));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);
  return (
    <ul className="flex flex-col gap-1" aria-live="polite">
      {toasts.map(({ id, entry }) => (
        <li key={id} className="slide-in slant pointer-events-auto flex items-stretch shadow-[0_6px_14px_rgba(11,29,79,0.3)]">
          <span className={`unslant grid place-items-center px-3 text-white ${entry.amount < 0 ? 'bg-stop' : 'bg-go'}`}>
            <Num className="text-[17px]">{fmtMoney(entry.amount)}</Num>
          </span>
          <span className="flex-1 bg-paper px-3 py-1 text-navy">
            <span className="unslant block">
              <span className="block text-[11.5px] font-semibold">{entry.text}</span>
              <span className="block text-[10px] text-muted">{entry.rule}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
