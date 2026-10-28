import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { has } from '../../game/incidents';
import { papersView } from '../../game/select';
import { act, useShiftView } from './hooks';
import { fmtMoney } from './format';
import { Btn, Panel, PanelHead } from './kit';

/** The clerk's queue of missing papers (spec §1.5): reorder, or rush one. Shown from shift 4. */
export function PapersPanel() {
  const v = useShiftView((s, t) => (has(s, 'papers') ? { rows: papersView(s, t), price: s.prices.rushPapers, working: s.papers.startedAt !== null } : null));
  if (!v) return null;
  return (
    <Panel label="Papers">
      <PanelHead icon={<FileText size={13} />} title="Papers" count={v.rows.length} />
      {!v.rows.length && <p className="px-2.5 py-2 text-[11px] text-pale">All papers complete.</p>}
      <ol>
        {v.rows.map((r, i) => (
          <li key={r.unitId} className="flex items-center gap-2 border-t border-white/8 px-2.5 py-1 first:border-0">
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[11.5px] font-bold">{r.unitId}</span>
              <span className="block text-[10px] text-pale">{r.minutesLeft !== null ? `clerk · ${r.minutesLeft} min left` : `${i + (v.working ? 0 : 1)} ahead`}</span>
            </span>
            {i > (v.working ? 1 : 0) && (
              <button type="button" className="grid h-4 w-4 cursor-pointer place-items-center bg-white/12 hover:bg-white/25" onClick={() => act({ kind: 'reorder', queue: 'papers', id: r.unitId, to: i - 1 })} aria-label={`Move ${r.unitId} up`}>
                <ChevronUp size={11} />
              </button>
            )}
            {i > 0 && i < v.rows.length - 1 && (
              <button type="button" className="grid h-4 w-4 cursor-pointer place-items-center bg-white/12 hover:bg-white/25" onClick={() => act({ kind: 'reorder', queue: 'papers', id: r.unitId, to: i + 1 })} aria-label={`Move ${r.unitId} down`}>
                <ChevronDown size={11} />
              </button>
            )}
            <Btn tone="paper" className="!px-2 !py-0" disabledReason={r.rush.ok ? null : r.rush.reason} onClick={() => act({ kind: 'rushPapers', unitId: r.unitId })}>
              Rush <span className="font-sans text-[10px] font-semibold not-italic">{fmtMoney(v.price, { sign: false })}</span>
            </Btn>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
