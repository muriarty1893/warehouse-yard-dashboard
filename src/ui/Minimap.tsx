import { useEffect, useRef } from 'react';
import { devYard } from '../config/devYard';
import { yardBounds } from '../domain/yard';
import { cameraView } from '../scene/CameraRig';
import { useLayers } from '../state/layers';
import { useUi } from '../state/ui';
import { useInventory } from '../world/inventory';
import { useWorld } from '../world/store';
import { focusPoint } from './focus';
import { Card } from './kit';

/**
 * Strategy-game minimap: the yard plan with live vehicles, people and cargo,
 * the camera's view direction, click (or drag) to move the camera there.
 */

const yb = yardBounds(devYard);
const PAD = 6;
const W = 232;
const K = (W - PAD * 2) / yb.w;
const H = Math.round(yb.h * K + PAD * 2);
const X = (x: number) => PAD + (x - yb.x0) * K;
const Y = (y: number) => H - PAD - (y - yb.y0) * K;

function drawStatic(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#eef1f7';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  devYard.boundary.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#9aa3b8';
  ctx.lineWidth = 2;
  ctx.stroke();
  for (const a of devYard.storage) {
    for (const part of a.parts) {
      ctx.beginPath();
      part.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.closePath();
      ctx.fillStyle = 'rgba(245, 208, 0, 0.22)';
      ctx.fill();
    }
  }
  for (const b of devYard.buildings) {
    ctx.fillStyle = b.kind === 'canopy' ? 'rgba(47, 95, 240, 0.12)' : '#7a8296';
    ctx.fillRect(X(b.rect.x), Y(b.rect.y + b.rect.h), b.rect.w * K, b.rect.h * K);
    if (b.kind === 'canopy') {
      ctx.strokeStyle = 'rgba(47, 95, 240, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(X(b.rect.x), Y(b.rect.y + b.rect.h), b.rect.w * K, b.rect.h * K);
    }
  }
  for (const g of devYard.gates) {
    ctx.strokeStyle = g.closed ? '#2f5ff0' : '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(X(g.a[0]), Y(g.a[1]));
    ctx.lineTo(X(g.b[0]), Y(g.b[1]));
    ctx.stroke();
  }
}

export function Minimap() {
  const on = useLayers((s) => s.minimap);
  const canvas = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 100) return;
      last = now;
      const ctx = canvas.current?.getContext('2d');
      if (!ctx) return;
      drawStatic(ctx);
      const { cargo } = useInventory.getState();
      ctx.fillStyle = '#c9a227';
      for (const c of cargo) if (!c.on && !c.loadedOn) ctx.fillRect(X(c.x) - 1.2, Y(c.y) - 1.2, 2.4, 2.4);
      const w = useWorld.getState();
      const sel = useUi.getState().selected;
      for (const t of w.trucks) {
        if (!t.onSite && t.where !== 'Public road') continue;
        ctx.fillStyle = t.held ? '#e05252' : '#2f5ff0';
        ctx.fillRect(X(t.x) - 3, Y(t.y) - 3, 6, 6);
      }
      for (const f of w.forklifts) {
        ctx.fillStyle = f.held ? '#e05252' : '#f0a020';
        ctx.beginPath();
        ctx.arc(X(f.x), Y(f.y), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ff7a1a';
      for (const p of w.workers) ctx.fillRect(X(p.x) - 1.3, Y(p.y) - 1.3, 2.6, 2.6);
      if (sel && sel.kind !== 'cargo') {
        const e = [...w.trucks, ...w.forklifts, ...w.workers].find((x) => x.id === sel.id);
        if (e) {
          ctx.strokeStyle = '#1b2a4a';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(X(e.x), Y(e.y), 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // Camera: where it looks and the view cone.
      const cx = X(cameraView.x);
      const cy = Y(cameraView.y);
      const dir = -cameraView.yaw - Math.PI / 2; // screen angle of the look direction
      const r = Math.min(60, 14 + cameraView.distance * 0.35);
      ctx.fillStyle = 'rgba(47, 95, 240, 0.14)';
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(dir) * r * 0.55, cy - Math.sin(dir) * r * 0.55);
      ctx.arc(cx - Math.cos(dir) * r * 0.55, cy - Math.sin(dir) * r * 0.55, r, dir - 0.5, dir + 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2f5ff0';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  if (!on) return null;
  const jump = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    focusPoint(yb.x0 + (px - PAD) / K, yb.y0 + (H - PAD - py) / K, Math.max(20, Math.min(90, cameraView.distance)));
  };
  return (
    <Card className="overflow-hidden p-1.5">
      <canvas
        ref={canvas}
        width={W}
        height={H}
        className="block cursor-crosshair rounded-lg"
        style={{ width: W, height: H }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => dragging.current && jump(e)}
        onPointerUp={() => (dragging.current = false)}
      />
      <div className="flex items-center justify-between px-1 pt-1 text-[10.5px] text-faint">
        <span>Click to move the camera</span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <i className="inline-block h-2 w-2 bg-brand" /> truck
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-full bg-[#f0a020]" /> forklift
          </span>
        </span>
      </div>
    </Card>
  );
}
