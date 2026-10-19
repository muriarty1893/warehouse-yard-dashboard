import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { TruckSpec } from '../../config/fleet';
import type { Carrier } from '../../domain/types';
import type { TruckKind } from '../../domain/vehicles';
import { clock } from '../../sim/clock';
import { entityTime, isHeld } from '../../sim/control';
import { useLayers } from '../../state/layers';
import { compileRoute, evalRoute, newPose } from '../../sim/route';
import { useHighlight, useUi } from '../../state/ui';
import { containerMaterials } from '../cargo/Containers';
import { Box, Cyl, glassMat, glowMat, mat, palette, RBox, unitBox, Wheel, yardToWorld } from '../kit';
import { Brackets, Tag } from '../markers';
import { Merge } from '../Merge';
import { registerEntity } from '../registry';
import { selectAndFocus } from '../../ui/focus';
import { LIVERIES, sideTexture } from './liveries';

type Spin = (g: THREE.Group | null) => void;

function SidePanels({ carrier, length, height, x, y, halfWidth }: { carrier: Carrier; length: number; height: number; x: number; y: number; halfWidth: number }) {
  const tex = sideTexture(carrier, length / height);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }), [tex]);
  return (
    <>
      <mesh position={[x, y, halfWidth + 0.004]} material={material}>
        <planeGeometry args={[length, height]} />
      </mesh>
      <mesh position={[x, y, -halfWidth - 0.004]} rotation={[0, Math.PI, 0]} material={material}>
        <planeGeometry args={[length, height]} />
      </mesh>
    </>
  );
}

/** Rear of a box body / trailer at x = rearX: closed doors, or doors swung open against the sides. */
function RearDoors({ rearX, y0, h, open }: { rearX: number; y0: number; h: number; open: boolean }) {
  const door = mat('#e7eaf1', { roughness: 0.6 });
  const lamp = glowMat('#ff4d4d', '#ff2a2a', 0.6, 2.2);
  return (
    <group>
      {open ? (
        <>
          <Box size={[0.04, h - 0.12, 2.38]} position={[rearX - 0.03, y0 + h / 2, 0]} color="#3b4358" shadow={false} />
          <Box size={[0.05, h - 0.1, 0.08]} position={[rearX - 0.04, y0 + h / 2, 1.24]} color="#e7eaf1" />
          <Box size={[0.05, h - 0.1, 0.08]} position={[rearX - 0.04, y0 + h / 2, -1.24]} color="#e7eaf1" />
          <Box size={[1.2, h - 0.15, 0.05]} position={[rearX + 0.6, y0 + h / 2, 1.32]} material={door} />
          <Box size={[1.2, h - 0.15, 0.05]} position={[rearX + 0.6, y0 + h / 2, -1.32]} material={door} />
        </>
      ) : (
        <>
          <RBox size={[0.06, h - 0.12, 2.42]} position={[rearX - 0.02, y0 + h / 2, 0]} material={door} radius={0.02} />
          <Box size={[0.07, h - 0.2, 0.035]} position={[rearX - 0.03, y0 + h / 2, 0]} color="#b4bccd" shadow={false} />
          {[-0.6, 0.6].map((z) => (
            <Box key={z} size={[0.07, h - 0.3, 0.03]} position={[rearX - 0.04, y0 + h / 2, z]} color="#c3cad8" shadow={false} />
          ))}
        </>
      )}
      <Box size={[0.05, 0.16, 0.3]} position={[rearX - 0.03, y0 - 0.12, 1.0]} material={lamp} shadow={false} />
      <Box size={[0.05, 0.16, 0.3]} position={[rearX - 0.03, y0 - 0.12, -1.0]} material={lamp} shadow={false} />
    </group>
  );
}

