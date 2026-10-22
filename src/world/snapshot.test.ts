import { beforeEach, describe, expect, it } from 'vitest';
import { planOf, useLoading } from '../loading/store';
import { demoCargo } from './demo';
import { useInventory } from './inventory';
import { computeSnapshot } from './snapshot';

const truck = (t: number) => computeSnapshot(t).trucks.find((x) => x.id === 'TRUCK-102')!;

beforeEach(() => {
  useInventory.setState({ cargo: demoCargo('normal', 1), documents: [], events: [], epoch: 0 });
  useLoading.getState().resetAll();
  const plan = useLoading.getState().trucks['TRUCK-102'].recommended!;
  useLoading.getState().confirm('TRUCK-102', plan.checks.ok ? undefined : { overrideReason: 'test' });
});

describe('planned trucks in the World State', () => {
  it("a planned truck's shipment comes from its plan", () => {
    const plan = planOf(useLoading.getState(), 'TRUCK-102')!;
    const t = truck(100);
    expect(t.shipment.pallets).toBe(plan.placements.length);
    expect(t.shipment.place).toBe('Eskişehir +2');
    expect(t.shipment.direction).toBe('outbound');
    expect(t.shipment.weightT).toBeCloseTo(plan.stats.weightKg / 1000, 1);
  });

  it('progress counts loaded units', () => {
    const plan = planOf(useLoading.getState(), 'TRUCK-102')!;
    const [a, b] = plan.placements;
    useInventory.getState().loadOnto(a.cargoId, 'TRUCK-102', a.stop, 'L1');
    useInventory.getState().loadOnto(b.cargoId, 'TRUCK-102', b.stop, 'L1');
    const t = truck(100);
    expect(t.progress).toEqual({ done: 2, total: plan.placements.length });
    expect(t.detail).toBe(`L1 · 2/${plan.placements.length} units`);
  });

  it('a loaded truck is ready to depart', () => {
    useLoading.getState().setStatus('TRUCK-102', 'loaded');
    expect(truck(100).detail).toBe('Loaded · ready to depart');
  });
});
