import { devYard } from '../config/devYard';
import type { Vec2 } from '../domain/types';
import { buildGrid, findPath } from '../sim/grid';
import { compileRoute } from '../sim/route';
import { standing } from './crew';
import { post } from './ledger';
import { TEMP_IN, tempOutRoute } from './places';
import { clockLabel, LUNCH, secondsFor, workDone, type Due, type GameCargo, type GameEvent, type HintKey, type Mechanic, type ShiftState } from './types';

/**
 * Timed events besides trucks and jobs (spec §1.5, §1.6, §2): the papers
 * clerk, breakdowns, rain, closed bays, temp forklifts, first-time hints.
 */

/** jobId of a temp forklift on its way out. */
export const EXIT = 'exit';

export const has = (s: ShiftState, m: Mechanic) => s.recipe.mechanics.includes(m);

/** A hint, once per shift, only for the recipe's mechanics. */
export function hint(s: ShiftState, key: HintKey): GameEvent[] {
  if (key !== 'basics' && !has(s, key)) return [];
  const id = `hint:${key}`;
  if (s.fired.includes(id)) return [];
  s.fired.push(id);
  return [{ kind: 'hint', key }];
}

const notice = (t: number, text: string, tone: 'info' | 'warn' = 'warn', until?: number): GameEvent => ({ kind: 'notice', t, text, tone, ...(until !== undefined ? { until } : {}) });

/** Until when a bay is closed at t (engine seconds), or null. */
export function bayClosedUntil(s: ShiftState, bayId: string, t: number): number | null {
  for (const inc of s.recipe.incidents) if (inc.kind === 'bayClosed' && inc.bayId === bayId && secondsFor(inc.fromMin) <= t && t < secondsFor(inc.toMin)) return secondsFor(inc.toMin);
  return null;
}

const uncovered = (areaId: string | null) => !!areaId && !devYard.storage.find((a) => a.id === areaId)?.covered;
const damageProne = (c: GameCargo) => c.look === 'cartons' || c.look === 'bag';

/** Yard units the rain would damage right now. */
export const atRisk = (s: ShiftState) => s.cargo.filter((c) => !c.loadedOn && !c.gone && !c.transitJob && damageProne(c) && uncovered(c.areaId));

function writeOff(s: ShiftState, c: GameCargo, t: number): GameEvent {
  c.gone = true;
  for (const j of s.jobs) if (j.unitId === c.id && j.status === 'queued') j.status = 'cancelled';
  for (const tr of s.trucks) {
    if (!tr.plan?.placements.some((p) => p.cargoId === c.id)) continue;
    tr.plan = { ...tr.plan, placements: tr.plan.placements.filter((p) => p.cargoId !== c.id) };
    tr.load = tr.plan.placements;
  }
  s.papers.queue = s.papers.queue.filter((id) => id !== c.id);
  return post(s, { t, kind: 'damaged', amount: -s.prices.damaged, text: `${c.id} damaged by rain`, ref: c.id });
}

function fire(s: ShiftState, id: string, run: () => GameEvent[]): () => GameEvent[] {
  return () => {
    s.fired.push(id);
    return run();
  };
}

