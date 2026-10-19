import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { hashString, mulberry32 } from '../../domain/seed';
import type { Cargo, StoragePosition } from '../../domain/types';
import { canvasTexture } from '../kit';

/**
 * Turns cargo records into low-poly primitives (pallets, cartons, wraps, …)
 * that are drawn with one InstancedMesh per primitive kind.
 */

export type PrimKind = 'pallet' | 'carton' | 'tape' | 'wrap' | 'crate' | 'reel' | 'cable' | 'bag' | 'body' | 'pipe' | 'wood';

export interface Prim {
  kind: PrimKind;
  cargo: number;
  /** Center in yard coords; z is height of the center. */
  x: number;
  y: number;
  z: number;
  /** Size along local x, height, local y. */
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  color: string;
}

export interface CargoBounds {
  x: number;
  y: number;
  base: number;
  top: number;
  l: number;
  w: number;
  yaw: number;
}

const PALLET_H = 0.144;

function palletGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const box = (l: number, h: number, w: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(l, h, w);
    g.translate(x, y, z);
    parts.push(g);
  };
  // Unit pallet: 1 × 0.144 × 1 (scaled to the real footprint per instance).
  for (let i = 0; i < 5; i++) box(1, 0.024, 0.15, 0, 0.132, -0.425 + i * 0.2125);
  for (const x of [-0.44, 0, 0.44]) for (const z of [-0.43, 0, 0.43]) box(0.12, 0.084, 0.14, x, 0.078, z);
  for (const z of [-0.43, 0, 0.43]) box(1, 0.022, 0.14, 0, 0.011, z);
  return mergeGeometries(parts);
}

function reelGeometry() {
  // Cable drum, axis along z; unit diameter 1, unit width 1.
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-0.46, 0.46]) {
    const g = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 28);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, z);
    parts.push(g);
  }
  const core = new THREE.CylinderGeometry(0.16, 0.16, 1.02, 16);
  core.rotateX(Math.PI / 2);
  parts.push(core);
  return mergeGeometries(parts);
}

function cableGeometry() {
  const g = new THREE.CylinderGeometry(0.42, 0.42, 0.84, 28);
  g.rotateX(Math.PI / 2);
  return g;
}

function pipeGeometry() {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, false);
  g.rotateZ(Math.PI / 2);
  return g;
}

function crateTexture() {
  return canvasTexture('crate', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d8ad74';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c99a5f';
    for (let y = 0; y < h; y += 26) ctx.fillRect(0, y, w, 3);
    ctx.fillStyle = '#b8874d';
    ctx.fillRect(0, 0, w, 12);
    ctx.fillRect(0, h - 12, w, 12);
    ctx.fillRect(0, 0, 12, h);
    ctx.fillRect(w - 12, 0, 12, h);
  });
}

export function makePrimAssets() {
  const white = (roughness: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness, ...opts });
  return {
    pallet: { geometry: palletGeometry(), material: white(0.85) },
    carton: { geometry: new RoundedBoxGeometry(1, 1, 1, 1, 0.035), material: white(0.8) },
    tape: { geometry: new THREE.BoxGeometry(1, 1, 1), material: white(0.5) },
    wrap: { geometry: new RoundedBoxGeometry(1, 1, 1, 1, 0.07), material: white(0.28, { metalness: 0.05 }) },
    crate: { geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 }) },
    reel: { geometry: reelGeometry(), material: white(0.8) },
    cable: { geometry: cableGeometry(), material: white(0.55) },
    bag: { geometry: new RoundedBoxGeometry(1, 1, 1, 2, 0.16), material: white(0.9) },
    body: { geometry: new RoundedBoxGeometry(1, 1, 1, 1, 0.06), material: white(0.5, { metalness: 0.15 }) },
    pipe: { geometry: pipeGeometry(), material: white(0.35, { metalness: 0.45 }) },
    wood: { geometry: new THREE.BoxGeometry(1, 1, 1), material: white(0.85) },
  } satisfies Record<PrimKind, { geometry: THREE.BufferGeometry; material: THREE.Material }>;
}

const CARTON_TONES = ['#d9a66b', '#d29d60', '#e0b07a', '#cf9a5e', '#dcaa70'];
const BLUE_TONES = ['#2f64f0', '#3a70ff', '#2a5be0', '#346bf7'];
const CABLE_TONES = ['#1d2b5a', '#d64b4b', '#2f5ff0', '#2b3140'];

/**
 * Layout for every cargo item: stacks on its position (spec §25), then the
 * primitives that draw it. Pure function of the World State.
 */