/** Cab-over cab whose front face is at x = front. */
function Cab({ front, carrier, tall = 2.55 }: { front: number; carrier: Carrier; tall?: number }) {
  const lv = LIVERIES[carrier];
  const cabMat = mat(lv.cab, { roughness: 0.4 });
  const cx = front - 1.25;
  const light = glowMat('#fff6d6', '#fff1c2', 0.5, 4);
  return (
    <group>
      <RBox size={[2.5, tall, 2.45]} position={[cx, 1.0 + tall / 2, 0]} material={cabMat} radius={0.22} />
      <RBox size={[1.7, 0.55, 2.3]} position={[cx - 0.25, 1.0 + tall + 0.22, 0]} material={cabMat} radius={0.2} />
      <RBox size={[0.08, 1.05, 2.12]} position={[front - 0.01, 1.0 + tall - 0.85, 0]} material={glassMat()} radius={0.03} shadow={false} />
      <RBox size={[0.95, 0.8, 2.47]} position={[front - 0.7, 1.0 + tall - 0.82, 0]} material={glassMat()} radius={0.05} shadow={false} />
      {lv.cab !== lv.accent && <RBox size={[2.52, 0.2, 2.47]} position={[cx, 1.6, 0]} color={lv.accent} radius={0.04} shadow={false} />}
      <RBox size={[0.1, 0.5, 1.6]} position={[front, 1.65, 0]} color="#2b3140" radius={0.03} />
      <RBox size={[0.32, 0.38, 2.45]} position={[front - 0.08, 0.86, 0]} color="#3a4256" radius={0.06} />
      <Box size={[0.06, 0.18, 0.42]} position={[front + 0.02, 1.3, 0.86]} material={light} shadow={false} />
      <Box size={[0.06, 0.18, 0.42]} position={[front + 0.02, 1.3, -0.86]} material={light} shadow={false} />
      <Box size={[0.12, 0.5, 0.08]} position={[front - 0.2, 2.7, 1.36]} color="#2b3140" />
      <Box size={[0.12, 0.5, 0.08]} position={[front - 0.2, 2.7, -1.36]} color="#2b3140" />
    </group>
  );
}

function RigidTruck({ carrier, doorsOpen, spin }: { carrier: Carrier; doorsOpen: boolean; spin?: Spin }) {
  return (
    <group>
      <Box size={[8.6, 0.32, 1.0]} position={[1.9, 0.72, 0]} color={palette.dark} />
      <RBox size={[7.7, 2.85, 2.55]} position={[0.45, 2.48, 0]} color={palette.white} radius={0.1} />
      <SidePanels carrier={carrier} length={7.3} height={2.5} x={0.45} y={2.5} halfWidth={1.275} />
      <RearDoors rearX={-3.4} y0={1.05} h={2.85} open={doorsOpen} />
      <Cab front={7.05} carrier={carrier} />
      <Cyl r={0.3} h={1.0} position={[3.4, 0.72, 1.0]} rotation={[0, 0, Math.PI / 2]} color="#c3cad8" />
      <Box size={[3.4, 0.08, 0.05]} position={[1.0, 0.72, 1.22]} color="#b4bccd" />
      <Box size={[3.4, 0.08, 0.05]} position={[1.0, 0.72, -1.22]} color="#b4bccd" />
      {[0, -1.3].map((x) => [1, -1].map((s) => <Wheel key={`${x}${s}`} r={0.5} w={0.55} position={[x, 0.5, s * 0.98]} spin={spin} />))}
      {[1, -1].map((s) => <Wheel key={s} r={0.5} w={0.36} position={[5.3, 0.5, s * 1.05]} spin={spin} />)}
    </group>
  );
}

function Tractor({ carrier, spin }: { carrier: Carrier; spin?: Spin }) {
  return (
    <group>
      <Box size={[6.4, 0.32, 1.0]} position={[1.5, 0.72, 0]} color={palette.dark} />
      <Box size={[1.2, 0.12, 1.4]} position={[0, 1.0, 0]} color="#3a4256" />
      <Cab front={5.1} carrier={carrier} tall={2.75} />
      <Cyl r={0.3} h={1.1} position={[1.6, 0.75, 1.0]} rotation={[0, 0, Math.PI / 2]} color="#c3cad8" />
      <Cyl r={0.3} h={1.1} position={[1.6, 0.75, -1.0]} rotation={[0, 0, Math.PI / 2]} color="#c3cad8" />
      <Cyl r={0.08} h={1.8} position={[2.45, 3.2, 1.05]} color="#c3cad8" />
      {[0, -1.3].map((x) => [1, -1].map((s) => <Wheel key={`${x}${s}`} r={0.5} w={0.55} position={[x, 0.5, s * 0.98]} spin={spin} />))}
      {[1, -1].map((s) => <Wheel key={s} r={0.5} w={0.36} position={[3.6, 0.5, s * 1.05]} spin={spin} />)}
    </group>
  );
}

