/** Number formats and stop colours shared by the load planner panels. */

export const fmtT = (kg: number) => `${(kg / 1000).toFixed(2)} t`;
export const fmtKg = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`;

/** One colour per stop of a route, stop 1 first. */
export const STOP_COLORS = ['#f0932b', '#2f5ff0', '#22b35e', '#7a5af0', '#e0527a'];
export const stopColor = (stop: number) => STOP_COLORS[(stop - 1) % STOP_COLORS.length];
