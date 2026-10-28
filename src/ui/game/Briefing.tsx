import { ArrowLeft, Play } from 'lucide-react';
import { recipeById } from '../../game/recipes';
import { briefingRows } from '../../game/select';
import { SHIFT_LENGTH_MIN } from '../../game/types';
import { useGame } from '../../game/store';
import { fmtMoney, minuteX } from './format';
import { Btn, Num, Slant, Stars, Tag } from './kit';

/** Before every shift (spec §4.3): what's new, the rule, the day's trucks, the targets and the budget. */
export function Briefing() {
  const id = useGame((s) => s.recipeId);
  const start = useGame((s) => s.startShift);
  const back = useGame((s) => s.openCampaign);
  if (!id) return null;
  const r = recipeById(id);
  const rows = briefingRows(r);
  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center overflow-y-auto bg-navy/60 p-6">
      <section className="w-[min(860px,94vw)] bg-paper text-navy shadow-[0_10px_30px_rgba(0,0,0,0.35)]" aria-label={`Briefing, shift ${r.no}`}>
        <header className="flex items-center gap-4 bg-navy px-5 py-3 text-white">
          <Slant className="bg-hot px-2.5 text-navy">
            <Num className="text-[24px]">{r.no}</Num>
          </Slant>
          <div>
            <div className="text-[10px] font-bold tracking-[0.12em] text-pale uppercase">Shift {r.no} of 9 · 06:00 – 14:00</div>
            <Num className="text-[28px] leading-none uppercase">{r.name}</Num>
          </div>
          <div className="ml-auto flex gap-2">
            <Btn tone="ghost" onClick={back}>
              <ArrowLeft size={14} aria-hidden /> Campaign
            </Btn>
            <Btn tone="hot" onClick={start} autoFocus>
              <Play size={14} aria-hidden /> Start shift
            </Btn>
          </div>
        </header>
        <div className="grid gap-5 p-5 md:grid-cols-[1.25fr_1fr]">
          <div>
            <div className="border-l-[5px] border-hot bg-[#fff4ec] px-3 py-2">
              <Num className="text-[15px] uppercase">{r.briefing.newTitle}</Num>
              <p className="mt-1 text-[12.5px] leading-snug text-muted">{r.briefing.newText}</p>
            </div>
            <div className="mt-2.5 border-l-[5px] border-brand bg-[#eef2fe] px-3 py-2">
              <Num className="text-[15px] uppercase">The rule</Num>
              <p className="mt-1 text-[12.5px] leading-snug text-muted">{r.briefing.rule}</p>
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold tracking-[0.12em] text-muted uppercase">Today's trucks</div>
            <ul className="mt-1">
              {rows.map((t) => (
                <li key={t.id} className="flex h-[17px] items-center gap-2 text-[11px] font-bold">
                  <Tag tone={t.kind === 'inbound' ? 'in' : 'out'}>{t.kind === 'inbound' ? 'IN' : 'OUT'}</Tag>
                  <span className="w-7">{t.id.replace('TRUCK-', '')}</span>
                  <span className="relative h-[7px] flex-1 bg-[#eef1f7]">
                    <span className={`absolute top-0 h-full ${t.kind === 'inbound' ? 'bg-brand' : 'bg-go'}`} style={{ left: `${minuteX(t.fromMin, SHIFT_LENGTH_MIN)}%`, width: `${minuteX(t.toMin, SHIFT_LENGTH_MIN) - minuteX(t.fromMin, SHIFT_LENGTH_MIN)}%` }} />
                    {t.deadlineMin !== null && <span className="absolute -top-[3px] h-[13px] w-[2px] bg-navy" style={{ left: `${minuteX(t.deadlineMin, SHIFT_LENGTH_MIN)}%` }} />}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-[9px] font-bold tracking-[0.12em] text-muted uppercase">Profit targets</div>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {r.targets.map((x, i) => (
                <Slant key={i} className="bg-navy py-1 text-center text-white">
                  <Stars n={i + 1} of={i + 1} className="justify-center text-[12px]" />
                  <Num className="block text-[18px]">{fmtMoney(x, { sign: false })}</Num>
                </Slant>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-muted">
              Budget for emergencies: <b className="text-navy">{fmtMoney(r.budget, { sign: false })}</b> · {r.bays.length} bays · {r.forklifts.length} forklifts
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
