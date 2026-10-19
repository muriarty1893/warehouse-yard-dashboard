/**
 * Render quality knobs, overridable from the URL for weaker GPUs, e.g.
 * `?ao=0&shadows=1024&msaa=0&dpr=1`.
 */
const q = new URLSearchParams(window.location.search);
const num = (key: string, fallback: number) => {
  const v = q.get(key);
  return v === null || Number.isNaN(Number(v)) ? fallback : Number(v);
};

export const settings = {
  ao: num('ao', 0) > 0,
  shadowMap: num('shadows', 2048),
  msaa: num('msaa', 4),
  dpr: num('dpr', 1.5),
  /** `?ui=0` hides the dashboard (clean captures, profiling). */
  ui: num('ui', 1) > 0,
};
