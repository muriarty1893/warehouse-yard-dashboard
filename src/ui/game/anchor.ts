/** Gap between the card and the point it belongs to (room for the pin line). */
const GAP = 40;
const EDGE = 8;

/**
 * Where the selection card goes for an entity at screen point `p` (spec §4.2):
 * above it with a pin down to it, or below it when the scoreboard is in the
 * way; never under the right-hand column or the timeline, always on screen.
 */
export function cardPlacement(
  p: { x: number; y: number },
  card: { w: number; h: number },
  view: { w: number; h: number },
  avoid: { top: number; bottom: number; right: number },
): { left: number; top: number; pinBelow: boolean } {
  const maxLeft = Math.max(EDGE, view.w - avoid.right - card.w - EDGE);
  const left = Math.min(Math.max(EDGE, p.x - card.w / 2), maxLeft);
  const above = p.y - card.h - GAP;
  const pinBelow = above >= avoid.top;
  const raw = pinBelow ? above : p.y + GAP;
  const maxTop = Math.max(avoid.top, view.h - avoid.bottom - card.h);
  const top = Math.min(Math.max(avoid.top, raw), maxTop, view.h - card.h);
  return { left, top: Math.max(0, top), pinBelow };
}
