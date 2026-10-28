import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { devYard } from '../../config/devYard';
import { validate } from '../../game/engine';
import { has } from '../../game/incidents';
import { motionOf } from '../../game/motion';
import { areaInfo, truckView } from '../../game/select';
import { useGame } from '../../game/store';
import type { ActionResult, ShiftState } from '../../game/types';
import { yardToWorld } from '../../scene/kit';
import { track } from '../../scene/game/Projector';
import { clock } from '../../sim/clock';
import { newPose } from '../../sim/route';
import { useUi, type EntityRef } from '../../state/ui';
import { useView } from '../../state/view';
import { baseHeight } from '../../world/placement';
import { cardPlacement } from './anchor';
import { act, useShiftView } from './hooks';
import { Btn, Chip, Num, Tag } from './kit';
import { fmtMoney } from './format';

/** Parts of the screen the card keeps clear of: scoreboard, timeline, right column. */
const AVOID = { top: 76, bottomShare: 0.26, rightShare: 0.27 };
const pose = newPose();

/** Where the selected thing is in the world, at the clock time. */
function anchorOf(ref: EntityRef): () => [number, number, number] | null {
  return () => {
    const s = useGame.getState().shift;
    if (!s) return null;
    if (ref.kind === 'truck') {
      const tr = s.trucks.find((t) => t.id === ref.id);
      if (!tr || tr.stage === 'scheduled' || tr.stage === 'gone') return null;
      motionOf(tr, clock.t, pose);
      return pose.visible ? yardToWorld(pose.x, pose.y, 4.2) : null;
    }
    if (ref.kind === 'cargo') {
      const c = s.cargo.find((u) => u.id === ref.id);
      if (!c || c.gone || c.loadedOn) return null;
      return yardToWorld(c.x, c.y, baseHeight(s.cargo, c) + c.dims.h + 0.3);
    }
    return null;
  };
}

const why = (r: ActionResult) => (r.ok ? null : r.reason);

function TruckBody({ id }: { id: string }) {
  const v = useShiftView((s, t) => ({ view: truckView(s, id, t), areas: areaInfo(s), queue: has(s, 'queue'), loose: looseEnds(s, id) }));
  const [sure, setSure] = useState(false);
  if (!v?.view) return null;
  const { view } = v;
  const bays = view.actions.filter((a) => a.action.kind === 'assignBay');
  const areas = view.actions.filter((a) => a.action.kind === 'chooseArea');
  const dispatch = view.actions.find((a) => a.action.kind === 'dispatch');
  const urgent = view.actions.find((a) => a.action.kind === 'urgent');
  const canPlan = view.kind === 'outbound' && view.stage === 'docked' && view.stageLabel.endsWith('plan the load');
  return (
    <>
      <div className="flex items-center gap-2 bg-navy py-1 pr-7 pl-2.5 text-white">
        <Tag tone={view.kind === 'inbound' ? 'in' : 'out'}>{view.kind === 'inbound' ? 'IN' : 'OUT'}</Tag>
        <Num className="text-[15px]">{id}</Num>
        {view.rush && <Tag tone="new">RUSH</Tag>}
        {view.fee && (
          <Chip tone="bad" className="ml-auto">
            <AlertTriangle size={10} aria-hidden /> €{view.fee.perMin}/min · {fmtMoney(view.fee.total)}
          </Chip>
        )}
      </div>
      <div className="px-2.5 pt-1.5 pb-2">
        <div className="text-[11px] text-muted">
          {view.stageLabel}
          {view.stops.length > 0 && ` · ${view.stops.join(' → ')}`}
          {view.deadline && ` · due ${view.deadline}`}
        </div>
        {bays.length > 0 && (
          <>
            <Label>Send to bay</Label>
            <div className="flex flex-wrap gap-1.5">
              {bays.map((a) => (
                <Btn key={a.label} tone="hot" disabledReason={why(a.result)} onClick={() => act(a.action)}>
                  {a.label.replace('Send to ', '')}
                </Btn>
              ))}
            </div>
          </>
        )}
        {areas.length > 0 && (
          <>
            <Label>Store in</Label>
            <div className="flex flex-wrap gap-1.5">
              {areas.map((a) => {
                const info = v.areas.find((x) => a.action.kind === 'chooseArea' && x.id === a.action.areaId);
                return (
                  <Btn key={a.label} tone="light" disabledReason={why(a.result)} onClick={() => act(a.action)} title={info?.covered ? 'Covered' : 'Open air'}>
                    {a.label}
                    <span className="font-sans text-[10px] font-semibold not-italic opacity-75">
                      {info?.units ?? 0} units{info?.covered ? ' · covered' : ''}
                    </span>
                  </Btn>
                );
              })}
            </div>
          </>
        )}
        {(canPlan || dispatch || (urgent && v.queue)) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {canPlan && (
              <Btn tone="brand" onClick={() => useView.getState().openPlanner(id)}>
                Plan load
              </Btn>
            )}
            {dispatch && (
              <Btn
                tone="hot"
                disabledReason={why(dispatch.result)}
                onClick={() => {
                  if (v.loose && !sure) return setSure(true);
                  setSure(false);
                  act(dispatch.action);
                }}
              >
                {sure ? 'Dispatch anyway' : 'Dispatch'}
              </Btn>
            )}
            {urgent && v.queue && (
              <Btn tone="light" disabledReason={why(urgent.result)} onClick={() => act(urgent.action)}>
                Urgent
              </Btn>
            )}
          </div>
        )}
        {sure && v.loose && <p className="mt-1 text-[11px] font-semibold text-stop">{v.loose}</p>}
      </div>
    </>
  );
}

