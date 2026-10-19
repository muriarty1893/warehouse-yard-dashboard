import { useMemo } from 'react';
import * as THREE from 'three';
import type { Cargo } from '../../domain/types';
import { canvasTexture, FONT, unitBox, yardToWorld } from '../kit';
import type { CargoBounds } from './cargoPrims';

/** Shade a hex color by k (−1 … 1). */
export function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  const target = k < 0 ? new THREE.Color('#1b2233') : new THREE.Color('#ffffff');
  return `#${c.lerp(target, Math.abs(k)).getHexString()}`;
}

function sideTexture(brand: string, color: string, forty: boolean) {
  const w = forty ? 1024 : 512;
  return canvasTexture(`ctr-side|${brand}|${color}|${forty}`, w, 220, (ctx, cw, ch) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, cw, ch);
    for (let x = 6; x < cw; x += 14) {
      ctx.fillStyle = shade(color, 0.14);
      ctx.fillRect(x, 10, 5, ch - 20);
      ctx.fillStyle = shade(color, -0.12);
      ctx.fillRect(x + 9, 10, 2, ch - 20);
    }
    ctx.fillStyle = shade(color, -0.22);
    ctx.fillRect(0, 0, cw, 10);
    ctx.fillRect(0, ch - 10, cw, 10);
    const light = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l > 0.7;
    ctx.fillStyle = light ? '#2f5ff0' : 'rgba(255,255,255,0.95)';
    ctx.font = `900 ${forty ? 76 : 58}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(brand, 40, ch / 2 + 4);
    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = light ? '#5b6b8c' : 'rgba(255,255,255,0.8)';
    ctx.textAlign = 'right';
    ctx.fillText(`${brand.slice(0, 3).toUpperCase()}U 48${brand.length}913 5`, cw - 30, 36);
  });
}

function endTexture(color: string) {
  return canvasTexture(`ctr-end|${color}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = shade(color, -0.05);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = shade(color, -0.3);
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.beginPath();
    ctx.moveTo(w / 2, 10);
    ctx.lineTo(w / 2, h - 10);
    ctx.stroke();
    ctx.lineWidth = 5;
    for (const x of [w * 0.18, w * 0.36, w * 0.64, w * 0.82]) {
      ctx.beginPath();
      ctx.moveTo(x, 18);
      ctx.lineTo(x, h - 18);
      ctx.stroke();
    }
  });
}

export function containerMaterials(brand: string, color: string, forty: boolean) {
  const side = new THREE.MeshStandardMaterial({ map: sideTexture(brand, color, forty), roughness: 0.6 });
  const end = new THREE.MeshStandardMaterial({ map: endTexture(color), roughness: 0.6 });
  const top = new THREE.MeshStandardMaterial({ color: shade(color, -0.08), roughness: 0.7 });
  // Box face order: +x, −x, +y, −y, +z, −z.
  return [end, end, top, top, side, side];
}

export function Containers({
  cargo,
  bounds,
  onHover,
  onClick,
  onDoubleClick,
}: {
  cargo: Cargo[];
  bounds: CargoBounds[];
  onHover: (cargo: number | null) => void;
  onClick: (cargo: number) => void;
  onDoubleClick: (cargo: number) => void;
}) {
  const items = useMemo(
    () =>
      cargo
        .map((c, i) => ({ c, i, b: bounds[i] }))
        .filter(({ c, b }) => c.look === 'container' && b)
        .map(({ c, i, b }) => {
          const along = b.w > b.l;
          const len = Math.max(b.l, b.w);
          const width = Math.min(b.l, b.w);
          return {
            i,
            len,
            width,
            height: c.dims.h,
            position: yardToWorld(b.x, b.y, b.base + c.dims.h / 2),
            yaw: along ? Math.PI / 2 : 0,
            materials: containerMaterials(c.brand ?? 'DOCKTOR', c.color ?? '#2f5ff0', len > 9),
          };
        }),
    [cargo, bounds],
  );
  return (
    <group>
      {items.map((it) => (
        <mesh
          key={it.i}
          geometry={unitBox}
          material={it.materials}
          position={it.position}
          rotation={[0, it.yaw, 0]}
          scale={[it.len, it.height, it.width]}
          castShadow
          receiveShadow
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(it.i);
          }}
          onPointerOut={() => onHover(null)}
          onClick={(e) => {
            e.stopPropagation();
            onClick(it.i);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onDoubleClick(it.i);
          }}
        />
      ))}
    </group>
  );
}
