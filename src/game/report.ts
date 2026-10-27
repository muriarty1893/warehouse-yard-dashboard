import { act, advance } from './engine';
import { newShift } from './generate';
import { fmtMoney, postedProfit } from './ledger';
import type { EntryKind, LedgerEntry, Recipe, ShiftState } from './types';

/** The end-of-shift report (spec §4.3): money in and out, every fine, one lesson. */

export function starsFor(profit: number, targets: [number, number, number]): 0 | 1 | 2 | 3 {
  return targets.filter((x) => profit >= x).length as 0 | 1 | 2 | 3;
}

export interface Report {
  recipeId: string;
  profit: number;
  stars: 0 | 1 | 2 | 3;
  nextTarget: number | null;
  earnings: { label: string; amount: number }[];
  fines: LedgerEntry[];
  spending: LedgerEntry[];
  lesson: string;
}

const SPENDING: EntryKind[] = ['tempForklift', 'overtime', 'rushPapers'];
const eur = (n: number) => fmtMoney(n, { sign: false });

/** Advice for the rule behind the biggest loss, given its total (positive euros). */
export const LESSONS: Partial<Record<EntryKind, (total: number) => string>> = {
  late: (x) => `Late departures cost you ${eur(x)}. Give outbound trucks a bay first and confirm their plans early; inbound trucks can wait their 5 free minutes.`,
  gateWait: (x) => `Gate waiting cost you ${eur(x)}. Give trucks a bay before their 5 free minutes run out.`,
  missingPapers: (x) => `Units left without papers cost you ${eur(x)}. Put the clerk on the units of the next truck to leave, or rush them.`,
  missedTruck: (x) => `Units left behind cost you ${eur(x)}. Wait for the last unit, or move it up the queue earlier.`,
  damaged: (x) => `Rain damage cost you ${eur(x)}. Move cartons and bags under cover as soon as the warning comes.`,
  unserved: (x) => `Trucks still waiting at the end cost you ${eur(x)}. Keep the bays turning, or buy overtime.`,
};

export function buildReport(s: ShiftState): Report {
  const profit = postedProfit(s);
  const rushIds = new Set(s.trucks.filter((t) => t.rush).map((t) => t.id));
  const earnings: Report['earnings'] = [];
  const delivered = s.ledger.filter((e) => e.kind === 'delivery' && !rushIds.has(e.ref));
  const rushed = s.ledger.filter((e) => e.kind === 'delivery' && rushIds.has(e.ref));
  const stored = s.ledger.filter((e) => e.kind === 'handling');
  const sum = (xs: LedgerEntry[]) => xs.reduce((a, e) => a + e.amount, 0);
  if (delivered.length) earnings.push({ label: `${Math.round(sum(delivered) / s.prices.delivery)} units delivered × ${eur(s.prices.delivery)}`, amount: sum(delivered) });
  if (rushed.length) earnings.push({ label: `${Math.round(sum(rushed) / s.prices.rushDelivery)} units on rush orders × ${eur(s.prices.rushDelivery)}`, amount: sum(rushed) });
  if (stored.length) earnings.push({ label: `${stored.length} units stored × ${eur(s.prices.handling)}`, amount: sum(stored) });

  const fines = s.ledger.filter((e) => e.amount < 0 && !SPENDING.includes(e.kind)).sort((a, b) => a.t - b.t);
  const spending = s.ledger.filter((e) => SPENDING.includes(e.kind));

  const byKind = new Map<EntryKind, number>();
  for (const f of fines) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) - f.amount);
  const worst = [...byKind].sort((a, b) => b[1] - a[1])[0];
  const lesson = worst ? (LESSONS[worst[0]]?.(worst[1]) ?? `${worst[0]} cost you ${eur(worst[1])}.`) : 'A clean shift. Next time, push for more trucks served.';

  const targets = s.recipe.targets;
  return { recipeId: s.recipe.id, profit, stars: starsFor(profit, targets), nextTarget: targets.find((x) => x > profit) ?? null, earnings, fines, spending, lesson };
}

/** A fresh shift with every logged action applied at its time, advanced to `until`. */
export function replay(recipe: Recipe, log: ShiftState['log'], until: number): ShiftState {
  const s = newShift(recipe);
  for (const entry of log) act(s, entry.action, entry.t);
  advance(s, until);
  return s;
}
