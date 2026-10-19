import { useMemo } from 'react';
import * as THREE from 'three';
import type { Rect, YardConfig } from '../../domain/types';
import { zonePositions } from '../../domain/yard';
import { canvasTexture, mat, palette, yardToWorld } from '../kit';
import { GROUND_EXTENT, paintGround, paintZone, ZONE_PPM } from './groundPaint';
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



export function Ground({ yard }: { yard: YardConfig }) {
  const g = GROUND_EXTENT;
  const groundMat = useMemo(() => {
    const tex = canvasTexture(`ground|${yard.id}`, (g.x1 - g.x0) * g.ppm, (g.y1 - g.y0) * g.ppm, (ctx) => paintGround(ctx, yard));
    tex.anisotropy = 16;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  }, [yard, g]);

  const zoneOverlays = useMemo(
    () =>
      yard.zones
        .filter((z) => z.grid)
        .map((z) => {
          const tex = canvasTexture(`zone|${yard.id}|${z.id}`, z.rect.w * ZONE_PPM, z.rect.h * ZONE_PPM, (ctx) => paintZone(ctx, z, zonePositions(z)));
          tex.anisotropy = 16;
          const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
          return { zone: z, material: m };
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
      {zoneOverlays.map(({ zone, material }) => (
        <FloorPlane key={zone.id} rect={zone.rect} h={0.01} material={material} />
      ))}

      {GRASS_BEDS.map((gr, i) => (
        <Slab key={i} rect={gr.rect} holes={gr.holes} height={0.22} color={palette.grass} />
      ))}
    </group>
  );
}
