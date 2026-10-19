import { create } from 'zustand';

/**
 * Map layers and lighting: what the 3D view shows. A per-viewer preference,
 * remembered in this browser.
 */

export type Overlay = 'none' | 'areas' | 'documents' | 'destination';
export const OVERLAYS: Overlay[] = ['none', 'areas', 'documents', 'destination'];

export interface Layers {
  overlay: Overlay;
  /** Name tags above every vehicle and person, not just the hovered one. */
  tags: boolean;
  /** Planned routes of moving vehicles. */
  routes: boolean;
  roofs: boolean;
  /** Full-height boundary walls, or cut down to see in. */
  walls: boolean;
  /** Map reference grid (A1…) on the floor. */
  grid: boolean;
  nature: boolean;
  traffic: boolean;
  minimap: boolean;
  /** Hour of day for the lighting (5–22), or follow the yard clock. */
  hour: number;
  followClock: boolean;
}

const DEFAULTS: Layers = {
  overlay: 'none',
  tags: false,
  routes: false,
  roofs: true,
  walls: true,
  grid: false,
  nature: true,
  traffic: true,
  minimap: true,
  hour: 14.5,
  followClock: false,
};

const KEY = 'docktor.layers';

function load(): Layers {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Layers>) } : DEFAULTS;
    return OVERLAYS.includes(saved.overlay) ? saved : { ...saved, overlay: 'none' };
  } catch {
    return DEFAULTS;
  }
}

export type ToggleKey = 'tags' | 'routes' | 'roofs' | 'walls' | 'grid' | 'nature' | 'traffic' | 'minimap';

interface LayersState extends Layers {
  set: (patch: Partial<Layers>) => void;
  toggle: (key: ToggleKey) => void;
  cycleOverlay: () => void;
}

export const useLayers = create<LayersState>((set, get) => ({
  ...load(),
  set: (patch) => set(patch),
  toggle: (key) => set({ [key]: !get()[key] }),
  cycleOverlay: () => set({ overlay: OVERLAYS[(OVERLAYS.indexOf(get().overlay) + 1) % OVERLAYS.length] }),
}));

useLayers.subscribe((s) => {
  const { overlay, tags, routes, roofs, walls, grid, nature, traffic, minimap, hour, followClock } = s;
  try {
    localStorage.setItem(KEY, JSON.stringify({ overlay, tags, routes, roofs, walls, grid, nature, traffic, minimap, hour, followClock }));
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
});

export const TIME_PRESETS = [
  { label: 'Morning', hour: 8 },
  { label: 'Day', hour: 14.5 },
  { label: 'Dusk', hour: 19.2 },
  { label: 'Night', hour: 22 },
] as const;
