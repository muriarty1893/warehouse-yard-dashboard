import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { groundAt, type ForkliftSpec } from '../../config/fleet';
import { FORKLIFT } from '../../domain/vehicles';
import { clock } from '../../sim/clock';
import { compileRoute, evalRoute, newPose } from '../../sim/route';
import { useHighlight, useUi } from '../../state/ui';
import { Box, Cyl, mat, palette, RBox, unitSphere, Wheel, yardToWorld } from '../kit';
import { Brackets, Tag } from '../markers';
import { registerEntity } from '../registry';
import { selectAndFocus } from '../../ui/focus';
import { Merge } from '../Merge';

type Load = NonNullable<ForkliftSpec['load']>;

/** Pallet + goods carried on the forks (local frame of the carriage). */
function ForkLoad({ load }: { load: Load }) {
  const x = FORKLIFT.carryOffset - 0.85;
  return (
    <group position={[x, 0.06, 0]}>
      <Box size={[1.2, 0.14, 0.8]} position={[0, 0.07, 0]} color={palette.wood} />
      {load === 'bag' ? (
        <RBox size={[1.05, 1.1, 0.95]} position={[0, 0.14 + 0.55, 0]} color="#f3f3ee" radius={0.16} />
      ) : (
        [0, 1].flatMap((l) =>
          [-0.3, 0.3].flatMap((dx) =>
            [-0.2, 0.2].map((dz) => (
              <RBox
                key={`${l}${dx}${dz}`}
                size={[0.57, 0.4, 0.38]}
                position={[dx, 0.14 + 0.2 + l * 0.41, dz]}
                color={load === 'wrap-blue' ? '#3a70ff' : palette.cardboard}
                radius={load === 'wrap-blue' ? 0.06 : 0.03}
              />
            )),
          ),
        )
      )}
    </group>
  );
}

function ForkliftModel({ carriage, beacon, loadRef, load, spin }: {
  carriage: RefObject<THREE.Group | null>;
  beacon: RefObject<THREE.MeshStandardMaterial | null>;
  loadRef: RefObject<THREE.Group | null>;
  load: Load;
  spin?: (g: THREE.Group | null) => void;
}) {
  const yellow = mat(palette.forklift, { roughness: 0.45 });
  const black = mat('#2a2f3a', { roughness: 0.6 });
  return (
    <group>
      <RBox size={[2.1, 0.32, 1.12]} position={[-0.25, 0.34, 0]} color={palette.blue} radius={0.08} />
      <RBox size={[1.5, 0.55, 1.1]} position={[-0.35, 0.78, 0]} material={yellow} radius={0.12} />
      <RBox size={[0.6, 0.85, 1.14]} position={[-1.08, 0.9, 0]} material={yellow} radius={0.18} />
      <RBox size={[0.45, 0.16, 0.5]} position={[-0.45, 1.12, 0]} material={black} radius={0.05} />
      <RBox size={[0.12, 0.55, 0.5]} position={[-0.68, 1.42, 0]} material={black} radius={0.04} />
      {/* Driver */}
      <RBox size={[0.3, 0.5, 0.42]} position={[-0.42, 1.48, 0]} color={palette.orange} radius={0.1} />
      <mesh geometry={unitSphere} material={mat('#f0c8a0')} position={[-0.38, 1.88, 0]} scale={0.13} castShadow />
      <mesh geometry={unitSphere} material={mat('#ffffff', { roughness: 0.4 })} position={[-0.38, 1.95, 0]} scale={[0.15, 0.1, 0.15]} castShadow />
      <Cyl r={0.03} h={0.5} position={[0.1, 1.25, 0]} rotation={[0, 0, -0.5]} material={black} />
      {/* Overhead guard */}
      {[0.28, -0.95].map((x) =>
        [0.48, -0.48].map((z) => <Cyl key={`${x}${z}`} r={0.035} h={1.25} position={[x, 1.63, z]} material={black} />),
      )}
      <RBox size={[1.35, 0.07, 1.04]} position={[-0.34, 2.27, 0]} material={black} radius={0.03} />
      <mesh position={[-0.75, 2.36, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.12, 12]} />
        <meshStandardMaterial ref={beacon} color="#ff9a3c" emissive="#ff7a00" emissiveIntensity={1} />
      </mesh>
      {/* Mast */}
      <Box size={[0.1, 2.4, 0.1]} position={[0.82, 1.3, 0.36]} material={black} />
      <Box size={[0.1, 2.4, 0.1]} position={[0.82, 1.3, -0.36]} material={black} />
      <Box size={[0.1, 0.1, 0.82]} position={[0.82, 2.45, 0]} material={black} />
      <group ref={carriage} userData={{ noMerge: true }}>
        <Box size={[0.06, 0.9, 0.95]} position={[0.9, 0.5, 0]} material={mat('#3a4256')} />
        <Box size={[1.15, 0.05, 0.12]} position={[1.47, 0.03, 0.26]} color="#9aa3b8" />
        <Box size={[1.15, 0.05, 0.12]} position={[1.47, 0.03, -0.26]} color="#9aa3b8" />
        <group ref={loadRef}>
          <ForkLoad load={load} />
        </group>
      </group>
      <Wheel r={0.33} w={0.26} position={[0.45, 0.33, 0.48]} spin={spin} />
      <Wheel r={0.33} w={0.26} position={[0.45, 0.33, -0.48]} spin={spin} />
      <Wheel r={0.27} w={0.22} position={[-0.95, 0.27, 0.47]} spin={spin} />
      <Wheel r={0.27} w={0.22} position={[-0.95, 0.27, -0.47]} spin={spin} />
    </group>
  );
}

