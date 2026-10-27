import type { CSSProperties, ReactNode } from 'react';

/** Small presentational pieces shared by the dashboard panels. */

export function Card({ className = '', style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={`pointer-events-auto rounded-2xl bg-white/95 shadow-[0_8px_30px_rgba(27,42,74,0.12)] ring-1 ring-ink/5 ${className}`} style={style}>
      {children}
    </div>
  );
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

// ---------------------------------------------------------------------------
// Form controls

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 flex items-baseline justify-between text-[11.5px] font-semibold text-muted">
        {label}
        {hint && <span className="font-normal text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand/50 focus:ring-2 focus:ring-brand/15';

export function Button({
  children,
  onClick,
  tone = 'secondary',
  disabled = false,
  title,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const tones = {
    primary: 'bg-brand text-white hover:bg-[#2552d8] disabled:bg-[#9db3f5]',
    secondary: 'bg-[#eef1f6] text-ink hover:bg-[#e3e8f1] disabled:text-faint',
    danger: 'bg-[#fdecec] text-[#d64545] hover:bg-[#fadcdc]',
    ghost: 'text-brand hover:bg-[#eef3ff]',
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-xl bg-[#f0f3f8] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[10px] px-2 py-1 text-[11.5px] font-semibold ${value === o.value ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: () => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={onChange} className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left hover:bg-[#f5f7fb]">
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[12.5px] font-medium text-ink">{label}</span>
        {hint && <span className="block text-[11px] text-faint">{hint}</span>}
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-[#d5dbe6]'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

/** The Docktor mark and name. */
export function Logo() {
  return (
    <div className="pointer-events-auto flex items-center gap-2.5 pr-2">
      <svg width="30" height="30" viewBox="0 0 28 28" aria-hidden>
        <rect width="28" height="28" rx="7" fill="#2f5ff0" />
        <path d="M14 6.5l6.5 3.75L14 14 7.5 10.25z" fill="#fff" />
        <path d="M7.5 10.25L14 14v7.5l-6.5-3.75z" fill="#fff" fillOpacity=".7" />
        <path d="M20.5 10.25L14 14v7.5l6.5-3.75z" fill="#fff" fillOpacity=".45" />
      </svg>
      <span className="text-[20px] font-bold tracking-tight text-ink">Docktor</span>
    </div>
  );
}
