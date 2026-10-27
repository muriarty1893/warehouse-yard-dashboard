import { describe, expect, test } from 'vitest';
import { recommendSpot } from '../world/placement';
import { forkliftFree } from './crew';
import { act, advance } from './engine';
import { advanceUntil, dock, TEST_RECIPE, truck, withRecipe, yardOf } from './fixtures';
import { newShift } from './generate';
import { planningCargo, recommendPlan } from './planning';
import { secondsFor, type GameCargo, type GameEvent, type Recipe, type ShiftState } from './types';

const withPapers = (n: number, patch: Partial<Recipe> = {}) => withRecipe({ trucks: [TEST_RECIPE.trucks[0], { ...TEST_RECIPE.trucks[1], missingPapers: n }], ...patch });

/** A copy of a yard unit as `look`, put down at the recommended spot in `areaId`. */
function putUnit(s: ShiftState, id: string, look: GameCargo['look'], areaId: string): GameCargo {
  const like = yardOf(s)[0] as GameCargo;
  const unit: GameCargo = { ...like, id, look, dims: { l: 1.2, w: 0.8, h: 1 }, on: null, loadedOn: null, transitJob: null, gone: false, papers: 'ok' };
  const spot = recommendSpot(yardOf(s), unit, { areaId })!;
  if ('on' in spot) throw new Error('expected a floor spot');
  Object.assign(unit, { x: spot.x, y: spot.y, yaw: spot.yaw, areaId });
  s.cargo.push(unit);
  return unit;
}

describe('papers', () => {
  test('the clerk fixes papers in queue order, 20 minutes each', () => {
    const s = newShift(withPapers(2));
    const [first, second] = s.papers.queue;
    advance(s, secondsFor(20) + 0.01);
    expect(s.cargo.find((c) => c.id === first)!.papers).toBe('ok');
    expect(s.cargo.find((c) => c.id === second)!.papers).toBe('missing');
    expect(s.papers.queue).toEqual([second]);
    expect(act(s, { kind: 'reorder', queue: 'papers', id: second, to: 1 }, s.t)).toEqual({ ok: false, reason: `The clerk is already working on ${second}` });
  });

  test('reordering papers keeps the unit in hand first', () => {
    const s = newShift(withPapers(3));
    const [a, b, c] = s.papers.queue;
    expect(act(s, { kind: 'reorder', queue: 'papers', id: c, to: 0 }, 0)).toEqual({ ok: true });
    expect(s.papers.queue).toEqual([a, c, b]);
  });

  test('rushing papers costs €40 and needs the cash', () => {
    const poor = newShift(withPapers(1, { budget: 30 }));
    expect(act(poor, { kind: 'rushPapers', unitId: poor.papers.queue[0] }, 0)).toEqual({ ok: false, reason: 'Not enough cash (€40 needed)' });
    const s = newShift(withPapers(2));
    const [first, second] = s.papers.queue;
    expect(act(s, { kind: 'rushPapers', unitId: first }, 5)).toEqual({ ok: true });
    expect(s.ledger.at(-1)).toEqual(expect.objectContaining({ kind: 'rushPapers', amount: -40 }));
    expect(s.cargo.find((c) => c.id === first)!.papers).toBe('ok');
    expect(s.papers).toEqual({ queue: [second], startedAt: 5 });
  });
});

describe('incidents', () => {
  test('a breakdown waits for the current job to finish', () => {
    const s = newShift(withRecipe({ incidents: [{ kind: 'breakdown', forkliftId: 'FL-02', atMin: 1, durationMin: 60 }] }));
    dock(s, 'TRUCK-OUT-1', 'L1');
    act(s, { kind: 'confirmPlan', truckId: 'TRUCK-OUT-1', plan: recommendPlan(s, 'TRUCK-OUT-1') }, 0);
    const job = s.jobs.find((j) => j.forkliftId === 'FL-02' && j.status === 'active')!;
    expect(job).toBeDefined();
    const events = advance(s, secondsFor(1) + 0.01);
    const f = s.forklifts.find((x) => x.id === 'FL-02')!;
    expect(f.brokenUntil).toBeNull();
    expect(f.breakdownPendingSec).toBe(secondsFor(60));
    expect(events).toContainEqual(expect.objectContaining({ kind: 'notice', tone: 'warn' }));
    advance(s, job.doneAt! + 0.01);
    expect(f.brokenUntil).toBeCloseTo(job.doneAt! + secondsFor(60), 6);
    expect(forkliftFree(f, job.doneAt! + 1)).toBe(false);
  });

  test('rain writes off uncovered cartons and bags only', () => {
    const s = newShift(withRecipe({ incidents: [{ kind: 'rain', atMin: 60 }] }));
    const wet = putUnit(s, 'TEST-WET', 'cartons', 'OY');
    const drum = putUnit(s, 'TEST-DRUM', 'drum', 'OY');
    const dry = putUnit(s, 'TEST-DRY', 'cartons', 'HS1');
    const events = advance(s, secondsFor(60 - 45) + 0.01);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'notice', tone: 'warn' }));
    advance(s, secondsFor(70) + 0.01);
    expect(wet.gone).toBe(true);
    expect(s.ledger).toContainEqual(expect.objectContaining({ kind: 'damaged', amount: -200, ref: 'TEST-WET' }));
    expect([drum.gone, dry.gone]).toEqual([false, false]);
    expect(planningCargo(s).map((c) => c.id)).not.toContain('TEST-WET');
  });

  test('a closed bay takes no trucks until it opens', () => {
    const s = newShift(withRecipe({ incidents: [{ kind: 'bayClosed', bayId: 'L1', fromMin: 0, toMin: 300 }] }));
    advanceUntil(s, (x) => truck(x, 'TRUCK-IN-1').stage === 'waiting');
    expect(act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L1' }, s.t)).toEqual({ ok: false, reason: 'Bay L1 is closed until 11:00' });
    expect(act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L2' }, s.t)).toEqual({ ok: true });
  });
});

