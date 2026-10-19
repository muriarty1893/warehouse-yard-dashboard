import { House, Keyboard, Layers, Map as MapIcon, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { useView } from '../state/view';
import { Card, IconButton, Kbd } from './kit';

export function MapButtons() {
  const send = useView((s) => s.send);
  const help = useView((s) => s.help);
  const toggleHelp = useView((s) => s.toggleHelp);
  const layers = useView((s) => s.layers);
  const toggleLayers = useView((s) => s.toggleLayers);
  return (
    <Card className="flex flex-col items-center gap-0.5 p-1">
      <IconButton title="Map layers & lighting (L)" onClick={() => toggleLayers()} active={layers}>
        <Layers size={16} />
      </IconButton>
      <div className="my-0.5 h-px w-6 bg-line" />
      <IconButton title="Zoom in (Z)" onClick={() => send({ kind: 'zoom', factor: 0.7 })}>
        <Plus size={17} />
      </IconButton>
      <IconButton title="Zoom out (X)" onClick={() => send({ kind: 'zoom', factor: 1.4 })}>
        <Minus size={17} />
      </IconButton>
      <div className="my-0.5 h-px w-6 bg-line" />
      <IconButton title="Rotate left (Q)" onClick={() => send({ kind: 'rotate', angle: Math.PI / 6 })}>
        <RotateCcw size={16} />
      </IconButton>
      <IconButton title="Rotate right (E)" onClick={() => send({ kind: 'rotate', angle: -Math.PI / 6 })}>
        <RotateCw size={16} />
      </IconButton>
      <IconButton title="Home view (H)" onClick={() => send({ kind: 'home' })}>
        <House size={16} />
      </IconButton>
      <IconButton title="Top-down plan view (T)" onClick={() => send({ kind: 'top' })}>
        <MapIcon size={16} />
      </IconButton>
      <div className="my-0.5 h-px w-6 bg-line" />
      <IconButton title="Keyboard controls (?)" onClick={() => toggleHelp()} active={help}>
        <Keyboard size={16} />
      </IconButton>
    </Card>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['W', 'A', 'S', 'D'], 'Pan (hold Shift for fast)'],
  [['Q', 'E'], 'Rotate'],
  [['Z', 'X'], 'Zoom in / out'],
  [['H', 'T'], 'Home view · top-down view'],
  [['F'], 'Focus selection'],
  [['C'], 'Register cargo'],
  [['M'], 'Move selected cargo'],
  [['R'], 'Turn the unit being placed'],
  [['G'], 'Hold / resume selected vehicle'],
  [['L', 'O'], 'Layers · cycle map colouring'],
  [['N'], 'Day / night'],
  [['Space'], 'Pause / resume time'],
  [['1', '2', '3', '4'], 'Speed 1× · 2× · 4× · 8×'],
  [['/'], 'Search'],
  [['Esc'], 'Cancel / clear selection'],
];

export function HelpPanel() {
  const help = useView((s) => s.help);
  const toggleHelp = useView((s) => s.toggleHelp);
  if (!help) return null;
  return (
    <Card className="w-[300px] p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-ink">Controls</span>
        <button type="button" onClick={() => toggleHelp(false)} className="text-[11px] font-semibold text-brand">
          Close
        </button>
      </div>
      <div className="space-y-1.5">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="flex gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
            <span className="text-right text-muted">{label}</span>
          </div>
        ))}
        <div className="mt-2 border-t border-line pt-2 text-[11.5px] leading-relaxed text-muted">
          Mouse: drag to pan, right-drag to rotate, scroll to zoom. Click to select, double-click to fly to it. While placing cargo, click a free spot or a unit to stack on.
        </div>
      </div>
    </Card>
  );
}
