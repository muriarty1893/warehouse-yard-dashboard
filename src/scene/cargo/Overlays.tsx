import { Html } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { devYard } from '../../config/devYard';
import { polygonBounds } from '../../domain/geometry';
import type { Cargo, SourceDocument } from '../../domain/types';
import { heightAt } from '../../domain/yard';
import { useLayers, type Overlay } from '../../state/layers';
import { useInventory } from '../../world/inventory';
import { useWorld } from '../../world/store';
import { stackOf } from '../../world/placement';
import { unitBox, yardToWorld } from '../kit';

/**
 * Map overlays over the cargo: storage areas tinted with how much floor is
 * taken, or a coloured halo under every stack for its paperwork state or
 * destination.
 */

export const OVERLAY_TONES = {
  green: '#22b35e',
  amber: '#f0a020',
  red: '#e05252',
} as const;

const DEST_PALETTE = ['#2f5ff0', '#16a39b', '#f07d2a', '#7a5af0', '#e05297', '#2bb3e0', '#c9a227', '#5b6b8c', '#22b35e', '#d64545', '#8d5b3a', '#1d2b5a'];
const CITIES = ['Ankara', 'İzmir', 'Bursa', 'Konya', 'Adana', 'Antalya', 'Kayseri', 'Samsun', 'Eskişehir', 'Gaziantep', 'Mersin', 'Trabzon'];
export function destinationColor(city: string) {
  let i = CITIES.indexOf(city);
  if (i < 0) {
    CITIES.push(city);
    i = CITIES.length - 1;
  }
  return DEST_PALETTE[i % DEST_PALETTE.length];
}

/** 0 = confirmed document, 1 = drafts only, 2 = no document. */
export function paperworkState(documents: SourceDocument[], cargoId: string) {
  const docs = documents.filter((d) => d.cargoId === cargoId);
  return !docs.length ? 2 : docs.some((d) => d.status === 'confirmed') ? 0 : 1;
}

function haloColor(overlay: Overlay, stack: Cargo[], documents: SourceDocument[]) {
  if (overlay === 'documents') return [OVERLAY_TONES.green, OVERLAY_TONES.amber, OVERLAY_TONES.red][Math.max(...stack.map((c) => paperworkState(documents, c.id)))];
  return destinationColor(stack[stack.length - 1].destination);
}

const floorH = (x: number, y: number) => heightAt(devYard, x, y);

function Halos({ overlay }: { overlay: Overlay }) {
  const cargo = useInventory((s) => s.cargo);
  const documents = useInventory((s) => s.documents);
  const ref = useRef<THREE.InstancedMesh>(null);
  const floor = useMemo(() => cargo.filter((c) => !c.on), [cargo]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    floor.forEach((c, i) => {
      q.setFromAxisAngle(up, c.yaw);
      m.compose(new THREE.Vector3(...yardToWorld(c.x, c.y, floorH(c.x, c.y) + 0.025)), q, new THREE.Vector3(c.dims.l + 0.34, 0.01, c.dims.w + 0.34));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.set(haloColor(overlay, stackOf(cargo, c.id), documents)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [floor, cargo, documents, overlay]);
  if (!floor.length) return null;
  return <instancedMesh key={floor.length} ref={ref} args={[unitBox, material, floor.length]} renderOrder={1} />;
}

function AreaTints() {
  const areas = useWorld((s) => s.areas);
  const shapes = useMemo(
    () =>
      devYard.storage.map((a) => {
        const geometry = new THREE.ShapeGeometry(a.parts.map((part) => new THREE.Shape(part.map(([x, y]) => new THREE.Vector2(x, y)))));
        const b = polygonBounds(a.parts);
        return { a, geometry, label: [b.x + b.w / 2, b.y + b.h / 2] as const };
      }),
    [],
  );
  return (
    <group>
      {shapes.map(({ a, geometry, label }) => {
        const st = areas.find((x) => x.id === a.id);
        const pct = st ? Math.round((Math.min(st.used, st.capacity) / st.capacity) * 100) : 0;
        const tone = pct > 85 ? OVERLAY_TONES.red : pct > 65 ? OVERLAY_TONES.amber : OVERLAY_TONES.green;
        return (
          <group key={a.id}>
            {/* Shape is in the yard x/y plane: lay it flat (y → −z). */}
            <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, (a.elevation ?? 0) + 0.02, 0]} renderOrder={1}>
              <meshBasicMaterial color={tone} transparent opacity={0.22} depthWrite={false} toneMapped={false} />
            </mesh>
            <Html position={yardToWorld(label[0], label[1], (a.elevation ?? 0) + 2.6)} center zIndexRange={[20, 5]} style={{ pointerEvents: 'none' }}>
              <div className="tag tag-light">
                <b>{a.name}</b>
                <span>
                  {pct}% full · {st?.units ?? 0} units
                </span>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

export function Overlays() {
  const overlay = useLayers((s) => s.overlay);
  if (overlay === 'none') return null;
  return overlay === 'areas' ? <AreaTints /> : <Halos overlay={overlay} />;
}
