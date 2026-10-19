import { Billboard, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { mat, palette } from './kit';

/** Blue location pin hovering above a tracked item. */
export function Pin({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = Math.sin(clock.elapsedTime * 2 + phase) * 0.15;
  });
  const blue = mat(palette.blue, { roughness: 0.35 });
  return (
    <group position={position}>
      <group ref={ref}>
        <mesh position={[0, 0.55, 0]} material={blue} castShadow>
          <sphereGeometry args={[0.5, 24, 18]} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[Math.PI, 0, 0]} material={blue} castShadow>
          <coneGeometry args={[0.43, 0.85, 24]} />
        </mesh>
        <Billboard position={[0, 0.58, 0]}>
          <mesh position={[0, 0, 0.5]} material={mat('#ffffff', { roughness: 0.4 })}>
            <circleGeometry args={[0.2, 24]} />
          </mesh>
        </Billboard>
      </group>
    </group>
  );
}

/**
 * Corner brackets + translucent footprint around a selected/hovered entity.
 * `size` = [length, height, width]; the group origin is the footprint center at ground.
 */
export function Brackets({ size, strong }: { size: [number, number, number]; strong: boolean }) {
  const [l, h, w] = size;
  const geo = useMemo(() => {
    const pts: number[] = [];
    const k = Math.min(0.9, Math.min(l, w) * 0.3);
    const kh = Math.min(0.9, h * 0.3);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (const y of [0, h]) {
          const x = (sx * l) / 2;
          const z = (sz * w) / 2;
          const dy = y === 0 ? kh : -kh;
          pts.push(x, y, z, x - sx * k, y, z);
          pts.push(x, y, z, x, y, z - sz * k);
          pts.push(x, y, z, x, y + dy, z);
        }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [l, h, w]);
  return (
    <group>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color={palette.blue} transparent opacity={strong ? 1 : 0.7} />
      </lineSegments>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[l, w]} />
        <meshBasicMaterial color={palette.blue} transparent opacity={strong ? 0.16 : 0.09} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Floating label pill. `statusRef` lets moving entities update the subtitle without re-rendering. */
export function Tag({
  y,
  title,
  subtitle,
  variant = 'blue',
  statusRef,
}: {
  y: number;
  title: string;
  subtitle?: string;
  variant?: 'blue' | 'light';
  statusRef?: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <Html position={[0, y, 0]} center zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
      <div className={`tag tag-${variant}`}>
        <b>{title}</b>
        <span ref={statusRef}>{subtitle}</span>
      </div>
    </Html>
  );
}
