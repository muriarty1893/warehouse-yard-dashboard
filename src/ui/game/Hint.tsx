import { Lightbulb } from 'lucide-react';
import { HINTS } from '../../game/recipes';
import { useGame } from '../../game/store';
import { Btn, Num } from './kit';

/** Where each hint points from: next to the panel it is about. */
const PLACE: Record<(typeof HINTS)[keyof typeof HINTS]['anchor'], string> = {
  timeline: 'left-[4%] bottom-[30%]',
  crew: 'right-[27%] top-[14%]',
  papers: 'right-[27%] top-[34%]',
  spend: 'right-[27%] top-[46%]',
  selection: 'left-1/2 top-[14%] -translate-x-1/2',
};

/** A first-time hint (spec §2): what to do with the mechanic that just showed up. Seen once, remembered. */
export function Hint() {
  const key = useGame((s) => s.hint);
  const dismiss = useGame((s) => s.dismissHint);
  if (!key) return null;
  const h = HINTS[key];
  return (
    <aside className={`slide-in pointer-events-auto absolute z-30 w-[300px] border-l-[5px] border-hot bg-paper p-3 text-navy shadow-[0_8px_20px_rgba(11,29,79,0.35)] ${PLACE[h.anchor]}`} role="status">
      <div className="flex items-center gap-2">
        <Lightbulb size={16} className="text-hot" aria-hidden />
        <Num className="text-[15px] uppercase">{h.title}</Num>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted">{h.text}</p>
      <div className="mt-2 text-right">
        <Btn tone="hot" onClick={dismiss} autoFocus>
          Got it
        </Btn>
      </div>
    </aside>
  );
}
