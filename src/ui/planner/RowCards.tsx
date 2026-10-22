import { useEffect, useRef } from 'react';
import { planOf, useLoading } from '../../loading/store';
import { useView } from '../../state/view';
import { Bar } from '../kit';
import { freeArea, rowAnchors } from './anchors';
import { fmtKg } from './format';

const GAP = 8;

/**
 * One card per ≈1.2 m row of the truck along the top of the 3D view, with a
 * dotted leader line to the row (spec §2.2). Positions are written straight
 * to the DOM each frame; React only renders when the plan changes.
 */
export function RowCards({ truckId }: { truckId: string }) {
  const plan = useLoading((s) => planOf(s, truckId));
  const view = useView((s) => s.plannerView);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const lines = useRef<SVGPathElement>(null);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const rows = plan?.rows ?? [];

  useEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const area = freeArea();
      const key = `${rowAnchors.version}|${area.left}|${area.right}|${area.top}`;
      if (key === last) return;
      last = key;
      const n = rows.length;
      const width = Math.min(124, (area.right - area.left - 24 - GAP * (n - 1)) / n);
      const start = (area.left + area.right) / 2 - (n * width + GAP * (n - 1)) / 2;
      const top = area.top + 10;
      // Cards keep the on-screen order of their rows so leader lines never cross.
      const order = rows.map((_, i) => i).sort((a, b) => (rowAnchors.points[a]?.x ?? a) - (rowAnchors.points[b]?.x ?? b));
      let d = '';
      order.forEach((row, slot) => {
        const card = cards.current[row];
        const p = rowAnchors.points[row];
        if (!card) return;
        const x = start + slot * (width + GAP);
        card.style.transform = `translate(${x}px, ${top}px)`;
        card.style.width = `${width}px`;
        card.style.opacity = p?.visible ? '1' : '0';
        const dot = dots.current[row];
        if (!p?.visible) {
          dot?.setAttribute('r', '0');
          return;
        }
        const cx = x + width / 2;
        const cy = top + card.offsetHeight;
        d += `M${cx},${cy} C${cx},${cy + 30} ${p.x},${p.y - 30} ${p.x},${p.y} `;
        dot?.setAttribute('cx', String(p.x));
        dot?.setAttribute('cy', String(p.y));
        dot?.setAttribute('r', '2.6');
      });
      lines.current?.setAttribute('d', d);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [rows]);

  if (!plan || view === 'plan' || !plan.placements.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      <svg className="absolute inset-0 h-full w-full">
        <path ref={lines} fill="none" stroke="#6f7c99" strokeWidth="1.2" strokeDasharray="2 3" />
        {rows.map((r, i) => (
          <circle
            key={r.index}
            ref={(c) => {
              dots.current[i] = c;
            }}
            r="0"
            fill="#fff"
            stroke="#6f7c99"
          />
        ))}
      </svg>
      {rows.map((r, i) => (
        <div
          key={r.index}
          ref={(el) => {
            cards.current[i] = el;
          }}
          className="absolute top-0 left-0 rounded-xl bg-white/95 px-2.5 py-2 shadow-[0_6px_18px_rgba(27,42,74,0.12)] ring-1 ring-ink/5 transition-[transform,opacity] duration-300"
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className="rounded-md bg-[#e8eefe] px-1.5 py-px font-mono font-semibold text-brand">R{String(r.index).padStart(2, '0')}</span>
            <span className="font-mono text-muted tabular-nums">{Math.round(r.fillPct)}%</span>
          </div>
          <div className="mt-1.5 truncate text-[11.5px] font-semibold text-ink">{r.topId ?? '—'}</div>
          <div className="truncate text-[10.5px] text-muted">{fmtKg(r.kg)}</div>
          <Bar value={r.fillPct / 100} tone={r.fillPct > 85 ? 'amber' : 'blue'} className="mt-1.5" />
        </div>
      ))}
    </div>
  );
}
