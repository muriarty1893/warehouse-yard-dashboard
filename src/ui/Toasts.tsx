import { CircleCheck, CircleX, MousePointerClick, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useUi } from '../state/ui';
import { cancelPlacing, placingUnit } from './actions';
import { Kbd } from './kit';

/** Short confirmation / error messages at the bottom centre. */
export function Toasts() {
  const toast = useUi((s) => s.toast);
  const [shown, setShown] = useState(toast);
  useEffect(() => {
    setShown(toast);
    if (!toast) return;
    const id = window.setTimeout(() => setShown(null), toast.tone === 'error' ? 3800 : 2600);
    return () => window.clearTimeout(id);
  }, [toast]);
  if (!shown) return null;
  return (
    <div className="pointer-events-none absolute bottom-[244px] left-1/2 z-40 -translate-x-1/2">
      <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold shadow-[0_8px_30px_rgba(27,42,74,0.18)] ${shown.tone === 'error' ? 'bg-[#d64545] text-white' : 'bg-ink text-white'}`}>
        {shown.tone === 'error' ? <CircleX size={15} /> : <CircleCheck size={15} />}
        {shown.text}
      </div>
    </div>
  );
}

/** Banner while putting a unit down on the map. */
export function PlacementBanner() {
  const placing = useUi((s) => s.placing);
  const rotate = useUi((s) => s.rotatePlacing);
  if (!placing) return null;
  const unit = placingUnit();
  const what = placing.kind === 'move' ? `Moving ${placing.cargoId}` : `Placing new ${placing.draft.input.id}`;
  return (
    <div className="pointer-events-none absolute top-[172px] left-1/2 z-30 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink py-2 pr-2 pl-3.5 text-[12.5px] text-white shadow-[0_8px_30px_rgba(27,42,74,0.25)]">
        <MousePointerClick size={16} className="text-[#9db3f5]" />
        <span>
          <b>{what}</b>
          <span className="text-white/70">
            {' '}
            · {unit ? `${Math.round(unit.dims.l * 100)}×${Math.round(unit.dims.w * 100)} cm · ` : ''}click a free spot, or a unit to stack on it
          </span>
        </span>
        <button type="button" onClick={rotate} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 font-semibold hover:bg-white/20">
          <RotateCw size={13} /> Turn <Kbd>R</Kbd>
        </button>
        <button type="button" onClick={cancelPlacing} className="rounded-lg bg-white/10 px-2 py-1 font-semibold hover:bg-white/20">
          Cancel <Kbd>Esc</Kbd>
        </button>
      </div>
    </div>
  );
}
