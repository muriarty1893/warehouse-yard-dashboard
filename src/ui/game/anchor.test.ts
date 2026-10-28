import { describe, expect, test } from 'vitest';
import { cardPlacement } from './anchor';

const view = { w: 1600, h: 900 };
const card = { w: 300, h: 120 };
const avoid = { top: 80, bottom: 220, right: 400 };
const fits = (r: { left: number; top: number }) => r.left >= 0 && r.top >= 0 && r.left + card.w <= view.w && r.top + card.h <= view.h;

describe('selection card placement', () => {
  test('above the point by default, with the pin below the card', () => {
    const r = cardPlacement({ x: 600, y: 500 }, card, view, avoid);
    expect(r.top + card.h).toBeLessThanOrEqual(500);
    expect(r.pinBelow).toBe(true);
    expect(r.left).toBe(450);
  });
  test('a point near the right column puts the card left of the column', () => {
    const r = cardPlacement({ x: 1450, y: 400 }, card, view, avoid);
    expect(r.left + card.w).toBeLessThanOrEqual(view.w - avoid.right);
    expect(fits(r)).toBe(true);
  });
  test('a point under the scoreboard puts the card below it', () => {
    const r = cardPlacement({ x: 600, y: 120 }, card, view, avoid);
    expect(r.top).toBeGreaterThanOrEqual(avoid.top);
    expect(r.top).toBeGreaterThan(120);
    expect(r.pinBelow).toBe(false);
  });
  test('the card always fits the view, even for points off screen', () => {
    for (const p of [{ x: -200, y: -50 }, { x: 2000, y: 1200 }, { x: 10, y: 890 }]) expect(fits(cardPlacement(p, card, view, avoid))).toBe(true);
  });
});
