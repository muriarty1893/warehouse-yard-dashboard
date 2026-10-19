import { ArrowUpRight, Crosshair, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useUi, type EntityRef } from '../state/ui';
import { useView } from '../state/view';
import { focusEntity } from './focus';
import { Bar, IconButton, IconTile, Pill, type Tone } from './kit';

/** Building blocks of the detail panel cards. */

export function Header({ icon, eyebrow, title, subtitle, entity }: { icon: ReactNode; eyebrow: string; title: string; subtitle: string; entity?: EntityRef }) {
  const select = useUi((s) => s.select);
  const follow = useView((s) => s.follow);
  const setFollow = useView((s) => s.setFollow);
  const send = useView((s) => s.send);
  const following = !!entity && follow?.kind === entity.kind && follow.id === entity.id;
  const movable = entity && entity.kind !== 'cargo';
  return (
    <div className="flex items-start gap-3 px-4 pt-4 pb-3">
      <IconTile tone="soft" size="lg">
        {icon}
      </IconTile>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[10.5px] font-bold tracking-[0.08em] text-brand uppercase">{eyebrow}</div>
        <div className="mt-0.5 truncate text-[17px] font-bold text-ink">{title}</div>
        <div className="mt-0.5 text-[12px] leading-snug text-muted">{subtitle}</div>
      </div>
      <div className="-mr-1.5 flex shrink-0">
        <IconButton title={entity ? 'Locate (F)' : 'Home view (H)'} onClick={() => (entity ? focusEntity(entity) : send({ kind: 'home' }))}>
          <Crosshair size={16} />
        </IconButton>
        {movable && (
          <IconButton
            title={following ? 'Stop following' : 'Follow with camera'}
            active={following}
            onClick={() => {
              if (following) setFollow(null);
              else {
                focusEntity(entity);
                setFollow(entity);
              }
            }}
          >
            <ArrowUpRight size={16} />
          </IconButton>
        )}
        {entity && (
          <IconButton
            title="Close (Esc)"
            onClick={() => {
              select(null);
              setFollow(null);
            }}
          >
            <X size={16} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

export function StatusLine({ tone, label, detail }: { tone: Tone; label: string; detail: string }) {
  return (
    <div className="mx-4 flex items-center gap-2 rounded-xl bg-[#f5f7fb] px-2 py-1.5">
      <Pill tone={tone}>{label}</Pill>
      <span className="truncate text-[11.5px] text-muted">{detail}</span>
    </div>
  );
}

export function Meter({ value, tone, left, right }: { value: number; tone: Tone; left?: string; right: string }) {
  return (
    <div className="mx-4 mt-2.5 flex items-center gap-3">
      {left && <span className="text-[11.5px] text-muted">{left}</span>}
      <Bar value={value} tone={tone} className="flex-1" />
      <span className="text-[11.5px] font-semibold text-muted tabular-nums">{right}</span>
    </div>
  );
}

export const Rows = ({ children }: { children: ReactNode }) => <div className="px-4 pt-2 pb-3">{children}</div>;
export const Link = ({ children }: { children: ReactNode }) => <span className="text-brand">{children}</span>;


export function Tile({ label, value, of, bar, tone = 'blue' }: { label: string; value: string; of?: string; bar?: number; tone?: Tone }) {
  return (
    <div className="rounded-xl bg-[#f5f7fb] p-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold text-ink tabular-nums">
        {value}
        {of && <span className="text-[11.5px] font-medium text-muted"> {of}</span>}
      </div>
      {bar !== undefined && <Bar value={bar} tone={tone} className="mt-1.5" />}
    </div>
  );
}


export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-4 pt-3">
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="font-semibold text-ink">{title}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5 px-4 pt-2.5">{children}</div>;
}