export function incidentDue(s: ShiftState): Due[] {
  const out: Due[] = [];
  const once = (id: string, t: number, order: number, run: () => GameEvent[]) => {
    if (!s.fired.includes(id)) out.push({ t: Math.max(0, t), order, id, run: fire(s, id, run) });
  };

  once('start', 0, 0, () => [...hint(s, 'basics'), ...hint(s, 'queue'), ...(s.papers.queue.length ? hint(s, 'papers') : [])]);
  if (has(s, 'overtime')) once('overtime-hint', secondsFor(420), 35, () => hint(s, 'overtime'));
  once('lunch', secondsFor(LUNCH.fromMin), 36, () => [notice(secondsFor(LUNCH.fromMin), `Lunch break · the crew and the clerk stop until ${clockLabel(secondsFor(LUNCH.toMin))}`, 'info', secondsFor(LUNCH.toMin))]);
  once('lunch-over', secondsFor(LUNCH.toMin), 36, () => [notice(secondsFor(LUNCH.toMin), 'Lunch is over · the crew is back to work', 'info')]);

  s.recipe.incidents.forEach((inc, i) => {
    if (inc.kind === 'breakdown') {
      once(`inc-${i}`, secondsFor(inc.atMin), 30, () => {
        const f = s.forklifts.find((x) => x.id === inc.forkliftId);
        if (!f) return [];
        const t = secondsFor(inc.atMin);
        const dur = secondsFor(inc.durationMin);
        const job = f.jobId ? s.jobs.find((j) => j.id === f.jobId) : undefined;
        if (job) f.breakdownPendingSec = dur;
        else f.brokenUntil = t + dur;
        const back = (job?.doneAt ?? t) + dur;
        return [notice(t, `${f.id} broke down · back at ${clockLabel(back)}`), ...hint(s, 'tempForklift')];
      });
    } else if (inc.kind === 'rain') {
      once(`inc-${i}-warn`, secondsFor(inc.atMin - 45), 31, () => [notice(secondsFor(inc.atMin - 45), `Rain at ${clockLabel(secondsFor(inc.atMin))} · ${atRisk(s).length} units in the open need cover`, 'warn', secondsFor(inc.atMin + 10)), ...hint(s, 'rain')]);
      once(`inc-${i}-damage`, secondsFor(inc.atMin + 10), 32, () => {
        const t = secondsFor(inc.atMin + 10);
        const wet = atRisk(s);
        const events = wet.map((c) => writeOff(s, c, t));
        if (wet.length) events.push(notice(t, `Rain damaged ${wet.length} units in the open`));
        return events;
      });
    } else {
      once(`inc-${i}-from`, secondsFor(inc.fromMin), 33, () => [notice(secondsFor(inc.fromMin), `Bay ${inc.bayId} is closed until ${clockLabel(secondsFor(inc.toMin))}`), ...hint(s, 'bayClosed')]);
      once(`inc-${i}-to`, secondsFor(inc.toMin), 34, () => [notice(secondsFor(inc.toMin), `Bay ${inc.bayId} is open again`, 'info')]);
    }
  });

  // The clerk works down the papers queue.
  if (s.papers.queue.length && s.papers.startedAt !== null) {
    const t = workDone(s.papers.startedAt, secondsFor(s.recipe.clerkMin ?? 20));
    out.push({
      t,
      order: 20,
      id: `papers-${s.papers.queue[0]}`,
      run: () => {
        const id = s.papers.queue.shift()!;
        const c = s.cargo.find((u) => u.id === id);
        if (c) c.papers = 'ok';
        s.papers.startedAt = s.papers.queue.length ? t : null;
        return [notice(t, `Papers ready for ${id}`, 'info')];
      },
    });
  }

  for (const f of s.forklifts) {
    if (f.brokenUntil !== null && Number.isFinite(f.brokenUntil)) {
      const t = f.brokenUntil;
      out.push({ t, order: 13, id: f.id, run: () => ((f.brokenUntil = null), [notice(t, `${f.id} is back to work`, 'info')]) });
    }
    if (f.arrivesAt !== null) {
      out.push({ t: f.arrivesAt, order: 14, id: f.id, run: () => ((f.arrivesAt = null), (f.motion = null), (f.pose = { ...TEMP_IN }), []) });
    }
    if (f.temp && f.leaveAt !== null && !f.jobId && f.arrivesAt === null) {
      const leaveAt = f.leaveAt;
      out.push({
        t: leaveAt,
        order: 15,
        id: f.id,
        run: () => {
          const t = Math.max(leaveAt, s.t);
          const path = findPath(buildGrid(standing(s)), [f.pose.x, f.pose.y], [TEMP_IN.x, TEMP_IN.y]) ?? ([[f.pose.x, f.pose.y]] as Vec2[]);
          const spec = tempOutRoute(path, t);
          f.leaveAt = null;
          f.jobId = EXIT;
          f.motion = { spec, t0: t, until: t + compileRoute(spec).duration };
          return [notice(t, `${f.id} has gone back`, 'info')];
        },
      });
    }
    if (f.jobId === EXIT && f.motion) {
      out.push({ t: f.motion.until, order: 16, id: f.id, run: () => ((s.forklifts = s.forklifts.filter((x) => x !== f)), []) });
    }
  }
  return out;
}
