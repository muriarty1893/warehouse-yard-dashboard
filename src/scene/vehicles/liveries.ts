import type { Carrier } from '../../domain/types';
import { CARRIER_NAMES } from '../../domain/vehicles';
import { canvasTexture, drawLogoMark, FONT, palette } from '../kit';

export interface Livery {
  name: string;
  tagline: string;
  cab: string;
  accent: string;
}

export const LIVERIES: Record<Carrier, Livery> = {
  docktor: { name: CARRIER_NAMES.docktor, tagline: 'Yard logistics · Live twin', cab: palette.blue, accent: palette.blue },
  nordline: { name: CARRIER_NAMES.nordline, tagline: 'Freight & Distribution', cab: '#f4f6fa', accent: '#16a39b' },
  cargoviva: { name: CARRIER_NAMES.cargoviva, tagline: 'Cargo across Türkiye', cab: '#f4f6fa', accent: '#f07d2a' },
  bluepeak: { name: CARRIER_NAMES.bluepeak, tagline: 'Transport', cab: '#1d2b5a', accent: '#2f5ff0' },
};

/** Box-body / trailer side graphic. `aspect` = panel width / height. */
export function sideTexture(carrier: Carrier, aspect: number) {
  const H = 256;
  const W = Math.round(H * aspect);
  const lv = LIVERIES[carrier];
  return canvasTexture(`side|${carrier}|${aspect.toFixed(2)}`, W, H, (ctx, w, h) => {
    ctx.fillStyle = palette.white;
    ctx.fillRect(0, 0, w, h);
    const big = Math.min(h * 0.34, w * 0.09);
    ctx.textBaseline = 'middle';
    switch (carrier) {
      case 'docktor': {
        const s = h * 0.36;
        const x = w * 0.5 - (s + big * 3.2) / 2;
        drawLogoMark(ctx, x, h * 0.3, s);
        ctx.fillStyle = palette.navy;
        ctx.font = `800 ${big}px ${FONT}`;
        ctx.fillText(lv.name, x + s * 1.2, h * 0.43);
        ctx.fillStyle = palette.blue;
        ctx.font = `600 ${big * 0.36}px ${FONT}`;
        ctx.fillText(lv.tagline, x + s * 1.22, h * 0.62);
        ctx.fillStyle = palette.blue;
        ctx.fillRect(0, h - 18, w, 18);
        break;
      }
      case 'nordline': {
        ctx.fillStyle = lv.accent;
        ctx.beginPath();
        ctx.moveTo(w * 0.55, h);
        ctx.bezierCurveTo(w * 0.72, h * 0.55, w * 0.85, h * 0.4, w, h * 0.3);
        ctx.lineTo(w, h * 0.55);
        ctx.bezierCurveTo(w * 0.88, h * 0.62, w * 0.78, h * 0.78, w * 0.7, h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#7fd3cd';
        ctx.fillRect(0, h - 14, w * 0.6, 14);
        ctx.fillStyle = lv.accent;
        ctx.font = `800 italic ${big}px ${FONT}`;
        ctx.fillText(lv.name, w * 0.08, h * 0.45);
        ctx.fillStyle = '#5b6b8c';
        ctx.font = `600 ${big * 0.34}px ${FONT}`;
        ctx.fillText(lv.tagline, w * 0.085, h * 0.67);
        break;
      }
      case 'cargoviva': {
        ctx.fillStyle = lv.accent;
        for (const k of [0, 1]) {
          ctx.beginPath();
          const x0 = w * (0.72 + k * 0.1);
          ctx.moveTo(x0, h);
          ctx.lineTo(x0 + w * 0.06, h);
          ctx.lineTo(x0 + w * 0.06 + h * 0.6, 0);
          ctx.lineTo(x0 + h * 0.6, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.font = `800 ${big}px ${FONT}`;
        ctx.fillText(lv.name, w * 0.08, h * 0.45);
        ctx.fillStyle = '#5b6b8c';
        ctx.font = `600 ${big * 0.34}px ${FONT}`;
        ctx.fillText(lv.tagline, w * 0.085, h * 0.67);
        break;
      }
      case 'bluepeak': {
        const bx = w * 0.08;
        ctx.fillStyle = lv.cab;
        ctx.beginPath();
        ctx.moveTo(bx, h * 0.62);
        ctx.lineTo(bx + h * 0.2, h * 0.28);
        ctx.lineTo(bx + h * 0.32, h * 0.46);
        ctx.lineTo(bx + h * 0.42, h * 0.34);
        ctx.lineTo(bx + h * 0.62, h * 0.62);
        ctx.closePath();
        ctx.fill();
        ctx.font = `800 ${big}px ${FONT}`;
        ctx.fillText(lv.name, bx + h * 0.72, h * 0.45);
        ctx.fillStyle = lv.accent;
        ctx.font = `600 ${big * 0.34}px ${FONT}`;
        ctx.fillText(lv.tagline, bx + h * 0.74, h * 0.66);
        ctx.fillStyle = lv.cab;
        ctx.fillRect(0, h - 20, w, 20);
        break;
      }
    }
  });
}
