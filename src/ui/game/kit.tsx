import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

/**
 * Building blocks of the "broadcast scoreboard" look (spec §4.1): slanted
 * solid panels, condensed italic numbers, navy / brand / hot orange. Orange
 * fills always carry navy text (contrast ≥ 4.5:1).
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** A skewed box whose children stand upright. */
export function Slant({ className, inner, children }: { className?: string; inner?: string; children: ReactNode }) {
  return (
    <div className={cx('slant', className)}>
      <div className={cx('unslant', inner)}>{children}</div>
    </div>
  );
}

/** Display-font number or label: condensed, italic, extra bold, tabular. */
export function Num({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cx('font-display font-extrabold italic tabular-nums', className)}>{children}</span>;
}

/** A navy panel with a soft drop shadow. */
export function Panel({ className, children, label }: { className?: string; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className={cx('pointer-events-auto bg-navy/95 text-white shadow-[0_6px_16px_rgba(11,29,79,0.3)]', className)}>
      {children}
    </section>
  );
}

/** Brand-blue panel header: icon, title, and an orange count tag. */
export function PanelHead({ icon, title, count }: { icon?: ReactNode; title: string; count?: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 bg-brand px-2.5 py-1">
      {icon && <span className="shrink-0">{icon}</span>}
      <Num className="text-[14px] uppercase">{title}</Num>
      {count !== undefined && (
        <Slant className="ml-auto bg-hot px-1.5 text-navy">
          <Num className="text-[12px]">{count}</Num>
        </Slant>
      )}
    </div>
  );
}

const TAG_TONE = {
  in: 'bg-brand text-white',
  out: 'bg-go text-white',
  move: 'bg-move text-white',
  free: 'bg-white/15 text-white',
  late: 'bg-stop text-white',
  new: 'bg-hot text-navy',
} as const;

/** A short slanted label: IN, OUT, LOAD, LATE… (text, so colour is never the only signal). */
export function Tag({ tone, children, className }: { tone: keyof typeof TAG_TONE; children: ReactNode; className?: string }) {
  return (
    <Slant className={cx('inline-block shrink-0 px-1.5', TAG_TONE[tone], className)}>
      <Num className="text-[11px] uppercase">{children}</Num>
    </Slant>
  );
}

const CHIP_TONE = { ok: 'bg-white/12 text-white', warn: 'bg-hot text-navy', bad: 'bg-stop text-white' } as const;

/** A small status chip (minutes waited, €/min running). */
export function Chip({ tone, children, className }: { tone: keyof typeof CHIP_TONE; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex shrink-0 items-center gap-1 px-1.5 py-px text-[11px] font-bold whitespace-nowrap', CHIP_TONE[tone], className)}>{children}</span>;
}

const BTN_TONE = {
  hot: 'bg-hot text-navy hover:brightness-105',
  paper: 'bg-paper text-navy hover:bg-[#eef2fb]',
  brand: 'bg-brand text-white hover:brightness-110',
  ghost: 'bg-white/12 text-white hover:bg-white/20',
  light: 'bg-[#eef1f7] text-navy hover:bg-[#e3e8f2]',
} as const;

/**
 * A slanted button. A disabled one keeps its reason readable: as a tooltip
 * and to screen readers.
 */
export function Btn({ tone = 'paper', disabledReason, className, children, ...rest }: { tone?: keyof typeof BTN_TONE; disabledReason?: string | null } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const id = useId();
  const disabled = !!disabledReason || rest.disabled;
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      title={disabledReason ?? rest.title}
      aria-describedby={disabledReason ? id : undefined}
      className={cx(
        'slant pointer-events-auto inline-flex cursor-pointer items-center px-3 py-1 outline-offset-2 focus-visible:outline-2 focus-visible:outline-hot',
        disabled ? 'cursor-not-allowed bg-[#e3e7ef] text-[#5d6a87]' : BTN_TONE[tone],
        className,
      )}
    >
      <span className="unslant inline-flex items-center gap-1.5 font-display text-[13px] font-extrabold uppercase italic">{children}</span>
      {disabledReason && (
        <span id={id} className="sr-only">
          {disabledReason}
        </span>
      )}
    </button>
  );
}

/** n of 3 stars, filled orange (with a text label for screen readers). */
export function Stars({ n, of = 3, className }: { n: number; of?: number; className?: string }) {
  return (
    <span className={cx('inline-flex gap-px', className)} role="img" aria-label={`${n} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className={cx('h-[1em] w-[1em]', i < n ? 'fill-hot' : 'fill-current opacity-25')} aria-hidden>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}
