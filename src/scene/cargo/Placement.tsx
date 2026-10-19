import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { create } from 'zustand';
import { devYard } from '../../config/devYard';
import type { Spot } from '../../domain/types';
import { gridRef, yardBounds } from '../../domain/yard';
import { useUi } from '../../state/ui';
import { placeAt, placeCheck, placingUnit } from '../../ui/actions';
import { useInventory } from '../../world/inventory';
import { yardToWorld } from '../kit';
import { Tag } from '../markers';
import { stackTopOf } from './CargoLayer';

/**
 * Map placement: while moving a unit or putting down a new one, the floor
 * becomes pickable and a ghost of the unit follows the cursor — blue where it
 * fits, amber outside the storage areas, red where it cannot go (with why).
 * Click a unit instead to stack on it; R turns the ghost.
 */

const usePointer = create<{ x: number; y: number } | null>(() => null);
const SNAP = 0.1;
const yb = yardBounds(devYard);

const TONES = { ok: '#2f5ff0', warn: '#f0a020', bad: '#e05252' } as const;

function PickPlanes() {
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const x = Math.round(e.point.x / SNAP) * SNAP;
    const y = Math.round(-e.point.z / SNAP) * SNAP;
    const cur = usePointer.getState();
    if (!cur || cur.x !== x || cur.y !== y) usePointer.setState({ x, y }, true);
    if (useUi.getState().hovered) useUi.getState().hover(null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = usePointer.getState();
    if (p) placeAt({ x: p.x, y: p.y, yaw: useUi.getState().placeYaw });
  };
  const platforms = devYard.buildings.filter((b) => b.kind === 'canopy');
  return (
    <group>
      <mesh position={[yb.cx, 0.01, -yb.cy]} rotation={[-Math.PI / 2, 0, 0]} onPointerMove={onMove} onClick={onClick} onPointerOut={() => usePointer.setState(null, true)}>
        <planeGeometry args={[yb.w + 4, yb.h + 4]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {platforms.map((b) => (
        <mesh key={b.id} position={yardToWorld(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2, (b.elevation ?? 0) + 0.01)} rotation={[-Math.PI / 2, 0, 0]} onPointerMove={onMove} onClick={onClick}>
          <planeGeometry args={[b.rect.w, b.rect.h]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
    </group>
  );
}

function Ghost() {
  const pointer = usePointer();
  const yaw = useUi((s) => s.placeYaw);
  const hoveredCargo = useUi((s) => (s.hovered?.kind === 'cargo' ? s.hovered.id : null));
  const cargo = useInventory((s) => s.cargo);
  useUi((s) => s.placing);
  const unit = placingUnit();
  if (!unit) return null;
  const spot: Spot | null = hoveredCargo ? { on: stackTopOf(cargo, hoveredCargo) } : pointer ? { x: pointer.x, y: pointer.y, yaw } : null;
  if (!spot) return null;
  const check = placeCheck(spot);
  if (!check) return null;
  const tone = !check.ok ? TONES.bad : check.warn ? TONES.warn : TONES.ok;
  const { l, w, h } = unit.dims;
  const where = `${check.areaId ? (devYard.storage.find((a) => a.id === check.areaId)?.name ?? '') : 'Yard floor'} · ${gridRef(devYard, check.x, check.y)}`;
  const subtitle = !check.ok ? check.reason : check.on ? `Stack on ${check.on}` : check.warn ? `${check.warn} · ${where}` : where;
  return (
    <group position={yardToWorld(check.x, check.y, check.z)} rotation={[0, check.yaw, 0]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[l, h, w]} />
        <meshBasicMaterial color={tone} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[l + 0.3, w + 0.3]} />
        <meshBasicMaterial color={tone} transparent opacity={0.35} depthWrite={false} toneMapped={false} />
      </mesh>
      <group rotation={[0, -check.yaw, 0]}>
        <Tag y={h + 1} title={check.ok ? 'Click to place' : 'Cannot place here'} subtitle={subtitle} variant={check.ok ? 'blue' : 'light'} />
      </group>
    </group>
  );
}

function Pulse() {
  const pulse = useUi((s) => s.pulse);
  const ref = useRef<THREE.Mesh>(null);
  const start = useRef(0);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: TONES.ok, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), []);
  useLayoutEffect(() => {
    start.current = performance.now();
  }, [pulse?.id]);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const u = (performance.now() - start.current) / 1200;
    m.visible = !!pulse && u < 1;
    m.scale.setScalar(0.6 + u * 1.8);
    material.opacity = 0.7 * (1 - u);
  });
  if (!pulse) return null;
  return (
    <mesh ref={ref} position={yardToWorld(pulse.x, pulse.y, pulse.h + 0.06)} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <ringGeometry args={[0.9, 1.15, 40]} />
    </mesh>
  );
}

export function Placement() {
  const placing = useUi((s) => !!s.placing);
  return (
    <group>
      {placing && <PickPlanes />}
      {placing && <Ghost />}
      <Pulse />
    </group>
  );
}
