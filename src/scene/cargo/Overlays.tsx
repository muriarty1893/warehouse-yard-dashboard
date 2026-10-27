import { Html } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { devYard } from '../../config/devYard';
import { polygonBounds } from '../../domain/geometry';
import { heightAt } from '../../domain/yard';
import { useLayers, type Overlay } from '../../state/layers';
import { yardUnitsAt } from '../../game/motion';
import { areaInfo } from '../../game/select';
import { useGame } from '../../game/store';
import type { GameCargo } from '../../game/types';
import { clock } from '../../sim/clock';
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

function haloColor(overlay: Overlay, stack: GameCargo[]) {
  if (overlay === 'documents') return stack.some((c) => c.papers === 'missing') ? OVERLAY_TONES.red : OVERLAY_TONES.green;
  return destinationColor(stack[stack.length - 1].destination);
}

const floorH = (x: number, y: number) => heightAt(devYard, x, y);

function Halos({ overlay }: { overlay: Overlay }) {
  const shift = useGame((s) => s.shift);
  const version = useGame((s) => s.version);
  const cargo = useMemo(() => (shift ? yardUnitsAt(shift, clock.t) : []), [shift, version]);
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
      mesh.setColorAt(i, color.set(haloColor(overlay, stackOf(cargo, c.id) as GameCargo[])));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [floor, cargo, overlay]);
  if (!floor.length) return null;
  return <instancedMesh key={floor.length} ref={ref} args={[unitBox, material, floor.length]} renderOrder={1} />;
}

function AreaTints() {
  const shift = useGame((s) => s.shift);
  const version = useGame((s) => s.version);
  const areas = useMemo(() => (shift ? areaInfo(shift) : []), [shift, version]);
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
        const density = st?.density ?? 0;
        const tone = density > 2.5 ? OVERLAY_TONES.red : density > 1.8 ? OVERLAY_TONES.amber : OVERLAY_TONES.green;
        return (
          <group key={a.id}>
            {/* Shape is in the yard x/y plane: lay it flat (y → −z). */}
            <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, (a.elevation ?? 0) + 0.02, 0]} renderOrder={1}>
              <meshBasicMaterial color={tone} transparent opacity={0.22} depthWrite={false} toneMapped={false} />
            </mesh>
            <Html position={yardToWorld(label[0], label[1], (a.elevation ?? 0) + 2.6)} center zIndexRange={[20, 5]} style={{ pointerEvents: 'none' }}>
              <div className="tag tag-light">
                <b>{a.name}</b>
                <span>{st?.units ?? 0} units</span>
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