/** Why dispatching now would cost money, or null. */
function looseEnds(s: ShiftState, id: string): string | null {
  const tr = s.trucks.find((t) => t.id === id);
  if (!tr || tr.kind !== 'outbound') return null;
  const left = (tr.plan?.placements ?? []).filter((p) => !tr.aboard.includes(p.cargoId)).length;
  const papers = tr.aboard.filter((u) => s.cargo.find((c) => c.id === u)?.papers === 'missing').length;
  const parts = [left && `${left} planned unit${left === 1 ? '' : 's'} not aboard (€${s.prices.missedTruck} each)`, papers && `${papers} aboard without papers (€${s.prices.missingPapers} each)`].filter(Boolean);
  return parts.length ? `${parts.join(', ')}. Press again to leave anyway.` : null;
}

function CargoBody({ id }: { id: string }) {
  const v = useShiftView((s, t) => {
    const c = s.cargo.find((u) => u.id === id);
    if (!c) return null;
    // Moving a unit takes whatever stands on it along.
    const stack = [c.id];
    for (let top = s.cargo.find((u) => u.on === c.id && !u.gone); top; top = s.cargo.find((u) => u.on === top!.id && !u.gone)) stack.push(top.id);
    return {
      c,
      area: devYard.storage.find((a) => a.id === c.areaId)?.name ?? 'Yard',
      moves: devYard.storage.filter((a) => a.id !== c.areaId).map((a) => ({ a, r: validate(s, { kind: 'moveUnits', unitIds: stack, areaId: a.id }, t), stack })),
      rush: c.papers === 'missing' ? validate(s, { kind: 'rushPapers', unitId: c.id }, t) : null,
    };
  });
  if (!v) return null;
  return (
    <>
      <div className="flex items-center gap-2 bg-navy py-1 pr-7 pl-2.5 text-white">
        <Tag tone="move">UNIT</Tag>
        <Num className="text-[15px]">{id}</Num>
        {v.c.papers === 'missing' && (
          <Chip tone="warn" className="ml-auto">
            Papers missing
          </Chip>
        )}
      </div>
      <div className="px-2.5 pt-1.5 pb-2">
        <div className="text-[11px] text-muted">
          {v.c.description} · to {v.c.destination} · {v.area}
        </div>
        <Label>Move to</Label>
        <div className="flex flex-wrap gap-1.5">
          {v.moves.map(({ a, r, stack }) => (
            <Btn key={a.id} tone="light" disabledReason={why(r)} onClick={() => act({ kind: 'moveUnits', unitIds: stack, areaId: a.id })}>
              {a.name}
            </Btn>
          ))}
        </div>
        {v.rush && (
          <div className="mt-2">
            <Btn tone="paper" disabledReason={why(v.rush)} onClick={() => act({ kind: 'rushPapers', unitId: id })}>
              Rush papers
            </Btn>
          </div>
        )}
      </div>
    </>
  );
}

const Label = ({ children }: { children: string }) => <div className="mt-1.5 mb-1 text-[9px] font-bold tracking-[0.12em] text-muted uppercase">{children}</div>;

/**
 * The selected truck's or unit's actions (spec §4.2), anchored next to it in
 * the 3D view with a pin line; every disabled button says why.
 */
export function SelectionCard() {
  const selected = useUi((s) => s.selected);
  const card = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const ref = selected && (selected.kind === 'truck' || selected.kind === 'cargo') ? selected : null;
  const key = ref ? `${ref.kind}:${ref.id}` : null;
  useEffect(() => {
    if (!ref) return;
    return track('selection', anchorOf(ref), (x, y, visible) => {
      const el = card.current;
      const line = pin.current;
      if (!el || !line) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const r = cardPlacement({ x, y }, { w: el.offsetWidth, h: el.offsetHeight }, { w: vw, h: vh }, { top: AVOID.top, bottom: vh * AVOID.bottomShare, right: vw * AVOID.rightShare });
      el.style.transform = `translate(${r.left}px, ${r.top}px)`;
      el.style.visibility = 'visible';
      const from = r.pinBelow ? r.top + el.offsetHeight : y;
      const to = r.pinBelow ? y : r.top;
      line.style.display = visible && to > from ? '' : 'none';
      line.style.transform = `translate(${x}px, ${from}px)`;
      line.style.height = `${Math.max(0, to - from)}px`;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!ref) return null;
  return (
    <>
      <div ref={pin} className="pointer-events-none absolute top-0 left-0 w-[2px] bg-paper shadow-[0_0_0_1px_rgba(11,29,79,0.3)]" style={{ display: 'none' }} />
      <div ref={card} className="pointer-events-auto absolute top-0 left-0 w-[340px] bg-paper text-navy shadow-[0_6px_16px_rgba(11,29,79,0.3)]" style={{ visibility: 'hidden' }} role="dialog" aria-label={`${ref.id} actions`}>
        <button type="button" className="absolute top-1 right-1 z-10 cursor-pointer p-0.5 text-white/80 hover:text-white" onClick={() => useUi.getState().select(null)} aria-label="Close">
          <X size={14} />
        </button>
        {ref.kind === 'truck' ? <TruckBody key={ref.id} id={ref.id} /> : <CargoBody key={ref.id} id={ref.id} />}
      </div>
    </>
  );
}