export function Forklift({ spec }: { spec: ForkliftSpec }) {
  const root = useRef<THREE.Group>(null);
  const carriage = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.MeshStandardMaterial>(null);
  const loadRef = useRef<THREE.Group>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const wheels = useRef<THREE.Group[]>([]);
  const route = useMemo(() => (spec.route ? compileRoute(spec.route) : null), [spec.route]);
  const pose = useMemo(newPose, []);
  const highlight = useHighlight('forklift', spec.id);
  const hover = useUi((s) => s.hover);
  const unhover = useUi((s) => s.unhover);
  const select = useUi((s) => s.select);
  const ref = useMemo(() => ({ kind: 'forklift' as const, id: spec.id }), [spec.id]);

  useEffect(() => {
    registerEntity(ref, root.current);
    return () => registerEntity(ref, null);
  }, [ref]);

  useFrame(() => {
    if (!root.current || !carriage.current || !loadRef.current) return;
    if (route) {
      evalRoute(route, clock.t, pose);
      root.current.position.set(...yardToWorld(pose.x, pose.y, groundAt(pose.x, pose.y)));
      root.current.rotation.y = pose.heading;
      // Pitch with the floor (ramp): compare floor height ahead and behind.
      const c = Math.cos(pose.heading);
      const sn = Math.sin(pose.heading);
      const ahead = groundAt(pose.x + c * 0.8, pose.y + sn * 0.8);
      const behind = groundAt(pose.x - c * 0.8, pose.y - sn * 0.8);
      root.current.rotation.z = Math.atan2(ahead - behind, 1.6);
      for (const w of wheels.current) w.rotation.z = -pose.odometer / (w.userData.radius as number);
      if (statusRef.current && statusRef.current.textContent !== pose.status) statusRef.current.textContent = pose.status;
    }
    carriage.current.position.y = route ? pose.fork : 0.12;
    loadRef.current.visible = route ? pose.carry : false;
    if (beacon.current) beacon.current.emissiveIntensity = route ? 0.4 + 0.8 * Math.max(0, Math.sin(clock.t * 7)) : 0.15;
  });

  const p = spec.pose ?? { x: 0, y: 0, heading: 0 };
  return (
    <group
      ref={root}
      position={yardToWorld(p.x, p.y, groundAt(p.x, p.y))}
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
      <Merge>
        <ForkliftModel
        carriage={carriage}
        beacon={beacon}
        loadRef={loadRef}
        load={spec.load ?? 'cartons'}
        spin={
          route
            ? (g) => {
                if (g && !wheels.current.includes(g)) wheels.current.push(g);
              }
            : undefined
        }
        />
      </Merge>
      {highlight && (
        <group position={[0.2, 0, 0]}>
          <Brackets size={[3.6, 2.5, 1.5]} strong={highlight === 'selected'} />
          <Tag y={3.4} title={spec.id} subtitle={spec.status || spec.model} statusRef={statusRef} />
        </group>
      )}
    </group>
  );
}