function TrailerAxles({ spin }: { spin?: Spin }) {
  return (
    <>
      {[-9.0, -10.3, -11.6].map((x) => [1, -1].map((s) => <Wheel key={`${x}${s}`} r={0.5} w={0.5} position={[x, 0.5, s * 0.98]} spin={spin} />))}
    </>
  );
}

function Trailer({ carrier, doorsOpen, standalone, spin }: { carrier: Carrier; doorsOpen: boolean; standalone: boolean; spin?: Spin }) {
  return (
    <group>
      <Box size={[12.5, 0.25, 1.0]} position={[-6.3, 1.15, 0]} color={palette.dark} />
      <RBox size={[13.6, 2.75, 2.55]} position={[-5.9, 2.68, 0]} color={palette.white} radius={0.1} />
      <SidePanels carrier={carrier} length={12.9} height={2.4} x={-5.9} y={2.7} halfWidth={1.275} />
      <RearDoors rearX={-12.7} y0={1.3} h={2.75} open={doorsOpen} />
      <Box size={[6, 0.1, 0.05]} position={[-5, 0.95, 1.22]} color="#b4bccd" />
      <Box size={[6, 0.1, 0.05]} position={[-5, 0.95, -1.22]} color="#b4bccd" />
      {standalone && (
        <>
          <Box size={[0.12, 1.2, 0.12]} position={[-1.6, 0.6, 0.8]} color="#5b6b8c" />
          <Box size={[0.12, 1.2, 0.12]} position={[-1.6, 0.6, -0.8]} color="#5b6b8c" />
          <Box size={[0.4, 0.06, 0.4]} position={[-1.6, 0.03, 0.8]} color="#5b6b8c" />
          <Box size={[0.4, 0.06, 0.4]} position={[-1.6, 0.03, -0.8]} color="#5b6b8c" />
        </>
      )}
      <TrailerAxles spin={spin} />
    </group>
  );
}

function ContainerChassis({ color, spin }: { color: string; spin?: Spin }) {
  const materials = useMemo(() => containerMaterials('MARLIN', color, true), [color]);
  return (
    <group>
      <Box size={[12.4, 0.3, 1.0]} position={[-6.0, 1.15, 0]} color={palette.dark} />
      <Box size={[0.3, 0.2, 2.4]} position={[-0.4, 1.25, 0]} color={palette.dark} />
      <Box size={[0.3, 0.2, 2.4]} position={[-12.0, 1.25, 0]} color={palette.dark} />
      <mesh geometry={unitBox} material={materials} position={[-6.15, 2.65, 0]} scale={[12.19, 2.59, 2.44]} castShadow receiveShadow />
      <TrailerAxles spin={spin} />
    </group>
  );
}

const TRUCK_BOUNDS: Record<TruckKind, { x: number; l: number; top: number }> = {
  rigid: { x: 1.8, l: 10.7, top: 4.1 },
  semi: { x: -3.8, l: 17.9, top: 4.25 },
  trailer: { x: -5.9, l: 13.7, top: 4.1 },
  container: { x: -3.8, l: 17.9, top: 4.25 },
};

