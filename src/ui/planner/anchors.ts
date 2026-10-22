/**
 * Shared between the 3D view and the planner's DOM overlay without React
 * re-renders: where each row of the truck is on screen (written by
 * <LoadView /> when the camera moves), and the screen area the panels leave
 * free for the 3D view.
 */
export const rowAnchors: { version: number; points: { x: number; y: number; visible: boolean }[] } = { version: 0, points: [] };

export interface FreeArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The part of the window not covered by planner panels (`data-planner-rail`). */
export function freeArea(): FreeArea {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const area = { left: 0, top: 76, right: w, bottom: h };
  for (const el of document.querySelectorAll('[data-planner-rail]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.top > h / 2) area.bottom = Math.min(area.bottom, r.top);
    else if (r.left < w / 2) area.left = Math.max(area.left, r.right);
    else area.right = Math.min(area.right, r.left);
  }
  return area;
}
