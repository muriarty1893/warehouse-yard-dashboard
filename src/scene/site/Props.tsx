import type { YardConfig } from '../../domain/types';
import { Box, Cyl, mat, palette, RBox, yardToWorld } from '../kit';
import { Merge } from '../Merge';

/** Fuel tank and dispenser for the fuel restricted area. */
function FuelStation({ x, y }: { x: number; y: number }) {
  return (
    <group position={yardToWorld(x, y)}>
      {[-1.6, 1.6].map((dx) => (
        <Box key={dx} size={[0.4, 0.7, 2.2]} position={[dx, 0.35, 0]} color="#c9d0de" />
      ))}
      <Cyl r={1.15} h={5.2} position={[0, 1.75, 0]} rotation={[0, 0, Math.PI / 2]} color="#f3f5f9" />
      <Cyl r={1.17} h={0.5} position={[0, 1.75, 0]} rotation={[0, 0, Math.PI / 2]} color={palette.blue} />
      <Cyl r={0.18} h={0.5} position={[1.6, 3.0, 0]} color="#9aa3b8" />
      <group position={[4.2, 0, 0.4]}>
        <RBox size={[0.7, 1.9, 0.5]} position={[0, 0.95, 0]} color={palette.white} radius={0.08} />
        <RBox size={[0.72, 0.5, 0.52]} position={[0, 1.6, 0]} color="#d64b4b" radius={0.06} />
        <Box size={[0.02, 0.3, 0.3]} position={[0.37, 1.2, 0]} material={mat('#9fe3b8', { emissive: '#3ad07a', emissiveIntensity: 0.4 })} shadow={false} />
      </group>
      {/* Bund kerb */}
      <Box size={[11.6, 0.18, 0.2]} position={[1, 0.09, 3.8]} color="#e65c5c" />
      <Box size={[11.6, 0.18, 0.2]} position={[1, 0.09, -3.8]} color="#e65c5c" />
    </group>
  );
}

/** Wall-mounted forklift chargers (C1, C2, …) facing west. */
function Chargers({ x, ys }: { x: number; ys: number[] }) {
  return (
    <>
      {ys.map((y) => (
        <group key={y} position={yardToWorld(x, y)}>
          <RBox size={[0.4, 1.7, 0.7]} position={[0, 0.85, 0]} color={palette.white} radius={0.06} />
          <RBox size={[0.42, 0.3, 0.72]} position={[0, 1.55, 0]} color={palette.blue} radius={0.05} />
          <Box size={[0.02, 0.28, 0.4]} position={[-0.21, 1.15, 0]} material={mat('#9fe3b8', { emissive: '#3ad07a', emissiveIntensity: 0.5 })} shadow={false} />
          <Box size={[1.6, 0.05, 0.05]} position={[-0.8, 0.6, 0.2]} color="#2a2f3a" shadow={false} />
        </group>
      ))}
    </>
  );
}

export function Props({ yard }: { yard: YardConfig }) {
  const fuel = yard.areas.find((a) => a.id === 'R-FUEL');
  const charge = yard.areas.find((a) => a.id === 'R-CHARGE');
  return (
    <Merge>
      {fuel && <FuelStation x={fuel.rect.x + fuel.rect.w / 2 - 1.5} y={fuel.rect.y + fuel.rect.h / 2} />}
      {charge && <Chargers x={charge.rect.x + charge.rect.w - 0.6} ys={[92, 96.5, 101]} />}
    </Merge>
  );
}
