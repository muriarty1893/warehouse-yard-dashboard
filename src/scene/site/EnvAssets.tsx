import { useGLTF } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { road } from '../../config/devYard';
import { yardToWorld } from '../kit';
import { clusters, GRASS_TOP, NEAR, scatter, treeSpots, type Spot } from './landscape';

/**
 * Environment dressing from ready-made CC0 models (Kenney Nature Kit and City
 * Kit Roads, bundled by `npm run assets:env`). Every model is drawn with one
 * InstancedMesh per material, so hundreds of trees cost a few draw calls.
 */

const BASE = import.meta.env.BASE_URL;
export const NATURE_URL = `${BASE}assets/env/nature.glb`;
export const ROADS_URL = `${BASE}assets/env/roads.glb`;

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** A named model root from a bundle, flattened into parts in the model's own frame. */
function useModelParts(url: string, name: string): Part[] {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    // Model roots are direct children of the bundle's scene.
    const root = scene.children.find((c) => c.name === name);
    if (!root) throw new Error(`Model ${name} not found in ${url}`);
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    const parts: Part[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      parts.push({ geometry, material: mesh.material as THREE.Material });
    });
    return parts;
  }, [scene, name, url]);
}

export interface Placement {
  x: number;
  y: number;
  h?: number;
  rot: number;
  scale: number | [number, number, number];
}

function InstancedModel({ url, name, items, castShadow = true }: { url: string; name: string; items: Placement[]; castShadow?: boolean }) {
  const parts = useModelParts(url, name);
  return (
    <>
      {parts.map((p, i) => (
        <PartInstances key={i} part={p} items={items} castShadow={castShadow} />
      ))}
    </>
  );
}

function PartInstances({ part, items, castShadow }: { part: Part; items: Placement[]; castShadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const s = new THREE.Vector3();
    items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.rot);
      if (typeof it.scale === 'number') s.setScalar(it.scale);
      else s.set(...it.scale);
      m.compose(new THREE.Vector3(...yardToWorld(it.x, it.y, it.h ?? 0)), q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  if (items.length === 0) return null;
  return <instancedMesh ref={ref} args={[part.geometry, part.material, items.length]} castShadow={castShadow} receiveShadow />;
}

/** Split spots into a model family by weight; `k` in [0, 1) picks the model. */
function byFamily<T extends string>(spots: Spot[], family: { name: T; weight: number; scale: number }[], h: number) {
  const total = family.reduce((s, f) => s + f.weight, 0);
  const groups = new Map<T, Placement[]>(family.map((f) => [f.name, []]));
  for (const sp of spots) {
    let r = sp.k * total;
    const f = family.find((m) => (r -= m.weight) <= 0) ?? family[family.length - 1];
    groups.get(f.name)!.push({ x: sp.x, y: sp.y, h, rot: sp.rot, scale: f.scale * sp.s });
  }
  return [...groups.entries()];
}

const TREES = [
  { name: 'tree_default', weight: 0.22, scale: 4.6 },
  { name: 'tree_oak', weight: 0.22, scale: 5.6 },
  { name: 'tree_fat', weight: 0.2, scale: 5.4 },
  { name: 'tree_detailed', weight: 0.14, scale: 5.2 },
  { name: 'tree_tall', weight: 0.12, scale: 4.6 },
  { name: 'tree_pineRoundA', weight: 0.1, scale: 5.0 },
];
const BUSHES = [
  { name: 'plant_bushLarge', weight: 0.4, scale: 5 },
  { name: 'plant_bushDetailed', weight: 0.3, scale: 3.6 },
  { name: 'plant_bush', weight: 0.3, scale: 4.5 },
];
const GRASS = [
  { name: 'grass', weight: 0.4, scale: 2.6 },
  { name: 'grass_large', weight: 0.35, scale: 2.6 },
  { name: 'grass_leafs', weight: 0.25, scale: 3 },
];
const FLOWERS = [
  { name: 'flower_yellowA', weight: 1, scale: 3.2 },
  { name: 'flower_redA', weight: 1, scale: 3.2 },
  { name: 'flower_purpleA', weight: 1, scale: 3.2 },
];
const ROCKS = [
  { name: 'rock_smallA', weight: 1, scale: 4 },
  { name: 'rock_smallC', weight: 1, scale: 4.4 },
];

/** Trees, bushes, grass tufts, flower patches and rocks on the grass beds. */
export function Nature() {
  const groups = useMemo(() => {
    const near = NEAR;
    const trees = treeSpots();
    const bushes = scatter('bushes', 0.012, near, 1.2);
    const grass = scatter('grass', 0.14, near, 0.4);
    const flowers = clusters('flowers', 26, 9, 1.6, near);
    const rocks = scatter('rocks', 0.003, near, 1);
    return [
      ...byFamily(trees, TREES, GRASS_TOP).map(([n, items]) => ({ n, items, cast: true })),
      ...byFamily(bushes, BUSHES, GRASS_TOP).map(([n, items]) => ({ n, items, cast: true })),
      ...byFamily(grass, GRASS, GRASS_TOP - 0.05).map(([n, items]) => ({ n, items, cast: false })),
      ...byFamily(flowers, FLOWERS, GRASS_TOP - 0.05).map(([n, items]) => ({ n, items, cast: false })),
      ...byFamily(rocks, ROCKS, GRASS_TOP - 0.1).map(([n, items]) => ({ n, items, cast: true })),
    ];
  }, []);
  return (
    <group>
      {groups.map((g) => (
        <InstancedModel key={g.n} url={NATURE_URL} name={g.n} items={g.items} castShadow={g.cast} />
      ))}
    </group>
  );
}

/** Kenney road tiles (1 × 1 units) along the public road, with a driveway tile at the gate. */
export const ROAD_TILE = 14;

export function RoadTiles({ gateX }: { gateX: number }) {
  const { straight, driveway, lights } = useMemo(() => {
    const cy = (road.y0 + road.y1) / 2;
    const straight: Placement[] = [];
    const driveway: Placement[] = [];
    const scale: [number, number, number] = [ROAD_TILE, ROAD_TILE * 0.6, ROAD_TILE];
    const first = gateX - ROAD_TILE / 2 - Math.ceil((gateX - road.x0) / ROAD_TILE) * ROAD_TILE;
    for (let x = first; x < road.x1; x += ROAD_TILE) {
      const tile = { x: x + ROAD_TILE / 2, y: cy, rot: 0, scale };
      (Math.abs(tile.x - gateX) < 1 ? driveway : straight).push(tile);
    }
    const lights: Placement[] = [];
    for (let x = gateX - 4 * 32; x < gateX + 5 * 32; x += 32) {
      if (Math.abs(x - gateX) < 14) continue;
      lights.push({ x, y: road.y1 - 0.8, rot: 0, scale: 11 });
      lights.push({ x: x + 16, y: road.y0 + 0.8, rot: Math.PI, scale: 11 });
    }
    return { straight, driveway, lights };
  }, [gateX]);
  return (
    <group>
      <InstancedModel url={ROADS_URL} name="road-straight" items={straight} castShadow={false} />
      <InstancedModel url={ROADS_URL} name="road-driveway-double" items={driveway} castShadow={false} />
      <InstancedModel url={ROADS_URL} name="light-curved" items={lights} />
    </group>
  );
}

useGLTF.preload(NATURE_URL);
useGLTF.preload(ROADS_URL);
