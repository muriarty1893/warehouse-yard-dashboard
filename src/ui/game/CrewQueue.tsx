import { ChevronDown, ChevronUp, Forklift, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { has } from '../../game/incidents';
import { crewView } from '../../game/select';
import { act, useShiftView } from './hooks';
import { Num, Panel, PanelHead, Tag } from './kit';

/**
 * The crew's job queue (spec §1.4): the crew works from the top. With the
 * queue mechanic on, groups move by drag or by the up/down buttons.
 */
export function CrewQueue() {
  const v = useShiftView((s, t) => ({ groups: crewView(s, t), order: s.groups.map((g) => g.id), canMove: has(s, 'queue'), busy: s.forklifts.filter((f) => f.jobId).length, total: s.forklifts.length }));
  const [drag, setDrag] = useState<string | null>(null);
  if (!v) return null;
  /** Move a group to where another visible group stands now. */
  const moveTo = (id: string, target: string | undefined) => target && act({ kind: 'reorder', queue: 'crew', id, to: v.order.indexOf(target) });
  return (
    <Panel label="Crew queue">
      <PanelHead icon={<Forklift size={13} />} title="Crew queue" count={`${v.busy}/${v.total} busy`} />
      {!v.groups.length && <p className="px-2.5 py-2 text-[11px] text-pale">No jobs. Forklifts wait on the loading strip.</p>}
      <ol>
        {v.groups.map((g, i) => (
          <li
            key={g.id}
            draggable={v.canMove}
            onDragStart={() => setDrag(g.id)}
            onDragOver={(e) => v.canMove && e.preventDefault()}
            onDrop={() => {
              if (drag && drag !== g.id) moveTo(drag, g.id);
              setDrag(null);
            }}
            className={`flex items-center gap-2 border-t border-white/8 px-2.5 py-1 first:border-0 ${drag === g.id ? 'opacity-40' : ''}`}
          >
            <Num className="w-3 text-[13px] text-hot">{g.rank}</Num>
            <Tag tone={g.tag === 'LOAD' ? 'out' : g.tag === 'UNLOAD' ? 'in' : 'move'}>{g.tag}</Tag>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[11.5px] font-bold">{g.label.replace(/^(Load|Unload|Move) /, '')}</span>
              <span className="block truncate text-[10px] text-pale">
                {g.done}/{g.total} done{g.forklifts.length ? ` · ${g.forklifts.join(', ')}` : ''}
              </span>
              {g.blocked && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-hot">
                  <TriangleAlert size={10} aria-hidden /> {g.blocked}
                </span>
              )}
            </span>
            {v.canMove && (
              <span className="flex flex-col gap-px">
                <button type="button" className="grid h-[11px] w-4 cursor-pointer place-items-center bg-white/12 hover:bg-white/25 disabled:opacity-30" disabled={i === 0} onClick={() => moveTo(g.id, v.groups[i - 1]?.id)} aria-label={`Move ${g.label} up`}>
                  <ChevronUp size={10} />
                </button>
                <button type="button" className="grid h-[11px] w-4 cursor-pointer place-items-center bg-white/12 hover:bg-white/25 disabled:opacity-30" disabled={i === v.groups.length - 1} onClick={() => moveTo(g.id, v.groups[i + 1]?.id)} aria-label={`Move ${g.label} down`}>
                  <ChevronDown size={10} />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