describe('spending', () => {
  test('a temp forklift joins after it arrives and leaves after its hours', () => {
    const s = newShift(TEST_RECIPE);
    expect(act(s, { kind: 'rentForklift', hours: 1 }, 10)).toEqual({ ok: true });
    expect(s.ledger.at(-1)).toEqual(expect.objectContaining({ kind: 'tempForklift', amount: -150 }));
    const f = s.forklifts.find((x) => x.id === 'FL-T1')!;
    expect(f.temp).toBe(true);
    expect(forkliftFree(f, 10)).toBe(false);
    const leaveAt = f.leaveAt!;
    expect(leaveAt).toBeCloseTo(f.arrivesAt! + secondsFor(60), 6);
    advance(s, f.arrivesAt! + 0.01);
    expect(forkliftFree(f, s.t)).toBe(true);
    advance(s, leaveAt + 120);
    expect(s.forklifts.some((x) => x.id === 'FL-T1')).toBe(false);
  });

  test('overtime moves the end by 30 minutes, twice at most', () => {
    const s = newShift(TEST_RECIPE);
    const end = s.end;
    expect(act(s, { kind: 'overtime' }, 1)).toEqual({ ok: true });
    expect(act(s, { kind: 'overtime' }, 2)).toEqual({ ok: true });
    expect(s.end).toBeCloseTo(end + secondsFor(60), 6);
    expect(act(s, { kind: 'overtime' }, 3)).toEqual({ ok: false, reason: 'Overtime is used up' });
    expect(s.ledger.filter((e) => e.kind === 'overtime').map((e) => e.amount)).toEqual([-400, -400]);
  });
});

describe('moving units and the queue', () => {
  test('moving units needs the units on top in the move too', () => {
    const s = newShift(TEST_RECIPE);
    const base = putUnit(s, 'TEST-BASE', 'cartons', 'OY');
    const top: GameCargo = { ...base, id: 'TEST-TOP', on: base.id };
    s.cargo.push(top);
    expect(act(s, { kind: 'moveUnits', unitIds: [base.id], areaId: 'HS2' }, 0)).toEqual({ ok: false, reason: 'TEST-BASE has TEST-TOP on top' });
    expect(act(s, { kind: 'moveUnits', unitIds: [base.id, top.id], areaId: 'HS2' }, 0)).toEqual({ ok: true });
    const g = s.groups.at(-1)!;
    expect(g.label).toBe('Move 2 units → Hold space 2');
    expect(g.jobIds.map((id) => s.jobs.find((j) => j.id === id)!.unitId)).toEqual(['TEST-TOP', 'TEST-BASE']);
  });

  test('urgent puts a truck’s jobs first', () => {
    const s = newShift(TEST_RECIPE);
    dock(s, 'TRUCK-IN-1', 'L1');
    dock(s, 'TRUCK-OUT-1', 'L2');
    act(s, { kind: 'chooseArea', truckId: 'TRUCK-IN-1', areaId: 'HS1' }, 0);
    act(s, { kind: 'confirmPlan', truckId: 'TRUCK-OUT-1', plan: recommendPlan(s, 'TRUCK-OUT-1') }, 0);
    expect(s.groups.map((g) => g.truckId)).toEqual(['TRUCK-IN-1', 'TRUCK-OUT-1']);
    expect(act(s, { kind: 'urgent', truckId: 'TRUCK-OUT-1' }, 0)).toEqual({ ok: true });
    expect(s.groups.map((g) => g.truckId)).toEqual(['TRUCK-OUT-1', 'TRUCK-IN-1']);
    expect(truck(s, 'TRUCK-OUT-1').urgent).toBe(true);
  });
});

describe('hints and mechanics', () => {
  test('hints fire once, only for the recipe’s mechanics', () => {
    const s = newShift(withRecipe({ mechanics: ['storage'], incidents: [{ kind: 'rain', atMin: 60 }] }));
    const events: GameEvent[] = [];
    events.push(...advance(s, 0));
    advanceUntil(s, (x) => truck(x, 'TRUCK-IN-1').stage === 'waiting');
    act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L1' }, s.t, events);
    for (let t = s.t; t < secondsFor(80); t += 1) events.push(...advance(s, t));
    const hints = events.filter((e) => e.kind === 'hint').map((e) => (e as { key: string }).key);
    expect(hints).toEqual(['basics', 'storage']);
  });

  test('mechanics that are off refuse their actions', () => {
    const s = newShift(withPapers(1, { mechanics: [] }));
    dock(s, 'TRUCK-IN-1', 'L1');
    act(s, { kind: 'chooseArea', truckId: 'TRUCK-IN-1', areaId: 'HS1' }, 0);
    const g = s.groups[0];
    for (const a of [
      { kind: 'reorder' as const, queue: 'crew' as const, id: g?.id ?? 'G1', to: 0 },
      { kind: 'urgent' as const, truckId: 'TRUCK-IN-1' },
      { kind: 'rushPapers' as const, unitId: s.papers.queue[0] },
      { kind: 'rentForklift' as const, hours: 1 },
      { kind: 'overtime' as const },
    ])
      expect(act(s, a, 0).ok).toBe(false);
  });
});
