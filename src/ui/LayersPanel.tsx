import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import type { ReactNode } from 'react';
import { OVERLAY_TONES, destinationColor } from '../scene/cargo/Overlays';
import { useLayers, TIME_PRESETS, type Overlay, type ToggleKey } from '../state/layers';
import { useView } from '../state/view';
import { useInventory } from '../world/inventory';
import { Card, Segmented, Toggle } from './kit';

/** Map layers, overlays and lighting — the "view" menu of the twin. */

const OVERLAY_OPTIONS: { value: Overlay; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'areas', label: 'Space' },
  { value: 'documents', label: 'Paperwork' },
  { value: 'destination', label: 'Destination' },
];

const TOGGLES: { key: ToggleKey; label: string; hint: string }[] = [
  { key: 'walls', label: 'High walls', hint: 'Off: cut down to see over them' },
  { key: 'roofs', label: 'Canopy roofs', hint: 'Off: look into the hold spaces' },
  { key: 'tags', label: 'Name tags', hint: 'Label every vehicle and person' },
  { key: 'routes', label: 'Vehicle routes', hint: 'Planned paths on the floor' },
  { key: 'grid', label: 'Reference grid', hint: 'A1…N9, for reading out locations' },
  { key: 'minimap', label: 'Minimap', hint: '' },
  { key: 'nature', label: 'Trees & planting', hint: '' },
  { key: 'traffic', label: 'Road traffic', hint: '' },
];

const PRESET_ICONS = [Sunrise, Sun, Sunset, Moon];

const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-2 flex max-w-[640px] flex-wrap gap-x-3 gap-y-1">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

export function OverlayLegend() {
  const overlay = useLayers((s) => s.overlay);
  const cargo = useInventory((s) => s.cargo);
  if (overlay === 'none') return null;
  const items: [string, string][] =
    overlay === 'areas'
      ? [
          [OVERLAY_TONES.green, 'Room to spare'],
          [OVERLAY_TONES.amber, 'Filling up (65 %+)'],
          [OVERLAY_TONES.red, 'Tight (85 %+)'],
        ]
      : overlay === 'documents'
        ? [
            [OVERLAY_TONES.green, 'Confirmed document'],
            [OVERLAY_TONES.amber, 'Draft only'],
            [OVERLAY_TONES.red, 'No document'],
          ]
        : [...new Set(cargo.map((c) => c.destination))].sort().map((d) => [destinationColor(d), d] as [string, string]);
  return <Legend items={items} />;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-line px-3.5 py-3 first:border-t-0">
      <div className="mb-2 text-[10.5px] font-bold tracking-[0.08em] text-faint uppercase">{title}</div>
      {children}
    </div>
  );
}

export function LayersPanel() {
  const open = useView((s) => s.layers);
  const toggleLayers = useView((s) => s.toggleLayers);
  const layers = useLayers();
  if (!open) return null;
  return (
    <Card className="max-h-full w-[300px] overflow-y-auto">
      <div className="flex items-center justify-between px-3.5 pt-3">
        <span className="text-[13px] font-semibold text-ink">Map layers</span>
        <button type="button" onClick={() => toggleLayers(false)} className="text-[11px] font-semibold text-brand">
          Close
        </button>
      </div>
      <Group title="Colour the map by (O)">
        <Segmented value={layers.overlay} options={OVERLAY_OPTIONS} onChange={(overlay) => layers.set({ overlay })} />
        <OverlayLegend />
      </Group>
      <Group title={`Lighting · ${fmtHour(layers.hour)}`}>
        <div className="mb-2 grid grid-cols-4 gap-1">
          {TIME_PRESETS.map((p, i) => {
            const Icon = PRESET_ICONS[i];
            const active = !layers.followClock && Math.abs(layers.hour - p.hour) < 0.01;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => layers.set({ hour: p.hour, followClock: false })}
                className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10.5px] font-semibold ${active ? 'bg-[#e8eefe] text-brand' : 'text-muted hover:bg-[#f5f7fb]'}`}
              >
                <Icon size={15} />
                {p.label}
              </button>
            );
          })}
        </div>
        <input
          type="range"
          min={5}
          max={22.5}
          step={0.25}
          value={layers.hour}
          onChange={(e) => layers.set({ hour: Number(e.target.value), followClock: false })}
          className="w-full accent-[#2f5ff0]"
          aria-label="Hour of day"
        />
        <Toggle on={layers.followClock} onChange={() => layers.set({ followClock: !layers.followClock })} label="Follow the yard clock" hint="Light changes as simulated time passes" />
      </Group>
      <Group title="Show">
        {TOGGLES.map((t) => (
          <Toggle key={t.key} on={layers[t.key]} onChange={() => layers.toggle(t.key)} label={t.label} hint={t.hint || undefined} />
        ))}
      </Group>
    </Card>
  );
}