/** A truck in the yard: static in a bay, or following a scripted route. */
export function Truck({ spec, interactive = true }: { spec: TruckSpec; interactive?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const front = useRef<THREE.Group>(null);
  const rear = useRef<THREE.Group>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const wheels = useRef<THREE.Group[]>([]);
  const route = useMemo(() => (spec.route ? compileRoute(spec.route) : null), [spec.route]);
  const pose = useMemo(newPose, []);
  const [doorsOpen, setDoorsOpen] = useState(spec.doorsOpen ?? false);
  const doorsState = useRef(doorsOpen);
  // Off-site trucks are hidden; their (DOM) tag has to go too.
  const [onMap, setOnMap] = useState(true);
  const onMapState = useRef(true);

  const spin: Spin | undefined = route
    ? (g) => {
        if (g && !wheels.current.includes(g)) wheels.current.push(g);
      }
    : undefined;

  const highlight = useHighlight('truck', spec.id);
  const tags = useLayers((s) => s.tags) && interactive;
  const hover = useUi((s) => s.hover);
  const unhover = useUi((s) => s.unhover);
  const select = useUi((s) => s.select);
  const ref = useMemo(() => ({ kind: 'truck' as const, id: spec.id }), [spec.id]);

  useEffect(() => {
    if (!interactive) return;
    registerEntity(ref, root.current);
    return () => registerEntity(ref, null);
  }, [ref, interactive]);

  useFrame(() => {
    if (!route || !root.current || !front.current) return;
    evalRoute(route, entityTime(spec.id, clock.t), pose);
    root.current.visible = pose.visible;
    if (pose.visible !== onMapState.current) {
      onMapState.current = pose.visible;
      setOnMap(pose.visible);
    }
    if (!pose.visible) return;
    root.current.position.set(...yardToWorld(pose.x, pose.y));
    front.current.rotation.y = pose.heading;
    if (rear.current) rear.current.rotation.y = pose.trailerHeading;
    for (const w of wheels.current) w.rotation.z = -pose.odometer / (w.userData.radius as number);
    const status = isHeld(spec.id) ? `On hold · ${pose.status}` : pose.status;
      if (statusRef.current && statusRef.current.textContent !== status) statusRef.current.textContent = status;
    if (pose.doors !== doorsState.current) {
      doorsState.current = pose.doors;
      setDoorsOpen(pose.doors);
    }
  });

  const kind = spec.kind;
  const p = spec.pose ?? { x: 0, y: 0, heading: 0 };
  const hasTractor = kind === 'semi' || kind === 'container';
  const b = TRUCK_BOUNDS[kind];

  return (
    <group
      ref={root}
      position={yardToWorld(p.x, p.y)}
      onPointerOver={
        interactive
          ? (e) => {
              e.stopPropagation();
              hover(ref);
            }
          : undefined
      }
      onPointerOut={interactive ? () => unhover(ref) : undefined}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              select(ref);
            }
          : undefined
      }
      onDoubleClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              selectAndFocus(ref);
            }
          : undefined
      }
    >
      <group ref={front} rotation={[0, p.heading, 0]}>
        <Merge deps={[doorsOpen]}>
          {kind === 'rigid' && <RigidTruck carrier={spec.carrier} doorsOpen={doorsOpen} spin={spin} />}
          {hasTractor && <Tractor carrier={spec.carrier} spin={spin} />}
        </Merge>
        {(highlight || tags) && onMap && (
          <group position={[b.x, 0, 0]}>
            {highlight && <Brackets size={[b.l + 0.4, b.top, 2.9]} strong={highlight === 'selected'} />}
            <Tag y={b.top + 1.2} title={spec.id} subtitle={spec.status || LIVERIES[spec.carrier].name} statusRef={statusRef} />
          </group>
        )}
      </group>
      {(hasTractor || kind === 'trailer') && (
        <group ref={rear} rotation={[0, p.heading, 0]}>
          <Merge deps={[doorsOpen]}>
            {kind === 'container' ? (
              <ContainerChassis color={spec.containerColor ?? '#17a99a'} spin={spin} />
            ) : (
              <Trailer carrier={spec.carrier} doorsOpen={doorsOpen} standalone={kind === 'trailer'} spin={spin} />
            )}
          </Merge>
        </group>
      )}
    </group>
  );
}
