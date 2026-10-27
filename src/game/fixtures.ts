import type { Recipe } from './types';

/**
 * Test-only recipes and helpers for the game engine's tests. Not imported by
 * the app.
 */

/** A small shift: one inbound and one outbound truck, two bays, three forklifts, everything switched on. */
export const TEST_RECIPE: Recipe = {
  id: 'test',
  no: 0,
  name: 'Test shift',
  teaches: 'Everything',
  briefing: { newTitle: 'Test', newText: 'Test', rule: 'Test' },
  seed: 7,
  bays: ['L1', 'L2'],
  forklifts: ['FL-01', 'FL-02', 'FL-03'],
  fill: 'quiet',
  mechanics: ['storage', 'outbound', 'papers', 'queue', 'tempForklift', 'rain', 'bayClosed', 'rushOrder', 'overtime'],
  trucks: [
    { id: 'TRUCK-IN-1', kind: 'inbound', carrier: 'cargoviva', arriveMin: 5, plannedArriveMin: 5, units: 4 },
    { id: 'TRUCK-OUT-1', kind: 'outbound', carrier: 'nordline', arriveMin: 10, plannedArriveMin: 10, units: 4, stops: ['Ankara', 'Konya'], deadlineMin: 120 },
  ],
  incidents: [],
  budget: 1000,
  targets: [100, 200, 300],
};

export const withRecipe = (patch: Partial<Recipe>): Recipe => ({ ...TEST_RECIPE, ...patch });
