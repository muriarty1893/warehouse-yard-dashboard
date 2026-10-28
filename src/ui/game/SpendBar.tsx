import { validate } from '../../game/engine';
import { has } from '../../game/incidents';
import { cash } from '../../game/ledger';
import { act, useShiftView } from './hooks';
import { fmtMoney } from './format';
import { Btn, Num } from './kit';

/** Ways out of trouble, paid from the shift's budget (spec §1.7). Each appears from the shift that teaches it. */
export function SpendBar() {
  const v = useShiftView((s, t) => ({
    cash: cash(s, t),
    temp: has(s, 'tempForklift') ? { price: s.prices.tempForkliftPerHour, r: validate(s, { kind: 'rentForklift', hours: 1 }, t) } : null,
    overtime: has(s, 'overtime') ? { price: s.prices.overtime, r: validate(s, { kind: 'overtime' }, t) } : null,
  }));
  if (!v || (!v.temp && !v.overtime)) return null;
  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
      <span className="mr-auto bg-navy/90 px-2 py-0.5 text-[10.5px] font-semibold text-pale">
        Cash <Num className="text-[13px] text-white">{fmtMoney(v.cash, { sign: false })}</Num>
      </span>
      {v.temp && (
        <Btn tone="brand" disabledReason={v.temp.r.ok ? null : v.temp.r.reason} onClick={() => act({ kind: 'rentForklift', hours: 1 })}>
          Temp forklift <span className="font-sans text-[10px] font-semibold not-italic opacity-90">{fmtMoney(v.temp.price, { sign: false })}/h</span>
        </Btn>
      )}
      {v.overtime && (
        <Btn tone="brand" disabledReason={v.overtime.r.ok ? null : v.overtime.r.reason} onClick={() => act({ kind: 'overtime' })}>
          Overtime <span className="font-sans text-[10px] font-semibold not-italic opacity-90">{fmtMoney(v.overtime.price, { sign: false })}</span>
        </Btn>
      )}
    </div>
  );
}
