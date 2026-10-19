import { ArrowDown, ArrowUp, FileText, Layers, Package, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useWorld } from '../world/store';
import { Card, IconTile } from './kit';

function Kpi({ icon, label, value, delta, sub }: { icon: ReactNode; label: string; value: string; delta?: { text: string; up: boolean }; sub: string }) {
  return (
    <Card className="flex w-[208px] items-center gap-3 px-3.5 py-3">
      <IconTile size="lg">{icon}</IconTile>
      <div className="min-w-0 leading-tight">
        <div className="text-[12px] font-medium text-muted">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-[22px] font-bold tracking-tight text-ink tabular-nums">{value}</span>
          {delta && (
            <span className={`flex items-center text-[11.5px] font-semibold ${delta.up ? 'text-[#1f9254]' : 'text-[#d64545]'}`}>
              {delta.up ? <ArrowUp size={12} strokeWidth={2.6} /> : <ArrowDown size={12} strokeWidth={2.6} />}
              {delta.text}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-faint">{sub}</div>
      </div>
    </Card>
  );
}

export function KpiCards() {
  const k = useWorld((s) => s.kpis);
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;
  return (
    <div className="pointer-events-none absolute top-[76px] left-4 z-10 hidden gap-3 md:flex">
      <Kpi icon={<Package size={20} />} label="Cargo in yard" value={k.cargo.toLocaleString('en-US')} delta={{ text: signed(k.cargoDelta), up: k.cargoDelta >= 0 }} sub="units · YD-01" />
      <Kpi icon={<Truck size={20} />} label="Trucks on site" value={String(k.trucksOnSite)} delta={{ text: `+${k.arrivalsToday}`, up: true }} sub={`${k.inbound} inbound · YD-01`} />
      <Kpi icon={<Layers size={20} />} label="Storage used" value={`${k.storagePct.toFixed(0)}%`} sub={`${k.spotsUsed} of ${k.spotsTotal} spots`} />
      <div className="hidden 2xl:block">
        <Kpi icon={<FileText size={20} />} label="Missing paperwork" value={String(k.docsMissing)} sub={`${k.docsDraft} drafts · ${k.documents} documents`} />
      </div>
    </div>
  );
}
