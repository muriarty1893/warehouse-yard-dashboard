import { describe, expect, it } from 'vitest';
/** The twin's route for TRUCK-102 (fixture). */
const DEFAULT_ROUTES: Record<string, string[]> = { 'TRUCK-102': ['Eskişehir', 'Ankara', 'Kayseri'] };
import { demoCargo } from '../world/demo';
import { candidatesFor } from './candidates';
import { optimise, optimiseInWorker, rankPlans } from './optimise';
import { buildPlan } from './plan';
import type { PlanCore } from './types';
import { vehicleById } from './vehicles';

const route = DEFAULT_ROUTES['TRUCK-102'];
const v = vehicleById('rigid-26');
const { items } = candidatesFor({ truckId: 'TRUCK-102', route, vehicle: 'rigid-26', include: [], exclude: [], urgent: [] }, demoCargo('normal', 1), new Set());
const counter = () => {
  let t = 0;
  return () => (t += 1);
};

describe('optimise', () => {
  it('same inputs, same best plan', () => {
    const a = optimise(v, items, route, { maxTries: 40, now: counter() });
    const b = optimise(v, items, route, { maxTries: 40, now: counter() });
    expect(a.plan).toEqual(b.plan);
    expect(a.tried).toBe(b.tried);
  });

  it('never ranks an illegal plan above a legal one', () => {
    const base = buildPlan(v, items, route);
    const legalFewer: PlanCore = { ...base, placements: base.placements.slice(1), checks: { ...base.checks, ok: true, issues: [] } };
    const illegalMore: PlanCore = { ...base, checks: { ...base.checks, ok: false, issues: ['Front axle over 9 t after stop 1'] } };
    expect(rankPlans(legalFewer, illegalMore)).toBeLessThan(0);
    expect(rankPlans(illegalMore, legalFewer)).toBeGreaterThan(0);
  });

  it('prefers more urgent units, then more units', () => {
    const base = buildPlan(v, items, route);
    const fewer: PlanCore = { ...base, stats: { ...base.stats, units: base.stats.units - 1 } };
    const urgentOne: PlanCore = { ...fewer, stats: { ...fewer.stats, urgent: 1 } };
    expect(rankPlans(base, fewer)).toBeLessThan(0);
    expect(rankPlans(urgentOne, base)).toBeLessThan(0);
  });

  it('respects the try budget', () => {
    expect(optimise(v, items, route, { maxTries: 25, now: counter() }).tried).toBe(25);
    expect(optimise(v, items, route, { maxTries: 1000, budgetMs: 10, now: counter() }).tried).toBeLessThanOrEqual(11);
  });

  it('is at least as good as the baseline', () => {
    const baseline = buildPlan(v, items, route);
    const r = optimise(v, items, route, { maxTries: 60, now: counter() });
    expect(rankPlans(r.plan, baseline)).toBeLessThanOrEqual(0);
  });

  it('without workers it still optimises (chunked)', async () => {
    const r = await optimiseInWorker({ vehicle: v, items, route, maxTries: 30 });
    expect(r.tried).toBe(30);
    expect(r.plan.placements.length).toBeGreaterThan(0);
  });
});
