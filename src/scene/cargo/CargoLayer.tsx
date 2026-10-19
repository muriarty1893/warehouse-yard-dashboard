import type { ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Cargo, StoragePosition } from '../../domain/types';
import { useUi } from '../../state/ui';
import { Brackets, Pin, Tag } from '../markers';
import { yardToWorld } from '../kit';
import { buildCargoPrims, makePrimAssets, type Prim, type PrimKind } from './cargoPrims';
import { Containers } from './Containers';
import { selectAndFocus } from '../../ui/focus';

function PrimMesh({ prims, asset, onHover, onClick, onDoubleClick }: {
  prims: Prim[];
  asset: { geometry: THREE.BufferGeometry; material: THREE.Material };
  onHover: (cargo: number | null) => void;
  onClick: (cargo: number) => void;
  onDoubleClick: (cargo: number) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    prims.forEach((p, i) => {
      q.setFromAxisAngle(up, p.yaw);
      m.compose(new THREE.Vector3(...yardToWorld(p.x, p.y, p.z)), q, new THREE.Vector3(p.sx, p.sy, p.sz));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.set(p.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [prims]);

  const cargoAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId === undefined ? null : prims[e.instanceId].cargo);
  return (
    <instancedMesh
      ref={ref}
      args={[asset.geometry, asset.material, prims.length]}
      castShadow
      receiveShadow
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(cargoAt(e));
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        const c = cargoAt(e);
        if (c !== null) onClick(c);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        const c = cargoAt(e);
        if (c !== null) onDoubleClick(c);
      }}
    />
  );
}

export function CargoLayer({ cargo, positions }: { cargo: Cargo[]; positions: Map<string, StoragePosition> }) {
  const assets = useMemo(makePrimAssets, []);
  const { prims, bounds } = useMemo(() => buildCargoPrims(cargo, positions), [cargo, positions]);
  const byKind = useMemo(() => {
    const groups = new Map<PrimKind, Prim[]>();
    for (const p of prims) {
      const list = groups.get(p.kind) ?? [];
      list.push(p);
      groups.set(p.kind, list);
    }
    return [...groups.entries()];
  }, [prims]);

  const hover = useUi((s) => s.hover);
  const select = useUi((s) => s.select);
  const hovered = useUi((s) => (s.hovered?.kind === 'cargo' ? s.hovered.id : null));
  const selected = useUi((s) => (s.selected?.kind === 'cargo' ? s.selected.id : null));
  const index = useMemo(() => new Map(cargo.map((c, i) => [c.id, i])), [cargo]);

  const onHover = (i: number | null) => {
    if (i !== null) hover({ kind: 'cargo', id: cargo[i].id });
    else if (useUi.getState().hovered?.kind === 'cargo') hover(null);
  };
  const onClick = (i: number) => select({ kind: 'cargo', id: cargo[i].id });
  const onDoubleClick = (i: number) => selectAndFocus({ kind: 'cargo', id: cargo[i].id });

  const highlight = [...new Set([selected, hovered].filter((x): x is string => !!x))];

  return (
    <group>
      {byKind.map(([kind, list]) => (
        <PrimMesh key={kind} prims={list} asset={assets[kind]} onHover={onHover} onClick={onClick} onDoubleClick={onDoubleClick} />
      ))}
      <Containers cargo={cargo} bounds={bounds} onHover={onHover} onClick={onClick} onDoubleClick={onDoubleClick} />

      {cargo.map((c, i) =>
        c.pinned && bounds[i] ? <Pin key={c.id} position={yardToWorld(bounds[i].x, bounds[i].y, bounds[i].top + 1.4)} /> : null,
      )}

      {highlight.map((id) => {
        const i = index.get(id);
        if (i === undefined || !bounds[i]) return null;
        const b = bounds[i];
        const c = cargo[i];
        return (
          <group key={id} position={yardToWorld(b.x, b.y, b.base)} rotation={[0, b.yaw, 0]}>
            <Brackets size={[b.l + 0.2, b.top - b.base + 0.1, b.w + 0.2]} strong={id === selected} />
            <Tag
              y={b.top - b.base + (c.pinned ? 2.6 : 0.9)}
              title={c.id}
              subtitle={`${c.description} · ${c.positionId}`}
              variant="light"
            />
          </group>
        );
      })}
    </group>
  );
}
