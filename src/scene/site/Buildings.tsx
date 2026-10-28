import { useMemo } from 'react';
import * as THREE from 'three';
import { inRect } from '../../domain/geometry';
import { hashString, mulberry32 } from '../../domain/seed';
import type { Building, Ramp, TruckBay, Vec2, YardConfig } from '../../domain/types';
import { heightAt } from '../../domain/yard';
import { useLayers } from '../../state/layers';
import {
  Box,
  canvasTexture,
  corrugatedTexture,
  Cyl,
  drawLogoMark,
  FONT,
  glassMat,
  glowMat,
  LightPool,
  mat,
  palette,
  RBox,
  registerGlow,
  roundRect,
  yardToWorld,
} from '../kit';
import { Merge } from '../Merge';

const DOOR_W = 3.4;
const DOCK_H = 1.25;
const DOOR_TOP = 5.0;

function wallMaterial() {
  const tex = corrugatedTexture('wall', palette.wall, '#f3f5fa', '#cdd4e3').clone();
  tex.needsUpdate = true;
  tex.repeat.set(1 / 1.6, 1);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
}

function roofMaterial(length: number) {
  const tex = corrugatedTexture('roof', palette.blue, '#4271f5', '#2550d6').clone();
  tex.needsUpdate = true;
  tex.repeat.set(length / 1.4, 1);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
}

