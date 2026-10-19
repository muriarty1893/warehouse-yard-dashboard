import { devYard } from '../../config/devYard';
import { parked } from '../../config/fleet';
import type { Fixture, YardConfig } from '../../domain/types';
import { heightAt } from '../../domain/yard';
import { Box, Cyl, glowMat, LightPool, mat, palette, RBox, unitSphere, yardToWorld } from '../kit';
import { Merge } from '../Merge';

/**
 * Equipment and clutter that makes the yard read as a working place:
 * manager tables, chargers, the side garage door, empty pallet stacks,
 * bins, extinguishers, cones, wheel chocks, a pallet jack.
 */

/** Manager's table at the platform edge: monitors, papers, an office chair behind it. */
function Desk({ f }: { f: Fixture }) {
  const h = heightAt(devYard, f.x, f.y);
  const top = mat('#eef1f6', { roughness: 0.5 });
  const leg = mat('#5b6b8c', { roughness: 0.4, metalness: 0.4 });
  const dark = mat('#2b3140', { roughness: 0.5 });
  return (
    <group position={yardToWorld(f.x, f.y, h)} rotation={[0, f.heading + Math.PI / 2, 0]}>
      {/* Local frame: x along the table, +z towards the trucks (front). */}
      <RBox size={[2.6, 0.05, 0.95]} position={[0, 0.76, 0]} material={top} radius={0.02} />
      {[-1.2, 1.2].flatMap((x) => [-0.38, 0.38].map((z) => <Box key={`${x}${z}`} size={[0.05, 0.74, 0.05]} position={[x, 0.37, z]} material={leg} />))}
      <Box size={[2.4, 0.4, 0.02]} position={[0, 0.5, -0.4]} color="#d5dbe6" />
      {[-0.55, 0.35].map((x) => (
        <group key={x} position={[x, 0.79, -0.12]}>
          <Box size={[0.06, 0.25, 0.06]} position={[0, 0.12, 0]} material={dark} />
          <RBox size={[0.62, 0.38, 0.04]} position={[0, 0.42, 0]} material={dark} radius={0.015} />
          <mesh position={[0, 0.42, 0.022]} material={glowMat('#3b5bd6', '#6f8cff', 0.35, 1.6)}>
            <planeGeometry args={[0.56, 0.32]} />
          </mesh>
        </group>
      ))}
      <Box size={[0.32, 0.02, 0.24]} position={[1.0, 0.8, 0.18]} color="#ffffff" />
      <Box size={[0.3, 0.02, 0.22]} position={[1.02, 0.815, 0.16]} color="#f6f1dc" rotation={[0, 0.2, 0]} />
      <Cyl r={0.04} h={0.1} position={[-1.05, 0.84, 0.2]} color="#e05252" />
      {/* Office chair. */}
      <group position={[-0.1, 0, -0.95]}>
        <Cyl r={0.3} h={0.04} position={[0, 0.06, 0]} material={dark} />
        <Cyl r={0.03} h={0.38} position={[0, 0.27, 0]} material={leg} />
        <RBox size={[0.5, 0.08, 0.48]} position={[0, 0.48, 0]} color={palette.navy} radius={0.03} />
        <RBox size={[0.48, 0.55, 0.07]} position={[0, 0.8, -0.24]} color={palette.navy} radius={0.03} />
      </group>
    </group>
  );
}

function Charger({ f }: { f: Fixture }) {
  const h = heightAt(devYard, f.x, f.y);
  return (
    <group position={yardToWorld(f.x, f.y, h)} rotation={[0, f.heading + Math.PI / 2, 0]}>
      <RBox size={[0.6, 1.6, 0.4]} position={[0, 0.8, 0]} color={palette.white} radius={0.05} />
      <RBox size={[0.62, 0.28, 0.42]} position={[0, 1.5, 0]} color={palette.blue} radius={0.05} />
      <Box size={[0.36, 0.22, 0.02]} position={[0, 1.15, 0.21]} material={glowMat('#9fe3b8', '#3ad07a', 0.5, 2.4)} shadow={false} />
      <Box size={[0.05, 0.05, 1.4]} position={[0.2, 0.55, 0.85]} color="#2a2f3a" shadow={false} />
      <Box size={[0.7, 0.04, 0.5]} position={[0, 0.02, 0.1]} color="#9aa3b8" shadow={false} />
    </group>
  );
}

