import { describe, expect, test } from 'vitest';
import { devYard } from '../config/devYard';
import { areaAt } from '../domain/yard';
import { buildGrid, reachUnit } from '../sim/grid';
import { recommendSpot } from '../world/placement';
import { TEST_RECIPE, withRecipe } from './fixtures';
import { newShift } from './generate';
import { RECIPES, recipeById } from './recipes';
import { secondsFor } from './types';

describe('newShift', () => {
  test('the same recipe gives the same shift', () => {
    expect(JSON.stringify(newShift(TEST_RECIPE))).toBe(JSON.stringify(newShift(TEST_RECIPE)));
  });

  test('trucks start scheduled, at their recipe times', () => {
    const s = newShift(TEST_RECIPE);
    expect(s.trucks.map((t) => [t.id, t.stage, t.arriveAt])).toEqual([
      ['TRUCK-IN-1', 'scheduled', secondsFor(5)],
      ['TRUCK-OUT-1', 'scheduled', secondsFor(10)],
    ]);
  });

  test('an inbound truck arrives packed with its units', () => {
    const s = newShift(TEST_RECIPE);
    const t = s.trucks[0];
    expect(t.aboard).toHaveLength(4);
    expect(t.load.map((p) => p.cargoId).sort()).toEqual([...t.aboard].sort());
    for (const id of t.aboard) expect(s.cargo.find((c) => c.id === id)?.loadedOn).toEqual({ truckId: 'TRUCK-IN-1', stop: 1 });
  });

  test('an outbound truck has exactly its reachable yard units for its stops', () => {
    const s = newShift(TEST_RECIPE);
    const yard = s.cargo.filter((c) => !c.loadedOn);
    const grid = buildGrid(yard);
    const mine = yard.filter((c) => ['Ankara', 'Konya'].includes(c.destination));
    expect(mine).toHaveLength(4);
    for (const c of mine) {
      expect(c.on).toBeNull();
      expect(reachUnit(grid, yard, c)).not.toBeNull();
    }
  });

  test('missing papers are marked and queued for the clerk', () => {
    const s = newShift(withRecipe({ trucks: TEST_RECIPE.trucks.map((t) => (t.kind === 'outbound' ? { ...t, missingPapers: 2 } : t)) }));
    expect(s.cargo.filter((c) => c.papers === 'missing')).toHaveLength(2);
    expect(s.papers.queue).toHaveLength(2);
  });

  test('forklifts start at their homes, only the recipe’s ones', () => {
    expect(newShift(TEST_RECIPE).forklifts.map((f) => f.id)).toEqual(['FL-01', 'FL-02', 'FL-03']);
  });

  test('every recipe generates', () => {
    for (const r of RECIPES) expect(newShift(r).trucks).toHaveLength(r.trucks.length);
    expect(recipeById('opening-gate').no).toBe(1);
  });
});

describe('recommendSpot', () => {
  test('recommendSpot can be held to one area', () => {
    const s = newShift(TEST_RECIPE);
    const spot = recommendSpot(
      s.cargo.filter((c) => !c.loadedOn),
      { look: 'cartons', dims: { l: 1.2, w: 0.8, h: 1 } },
      { areaId: 'HS2' },
    );
    expect(spot && 'x' in spot && areaAt(devYard, spot.x, spot.y)?.id).toBe('HS2');
  });
});