export function buildCargoPrims(cargo: Cargo[], positions: Map<string, StoragePosition>) {
  const prims: Prim[] = [];
  const bounds: CargoBounds[] = [];
  const stackTop = new Map<string, number>();
  const order = cargo.map((_, i) => i).sort((a, b) => cargo[a].stackLevel - cargo[b].stackLevel);

  for (const i of order) {
    const c = cargo[i];
    const pos = positions.get(c.positionId);
    if (!pos) continue;
    const base = stackTop.get(pos.id) ?? 0;
    const rng = mulberry32(hashString(c.id));
    const yaw = c.look === 'container' ? 0 : (rng() - 0.5) * 0.06;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const { l, w, h } = c.dims;

    const add = (kind: PrimKind, lx: number, ly: number, z: number, sx: number, sy: number, sz: number, color: string, ownYaw = 0) => {
      prims.push({ kind, cargo: i, x: pos.x + lx * cos - ly * sin, y: pos.y + lx * sin + ly * cos, z: base + z, sx, sy, sz, yaw: yaw + ownYaw, color });
    };
    const pallet = () => add('pallet', 0, 0, 0, l, 1, w, '#c99a64');

    const cartonGrid = (kind: 'carton' | 'wrap', tones: string[], nx: number, ny: number, z0: number, height: number, tape: boolean) => {
      const layers = Math.max(1, Math.round(height / 0.4));
      const ch = height / layers;
      const cl = l / nx;
      const cw = w / ny;
      for (let k = 0; k < layers; k++) {
        for (let a = 0; a < nx; a++) {
          for (let b = 0; b < ny; b++) {
            const j = 0.94 + rng() * 0.05;
            const ox = (a + 0.5) * cl - l / 2 + (rng() - 0.5) * 0.03;
            const oy = (b + 0.5) * cw - w / 2 + (rng() - 0.5) * 0.03;
            const zc = z0 + k * ch + ch / 2;
            const ry = (rng() - 0.5) * 0.06;
            const color = tones[Math.floor(rng() * tones.length)];
            add(kind, ox, oy, zc, (cl - 0.025) * j, ch - 0.012, (cw - 0.025) * j, color, ry);
            if (tape && k === layers - 1) add('tape', ox, oy, zc + ch / 2 - 0.004, (cl - 0.025) * j * 1.002, 0.012, 0.07, '#efd6ad', ry);
          }
        }
      }
    };

    switch (c.look) {
      case 'cartons':
        pallet();
        cartonGrid('carton', CARTON_TONES, 2, 2, PALLET_H, h - PALLET_H, true);
        break;
      case 'wrap-blue':
        pallet();
        cartonGrid('wrap', BLUE_TONES, 2, 2, PALLET_H, h - PALLET_H, false);
        break;
      case 'wrap-white':
        pallet();
        add('wrap', 0, 0, PALLET_H + (h - PALLET_H) / 2, l - 0.02, h - PALLET_H - 0.01, w - 0.02, '#f1f4fa');
        add('tape', 0, -w / 2 + 0.005, PALLET_H + (h - PALLET_H) * 0.6, 0.3, 0.2, 0.012, '#2f5ff0');
        break;
      case 'group-cartons':
        cartonGrid('carton', CARTON_TONES, 5, 4, 0, h, true);
        break;
      case 'crate':
        for (const s of [-0.32, 0.32]) add('wood', 0, s * w, 0.05, l, 0.1, 0.12, '#a77b4c');
        add('crate', 0, 0, 0.1 + (h - 0.1) / 2, l, h - 0.1, w, '#ffffff');
        break;
      case 'drum': {
        const cable = CABLE_TONES[Math.floor(rng() * CABLE_TONES.length)];
        add('reel', 0, 0, h / 2, h, h, w, '#c99a64');
        add('cable', 0, 0, h / 2, h, h, w, cable);
        break;
      }
      case 'bag':
        pallet();
        add('bag', 0, 0, PALLET_H + (h - PALLET_H) / 2, l - 0.05, h - PALLET_H - 0.02, w - 0.05, rng() < 0.5 ? '#f3f3ee' : '#ecebe4');
        add('tape', 0, -(w - 0.05) / 2 - 0.004, PALLET_H + (h - PALLET_H) * 0.55, 0.42, 0.3, 0.01, '#2f5ff0');
        break;
      case 'machine': {
        add('wood', 0, 0, 0.06, l, 0.12, w, '#a77b4c');
        add('body', 0, 0, 0.12 + 0.35, l * 0.96, 0.7, w * 0.92, '#5b6b8c');
        add('body', -l * 0.12, 0, 0.12 + 0.7 + (h - 0.82) / 2, l * 0.62, h - 0.84, w * 0.8, '#e9ecf2');
        add('body', l * 0.33, 0, 0.12 + 0.7 + 0.25, l * 0.22, 0.5, w * 0.5, '#f6c431');
        break;
      }
      case 'pipes': {
        for (const s of [-0.38, 0.38]) add('wood', s * l, 0, 0.05, 0.12, 0.1, w, '#a77b4c');
        const r = w / 6;
        const tone = rng() < 0.5 ? '#aab4c8' : '#8d97ad';
        for (let k = 0; k < 3; k++) add('pipe', 0, -w / 2 + r + k * 2 * r, 0.1 + r, l, 2 * r, 2 * r, tone);
        for (let k = 0; k < 2; k++) add('pipe', 0, -w / 2 + 2 * r + k * 2 * r, 0.1 + r + r * 1.73, l, 2 * r, 2 * r, tone);
        break;
      }
      case 'container':
        // Drawn by <Containers />; only the stack height matters here.
        break;
    }

    stackTop.set(pos.id, base + h + (c.look === 'container' ? 0 : 0.02));
    bounds[i] = { x: pos.x, y: pos.y, base, top: base + h, l, w, yaw };
  }
  return { prims, bounds };
}
