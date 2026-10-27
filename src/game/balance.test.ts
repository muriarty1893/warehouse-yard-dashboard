import { describe, expect, test } from 'vitest';
import { basicBot, goodBot, runShift } from './bots';
import { RECIPES } from './recipes';

/**
 * Star targets come from the bots (spec §5.3): ★ = what the basic bot makes,
 * ★★★ = 95 % of the good bot, ★★ halfway, each rounded down to €100.
 * `npm run balance` prints the numbers.
 */

const floor100 = (n: number) => Math.floor(n / 100) * 100;

describe.each(RECIPES)('$no $name', (recipe) => {
  const t0 = performance.now();
  const basic = runShift(recipe, basicBot).report.profit;
  const good = runShift(recipe, goodBot).report.profit;
  const ms = performance.now() - t0;
  const want: [number, number, number] = [floor100(basic), floor100((basic + 0.95 * good) / 2), floor100(0.95 * good)];
  if (import.meta.env.BALANCE) console.log(`${recipe.no} ${recipe.id.padEnd(14)} basic ${String(basic).padStart(6)}  good ${String(good).padStart(6)}  targets ${JSON.stringify(want)}  ${Math.round(ms)} ms`);

  test('targets match the bots', () => expect(recipe.targets).toEqual(want));
  test('targets are in order and the good bot clearly beats the basic one', () => {
    expect(want[0]).toBeLessThan(want[1]);
    expect(want[1]).toBeLessThan(want[2]);
    expect(good - basic).toBeGreaterThanOrEqual(300);
  });
  test('the basic bot can pass', () => expect(basic).toBeGreaterThanOrEqual(recipe.targets[0]));
  test('both bots run a shift headless in under half a minute', () => expect(ms).toBeLessThan(30_000));
});
