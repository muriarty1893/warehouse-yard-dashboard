import { Lightbulb, Play, RotateCcw } from 'lucide-react';
import { useProgress } from '../../game/progress';
import { RECIPES } from '../../game/recipes';
import { useGame } from '../../game/store';
import { clockLabel } from '../../game/types';
import { fmtMoney } from './format';
import { Btn, Num, Stars } from './kit';

/** End of the shift, like a full-time scoreboard (spec §4.3): profit and stars, the money, every fine with its rule, one lesson. */
export function Report() {
  const report = useGame((s) => s.report);
  const g = useGame.getState();
  const best = useProgress((s) => (report ? s.shifts[report.recipeId]?.bestProfit : undefined));
  const isUnlocked = useProgress((s) => s.isUnlocked);
  if (!report) return null;
  const r = RECIPES.find((x) => x.id === report.recipeId)!;
  const next = RECIPES.find((x) => x.no === r.no + 1);
  const nextStar = report.stars < 3 ? (r.targets as number[])[report.stars] : null;
  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center overflow-y-auto bg-navy/60 p-6">
      <section className="w-[min(920px,94vw)]" aria-label={`Report, shift ${r.no}`}>
        <header className="flex items-center justify-between bg-navy px-5 py-2.5 text-white shadow-[0_8px_20px_rgba(0,0,0,0.3)]">
          <div>
            <div className="text-[10px] font-bold tracking-[0.12em] text-pale uppercase">Shift {r.no} · {r.name} · full time</div>
            <div className="flex items-center gap-4">
              <Num className={`text-[44px] leading-none ${report.profit < 0 ? 'text-[#ff8a80]' : ''}`}>{fmtMoney(report.profit, { sign: false })}</Num>
              <Stars n={report.stars} className="text-[28px] text-white" />
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold tracking-[0.12em] text-pale uppercase">{nextStar === null ? 'All three stars' : 'Next star'}</div>
            {nextStar !== null && <Num className="text-[21px]">{fmtMoney(nextStar - report.profit, { sign: false })} short of {'★'.repeat(report.stars + 1)}</Num>}
            {best !== undefined && <div className="text-[11px] text-pale">Best so far: {fmtMoney(best, { sign: false })}{best === report.profit ? ' · new best' : ''}</div>}
          </div>
        </header>
        <div className="grid bg-paper text-navy md:grid-cols-[1fr_1.5fr]">
          <div className="border-line px-4 py-3 md:border-r">
            <div className="text-[9px] font-bold tracking-[0.12em] text-muted uppercase">Money</div>
            <ul>
              {report.earnings.map((e) => (
                <li key={e.label} className="flex justify-between border-b border-line py-1 text-[12.5px]">
                  <span>{e.label}</span>
                  <Num className="text-[16px] text-go">{fmtMoney(e.amount)}</Num>
                </li>
              ))}
              <li className="flex justify-between border-b border-line py-1 text-[12.5px]">
                <span>Fines ({report.fines.length})</span>
                <Num className="text-[16px] text-stop">{fmtMoney(report.fines.reduce((a, f) => a + f.amount, 0))}</Num>
              </li>
              {report.spending.map((e, i) => (
                <li key={i} className="flex justify-between border-b border-line py-1 text-[12.5px]">
                  <span>{e.text}</span>
                  <Num className="text-[16px] text-stop">{fmtMoney(e.amount)}</Num>
                </li>
              ))}
              <li className="flex justify-between py-1 text-[12.5px] font-bold">
                <span>Profit</span>
                <Num className="text-[16px]">{fmtMoney(report.profit, { sign: false })}</Num>
              </li>
            </ul>
          </div>
          <div className="max-h-[42vh] overflow-y-auto px-4 py-3">
            <div className="text-[9px] font-bold tracking-[0.12em] text-muted uppercase">Fines</div>
            {!report.fines.length && <p className="text-[12px] text-muted">No fines. A clean shift.</p>}
            <ul>
              {report.fines.map((f, i) => (
                <li key={i} className="grid grid-cols-[42px_1fr_auto] items-baseline gap-2 border-b border-line py-1 text-[12px]">
                  <span className="font-semibold text-muted">{clockLabel(f.t)}</span>
                  <span>
                    {f.text}
                    <span className="block text-[10.5px] text-muted">{f.rule}</span>
                  </span>
                  <Num className="text-[15px] text-stop">{fmtMoney(f.amount)}</Num>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="m-0 flex items-start gap-2.5 border-l-[5px] border-hot bg-[#fff4ec] px-3 py-2 text-[12.5px] text-navy shadow-[0_6px_16px_rgba(0,0,0,0.2)]">
          <Lightbulb size={18} className="mt-px shrink-0 text-hot" aria-hidden />
          <span>
            <b>Lesson:</b> {report.lesson}
          </span>
        </p>
        <div className="mt-3 flex justify-end gap-2.5">
          <Btn tone="ghost" onClick={g.openCampaign}>
            Campaign
          </Btn>
          <Btn tone="paper" onClick={() => (g.openBriefing(r.id), g.startShift())}>
            <RotateCcw size={14} aria-hidden /> Retry
          </Btn>
          {next && (
            <Btn tone="hot" disabledReason={isUnlocked(next.no) ? null : 'Earn a star to unlock the next shift'} onClick={() => g.openBriefing(next.id)} autoFocus>
              <Play size={14} aria-hidden /> Next shift
            </Btn>
          )}
        </div>
      </section>
    </div>
  );
}