/** Stack of empty euro pallets. */
function PalletStack({ x, y, n, yaw = 0 }: { x: number; y: number; n: number; yaw?: number }) {
  const wood = mat(palette.wood, { roughness: 0.9 });
  const h = heightAt(devYard, x, y);
  return (
    <group position={yardToWorld(x, y, h)} rotation={[0, yaw, 0]}>
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[(i % 2) * 0.03, i * 0.145, ((i * 7) % 3) * 0.015]}>
          <Box size={[1.2, 0.025, 0.8]} position={[0, 0.132, 0]} material={wood} />
          {[-0.33, 0, 0.33].map((z) => (
            <Box key={z} size={[1.2, 0.1, 0.1]} position={[0, 0.06, z]} material={wood} />
          ))}
        </group>
      ))}
    </group>
  );
}

function Bin({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <group position={yardToWorld(x, y)}>
      <RBox size={[0.6, 1.0, 0.7]} position={[0, 0.5, 0]} color={color} radius={0.05} />
      <RBox size={[0.64, 0.06, 0.76]} position={[0, 1.03, 0]} color={color} radius={0.02} />
      <Cyl r={0.1} h={0.05} position={[0.2, 0.1, 0.36]} rotation={[Math.PI / 2, 0, 0]} color={palette.tire} />
    </group>
  );
}

function Extinguisher({ x, y }: { x: number; y: number }) {
  const h = heightAt(devYard, x, y);
  return (
    <group position={yardToWorld(x, y, h)}>
      <Box size={[0.4, 0.05, 0.3]} position={[0, 0.025, 0]} color="#d64545" />
      <Box size={[0.04, 1.3, 0.04]} position={[0, 0.65, -0.12]} color="#d64545" />
      <RBox size={[0.34, 0.24, 0.02]} position={[0, 1.2, -0.1]} color="#ffffff" radius={0.01} />
      <Cyl r={0.08} h={0.5} position={[0, 0.32, 0]} color="#e04848" />
      <mesh geometry={unitSphere} material={mat('#e04848')} position={[0, 0.57, 0]} scale={0.08} />
      <Box size={[0.04, 0.06, 0.12]} position={[0, 0.66, 0.03]} color="#2b3140" />
    </group>
  );
}

function Cone({ x, y }: { x: number; y: number }) {
  return (
    <group position={yardToWorld(x, y)}>
      <Box size={[0.42, 0.04, 0.42]} position={[0, 0.02, 0]} color="#2b3140" />
      <mesh position={[0, 0.38, 0]} material={mat('#ff7a1a', { roughness: 0.6 })} castShadow>
        <coneGeometry args={[0.17, 0.7, 14]} />
      </mesh>
      <mesh position={[0, 0.42, 0]} material={mat('#ffffff')}>
        <cylinderGeometry args={[0.095, 0.12, 0.12, 14]} />
      </mesh>
    </group>
  );
}

/** Yellow wedges in front of a parked truck's rear wheels. */
function Chocks({ x, y, heading }: { x: number; y: number; heading: number }) {
  return (
    <group position={yardToWorld(x, y)} rotation={[0, heading, 0]}>
      {[-1.02, 1.02].map((z) => (
        <Box key={z} size={[0.24, 0.18, 0.32]} position={[0.62, 0.09, z]} color={palette.yellow} rotation={[0, 0, 0.35]} />
      ))}
    </group>
  );
}

function PalletJack({ x, y, heading }: { x: number; y: number; heading: number }) {
  const h = heightAt(devYard, x, y);
  const red = mat('#d64545', { roughness: 0.5 });
  return (
    <group position={yardToWorld(x, y, h)} rotation={[0, heading, 0]}>
      {[-0.27, 0.27].map((z) => (
        <Box key={z} size={[1.15, 0.07, 0.16]} position={[0.55, 0.06, z]} color="#3a4256" />
      ))}
      <RBox size={[0.3, 0.3, 0.62]} position={[-0.08, 0.2, 0]} material={red} radius={0.04} />
      <Cyl r={0.025} h={1.1} position={[-0.38, 0.62, 0]} rotation={[0, 0, 0.45]} color="#2b3140" />
      <Box size={[0.06, 0.06, 0.34]} position={[-0.62, 1.1, 0]} color="#2b3140" />
    </group>
  );
}

