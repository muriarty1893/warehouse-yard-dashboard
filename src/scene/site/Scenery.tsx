import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Vec2, YardConfig } from '../../domain/types';
import { Box, Cyl, mat, palette, RBox, unitBox, unitCylinder, yardToWorld } from '../kit';
import { Merge } from '../Merge';

type Inst = { position: [number, number, number]; scale: [number, number, number]; rotation?: number };

/** One InstancedMesh for many copies of the same geometry/material. */
export function Instanced({ geometry, material, items, castShadow = true }: { geometry: THREE.BufferGeometry; material: THREE.Material; items: Inst[]; castShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.rotation ?? 0);
      m.compose(new THREE.Vector3(...it.position), q, new THREE.Vector3(...it.scale));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow />;
}

// ---------------------------------------------------------------------------
// Fence along the yard boundary, open at gates.

function fenceRuns(yard: YardConfig): [Vec2, Vec2][] {
  const runs: [Vec2, Vec2][] = [];
  const n = yard.boundary.length;
  for (let i = 0; i < n; i++) {
    const a = yard.boundary[i];
    const b = yard.boundary[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    // Gate openings that lie on this edge, as [start, end] distances.
    const cuts = yard.gates
      .map((g) => {
        const ta = (g.a[0] - a[0]) * dir[0] + (g.a[1] - a[1]) * dir[1];
        const tb = (g.b[0] - a[0]) * dir[0] + (g.b[1] - a[1]) * dir[1];
        const off = Math.abs((g.a[0] - a[0]) * dir[1] - (g.a[1] - a[1]) * dir[0]);
        return off < 0.01 ? ([Math.min(ta, tb), Math.max(ta, tb)] as const) : null;
      })
      .filter((c): c is readonly [number, number] => !!c)
      .sort((p, q) => p[0] - q[0]);
    let t = 0;
    const at = (s: number): Vec2 => [a[0] + dir[0] * s, a[1] + dir[1] * s];
    for (const [c0, c1] of cuts) {
      if (c0 > t) runs.push([at(t), at(c0)]);
      t = c1;
    }
    if (t < len) runs.push([at(t), at(len)]);
  }
  return runs;
}

function Fence({ yard }: { yard: YardConfig }) {
  const { posts, rails, panels } = useMemo(() => {
    const posts: Inst[] = [];
    const rails: Inst[] = [];
    const panels: Inst[] = [];
    const H = 2.1;
    for (const [a, b] of fenceRuns(yard)) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const count = Math.max(1, Math.round(len / 3));
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        posts.push({ position: yardToWorld(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, H / 2), scale: [0.09, H, 0.09] });
      }
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      rails.push({ position: yardToWorld(mx, my, H - 0.04), scale: [len, 0.07, 0.07], rotation: heading });
      rails.push({ position: yardToWorld(mx, my, 0.12), scale: [len, 0.07, 0.05], rotation: heading });
      panels.push({ position: yardToWorld(mx, my, H / 2), scale: [len, H - 0.15, 0.02], rotation: heading });
    }
    return { posts, rails, panels };
  }, [yard]);
  return (
    <group>
      <Instanced geometry={unitBox} material={mat('#a7b0c4', { roughness: 0.5, metalness: 0.2 })} items={posts} />
      <Instanced geometry={unitBox} material={mat('#b4bccd', { roughness: 0.5, metalness: 0.2 })} items={rails} />
      <Instanced
        geometry={unitBox}
        material={mat('#c9d0de', { transparent: true, opacity: 0.32, roughness: 0.6 })}
        items={panels}
        castShadow={false}
      />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Light poles and bollards.

const POLES: { x: number; y: number; heading: number }[] = [
  { x: 34.5, y: 2, heading: Math.PI / 2 },
  { x: 2, y: 30, heading: 0 },
  { x: 2, y: 66, heading: 0 },
  { x: 88.5, y: 70, heading: Math.PI },
  { x: 58, y: 47.5, heading: Math.PI / 2 },
  { x: 92.5, y: 56, heading: -Math.PI / 2 },
  { x: 132, y: 57.5, heading: -Math.PI / 2 },
  { x: 158.5, y: 29.5, heading: Math.PI },
  { x: 132, y: 1.5, heading: Math.PI / 2 },
  { x: 92.5, y: 1.5, heading: Math.PI / 2 },
];

function LightPole({ x, y, heading }: { x: number; y: number; heading: number }) {
  const pole = mat('#b9c1d1', { roughness: 0.4, metalness: 0.4 });
  return (
    <group position={yardToWorld(x, y)} rotation={[0, heading, 0]}>
      <Cyl r={0.32} h={0.3} position={[0, 0.15, 0]} material={mat('#c9d0de')} />
      <Cyl r={0.1} h={9} position={[0, 4.5, 0]} material={pole} />
      <Box size={[1.6, 0.1, 0.1]} position={[0.75, 8.9, 0]} material={pole} />
      <RBox size={[0.9, 0.16, 0.42]} position={[1.4, 8.82, 0]} color="#dfe4ee" radius={0.05} />
      <Box size={[0.8, 0.02, 0.34]} position={[1.4, 8.73, 0]} material={mat('#fff8de', { emissive: '#fff3c4', emissiveIntensity: 0.6 })} shadow={false} />
    </group>
  );
}

const BOLLARDS: Vec2[] = [
  [35.4, 1], [56.6, 1], [35.4, 3], [56.6, 3],
  [9.4, 85.4], [80.6, 85.4], [59.5, 0.5], [65.5, 0.5],
  [93.6, 3.5], [93.6, 40], [104.6, 26.5], [104.6, 32.5],
];

export function Scenery({ yard }: { yard: YardConfig }) {
  const bollards = useMemo<Inst[]>(() => BOLLARDS.map(([x, y]) => ({ position: yardToWorld(x, y, 0.5), scale: [0.13, 1, 0.13] })), []);
  return (
    <group>
      <Fence yard={yard} />
      <Merge>
        {POLES.map((p, i) => (
          <LightPole key={i} {...p} />
        ))}
      </Merge>
      <Instanced geometry={unitCylinder} material={mat(palette.yellow, { roughness: 0.5 })} items={bollards} />
    </group>
  );
}
