import { describe, expect, test } from 'vitest';
import { cash, DEFAULT_PRICES, fmtMoney, gateWaitAmount, lateAmount, post, profit, runningFees } from './ledger';
import { clockLabel, secondsFor, type GameTruck, type Recipe, type ShiftState } from './types';

const recipe: Recipe = {
  id: 'test',
  no: 0,
  name: 'Test',
  teaches: '',
  briefing: { newTitle: '', newText: '', rule: '' },
  seed: 1,
  bays: ['L1'],
  forklifts: [],
  fill: 'quiet',
  mechanics: [],
  trucks: [],
  incidents: [],
  budget: 1000,
  targets: [0, 0, 0],
};

function truck(patch: Partial<GameTruck>): GameTruck {
  return {
    id: 'TRUCK-1',
    kind: 'inbound',
    carrier: 'docktor',
    vehicle: 'rigid-26',
    stage: 'waiting',
    arriveAt: 0,
    plannedArriveAt: 0,
    stops: [],
    deadline: null,
    rush: false,
    urgent: false,
    slot: 0,
    bayId: null,
    areaId: null,
    load: [],
    aboard: [],
    plan: null,
    busyUntil: -Infinity,
    dispatchPending: false,
    times: {},
    motion: null,
    pose: { x: 0, y: 0, heading: 0 },
    ...patch,
  };
}

function stateWith(trucks: GameTruck[]): ShiftState {
  return {
    recipe,
    prices: DEFAULT_PRICES,
    t: 0,
    end: secondsFor(480),
    overtimeBought: 0,
    rng: 1,
    seq: 0,
    trucks,
    forklifts: [],
    cargo: [],
    jobs: [],
    groups: [],
    papers: { queue: [], startedAt: null },
    ledger: [],
    fired: [],
    over: false,
    log: [],
  };
}

const stateWithWaitingTruck = ({ waitSince }: { waitSince: number }) => stateWith([truck({ times: { arrived: waitSince } })]);

describe('shift clock', () => {
  test('clock label', () => {
    expect(clockLabel(0)).toBe('06:00');
    expect(clockLabel(secondsFor(90))).toBe('07:30');
  });
});

describe('fees', () => {
  test('gate waiting: 5 free minutes, then €12 a minute', () => {
    expect(gateWaitAmount(DEFAULT_PRICES, 4)).toBe(0);
    expect(gateWaitAmount(DEFAULT_PRICES, 15)).toBe(-120);
  });

  test('late departure: €15 a minute', () => expect(lateAmount(DEFAULT_PRICES, 10)).toBe(-150));

  test('running fees count towards the live profit', () => {
    const s = stateWithWaitingTruck({ waitSince: 0 });
    expect(runningFees(s, secondsFor(15))).toEqual([{ ref: 'TRUCK-1', kind: 'gateWait', minutes: 15, amount: -120 }]);
    expect(profit(s, secondsFor(15))).toBe(-120);
    expect(cash(s, secondsFor(15))).toBe(s.recipe.budget - 120);
  });

  test('a docked outbound truck past its deadline runs a late fee', () => {
    const s = stateWith([truck({ id: 'TRUCK-2', kind: 'outbound', stage: 'docked', deadline: secondsFor(60), times: { arrived: 0, leftKerb: 0 } })]);
    expect(runningFees(s, secondsFor(70))).toEqual([{ ref: 'TRUCK-2', kind: 'late', minutes: 10, amount: -150 }]);
  });
});

describe('ledger', () => {
  test('post fills in the rule and returns a money event', () => {
    const s = stateWithWaitingTruck({ waitSince: 0 });
    const ev = post(s, { t: 1, kind: 'late', amount: -180, text: 'TRUCK-1 left 12 min late', ref: 'TRUCK-1' });
    expect(s.ledger[0].rule).toBe('Departure deadline · €15 per minute');
    expect(ev).toEqual({ kind: 'money', entry: s.ledger[0] });
  });

  test('money format', () => {
    expect(fmtMoney(640)).toBe('+€640');
    expect(fmtMoney(-180)).toBe('−€180');
    expect(fmtMoney(4280, { sign: false })).toBe('€4,280');
  });

  test('no fees run once the shift is over (they were posted)', () => {
    const s = stateWithWaitingTruck({ waitSince: 0 });
    s.over = true;
    expect(runningFees(s, secondsFor(60))).toEqual([]);
  });
});