/** Roller door in the boundary wall (kept closed). */
function GarageDoor({ a, b, height }: { a: [number, number]; b: [number, number]; height: number }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return (
    <group position={yardToWorld((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)} rotation={[0, heading, 0]}>
      <Box size={[len, height - 0.3, 0.18]} position={[0, (height - 0.3) / 2, -0.12]} color="#c9d2e3" />
      {Array.from({ length: Math.round((height - 0.4) / 0.32) }, (_, i) => (
        <Box key={i} size={[len, 0.05, 0.2]} position={[0, 0.3 + i * 0.32, -0.12]} color="#aab4c8" shadow={false} />
      ))}
      <Box size={[len + 0.5, 0.5, 0.4]} position={[0, height - 0.05, -0.12]} color={palette.blue} />
      <Box size={[0.3, height + 0.2, 0.4]} position={[-len / 2 - 0.15, (height + 0.2) / 2, -0.12]} color={palette.blue} />
      <Box size={[0.3, height + 0.2, 0.4]} position={[len / 2 + 0.15, (height + 0.2) / 2, -0.12]} color={palette.blue} />
    </group>
  );
}

function FixtureModel({ f }: { f: Fixture }) {
  const n = f.count ?? 1;
  switch (f.kind) {
    case 'desk':
      return <Desk f={f} />;
    case 'charger':
      return <Charger f={f} />;
    case 'pallets':
      return <PalletStack x={f.x} y={f.y} n={n} yaw={f.heading} />;
    case 'skip':
      return (
        <group position={yardToWorld(f.x, f.y)} rotation={[0, f.heading, 0]}>
          <RBox size={[2.2, 1.1, 1.5]} position={[0, 0.7, 0]} color="#e8762b" radius={0.05} />
          <Box size={[2.4, 0.08, 1.62]} position={[0, 1.27, 0]} color="#c75f1c" />
          <Box size={[1.6, 0.15, 1.2]} position={[0, 0.08, 0]} color="#3a4256" />
        </group>
      );
    case 'bins':
      return (
        <>
          {Array.from({ length: n }, (_, i) => (
            <Bin key={i} x={f.x + (i - (n - 1) / 2) * 0.8} y={f.y} color={['#16a39b', '#2f5ff0', '#5b6b8c'][i % 3]} />
          ))}
        </>
      );
    case 'extinguisher':
      return <Extinguisher x={f.x} y={f.y} />;
    case 'cones':
      return (
        <>
          {Array.from({ length: n }, (_, i) => (
            <Cone key={i} x={f.x + Math.cos(f.heading) * (i - (n - 1) / 2) * 1.2} y={f.y + Math.sin(f.heading) * (i - (n - 1) / 2) * 1.2} />
          ))}
        </>
      );
    case 'palletJack':
      return <PalletJack x={f.x} y={f.y} heading={f.heading} />;
    default:
      // Light poles and bollards are drawn with the scenery.
      return null;
  }
}

export function Props({ yard }: { yard: YardConfig }) {
  const chockFor = ['L1', 'L4', 'P2'].map((bay) => parked(bay, 'rigid'));
  return (
    <group>
      <Merge>
        {yard.fixtures.map((f) => (
          <FixtureModel key={f.id} f={f} />
        ))}
        {yard.gates
          .filter((g) => g.closed)
          .map((g) => (
            <GarageDoor key={g.id} a={g.a} b={g.b} height={yard.wallHeight} />
          ))}
        {chockFor.map((p, i) => (
          <Chocks key={i} x={p.x} y={p.y} heading={p.heading} />
        ))}
      </Merge>
      {yard.fixtures
        .filter((f) => f.kind === 'desk')
        .map((f) => (
          <LightPool key={f.id} x={f.x} y={f.y} h={heightAt(yard, f.x, f.y)} r={2.6} />
        ))}
    </group>
  );
}
