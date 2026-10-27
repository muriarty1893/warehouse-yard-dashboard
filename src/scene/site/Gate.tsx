import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { devYard } from '../../config/devYard';
import { clock } from '../../sim/clock';
import { motionOf } from '../../game/motion';
import { useGame } from '../../game/store';
import { newPose } from '../../sim/route';
import { useLayers } from '../../state/layers';
import { Box, canvasTexture, corrugatedTexture, Cyl, FONT, glowMat, mat, palette, yardToWorld } from '../kit';
import { Merge } from '../Merge';

/**
 * The main entrance: a huge two-leaf telescopic sliding door that runs along
 * the inside of the south wall. It opens a few seconds before a truck gets
 * there and closes once the entrance is clear.
 */

const pose = newPose();
const gate = devYard.gates.find((g) => g.parkedPanel)!;
const X0 = Math.min(gate.a[0], gate.b[0]);
const X1 = Math.max(gate.a[0], gate.b[0]);
const LEAF = (X1 - X0) / 2 + 0.25;
const [PARK0, PARK1] = gate.parkedPanel!;

/** Does any truck reach the entrance within the next few seconds? */
function truckNear() {
  for (const tr of useGame.getState().shift?.trucks ?? []) {
    if (!tr.motion) continue;
    for (let ahead = 0; ahead <= 9; ahead += 1.5) {
      motionOf(tr, clock.t + ahead, pose);
      if (pose.visible && pose.x > X0 - 4 && pose.x < X1 + 4 && pose.y > -9 && pose.y < 9) return true;
    }
  }
  return false;
}

function leafMaterial() {
  const tex = corrugatedTexture('door', '#cfd6e4', '#e3e8f1', '#aeb8cc').clone();
  tex.needsUpdate = true;
  tex.repeat.set(LEAF / 1.6, 1);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.15 });
}

function Leaf({ leafRef, y, height, material }: { leafRef: React.RefObject<THREE.Group | null>; y: number; height: number; material: THREE.Material }) {
  const frame = mat(palette.blue, { roughness: 0.5 });
  return (
    <group ref={leafRef} position={[0, 0, -y]}>
      <mesh position={[LEAF / 2, height / 2 + 0.08, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[LEAF, height, 0.08]} />
      </mesh>
      <mesh position={[LEAF / 2, height + 0.12, 0]} material={frame} castShadow>
        <boxGeometry args={[LEAF + 0.05, 0.14, 0.12]} />
      </mesh>
      <mesh position={[LEAF / 2, 0.1, 0]} material={frame}>
        <boxGeometry args={[LEAF + 0.05, 0.14, 0.12]} />
      </mesh>
      {[0.05, LEAF - 0.05].map((x) => (
        <mesh key={x} position={[x, height / 2 + 0.1, 0]} material={frame}>
          <boxGeometry args={[0.12, height + 0.2, 0.12]} />
        </mesh>
      ))}
      <mesh position={[LEAF - 0.25, 1.1, 0.07]} material={glowMat('#ffcf5a', '#ffb000', 0.4, 2.4)}>
        <boxGeometry args={[0.12, 0.12, 0.05]} />
      </mesh>
    </group>
  );
}

export function SlidingDoor() {
  const leafA = useRef<THREE.Group>(null);
  const leafB = useRef<THREE.Group>(null);
  const open = useRef(1);
  const lastT = useRef(clock.t);
  const material = useMemo(leafMaterial, []);
  const height = devYard.wallHeight - 0.35;
  useFrame(() => {
    const dt = Math.max(0, clock.t - lastT.current);
    lastT.current = clock.t;
    const target = truckNear() ? 1 : 0;
    open.current += Math.sign(target - open.current) * Math.min(Math.abs(target - open.current), dt * 0.32);
    const k = open.current * open.current * (3 - 2 * open.current);
    // West leaf travels into the parked position; the east leaf travels twice as far, behind it.
    if (leafA.current) leafA.current.position.x = X0 + (PARK1 - LEAF - X0) * k;
    if (leafB.current) leafB.current.position.x = X0 + LEAF - 0.5 + (PARK0 - (X0 + LEAF - 0.5)) * k;
  });
  return (
    <group>
      <Leaf leafRef={leafA} y={0.32} height={height} material={material} />
      <Leaf leafRef={leafB} y={0.55} height={height} material={material} />
      <Merge>
        {/* Floor track and the guide posts at the parked end. */}
        <Box size={[X1 - PARK0, 0.04, 0.5]} position={[(PARK0 + X1) / 2, 0.02, -0.44]} color="#8d97ad" shadow={false} />
        {[PARK0 - 0.2, X0 + 0.25].map((x) => (
          <Box key={x} size={[0.3, height + 0.5, 0.25]} position={[x, (height + 0.5) / 2, -0.85]} color="#6b7894" />
        ))}
      </Merge>
    </group>
  );
}

function speedSign() {
  return canvasTexture('sign-speed', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#d93a3a';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 54, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#1b2233';
    ctx.font = `800 52px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('10', w / 2, h / 2 + 3);
  });
}

/** Speed-limit sign on a post, facing `heading` (yard radians). */
function Sign({ x, y, heading }: { x: number; y: number; heading: number }) {
  const face = useMemo(() => new THREE.MeshStandardMaterial({ map: speedSign(), transparent: true, alphaTest: 0.5, roughness: 0.5 }), []);
  return (
    <group position={yardToWorld(x, y)} rotation={[0, heading - Math.PI / 2, 0]}>
      <Cyl r={0.04} h={2.2} position={[0, 1.1, 0]} material={mat('#9aa3b8', { roughness: 0.4, metalness: 0.4 })} />
      <mesh position={[0, 2.45, 0.05]} material={face}>
        <planeGeometry args={[0.66, 0.66]} />
      </mesh>
      <mesh position={[0, 2.45, 0.04]} rotation={[0, Math.PI, 0]} material={mat('#aab3c5')}>
        <planeGeometry args={[0.6, 0.6]} />
      </mesh>
    </group>
  );
}

export function GateArea() {
  const walls = useLayers((s) => s.walls);
  return (
    <group>
      {walls && <SlidingDoor />}
      <Merge>
        <Sign x={50.1} y={1.1} heading={-Math.PI / 2} />
      </Merge>
    </group>
  );
}
