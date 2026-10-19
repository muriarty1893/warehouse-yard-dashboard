import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Vec2, YardConfig } from '../../domain/types';
import { Box, Cyl, glowMat, LightPool, mat, palette, RBox, unitBox, unitCylinder, yardToWorld } from '../kit';
import { devYard } from '../../config/devYard';
import { Merge } from '../Merge';
import { useLayers } from '../../state/layers';

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

/**
 * High precast-concrete boundary walls: panels between pilasters, a coping on
 * top, tall posts either side of the entrance. The "walls" layer cuts them
 * down so the yard can be seen from a low camera.
 */
function Walls({ yard }: { yard: YardConfig }) {
  const full = useLayers((s) => s.walls);
  const H = full ? yard.wallHeight : 0.9;
  const { panels, posts, joints, caps } = useMemo(() => {
    const panels: Inst[] = [];
    const posts: Inst[] = [];
    const joints: Inst[] = [];
    const caps: Inst[] = [];
    const T = 0.25;
    for (const [a, b] of fenceRuns(yard)) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.2) continue;
      const heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
      // Wall stands just inside the boundary line.
      const nx = -Math.sin(heading) * (T / 2);
      const ny = Math.cos(heading) * (T / 2);
      const mx = (a[0] + b[0]) / 2 + nx;
      const my = (a[1] + b[1]) / 2 + ny;
      panels.push({ position: yardToWorld(mx, my, H / 2), scale: [len, H, T], rotation: heading });
      caps.push({ position: yardToWorld(mx, my, H + 0.06), scale: [len + 0.1, 0.12, T + 0.16], rotation: heading });
      const count = Math.max(1, Math.round(len / 4));
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const x = a[0] + (b[0] - a[0]) * t + nx * 1.6;
        const y = a[1] + (b[1] - a[1]) * t + ny * 1.6;
        const end = i === 0 || i === count;
        posts.push({ position: yardToWorld(x, y, (H + (end ? 0.3 : 0.1)) / 2), scale: [end ? 0.6 : 0.42, H + (end ? 0.3 : 0.1), end ? 0.6 : 0.42], rotation: heading });
        if (!end) {
          // Horizontal joint halfway up each panel.
          const xm = a[0] + (b[0] - a[0]) * (t - 0.5 / count) + nx * 2.05;
          const ym = a[1] + (b[1] - a[1]) * (t - 0.5 / count) + ny * 2.05;
          joints.push({ position: yardToWorld(xm, ym, H * 0.5), scale: [len / count - 0.4, 0.05, 0.02], rotation: heading });
        }
      }
    }
    return { panels, posts, joints, caps };
  }, [yard, H]);
  return (
    <group>
      <Instanced key={`p${H}`} geometry={unitBox} material={mat('#d3d8e2', { roughness: 0.92 })} items={panels} />
      <Instanced key={`c${H}`} geometry={unitBox} material={mat('#e7eaf0', { roughness: 0.85 })} items={caps} />
      <Instanced key={`s${H}`} geometry={unitBox} material={mat('#c3c9d6', { roughness: 0.9 })} items={posts} />
      <Instanced key={`j${H}`} geometry={unitBox} material={mat('#b4bccb', { roughness: 0.9 })} items={joints} castShadow={false} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Light poles and bollards.

const POLES = devYard.fixtures.filter((f) => f.kind === 'lightPole');

function LightPole({ x, y, heading }: { x: number; y: number; heading: number }) {
  const pole = mat('#b9c1d1', { roughness: 0.4, metalness: 0.4 });
  return (
    <group position={yardToWorld(x, y)} rotation={[0, heading, 0]}>
      <Cyl r={0.32} h={0.3} position={[0, 0.15, 0]} material={mat('#c9d0de')} />
      <Cyl r={0.1} h={9} position={[0, 4.5, 0]} material={pole} />
      <Box size={[1.6, 0.1, 0.1]} position={[0.75, 8.9, 0]} material={pole} />
      <RBox size={[0.9, 0.16, 0.42]} position={[1.4, 8.82, 0]} color="#dfe4ee" radius={0.05} />
      <Box size={[0.8, 0.02, 0.34]} position={[1.4, 8.73, 0]} material={glowMat('#fff8de', '#fff3c4', 0.6, 3.2)} shadow={false} />
    </group>
  );
}

const BOLLARDS = devYard.fixtures.filter((f) => f.kind === 'bollard').map((f): Vec2 => [f.x, f.y]);

export function Scenery({ yard }: { yard: YardConfig }) {
  const bollards = useMemo<Inst[]>(() => BOLLARDS.map(([x, y]) => ({ position: yardToWorld(x, y, 0.5), scale: [0.13, 1, 0.13] })), []);
  return (
    <group>
      <Walls yard={yard} />
      <Merge>
        {POLES.map((p) => (
          <LightPole key={p.id} x={p.x} y={p.y} heading={p.heading} />
        ))}
      </Merge>
      {POLES.map((p, i) => (
        <LightPool key={i} x={p.x + Math.cos(p.heading) * 1.4} y={p.y + Math.sin(p.heading) * 1.4} r={7.5} />
      ))}
      <Instanced geometry={unitCylinder} material={mat(palette.yellow, { roughness: 0.5 })} items={bollards} />
    </group>
  );
}
