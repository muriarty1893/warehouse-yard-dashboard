import { shiftMinutes, type EntryKind, type GameEvent, type LedgerEntry, type Prices, type ShiftState } from './types';

/** Starting prices (spec §1.7); recipes may override any of them. */
export const DEFAULT_PRICES: Prices = {
  handling: 40,
  delivery: 80,
  rushDelivery: 160,
  gateFreeMin: 5,
  gatePerMin: 12,
  latePerMin: 15,
  missingPapers: 300,
  missedTruck: 240,
  damaged: 200,
  unserved: 500,
  tempForkliftPerHour: 150,
  overtime: 400,
  rushPapers: 40,
};

const eur = (n: number) => `€${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

/** The rule behind each kind of ledger line, in plain words. */
export const RULES: Record<EntryKind, (p: Prices) => string> = {
  handling: (p) => `${eur(p.handling)} per unit stored`,
  delivery: (p) => `${eur(p.delivery)} per unit delivered`,
  gateWait: (p) => `Gate waiting fee · ${p.gateFreeMin} free minutes, then ${eur(p.gatePerMin)} per minute`,
  late: (p) => `Departure deadline · ${eur(p.latePerMin)} per minute`,
  missingPapers: (p) => `Papers must be complete before a unit leaves · ${eur(p.missingPapers)} per unit`,
  missedTruck: (p) => `Unit missed its truck · ${eur(p.missedTruck)}`,
  damaged: (p) => `Rain damage · cartons and bags need cover · ${eur(p.damaged)} per unit`,
  unserved: (p) => `Truck still waiting at the end of the shift · ${eur(p.unserved)}`,
  tempForklift: (p) => `Temp forklift · ${eur(p.tempForkliftPerHour)} per hour`,
  overtime: (p) => `Overtime · ${eur(p.overtime)} per 30 minutes`,
  rushPapers: (p) => `Rushed papers · ${eur(p.rushPapers)} per unit`,
};

export const gateWaitAmount = (p: Prices, minutes: number) => -Math.round(Math.max(0, minutes - p.gateFreeMin) * p.gatePerMin) || 0;
export const lateAmount = (p: Prices, minutes: number) => -Math.round(Math.max(0, minutes) * p.latePerMin) || 0;

/** Add a line to the ledger (its rule filled in from the prices); returns the money event. */
export function post(s: ShiftState, e: Omit<LedgerEntry, 'rule'>): GameEvent {
  const entry: LedgerEntry = { ...e, amount: Math.round(e.amount), rule: RULES[e.kind](s.prices) };
  s.ledger.push(entry);
  return { kind: 'money', entry };
}

/** Fees still running at t: gate waiting past the free minutes, outbound trucks past their deadline. */
export function runningFees(s: ShiftState, t: number): { ref: string; kind: 'gateWait' | 'late'; minutes: number; amount: number }[] {
  const out: { ref: string; kind: 'gateWait' | 'late'; minutes: number; amount: number }[] = [];
  // At the end of the shift every running fee is posted.
  if (s.over) return out;
  for (const tr of s.trucks) {
    if (tr.stage === 'waiting' && tr.times.arrived !== undefined) {
      const minutes = shiftMinutes(t - tr.times.arrived);
      const amount = gateWaitAmount(s.prices, minutes);
      if (amount !== 0) out.push({ ref: tr.id, kind: 'gateWait', minutes: Math.round(minutes), amount });
    }
    if (tr.kind === 'outbound' && tr.deadline !== null && (tr.stage === 'waiting' || tr.stage === 'docking' || tr.stage === 'docked') && t > tr.deadline) {
      const minutes = shiftMinutes(t - tr.deadline);
      const amount = lateAmount(s.prices, minutes);
      if (amount !== 0) out.push({ ref: tr.id, kind: 'late', minutes: Math.round(minutes), amount });
    }
  }
  return out;
}

export const postedProfit = (s: ShiftState) => s.ledger.reduce((sum, e) => sum + e.amount, 0);

/** Profit shown live: everything posted plus fees still running. */
export const profit = (s: ShiftState, t: number) => postedProfit(s) + runningFees(s, t).reduce((sum, f) => sum + f.amount, 0);

/** Money left to spend: the shift's budget plus profit so far. */
export const cash = (s: ShiftState, t: number) => s.recipe.budget + profit(s, t);

/** "+€640", "−€180"; `sign: false` gives "€4,280" (and "−€180" for negatives). */
export function fmtMoney(n: number, opts: { sign?: boolean } = {}): string {
  const v = Math.round(n);
  if (v < 0) return `−${eur(v)}`;
  return opts.sign === false || v === 0 ? eur(v) : `+${eur(v)}`;
}