function signTexture(title: string, subtitle: string) {
  return canvasTexture(`sign|${title}|${subtitle}`, 1024, 192, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 0, 0, w, h, 36);
    ctx.fill();
    drawLogoMark(ctx, 28, 28, h - 56);
    ctx.fillStyle = palette.navy;
    ctx.font = `800 78px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Docktor', h + 6, 100);
    ctx.fillStyle = palette.blue;
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(`${title} · ${subtitle}`, h + 8, 154);
  });
}

function dockNumberTexture(n: string) {
  return canvasTexture(`docknum|${n}`, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = palette.blue;
    roundRect(ctx, 0, 0, w, h, 22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 68px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n, w / 2, h / 2 + 4);
  });
}

/** Wall from a 2D outline (meters, x along wall, y up) with rectangular holes; outer face at z = 0. */
function wallGeometry(outline: [number, number][], holes: [number, number, number, number][], thickness: number) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const [x, y, w, h] of holes) {
    const hole = new THREE.Path();
    hole.moveTo(x, y);
    hole.lineTo(x + w, y);
    hole.lineTo(x + w, y + h);
    hole.lineTo(x, y + h);
    hole.closePath();
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness);
  return g;
}

function CartonPallet({ position, layers = 2 }: { position: [number, number, number]; layers?: number }) {
  return (
    <group position={position}>
      <Box size={[1.2, 0.14, 1.0]} position={[0, 0.07, 0]} color={palette.wood} />
      {Array.from({ length: layers }).flatMap((_, l) =>
        [-0.3, 0.3].flatMap((dx) =>
          [-0.25, 0.25].map((dz) => (
            <RBox key={`${l}${dx}${dz}`} size={[0.58, 0.4, 0.48]} position={[dx, 0.14 + 0.2 + l * 0.41, dz]} color={palette.cardboard} radius={0.03} />
          )),
        ),
      )}
    </group>
  );
}

function DockDoor({ u, id, stocked }: { u: number; id: string; stocked: boolean }) {
  const frame = mat(palette.blue, { roughness: 0.5 });
  const seal = mat('#30364a', { roughness: 0.9 });
  const openH = DOOR_TOP - DOCK_H;
  const numTex = dockNumberTexture(id.replace('DK-', ''));
  return (
    <group position={[u, 0, 0]}>
      {/* Dock interior seen through the opening. */}
      <mesh position={[0, DOCK_H + openH / 2, -0.3 - 2.5]} material={mat('#56627e', { side: THREE.BackSide, roughness: 1 })}>
        <boxGeometry args={[DOOR_W, openH, 5]} />
      </mesh>
      {stocked && (
        <>
          <CartonPallet position={[-0.75, DOCK_H, -2.4]} />
          <CartonPallet position={[0.7, DOCK_H, -3.6]} layers={3} />
        </>
      )}
      {/* Roller door, partly raised. */}
      <RBox size={[DOOR_W, 1.0, 0.1]} position={[0, DOOR_TOP - 0.5, -0.2]} color="#d7dce8" radius={0.03} />
      {/* Frame, seals, bumpers. */}
      <Box size={[0.24, openH + 0.24, 0.3]} position={[-DOOR_W / 2 - 0.12, DOCK_H + openH / 2, 0.1]} material={frame} />
      <Box size={[0.24, openH + 0.24, 0.3]} position={[DOOR_W / 2 + 0.12, DOCK_H + openH / 2, 0.1]} material={frame} />
      <Box size={[DOOR_W + 0.48, 0.26, 0.3]} position={[0, DOOR_TOP + 0.12, 0.1]} material={frame} />
      <RBox size={[0.34, openH + 0.2, 0.45]} position={[-DOOR_W / 2 - 0.42, DOCK_H + openH / 2, 0.22]} material={seal} radius={0.08} />
      <RBox size={[0.34, openH + 0.2, 0.45]} position={[DOOR_W / 2 + 0.42, DOCK_H + openH / 2, 0.22]} material={seal} radius={0.08} />
      <RBox size={[DOOR_W + 1.2, 0.42, 0.45]} position={[0, DOOR_TOP + 0.45, 0.22]} material={seal} radius={0.08} />
      <RBox size={[0.32, 0.5, 0.32]} position={[-1.3, 0.85, 0.32]} color={palette.tire} radius={0.05} />
      <RBox size={[0.32, 0.5, 0.32]} position={[1.3, 0.85, 0.32]} color={palette.tire} radius={0.05} />
      <Box size={[DOOR_W, 0.06, 0.5]} position={[0, DOCK_H - 0.03, 0.2]} color="#9aa3b8" />
      <mesh position={[0, 6.35, 0.03]}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshStandardMaterial map={numTex} roughness={0.6} />
      </mesh>
    </group>
  );
}

function RoofUnit({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RBox size={[2.2, 0.9, 1.5]} position={[0, 0.45, 0]} color="#f3f5f9" radius={0.1} />
      <Cyl r={0.42} h={0.04} position={[-0.5, 0.92, 0]} color="#3a4256" />
      <Cyl r={0.42} h={0.04} position={[0.5, 0.92, 0]} color="#3a4256" />
    </group>
  );
}

export function Warehouse({ b }: { b: Building }) {
  const { x: X, y: Y, w: L, h: D } = b.rect;
  const H = b.height;
  const rise = 1.2;
  const pitch = Math.atan2(rise, D / 2);
  const docks = b.docks ?? [];

  const { south, north, gable, wallMat, roofMat } = useMemo(() => {
    const holes = docks.map((d) => [d.x - X - DOOR_W / 2, DOCK_H, DOOR_W, DOOR_TOP - DOCK_H] as [number, number, number, number]);
    return {
      south: wallGeometry([[0, 0], [L, 0], [L, H], [0, H]], holes, 0.3),
      north: wallGeometry([[0, 0], [L, 0], [L, H], [0, H]], [], 0.3),
      gable: wallGeometry([[0, 0], [D, 0], [D, H], [D / 2, H + rise], [0, H]], [], 0.3),
      wallMat: wallMaterial(),
      roofMat: roofMaterial(L),
    };
  }, [docks, X, L, D, H]);

  const signTex = signTexture(b.name, b.subtitle ?? '');
  const trim = mat(palette.blue, { roughness: 0.5 });
  const slabDepth = D / 2 / Math.cos(pitch) + 0.7;

  return (
    <group position={yardToWorld(X, Y)}>
      <mesh geometry={south} material={wallMat} castShadow receiveShadow />
      <mesh geometry={north} material={wallMat} position={[L, 0, -D]} rotation={[0, Math.PI, 0]} castShadow receiveShadow />
      <mesh geometry={gable} material={wallMat} position={[0, 0, -D]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow />
      <mesh geometry={gable} material={wallMat} position={[L, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow />

      {/* Roof. */}
      <group position={[L / 2, H + rise / 2 + 0.05, -D / 4]} rotation={[pitch, 0, 0]}>
        <mesh material={roofMat} castShadow receiveShadow>
          <boxGeometry args={[L + 1, 0.22, slabDepth]} />
        </mesh>
        {[-0.3, 0.3].map((k) => (
          <Box key={k} size={[L * 0.8, 0.06, 1.2]} position={[0, 0.13, k * slabDepth]} material={mat('#cfe0ff', { roughness: 0.2, metalness: 0.1 })} shadow={false} />
        ))}
      </group>
      <group position={[L / 2, H + rise / 2 + 0.05, (-3 * D) / 4]} rotation={[-pitch, 0, 0]}>
        <mesh material={roofMat} castShadow receiveShadow>
          <boxGeometry args={[L + 1, 0.22, slabDepth]} />
        </mesh>
      </group>
      <Box size={[L + 1.1, 0.25, 0.9]} position={[L / 2, H + rise + 0.12, -D / 2]} color="#dfe5f0" />
      {[0.18, 0.42, 0.66].map((k) => (
        <RoofUnit key={k} position={[L * k, H + rise * 0.55, -D * 0.68]} />
      ))}

      {/* Trim: eaves, corner pilasters, dock face. */}
      <Box size={[L + 0.5, 0.6, 0.45]} position={[L / 2, H - 0.3, 0.1]} material={trim} />
      <Box size={[L + 0.5, 0.6, 0.45]} position={[L / 2, H - 0.3, -D - 0.1]} material={trim} />
      {[
        [0, 0],
        [L, 0],
        [0, -D],
        [L, -D],
      ].map(([px, pz], i) => (
        <Box key={i} size={[0.7, H, 0.7]} position={[px, H / 2, pz]} material={trim} />
      ))}
      <Box size={[L, DOCK_H, 0.36]} position={[L / 2, DOCK_H / 2, 0.06]} color="#cdd3df" />

      {docks.map((d, i) => (
        <DockDoor key={d.id} u={d.x - X} id={d.id} stocked={i % 3 !== 1} />
      ))}

      <mesh position={[L * 0.47, 8.05, 0.06]}>
        <planeGeometry args={[12.8, 2.4]} />
        <meshStandardMaterial map={signTex} roughness={0.5} />
      </mesh>

      {/* West personnel door with canopy (walkway side). */}
      <group position={[-0.05, 0, -9.5]}>
        <RBox size={[0.12, 2.3, 1.2]} position={[0, 1.15, 0]} color={palette.blue} radius={0.03} />
        <Box size={[1.2, 0.12, 2]} position={[-0.6, 2.7, 0]} color="#dfe4ee" />
      </group>
      {/* East end windows (staff area). */}
      <Box size={[0.08, 1.1, D * 0.7]} position={[L + 0.02, 6.6, -D / 2]} material={glassMat()} shadow={false} />
      <Box size={[0.08, 1.1, D * 0.7]} position={[L + 0.02, 3.4, -D / 2]} material={glassMat()} shadow={false} />
    </group>
  );
}

export function Gatehouse({ b }: { b: Building }) {
  const { x, y, w, h } = b.rect;
  return (
    <group position={yardToWorld(x + w / 2, y + h / 2)}>
      <RBox size={[w, 2.7, h]} position={[0, 1.35, 0]} color={palette.white} radius={0.12} />
      <RBox size={[w + 0.06, 1.0, h + 0.06]} position={[0, 1.75, 0]} material={glassMat()} radius={0.1} shadow={false} />
      <RBox size={[w + 1.2, 0.3, h + 1.2]} position={[0, 2.95, 0]} color={palette.blue} radius={0.1} />
      <RBox size={[0.9, 2.1, 0.08]} position={[-w / 4, 1.05, h / 2 + 0.03]} color="#c9d0de" radius={0.03} />
    </group>
  );
}

/** One floor's window band: framed panes, some with blinds; a matching glow map lights a few at night. */
function windowBand(key: string, panes: number, seed: number) {
  const W = 64 * panes;
  const H = 64;
  const rng = mulberry32(seed);
  const lit: boolean[] = Array.from({ length: panes }, () => rng() < 0.55);
  const blinds: number[] = Array.from({ length: panes }, () => (rng() < 0.3 ? 0.2 + rng() * 0.5 : 0));
  const map = canvasTexture(`win|${key}`, W, H, (ctx) => {
    ctx.fillStyle = '#dfe4ee';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < panes; i++) {
      const x = i * 64;
      const g = ctx.createLinearGradient(x, 0, x + 64, H);
      g.addColorStop(0, '#3a5488');
      g.addColorStop(0.55, '#24365f');
      g.addColorStop(1, '#2e4677');
      ctx.fillStyle = g;
      ctx.fillRect(x + 4, 5, 56, H - 10);
      if (blinds[i]) {
        ctx.fillStyle = '#c9d0de';
        ctx.fillRect(x + 4, 5, 56, (H - 10) * blinds[i]);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(x + 8, H - 6);
      ctx.lineTo(x + 26, 5);
      ctx.lineTo(x + 36, 5);
      ctx.lineTo(x + 18, H - 6);
      ctx.fill();
      ctx.fillStyle = '#b9c2d3';
      ctx.fillRect(x + 31, 5, 2, H - 10);
    }
  });
  const glow = canvasTexture(`winglow|${key}`, W, H, (ctx) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < panes; i++) {
      if (!lit[i]) continue;
      ctx.fillStyle = rng() < 0.3 ? '#fff4d8' : '#ffd79a';
      ctx.fillRect(i * 64 + 4, 5 + (H - 10) * blinds[i], 56, (H - 10) * (1 - blinds[i]));
    }
  });
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.25, metalness: 0.2 });
  registerGlow(m, 0, 1.25);
  return m;
}

const SIDE_DIR = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] } as const;

/** Glazed door with a frame and a small canopy; `sill` lifts it onto the platform. */
function BuildingDoor({ b, door }: { b: Building; door: NonNullable<Building['doors']>[number] }) {
  const { x, y, w, h } = b.rect;
  const [dx, dy] = SIDE_DIR[door.side];
  const along = door.side === 'north' || door.side === 'south';
  const cx = along ? x + door.at : dx > 0 ? x + w : x;
  const cy = along ? (dy > 0 ? y + h : y) : y + door.at;
  const sill = door.sill ?? 0;
  const heading = Math.atan2(dy, dx);
  return (
    <group position={yardToWorld(cx, cy, sill)} rotation={[0, heading, 0]}>
      {/* Local frame: +x out of the wall. */}
      <Box size={[0.08, 2.3, door.width]} position={[0.04, 1.15, 0]} material={glassMat()} shadow={false} />
      <Box size={[0.1, 0.12, door.width + 0.2]} position={[0.05, 2.36, 0]} color={palette.blue} />
      <Box size={[0.1, 2.4, 0.1]} position={[0.05, 1.2, door.width / 2 + 0.05]} color={palette.blue} />
      <Box size={[0.1, 2.4, 0.1]} position={[0.05, 1.2, -door.width / 2 - 0.05]} color={palette.blue} />
      <Box size={[0.06, 2.3, 0.04]} position={[0.08, 1.15, 0]} color="#9aa3b8" />
      <Box size={[1.3, 0.12, door.width + 1]} position={[0.65, 2.75, 0]} color="#e4e8f0" />
      <mesh position={[0.6, 2.67, 0]} material={glowMat('#fff6d6', '#ffe6a8', 0.3, 3)}>
        <boxGeometry args={[0.3, 0.04, 0.3]} />
      </mesh>
      {!sill && <Box size={[1.2, 0.1, door.width + 0.6]} position={[0.6, 0.05, 0]} color="#cfd5e1" />}
    </group>
  );
}

/** Rooftop solar array: rows of tilted panels. */
function SolarArray({ w, d, y }: { w: number; d: number; y: number }) {
  const panel = mat('#1e3266', { roughness: 0.25, metalness: 0.5 });
  const frame = mat('#c3cad8', { roughness: 0.4, metalness: 0.4 });
  const rows = Math.max(1, Math.floor(d / 1.9));
  const cols = Math.max(1, Math.floor(w / 1.1));
  return (
    <group position={[0, y, 0]}>
      {Array.from({ length: rows }, (_, r) => (
        <group key={r} position={[0, 0.35, -d / 2 + 0.9 + r * 1.9]} rotation={[-0.42, 0, 0]}>
          <Box size={[cols * 1.08, 0.04, 1.6]} position={[0, 0, 0]} material={panel} />
          {Array.from({ length: cols + 1 }, (_, c) => (
            <Box key={c} size={[0.03, 0.05, 1.62]} position={[-cols * 0.54 + c * 1.08, 0.005, 0]} material={frame} shadow={false} />
          ))}
          <Box size={[cols * 1.08, 0.05, 0.03]} position={[0, 0.005, 0]} material={frame} shadow={false} />
        </group>
      ))}
    </group>
  );
}

export function Office({ b }: { b: Building }) {
  const { x, y, w, h } = b.rect;
  const H = b.height;
  const floors = b.floors ?? 2;
  const floorH = H / floors;
  const signTex = signTexture(b.name, b.subtitle ?? '');
  const bands = useMemo(() => Array.from({ length: floors }, (_, i) => windowBand(`${b.id}|${i}`, Math.round(Math.max(w, h) / 1.7), hashString(`${b.id}${i}`))), [b.id, floors, w, h]);
  return (
    <group>
      <group position={yardToWorld(x + w / 2, y + h / 2)}>
        <RBox size={[w, H, h]} position={[0, H / 2, 0]} color={palette.white} radius={0.2} />
        <Box size={[w + 0.12, 0.35, h + 0.12]} position={[0, 0.17, 0]} color="#c9d0de" />
        {bands.map((m, i) => (
          <RBox key={i} size={[w + 0.08, floorH * 0.48, h + 0.08]} position={[0, i * floorH + floorH * 0.55, 0]} material={m} radius={0.15} shadow={false} />
        ))}
        {Array.from({ length: floors - 1 }, (_, i) => (
          <Box key={i} size={[w + 0.14, 0.12, h + 0.14]} position={[0, (i + 1) * floorH, 0]} color="#e3e7ef" shadow={false} />
        ))}
        <RBox size={[w + 0.4, 0.55, h + 0.4]} position={[0, H + 0.1, 0]} color={palette.blue} radius={0.12} />
        {/* Parapet, roof hatch, HVAC, vents, solar on the bigger roof. */}
        {[
          [0, h / 2 + 0.05, w + 0.3, 0.15],
          [0, -h / 2 - 0.05, w + 0.3, 0.15],
        ].map(([px, pz, lx, lz], i) => (
          <Box key={i} size={[lx, 0.45, lz]} position={[px, H + 0.6, pz]} color="#dfe5f0" />
        ))}
        {[w / 2 + 0.05, -w / 2 - 0.05].map((px) => (
          <Box key={px} size={[0.15, 0.45, h + 0.3]} position={[px, H + 0.6, 0]} color="#dfe5f0" />
        ))}
        <RoofUnit position={[-w * 0.28, H + 0.38, -h * 0.25]} />
        {w > 12 && <RoofUnit position={[-w * 0.05, H + 0.38, -h * 0.3]} />}
        <RBox size={[1, 0.5, 1]} position={[w * 0.3, H + 0.62, -h * 0.32]} color="#cfd5e1" radius={0.05} />
        {[-0.4, 0.4].map((k) => (
          <Cyl key={k} r={0.12} h={0.8} position={[w * 0.2 + k, H + 0.75, -h * 0.05]} color="#b9c1d1" />
        ))}
        {w > 12 && <SolarArray w={w * 0.8} d={h * 0.42} y={H + 0.38} />}
        <mesh position={[0, H - floorH * 0.32, h / 2 + 0.06]}>
          <planeGeometry args={[Math.min(10.6, w * 0.8), Math.min(2, floorH * 0.5)]} />
          <meshStandardMaterial map={signTex} roughness={0.5} />
        </mesh>
      </group>
      {(b.doors ?? []).map((d, i) => (
        <BuildingDoor key={i} b={b} door={d} />
      ))}
    </group>
  );
}

function stripesTexture() {
  return canvasTexture(
    'hazard',
    64,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1b2233';
      for (let i = -2; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 32, h);
        ctx.lineTo(i * 32 + 16, h);
        ctx.lineTo(i * 32 + 16 + h, 0);
        ctx.lineTo(i * 32 + h, 0);
        ctx.fill();
      }
    },
    { repeat: true },
  );
}

function canopyColumns(b: Building): [number, number][] {
  const { w, h } = b.rect;
  const cols: [number, number][] = [];
  const nx = Math.max(1, Math.round(w / 7.5));
  const ny = Math.max(1, Math.round(h / 7));
  for (let i = 0; i <= nx; i++) for (const j of [0, ny]) cols.push([-w / 2 + 0.4 + (i * (w - 0.8)) / nx, -h / 2 + 0.4 + (j * (h - 0.8)) / ny]);
  for (let j = 1; j < ny; j++) for (const i of [0, nx]) cols.push([-w / 2 + 0.4 + (i * (w - 0.8)) / nx, -h / 2 + 0.4 + (j * (h - 0.8)) / ny]);
  return cols;
}

/** Stairs from the ground up to a platform edge (people access). */
export const STAIRS = [{ x: 54.1, y: 15.0, w: 1.4, h: 1.5, down: 'west' as const }];

/**
 * Open platform edges that need a safety rail: not where trucks dock, the
 * ramp meets the platform, another raised floor continues, or a wall/door is.
 */
function railRuns(yard: YardConfig, b: Building): [Vec2, Vec2][] {
  const { x, y, w, h } = b.rect;
  const E = b.elevation ?? 0;
  const edges: { a: Vec2; b: Vec2; out: Vec2 }[] = [
    { a: [x, y], b: [x + w, y], out: [0, -1] },
    { a: [x + w, y], b: [x + w, y + h], out: [1, 0] },
    { a: [x + w, y + h], b: [x, y + h], out: [0, 1] },
    { a: [x, y + h], b: [x, y], out: [-1, 0] },
  ];
  const isOpen = (px: number, py: number, out: Vec2) => {
    const qx = px + out[0] * 0.35;
    const qy = py + out[1] * 0.35;
    if (heightAt(yard, qx, qy) > E - 0.3) return false;
    for (const o of yard.buildings) if (o !== b && o.kind !== 'canopy' && inRect(o.rect, qx, qy, 0.2)) return false;
    for (const r of yard.ramps) if (inRect(r.rect, qx, qy, 0.2)) return false;
    for (const s of STAIRS) if (inRect({ x: s.x, y: s.y, w: s.w, h: s.h }, qx, qy, 0.1)) return false;
    for (const bay of yard.bays) {
      if (bay.kind !== 'loading') continue;
      const [rx, ry] = [bay.center[0] - (Math.cos(bay.heading) * bay.length) / 2, bay.center[1] - (Math.sin(bay.heading) * bay.length) / 2];
      if (Math.abs(ry - py) < 0.6 && Math.abs(rx - px) <= bay.width / 2) return false;
    }
    for (const g of yard.gates) if (g.closed && Math.abs(g.a[0] - qx) < 1.5 && qy > Math.min(g.a[1], g.b[1]) && qy < Math.max(g.a[1], g.b[1])) return false;
    return true;
  };
  const runs: [Vec2, Vec2][] = [];
  for (const e of edges) {
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    let start: number | null = null;
    const at = (t: number): Vec2 => [e.a[0] + ((e.b[0] - e.a[0]) * t) / len, e.a[1] + ((e.b[1] - e.a[1]) * t) / len];
    for (let t = 0; t <= len + 0.001; t += 0.25) {
      const [px, py] = at(Math.min(t, len));
      const open = isOpen(px, py, e.out);
      if (open && start === null) start = t;
      if ((!open || t + 0.25 > len + 0.001) && start !== null) {
        const end = open ? len : t - 0.25;
        if (end - start > 0.8) runs.push([at(start + 0.1), at(end - 0.1)]);
        start = null;
      }
    }
  }
  return runs;
}

function Rails({ yard, b }: { yard: YardConfig; b: Building }) {
  const E = b.elevation ?? 0;
  const runs = useMemo(() => railRuns(yard, b), [yard, b]);
  const yellow = mat(palette.yellow, { roughness: 0.45, metalness: 0.2 });
  return (
    <>
      {runs.map(([a, c], i) => {
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const heading = Math.atan2(c[1] - a[1], c[0] - a[0]);
        const n = Math.max(1, Math.round(len / 1.5));
        return (
          <group key={i} position={yardToWorld(a[0], a[1], E)} rotation={[0, heading, 0]}>
            {Array.from({ length: n + 1 }, (_, k) => (
              <Box key={k} size={[0.06, 1.1, 0.06]} position={[(k * len) / n, 0.55, 0]} material={yellow} />
            ))}
            <Box size={[len, 0.06, 0.06]} position={[len / 2, 1.08, 0]} material={yellow} />
            <Box size={[len, 0.05, 0.05]} position={[len / 2, 0.55, 0]} material={yellow} />
            <Box size={[len, 0.12, 0.02]} position={[len / 2, 0.06, 0]} material={yellow} shadow={false} />
          </group>
        );
      })}
    </>
  );
}

function Stairs({ s, rise }: { s: (typeof STAIRS)[number]; rise: number }) {
  const steps = Math.round(rise / 0.18);
  const tread = s.w / steps;
  return (
    <group position={yardToWorld(s.x, s.y + s.h / 2)}>
      {Array.from({ length: steps }, (_, i) => (
        <Box key={i} size={[tread * (steps - i), (i + 1) * (rise / steps), s.h]} position={[s.w - (tread * (steps - i)) / 2, ((i + 1) * (rise / steps)) / 2, 0]} color="#cdd4e0" />
      ))}
      {[-s.h / 2, s.h / 2].map((z) => (
        <mesh key={z} position={[s.w / 2, rise / 2 + 0.85, z]} rotation={[0, 0, Math.atan2(rise, s.w)]}>
          <boxGeometry args={[Math.hypot(s.w, rise), 0.05, 0.05]} />
          <meshStandardMaterial color={palette.yellow} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Raised hold space under a big canopy, no walls: a concrete platform at dock
 * height, steel columns with impact guards, safety rails on the open edges,
 * dock bumpers where trucks back up, high-bay lights and a hanging sign.
 * The roof itself is drawn by <CanopyRoof /> so it can be hidden.
 */
export function Canopy({ yard, b, bays }: { yard: YardConfig; b: Building; bays: TruckBay[] }) {
  const { x, y, w, h } = b.rect;
  const E = b.elevation ?? 1.2;
  const H = b.height;
  const steel = mat('#5b6b8c', { roughness: 0.45, metalness: 0.4 });
  const guard = useMemo(() => new THREE.MeshStandardMaterial({ map: stripesTexture(), roughness: 0.6 }), []);
  const cols = canopyColumns(b);
  const docks = bays.filter((bay) => {
    const rearY = bay.center[1] - (Math.sin(bay.heading) * bay.length) / 2;
    return bay.kind === 'loading' && Math.abs(rearY - y) < 0.5 && bay.center[0] > x && bay.center[0] < x + w;
  });
  const signTex = useMemo(() => hangingSign(b.name.toUpperCase()), [b.name]);
  return (
    <group>
      <group position={yardToWorld(x + w / 2, y + h / 2)}>
        {/* Platform */}
        <Box size={[w, E, h]} position={[0, E / 2, 0]} color="#d5dbe6" />
        <Box size={[w + 0.02, 0.12, 0.3]} position={[0, E - 0.06, h / 2 - 0.15]} color={palette.yellow} shadow={false} />
        <Box size={[w + 0.04, 0.35, 0.06]} position={[0, E - 0.18, h / 2 + 0.01]} color="#3a4256" shadow={false} />
        {docks.map((bay) => (
          <group key={bay.id} position={[bay.center[0] - (x + w / 2), 0, h / 2]}>
            {[-1.25, 1.25].map((dx) => (
              <RBox key={dx} size={[0.3, 0.5, 0.25]} position={[dx, E - 0.45, 0.12]} color={palette.tire} radius={0.05} />
            ))}
            {/* Dock leveller plate and the dock light on its arm. */}
            <Box size={[2.2, 0.05, 0.6]} position={[0, E + 0.02, -0.3]} color="#9aa3b8" shadow={false} />
            <Box size={[2.2, 0.03, 0.04]} position={[0, E + 0.05, -0.02]} color={palette.yellow} shadow={false} />
            <Cyl r={0.04} h={1.2} position={[1.7, E + 0.6, -0.15]} color="#3a4256" />
            <Box size={[0.6, 0.05, 0.05]} position={[1.42, E + 1.2, -0.15]} color="#3a4256" />
            <mesh position={[1.12, E + 1.17, -0.08]} material={glowMat('#fff6d6', '#ffe6a8', 0.3, 2.6)}>
              <boxGeometry args={[0.2, 0.12, 0.14]} />
            </mesh>
          </group>
        ))}
        {/* Columns with impact guards */}
        {cols.map(([cx, cz], i) => (
          <group key={i}>
            <Box size={[0.3, H - E, 0.3]} position={[cx, E + (H - E) / 2, cz]} material={steel} />
            <Box size={[0.42, 0.9, 0.42]} position={[cx, E + 0.45, cz]} material={guard} />
            <Box size={[0.5, 0.04, 0.5]} position={[cx, E + 0.02, cz]} color="#8d97ad" shadow={false} />
          </group>
        ))}
        {/* Downpipes from the front gutter at every other column. */}
        {cols
          .filter(([, cz]) => cz > 0)
          .filter((_, i) => i % 2 === 0)
          .map(([cx], i) => (
            <Cyl key={i} r={0.06} h={H - 0.2} position={[cx + 0.22, (H - 0.2) / 2, h / 2 - 0.25]} color="#b9c1d1" />
          ))}
        {/* High-bay lights under the beams. */}
        {cols
          .filter(([, cz]) => cz < 0)
          .slice(0, -1)
          .map(([cx], i) => (
            <group key={i}>
              {[-h / 4, h / 4].map((lz) => (
                <group key={lz} position={[cx + (w - 0.8) / Math.max(1, Math.round(w / 7.5)) / 2, H - 0.75, lz]}>
                  <Cyl r={0.02} h={0.5} position={[0, 0.3, 0]} color="#3a4256" />
                  <mesh material={glowMat('#f4f6fb', '#fff1cc', 0.25, 3.2)}>
                    <cylinderGeometry args={[0.32, 0.24, 0.16, 16]} />
                  </mesh>
                </group>
              ))}
            </group>
          ))}
        {/* Hanging sign over the loading strip. */}
        <group position={[-w / 2 + Math.min(9, w / 2), H - 1.6, h / 2 - 2]}>
          <Box size={[0.03, 0.9, 0.03]} position={[-1.6, 0.85, 0]} color="#3a4256" shadow={false} />
          <Box size={[0.03, 0.9, 0.03]} position={[1.6, 0.85, 0]} color="#3a4256" shadow={false} />
          <mesh>
            <boxGeometry args={[3.8, 0.8, 0.05]} />
            <meshStandardMaterial map={signTex} roughness={0.5} />
          </mesh>
        </group>
      </group>
      <Rails yard={yard} b={b} />
      {STAIRS.filter((s) => inRect(b.rect, s.x + s.w + 0.3, s.y + s.h / 2)).map((s, i) => (
        <Stairs key={i} s={s} rise={E} />
      ))}
    </group>
  );
}

function hangingSign(text: string) {
  return canvasTexture(`hang|${text}`, 512, 108, (ctx, w, h) => {
    ctx.fillStyle = palette.blue;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

/** Canopy roof: beams, ribbed translucent panels, fascia and gutter — hideable to look inside. */
export function CanopyRoof({ b }: { b: Building }) {
  const { x, y, w, h } = b.rect;
  const H = b.height;
  const steel = mat('#5b6b8c', { roughness: 0.45, metalness: 0.4 });
  const blue = mat(palette.blue, { roughness: 0.5 });
  const nx = Math.max(1, Math.round(w / 7.5));
  const roofMat = useMemo(() => {
    const tex = corrugatedTexture('canopy-roof', '#cfdcfb', '#e6eeff', '#b3c6f2').clone();
    tex.needsUpdate = true;
    tex.repeat.set(w / 1.2, 1);
    return new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.42, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide });
  }, [w]);
  return (
    <group position={yardToWorld(x + w / 2, y + h / 2)}>
      {Array.from({ length: nx + 1 }, (_, i) => (
        <Box key={i} size={[0.25, 0.4, h]} position={[-w / 2 + 0.4 + (i * (w - 0.8)) / nx, H - 0.2, 0]} material={steel} />
      ))}
      <Box size={[w, 0.18, 0.15]} position={[0, H - 0.1, 0]} material={steel} />
      <mesh position={[0, H + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={roofMat}>
        <planeGeometry args={[w + 0.6, h + 0.6]} />
      </mesh>
      <Box size={[w + 0.8, 0.5, 0.3]} position={[0, H, h / 2 + 0.3]} material={blue} />
      <Box size={[w + 0.8, 0.5, 0.3]} position={[0, H, -h / 2 - 0.3]} material={blue} />
      <Box size={[0.3, 0.5, h + 0.6]} position={[w / 2 + 0.3, H, 0]} material={blue} />
      <Box size={[0.3, 0.5, h + 0.6]} position={[-w / 2 - 0.3, H, 0]} material={blue} />
      <Box size={[w + 0.8, 0.16, 0.22]} position={[0, H - 0.3, h / 2 + 0.52]} color="#b9c1d1" />
    </group>
  );
}

/** Night light pools on the platform under the high-bay lights. */
export function CanopyLights({ b }: { b: Building }) {
  const { x, y, w, h } = b.rect;
  const nx = Math.max(1, Math.round(w / 7.5));
  const pools: [number, number][] = [];
  for (let i = 0; i < nx; i++) for (const k of [0.25, 0.75]) pools.push([x + 0.4 + ((i + 0.5) * (w - 0.8)) / nx, y + h * k]);
  return (
    <>
      {pools.map(([px, py], i) => (
        <LightPool key={i} x={px} y={py} h={b.elevation ?? 0} r={4.2} />
      ))}
    </>
  );
}

/** Forklift ramp: a sloped concrete wedge from the ground to the platform. */
export function RampMesh({ ramp }: { ramp: Ramp }) {
  const r = ramp.rect;
  // Built climbing north (length along the climb, width across), then turned to its direction.
  const ns = ramp.up === 'north' || ramp.up === 'south';
  const len = ns ? r.h : r.w;
  const wid = ns ? r.w : r.h;
  const turn = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 }[ramp.up];
  const geo = useMemo(() => {
    // Profile in the climb direction: length len, rise ramp.rise; extruded across wid.
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(len, 0), new THREE.Vector2(len, ramp.rise)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: wid, bevelEnabled: false });
    // shape x → yard north (world −z), shape y → up, extrude → east (world +x).
    g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
    return g;
  }, [len, wid, ramp.rise]);
  return (
    <group position={yardToWorld(r.x + r.w / 2, r.y + r.h / 2)} rotation={[0, turn, 0]}>
      <group position={[-wid / 2, 0, len / 2]}>
        <mesh geometry={geo} material={mat('#cdd4e0', { roughness: 0.9 })} castShadow receiveShadow />
        {[0.15, wid - 0.15].map((dx) => (
          <mesh key={dx} position={[dx, ramp.rise / 2 + 0.06, -len / 2]} rotation={[Math.atan2(ramp.rise, len), 0, 0]} castShadow>
            <boxGeometry args={[0.18, 0.12, Math.hypot(len, ramp.rise)]} />
            <meshStandardMaterial color={palette.yellow} roughness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function Buildings({ yard }: { yard: YardConfig }) {
  const roofs = useLayers((st) => st.roofs);
  return (
    <group>
      {yard.buildings.map((b) => (
        <Merge key={b.id}>
          {b.kind === 'warehouse' ? (
            <Warehouse b={b} />
          ) : b.kind === 'gatehouse' ? (
            <Gatehouse b={b} />
          ) : b.kind === 'canopy' ? (
            <Canopy yard={yard} b={b} bays={yard.bays} />
          ) : (
            <Office b={b} />
          )}
        </Merge>
      ))}
      {yard.buildings
        .filter((b) => b.kind === 'canopy')
        .map((b) => (
          <group key={b.id}>
            {roofs && (
              <Merge>
                <CanopyRoof b={b} />
              </Merge>
            )}
            <CanopyLights b={b} />
          </group>
        ))}
      {yard.ramps.map((r) => (
        <RampMesh key={r.id} ramp={r} />
      ))}
    </group>
  );
}
