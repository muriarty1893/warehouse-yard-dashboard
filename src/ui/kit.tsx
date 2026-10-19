import type { ReactNode } from 'react';

/** Small presentational pieces shared by the dashboard panels. */

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`pointer-events-auto rounded-2xl bg-white/95 shadow-[0_8px_30px_rgba(27,42,74,0.12)] ring-1 ring-ink/5 ${className}`}>{children}</div>;
}

export type Tone = 'green' | 'blue' | 'amber' | 'gray' | 'red' | 'violet';

const TONES: Record<Tone, string> = {
  green: 'bg-[#e5f6ec] text-[#1f9254]',
  blue: 'bg-[#e8eefe] text-brand',
  amber: 'bg-[#fff1df] text-[#c4640a]',
  gray: 'bg-[#eef1f6] text-muted',
  red: 'bg-[#fdecec] text-[#d64545]',
  violet: 'bg-[#f0ebfe] text-[#6b4ee6]',
};

const BARS: Record<Tone, string> = {
  green: 'bg-[#22b35e]',
  blue: 'bg-brand',
  amber: 'bg-[#f0932b]',
  gray: 'bg-[#aab3c5]',
  red: 'bg-[#e05252]',
  violet: 'bg-[#7a5af0]',
};

export function Pill({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}>{children}</span>;
}

export function Bar({ value, tone = 'green', className = '' }: { value: number; tone?: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-[#e9edf4] ${className}`}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${BARS[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function IconTile({ children, tone = 'blue', size = 'md' }: { children: ReactNode; tone?: 'blue' | 'soft'; size?: 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-11 w-11 rounded-xl' : 'h-9 w-9 rounded-[10px]';
  const colors = tone === 'blue' ? 'bg-brand text-white' : 'bg-[#e8eefe] text-brand';
  return <div className={`flex shrink-0 items-center justify-center ${dims} ${colors}`}>{children}</div>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line py-[7px] text-[12.5px] first:border-t-0">
      <span className="text-muted">{label}</span>
      <span className="truncate text-right font-semibold text-ink">{children}</span>
    </div>
  );
}

export function IconButton({ title, onClick, active = false, children }: { title: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${active ? 'bg-brand text-white' : 'text-muted hover:bg-[#eef1f6] hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-[#f6f8fb] px-1 font-sans text-[10.5px] font-semibold text-muted">{children}</kbd>;
}
