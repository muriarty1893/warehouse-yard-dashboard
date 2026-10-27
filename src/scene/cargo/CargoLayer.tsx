import type { ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useUi } from '../../state/ui';
import type { Cargo } from '../../domain/types';
import { yardUnitsAt } from '../../game/motion';
import { useGame } from '../../game/store';
import type { GameCargo } from '../../game/types';
import { clock } from '../../sim/clock';
import { Brackets, Pin, Tag } from '../markers';
import { unitBox, yardToWorld } from '../kit';
import { buildCargoPrims, makePrimAssets, type CargoBounds, type Prim, type PrimKind } from './cargoPrims';
import { Containers } from './Containers';
import { selectAndFocus } from '../../ui/focus';

export function PrimMesh({ prims, asset, onHover, onClick, onDoubleClick }: {
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

/**
 * Shadows for all cargo from one box per unit: the detailed primitives (each
 * carton, tape, label) are not drawn into the shadow map, which keeps the
 * shadow pass cheap however full the yard is.
 */
function ShadowProxies({ bounds }: { bounds: CargoBounds[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const list = useMemo(() => bounds.filter(Boolean), [bounds]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    list.forEach((b, i) => {
      q.setFromAxisAngle(up, b.yaw);
      m.compose(new THREE.Vector3(...yardToWorld(b.x, b.y, (b.base + b.top) / 2)), q, new THREE.Vector3(b.l * 0.96, b.top - b.base, b.w * 0.96));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list]);
  if (!list.length) return null;
  return <instancedMesh key={list.length} ref={ref} args={[unitBox, material, list.length]} castShadow raycast={() => null} />;
}

/** Top unit of the stack that `id` belongs to (where a new unit would go). */
export function stackTopOf(cargo: { id: string; on: string | null }[], id: string) {
  let top = id;
  for (let guard = 0; guard < 8; guard++) {
    const above = cargo.find((c) => c.on === top);
    if (!above) break;
    top = above.id;
  }
  return top;
}

/** The shift's yard units at the clock time, the same array while nothing in the yard changes. */
function useYardUnits(): Cargo[] {
  const shift = useGame((s) => s.shift);
  const version = useGame((s) => s.version);
  const last = useRef<{ key: string; units: Cargo[] }>({ key: '', units: [] });
  return useMemo(() => {
    const units = shift ? yardUnitsAt(shift, clock.t) : [];
    const key = units.map((c) => `${c.id}:${c.x}:${c.y}:${c.yaw}:${c.on ?? ''}`).join('|');
    if (key !== last.current.key) last.current = { key, units };
    return last.current.units;
    // version: the shift is mutated in place; re-read it on every engine tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, version]);
}

export function CargoLayer() {
  const cargo = useYardUnits();
  // Units with complete papers carry their label.
  const labelled = useMemo(() => new Set((cargo as GameCargo[]).filter((c) => c.papers !== 'missing').map((c) => c.id)), [cargo]);
  const assets = useMemo(makePrimAssets, []);
  const { prims, bounds } = useMemo(() => buildCargoPrims(cargo, labelled), [cargo, labelled]);
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
        <PrimMesh key={`${kind}|${list.length}`} prims={list} asset={assets[kind]} onHover={onHover} onClick={onClick} onDoubleClick={onDoubleClick} />
      ))}
      <ShadowProxies bounds={bounds} />
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
              subtitle={c.description}
              variant="light"
            />
          </group>
        );
      })}
    </group>
  );
}
