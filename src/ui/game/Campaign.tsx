import { Lock, Play } from 'lucide-react';
import { useAdmin } from '../../game/admin';
import { useProgress } from '../../game/progress';
import { RECIPES } from '../../game/recipes';
import { useGame } from '../../game/store';
import { fmtMoney } from './format';
import { Num, Slant, Stars } from './kit';

/** The nine shifts, like a season's fixtures (spec §4.3). */
export function Campaign() {
  const shifts = useProgress((s) => s.shifts);
  const progressUnlocked = useProgress((s) => s.isUnlocked);
  const unlockAll = useAdmin((s) => s.unlockAll);
  const isUnlocked = (no: number) => unlockAll || progressUnlocked(no);
  const total = useProgress((s) => s.totalStars());
  const open = useGame((s) => s.openBriefing);
  const unlocked = RECIPES.filter((r) => isUnlocked(r.no));
  const next = unlocked.find((r) => !shifts[r.id]?.stars) ?? unlocked[unlocked.length - 1];
  return (
    <div className="pointer-events-auto absolute inset-0 overflow-y-auto bg-navy/60 px-[4%] py-[5%] text-white">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] font-bold tracking-[0.14em] text-pale uppercase">Docktor yard · training</div>
          <h1 className="m-0">
            <Num className="text-[34px] leading-none uppercase">Yard manager campaign</Num>
          </h1>
        </div>
        <Slant className="bg-paper px-4 py-1.5 text-navy" inner="flex items-center gap-2">
          <Stars n={1} of={1} className="text-[18px]" />
          <Num className="text-[24px]">{total} / 27</Num>
          <span className="text-[11px] font-semibold text-muted">stars</span>
        </Slant>
      </div>
      <ol className="mt-5 grid list-none grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3 p-0">
        {RECIPES.map((r) => {
          const done = shifts[r.id];
          const can = isUnlocked(r.no);
          const isNext = r.id === next?.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                disabled={!can}
                onClick={() => open(r.id)}
                className={`flex h-full min-h-[128px] w-full cursor-pointer flex-col text-left shadow-[0_6px_16px_rgba(0,0,0,0.3)] outline-offset-2 focus-visible:outline-2 focus-visible:outline-hot disabled:cursor-not-allowed ${can ? 'bg-navy/95 hover:bg-navy' : 'bg-navy/60 text-[#93a3c6]'} ${isNext ? 'outline-3 outline-hot' : ''}`}
                aria-label={`Shift ${r.no}, ${r.name}${can ? '' : ', locked'}`}
              >
                <span className={`flex items-center gap-2 px-3 py-1.5 ${isNext ? 'bg-hot text-navy' : can ? 'bg-brand' : 'bg-white/8'}`}>
                  <Num className="text-[22px] leading-none">{r.no}</Num>
                  <Num className="text-[14px] leading-tight uppercase">{r.name}</Num>
                </span>
                <span className={`flex-1 px-3 pt-1.5 text-[11.5px] ${can ? 'text-pale' : ''}`}>{r.teaches}</span>
                <span className="flex items-center justify-between px-3 pb-2 text-[12px]">
                  {!can ? (
                    <Lock size={14} aria-hidden />
                  ) : done ? (
                    <>
                      <Stars n={done.stars} className="text-[14px]" />
                      <Num className="text-[14px]">{fmtMoney(done.bestProfit, { sign: false })}</Num>
                    </>
                  ) : (
                    <>
                      <span className="bg-hot px-1.5 font-display text-[11px] font-extrabold text-navy italic">NEXT</span>
                      <span className="flex items-center gap-1 font-display font-extrabold italic">
                        <Play size={13} aria-hidden /> PLAY
                      </span>
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
