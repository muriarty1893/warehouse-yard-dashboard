import { useEffect } from 'react';
import { startWorldSync } from '../world/store';
import { DetailPanel } from './DetailPanel';
import { KpiCards } from './KpiCards';
import { HelpPanel, MapButtons } from './MapButtons';
import { OpsTable } from './OpsTable';
import { ShipmentTracker } from './ShipmentTracker';
import { TopBar } from './TopBar';

/** Operations dashboard over the 3D twin. Reads the World State snapshot only. */
export function Dashboard() {
  useEffect(() => startWorldSync(), []);
  return (
    <>
      <TopBar />
      <KpiCards />
      <div className="pointer-events-none absolute top-[76px] right-4 bottom-[240px] z-10 flex items-start gap-3">
        <HelpPanel />
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
    </>
  );
}
