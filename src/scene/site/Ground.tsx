import { useMemo } from 'react';
import * as THREE from 'three';
import type { Rect, YardConfig } from '../../domain/types';
import { yardBounds } from '../../domain/yard';
import { useLayers } from '../../state/layers';
import { canvasTexture, mat, palette, yardToWorld } from '../kit';
import { AREA_PPM, groundExtent, makePainter, paintArea, paintGrid, paintGround, paintStorageArea, storageDecalRect } from './groundPaint';
import { GRASS_BEDS } from './landscape';

/** A flat plane lying on the yard floor covering `rect`. */
function FloorPlane({ rect, h, material, receive = true }: { rect: Rect; h: number; material: THREE.Material; receive?: boolean }) {
  return (
    <mesh
      position={yardToWorld(rect.x + rect.w / 2, rect.y + rect.h / 2, h)}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      receiveShadow={receive}
    >
      <planeGeometry args={[rect.w, rect.h]} />
    </mesh>
  );
}

function roundedRectShape(r: Rect, radius: number) {
  const s = new THREE.Shape();
  const { x, y, w, h } = r;
  const k = Math.min(radius, w / 2, h / 2);
  s.moveTo(x + k, y);
  s.lineTo(x + w - k, y);
  s.quadraticCurveTo(x + w, y, x + w, y + k);
  s.lineTo(x + w, y + h - k);
  s.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  s.lineTo(x + k, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - k);
  s.lineTo(x, y + k);
  s.quadraticCurveTo(x, y, x + k, y);
  return s;
}

/** Raised slab (grass bed, sidewalk) extruded from a rounded rect, with optional holes. */
function Slab({ rect, height, color, radius = 1.2, holes = [] }: { rect: Rect; height: number; color: string; radius?: number; holes?: Rect[] }) {
  const geo = useMemo(() => {
    const shape = roundedRectShape(rect, radius);
    for (const hole of holes) shape.holes.push(roundedRectShape(hole, 1));
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.06, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [rect, height, radius, holes]);
  return <mesh geometry={geo} material={mat(color, { roughness: 0.95 })} receiveShadow castShadow />;
}



const GRID_PPM = 24;

/** Reference grid decal: on the ground, and repeated on top of each raised platform. */
function GridLayer({ yard }: { yard: YardConfig }) {
  const on = useLayers((s) => s.grid);
  const planes = useMemo(() => {
    const b = yardBounds(yard);
    const tex = canvasTexture(`grid|${yard.id}`, Math.round(b.w * GRID_PPM), Math.round(b.h * GRID_PPM), (ctx) => paintGrid(ctx, yard, GRID_PPM));
    const full: Rect = { x: b.x0, y: b.y0, w: b.w, h: b.h };
    const out = [{ key: 'ground', rect: full, h: 0.016, tex }];
    for (const p of yard.buildings.filter((x) => x.elevation)) {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(p.rect.w / b.w, p.rect.h / b.h);
      t.offset.set((p.rect.x - b.x0) / b.w, (p.rect.y - b.y0) / b.h);
      out.push({ key: p.id, rect: p.rect, h: (p.elevation ?? 0) + 0.016, tex: t });
    }
    return out.map((o) => ({ ...o, material: new THREE.MeshBasicMaterial({ map: o.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }) }));
  }, [yard]);
  if (!on) return null;
  return (
    <group>
      {planes.map((p) => (
        <FloorPlane key={p.key} rect={p.rect} h={p.h} material={p.material} receive={false} />
      ))}
    </group>
  );
}

export function Ground({ yard }: { yard: YardConfig }) {
  const g = useMemo(() => groundExtent(yard), [yard]);
  const groundMat = useMemo(() => {
    const tex = canvasTexture(`ground|${yard.id}`, (g.x1 - g.x0) * g.ppm, (g.y1 - g.y0) * g.ppm, (ctx) => paintGround(ctx, yard));
    tex.anisotropy = 16;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  }, [yard, g]);

  // Storage areas: floor-marking outlines, on the ground or on the raised platform.
  const storageDecals = useMemo(
    () =>
      yard.storage.map((a) => {
        const rect = storageDecalRect(a);
        const tex = canvasTexture(`storage|${yard.id}|${a.id}`, Math.round(rect.w * AREA_PPM), Math.round(rect.h * AREA_PPM), (ctx) => paintStorageArea(ctx, a));
        tex.anisotropy = 16;
        const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
        return { area: a, rect, material: m };
      }),
    [yard],
  );

  // Markings on raised floors (platforms) get their own small canvases.
  const raisedAreas = useMemo(
    () =>
      yard.areas
        .filter((a) => a.elevation)
        .map((area) => {
          const r = area.rect;
          const tex = canvasTexture(`area|${yard.id}|${area.id}`, r.w * AREA_PPM, r.h * AREA_PPM, (ctx) =>
            paintArea(makePainter(ctx, r.x, r.y + r.h, AREA_PPM), area),
          );
          const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
          return { area, material: m };
        }),
    [yard],
  );

  return (
    <group>
      {/* Endless outer ground. */}
      <mesh position={[80, -0.03, -50]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={mat(palette.ground, { roughness: 1 })}>
        <planeGeometry args={[2400, 2400]} />
      </mesh>

      <FloorPlane rect={{ x: g.x0, y: g.y0, w: g.x1 - g.x0, h: g.y1 - g.y0 }} h={0} material={groundMat} />
      {storageDecals.map(({ area, rect, material }) => (
        <FloorPlane key={area.id} rect={rect} h={(area.elevation ?? 0) + 0.012} material={material} />
      ))}
      <GridLayer yard={yard} />
      {raisedAreas.map(({ area, material }) => (
        <FloorPlane key={area.id} rect={area.rect} h={(area.elevation ?? 0) + 0.014} material={material} />
      ))}

      {GRASS_BEDS.map((gr, i) => (
        <Slab key={i} rect={gr.rect} holes={gr.holes} height={0.22} color={palette.grass} />
      ))}
    </group>
  );
}
