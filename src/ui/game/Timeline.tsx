import { CloudRain, Clock, Construction } from 'lucide-react';
import { shiftMinutes } from '../../game/types';
import { timelineRows, type Segment } from '../../game/select';
import { selectAndFocus } from '../focus';
import { useShiftView } from './hooks';
import { minuteX } from './format';
import { Num, Panel, PanelHead, Tag } from './kit';

const SEG: Record<Segment['kind'], string> = {
  plan: 'bg-white/14',
  wait: 'bg-[repeating-linear-gradient(-45deg,#ff6b1a_0_4px,#c24f10_4px_8px)]',
  dock: 'bg-brand',
  late: 'bg-stop',
};
const LABEL: Partial<Record<Segment['kind'], string>> = { wait: 'WAIT', late: 'LATE' };

/**
 * Every truck of the shift as a bar against the clock (spec §4.2, layout 3):
 * striped while it waits at the gate, blue while docked, red once late, a
 * white tick at its deadline. Click a row to select the truck.
 */
export function Timeline() {
  const v = useShiftView((s, t) => {
    const endMin = shiftMinutes(s.end);
    const markers = s.recipe.incidents.flatMap((inc): { min: number; icon: 'rain' | 'bay'; label: string }[] =>
      inc.kind === 'rain' ? [{ min: inc.atMin, icon: 'rain', label: 'Rain' }] : inc.kind === 'bayClosed' ? [{ min: inc.fromMin, icon: 'bay', label: `${inc.bayId} closed` }] : [],
    );
    return { rows: timelineRows(s, t), endMin, now: shiftMinutes(t), hours: Math.ceil(endMin / 60), markers };
  });
  if (!v) return null;
  const x = (min: number) => `${minuteX(min, v.endMin)}%`;
  return (
    <Panel label="Today's trucks" className="pb-1">
      <PanelHead icon={<Clock size={13} />} title="Today's trucks" count={v.rows.length} />
      <div className="relative">
        <div className="relative mr-2 ml-[86px] h-4 border-b border-white/15">
          {Array.from({ length: v.hours + 1 }, (_, h) => (
            <span key={h} className="absolute top-0.5 -translate-x-1/2 text-[9px] text-pale" style={{ left: x(h * 60) }}>
              {String(6 + h).padStart(2, '0')}
            </span>
          ))}
          {v.markers.map((m) => (
            <span key={m.label + m.min} className="absolute -top-0.5 flex items-center gap-0.5 text-[9px] font-bold text-hot" style={{ left: x(m.min) }} title={m.label}>
              {m.icon === 'rain' ? <CloudRain size={11} /> : <Construction size={11} />}
            </span>
          ))}
        </div>
        <ul>
          {v.rows.map((r) => (
            <li key={r.truckId}>
              <button
                type="button"
                disabled={!r.selectable}
                onClick={() => selectAndFocus({ kind: 'truck', id: r.truckId })}
                className="flex h-[17px] w-full cursor-pointer items-center text-left hover:bg-white/8 disabled:cursor-default"
                aria-label={`${r.truckId}${r.deadlineMin !== null ? ', has a deadline' : ''}`}
              >
                <span className="flex w-[86px] shrink-0 items-center gap-1.5 pl-2">
                  <Tag tone={r.kind === 'inbound' ? 'in' : 'out'}>{r.kind === 'inbound' ? 'IN' : 'OUT'}</Tag>
                  <Num className="text-[11px]">{r.truckId.replace('TRUCK-', '')}</Num>
                </span>
                <span className="relative mr-2 h-full flex-1">
                  {r.segments.map((sg, i) => (
                    <span key={i} className={`absolute top-[3px] h-[11px] overflow-hidden ${SEG[sg.kind]}`} style={{ left: x(sg.from), width: `max(2px, ${minuteX(sg.to, v.endMin) - minuteX(sg.from, v.endMin)}%)` }}>
                      {LABEL[sg.kind] && sg.to - sg.from > 25 && <span className="absolute inset-0 pl-1 font-display text-[9px] leading-[11px] font-extrabold italic text-white">{LABEL[sg.kind]}</span>}
                    </span>
                  ))}
                  {r.deadlineMin !== null && <span className="absolute top-px h-[15px] w-[2px] bg-white" style={{ left: x(r.deadlineMin) }} title="Deadline" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <span className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-hot shadow-[0_0_6px_#ff6b1a]" style={{ left: `calc(86px + (100% - 94px) * ${minuteX(v.now, v.endMin) / 100})` }} />
      </div>
    </Panel>
  );
}
