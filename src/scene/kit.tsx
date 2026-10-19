import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Shared look & building blocks: palette, cached materials/geometries and a
 * few tiny primitives. Everything in the scene is code-generated low-poly
 * geometry — no external model files.
 */

export const palette = {
  background: '#e4e8f2',
  ground: '#dde2ee',
  yard: '#eef1f7',
  lane: '#e2e6f0',
  grass: '#bfe6cc',
  blue: '#2f5ff0',
  blueDark: '#1f44c4',
  navy: '#1b2a4a',
  white: '#f7f8fb',
  wall: '#e6eaf3',
  yellow: '#f2c230',
  forklift: '#f6c431',
  steel: '#8d97ad',
  dark: '#2b3140',
  glass: '#2a3d66',
  tire: '#22262f',
  cardboard: '#d9a66b',
  tape: '#efd3a6',
  wood: '#c99a64',
  orange: '#ff8a2a',
} as const;

// ---------------------------------------------------------------------------
// Caches

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export interface MatOpts {
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

export function mat(color: string, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.72,
      metalness: opts.metalness ?? 0,
      emissive: opts.emissive ?? '#000000',
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    });
    matCache.set(key, m);
  }
  return m;
}

export const glassMat = () => mat(palette.glass, { roughness: 0.18, metalness: 0.35 });

const geoCache = new Map<string, THREE.BufferGeometry>();

export function roundedBox(l: number, h: number, w: number, r: number): THREE.BufferGeometry {
  const key = `rb|${l.toFixed(3)}|${h.toFixed(3)}|${w.toFixed(3)}|${r.toFixed(3)}`;
  let g = geoCache.get(key);
  if (!g) {
    const rr = Math.max(0.001, Math.min(r, l / 2 - 0.001, h / 2 - 0.001, w / 2 - 0.001));
    g = new RoundedBoxGeometry(l, h, w, 2, rr);
    geoCache.set(key, g);
  }
  return g;
}

export const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
export const unitSphere = new THREE.SphereGeometry(1, 16, 11);

// ---------------------------------------------------------------------------
// Primitives. Local frame: x = length (forward), y = up, z = width.

type V3 = [number, number, number];

interface BoxProps {
  size: V3;
  position?: V3;
  rotation?: V3;
  color?: string;
  material?: THREE.Material;
  radius?: number;
  shadow?: boolean;
}

/** Rounded box. `position` is the box center. */
export function RBox({ size, position, rotation, color = palette.white, material, radius = 0.06, shadow = true }: BoxProps) {
  const geo = roundedBox(size[0], size[1], size[2], radius);
  return (
    <mesh geometry={geo} material={material ?? mat(color)} position={position} rotation={rotation} castShadow={shadow} receiveShadow />
  );
}

/** Sharp box. */
export function Box({ size, position, rotation, color = palette.white, material, shadow = true }: BoxProps) {
  return (
    <mesh geometry={unitBox} material={material ?? mat(color)} position={position} rotation={rotation} scale={size} castShadow={shadow} receiveShadow />
  );
}

/** Cylinder; default axis is y. */
export function Cyl({
  r,
  h,
  position,
  rotation,
  color = palette.white,
  material,
  shadow = true,
}: {
  r: number;
  h: number;
  position?: V3;
  rotation?: V3;
  color?: string;
  material?: THREE.Material;
  shadow?: boolean;
}) {
  return (
    <mesh geometry={unitCylinder} material={material ?? mat(color)} position={position} rotation={rotation} scale={[r, h, r]} castShadow={shadow} receiveShadow />
  );
}

/** Wheel lying along z (rolls about z when the vehicle moves along x). `spin` registers it for rolling. */
export function Wheel({ r, w, position, spin }: { r: number; w: number; position: V3; spin?: (g: THREE.Group | null) => void }) {
  return (
    <group position={position} ref={spin} userData={{ radius: r, noMerge: !!spin }}>
      <mesh geometry={unitCylinder} material={mat(palette.tire, { roughness: 0.9 })} rotation={[Math.PI / 2, 0, 0]} scale={[r, w, r]} castShadow />
      <mesh geometry={unitCylinder} material={mat('#c3cad8', { roughness: 0.4, metalness: 0.3 })} rotation={[Math.PI / 2, 0, 0]} scale={[r * 0.55, w * 1.04, r * 0.55]} />
    </group>
  );
}

/** Yard (x east, y north, meters) → three.js position. */
export const yardToWorld = (x: number, y: number, h = 0): V3 => [x, h, -y];

/** Group placed at a yard pose. Children use the local vehicle frame. */
export function AtPose({ x, y, heading, h = 0, children }: { x: number; y: number; heading: number; h?: number; children: ReactNode }) {
  return (
    <group position={yardToWorld(x, y, h)} rotation={[0, heading, 0]}>
      {children}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Canvas textures

const texCache = new Map<string, THREE.CanvasTexture>();

export function canvasTexture(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { repeat?: boolean } = {},
): THREE.CanvasTexture {
  const cached = texCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (opts.repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  texCache.set(key, tex);
  return tex;
}

export const FONT = '"Inter Variable", Inter, system-ui, sans-serif';

/** Memoized material with a texture map. */
export function useMapMaterial(tex: THREE.Texture, opts: MatOpts & { color?: string } = {}) {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: tex,
        color: opts.color ?? '#ffffff',
        roughness: opts.roughness ?? 0.7,
        metalness: opts.metalness ?? 0,
        transparent: opts.transparent ?? false,
        side: opts.side ?? THREE.FrontSide,
      }),
    [tex],
  );
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** The Docktor mark: a rounded square with an isometric cube. */
export function drawLogoMark(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string = palette.blue) {
  ctx.save();
  ctx.fillStyle = color;
  roundRect(ctx, x, y, s, s, s * 0.22);
  ctx.fill();
  const cx = x + s / 2;
  const cy = y + s / 2;
  const k = s * 0.26;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - k);
  ctx.lineTo(cx + k * 0.87, cy - k / 2);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx - k * 0.87, cy - k / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.moveTo(cx - k * 0.87, cy - k / 2);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx, cy + k);
  ctx.lineTo(cx - k * 0.87, cy + k / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(cx + k * 0.87, cy - k / 2);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx, cy + k);
  ctx.lineTo(cx + k * 0.87, cy + k / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Vertical corrugation (ribbed cladding). One tile = 1.6 m. */
export function corrugatedTexture(key: string, base: string, light: string, dark: string) {
  return canvasTexture(
    `corr|${key}`,
    128,
    32,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) {
        ctx.fillStyle = light;
        ctx.fillRect(x, 0, 5, h);
        ctx.fillStyle = dark;
        ctx.fillRect(x + 12, 0, 2, h);
      }
    },
    { repeat: true },
  );
}
