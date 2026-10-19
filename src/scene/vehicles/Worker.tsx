import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { WorkerSpec } from '../../config/fleet';
import { clock } from '../../sim/clock';
import { compileRoute, evalRoute, newPose } from '../../sim/route';
import { useHighlight, useUi } from '../../state/ui';
import { Box, mat, palette, RBox, unitSphere, yardToWorld } from '../kit';
import { Brackets, Tag } from '../markers';
import { registerEntity } from '../registry';
import { selectAndFocus } from '../../ui/focus';

const capsule = new THREE.CapsuleGeometry(1, 1, 4, 10);

function Limb({ limbRef, position, r, len, color }: { limbRef: RefObject<THREE.Group | null>; position: [number, number, number]; r: number; len: number; color: string }) {
  // Pivot at the top so the limb swings from the hip/shoulder.
  return (
    <group ref={limbRef} position={position}>
      <mesh geometry={capsule} material={mat(color)} position={[0, -len / 2, 0]} scale={[r, len / 3, r]} castShadow />
    </group>
  );
}

export function Worker({ spec }: { spec: WorkerSpec }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const route = useMemo(() => (spec.route ? compileRoute(spec.route) : null), [spec.route]);
  const pose = useMemo(newPose, []);
  const highlight = useHighlight('worker', spec.id);
  const hover = useUi((s) => s.hover);
  const unhover = useUi((s) => s.unhover);
  const select = useUi((s) => s.select);
  const ref = useMemo(() => ({ kind: 'worker' as const, id: spec.id }), [spec.id]);

  useEffect(() => {
    registerEntity(ref, root.current);
    return () => registerEntity(ref, null);
  }, [ref]);

  useFrame(() => {
    if (!route || !root.current) return;
    evalRoute(route, clock.t, pose);
    root.current.position.set(...yardToWorld(pose.x, pose.y));
    root.current.rotation.y = pose.heading;
    const phase = pose.odometer * 3.2;
    const swing = pose.moving ? Math.sin(phase) * 0.55 : 0;
    if (legL.current) legL.current.rotation.z = swing;
    if (legR.current) legR.current.rotation.z = -swing;
    if (armL.current) armL.current.rotation.z = -swing * 0.8;
    if (armR.current) armR.current.rotation.z = swing * 0.8;
    if (body.current) body.current.position.y = pose.moving ? Math.abs(Math.cos(phase)) * 0.04 : 0;
  });

  const p = spec.pose ?? { x: 0, y: 0, heading: 0 };
  const pants = '#2b3a5c';
  return (
    <group
      ref={root}
      position={yardToWorld(p.x, p.y)}
      rotation={[0, p.heading, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover(ref);
      }}
      onPointerOut={() => unhover(ref)}
      onClick={(e) => {
        e.stopPropagation();
        select(ref);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        selectAndFocus(ref);
      }}
    >
      <group ref={body}>
        <Limb limbRef={legL} position={[0, 0.85, 0.1]} r={0.085} len={0.85} color={pants} />
        <Limb limbRef={legR} position={[0, 0.85, -0.1]} r={0.085} len={0.85} color={pants} />
        <RBox size={[0.28, 0.62, 0.44]} position={[0, 1.17, 0]} color={spec.vest} radius={0.1} />
        <Box size={[0.29, 0.05, 0.45]} position={[0, 1.1, 0]} color="#f4f6fa" shadow={false} />
        <Limb limbRef={armL} position={[0, 1.42, 0.27]} r={0.06} len={0.62} color={spec.vest} />
        <Limb limbRef={armR} position={[0, 1.42, -0.27]} r={0.06} len={0.62} color={spec.vest} />
        <mesh geometry={unitSphere} material={mat('#f0c8a0')} position={[0, 1.62, 0]} scale={0.12} castShadow />
        <mesh geometry={unitSphere} material={mat('#ffffff', { roughness: 0.4 })} position={[0, 1.69, 0]} scale={[0.14, 0.09, 0.14]} castShadow />
      </group>
      {highlight && (
        <>
          <Brackets size={[0.8, 1.85, 0.8]} strong={highlight === 'selected'} />
          <Tag y={2.6} title={spec.id} subtitle={`${spec.name} · ${spec.role}`} variant="light" />
        </>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.32, 20]} />
        <meshBasicMaterial color={palette.navy} transparent opacity={0.08} depthWrite={false} />
      </mesh>
    </group>
  );
}
