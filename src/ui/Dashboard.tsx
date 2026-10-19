import { useEffect } from 'react';
import { startWorldSync } from '../world/store';
import { DetailPanel } from './DetailPanel';
import { Dialogs } from './Dialog';
import { Toasts, PlacementBanner } from './Toasts';
import { KpiCards } from './KpiCards';
import { LayersPanel, OverlayLegend } from './LayersPanel';
import { Minimap } from './Minimap';
import { useLayers } from '../state/layers';
import { useUi } from '../state/ui';
import { useView } from '../state/view';
import { Card } from './kit';
import { HelpPanel, MapButtons } from './MapButtons';
import { OpsTable } from './OpsTable';
import { ShipmentTracker } from './ShipmentTracker';
import { TopBar } from './TopBar';

/** Legend of the active map colouring, while the layers panel is closed. */
function LegendChip() {
  const overlay = useLayers((s) => s.overlay);
  const placing = useUi((s) => !!s.placing);
  const panel = useView((s) => s.layers);
  if (overlay === 'none' || placing || panel) return null;
  const titles = { areas: 'Storage space', documents: 'Paperwork', destination: 'Destination' } as const;
  return (
    <div className="pointer-events-none absolute top-[172px] left-1/2 z-20 -translate-x-1/2">
      <Card className="px-3 py-2">
        <div className="flex items-center gap-3 whitespace-nowrap">
          <span className="text-[11.5px] font-semibold whitespace-nowrap text-ink">Map: {titles[overlay]}</span>
          <div className="-mt-2">
            <OverlayLegend />
          </div>
          <button type="button" onClick={() => useLayers.getState().set({ overlay: 'none' })} className="text-[11px] font-semibold whitespace-nowrap text-brand">
            Clear
          </button>
        </div>
      </Card>
    </div>
  );
}

/** Operations dashboard over the 3D twin. Reads the World State snapshot only. */
export function Dashboard() {
  useEffect(() => startWorldSync(), []);
  return (
    <>
      <TopBar />
      <KpiCards />
      <div className="pointer-events-none absolute top-[76px] right-4 bottom-[240px] z-10 flex items-start gap-3">
        <HelpPanel />
        <LayersPanel />
        <MapButtons />
        <div className="flex max-h-full min-h-0 flex-col">
          <DetailPanel />
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden xl:block">
        <ShipmentTracker />
      </div>
      <div className="pointer-events-none absolute right-4 bottom-4 z-10">
        <OpsTable />
      </div>
      <div className="pointer-events-none absolute top-[176px] left-4 z-10 hidden md:block">
        <Minimap />
      </div>
      <LegendChip />
      <PlacementBanner />
      <Toasts />
      <Dialogs />
    </>
  );
}
