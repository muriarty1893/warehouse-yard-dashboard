import type { YardConfig } from '../../domain/types';
import { Box, mat, palette, RBox, yardToWorld } from '../kit';
import { Merge } from '../Merge';

/** Wall-mounted forklift chargers (C1, C2, …) facing west. */
function Chargers({ x, ys, h }: { x: number; ys: number[]; h: number }) {
  return (
    <>
      {ys.map((y) => (
        <group key={y} position={yardToWorld(x, y, h)}>
          <RBox size={[0.4, 1.7, 0.7]} position={[0, 0.85, 0]} color={palette.white} radius={0.06} />
          <RBox size={[0.42, 0.3, 0.72]} position={[0, 1.55, 0]} color={palette.blue} radius={0.05} />
          <Box size={[0.02, 0.28, 0.4]} position={[-0.21, 1.15, 0]} material={mat('#9fe3b8', { emissive: '#3ad07a', emissiveIntensity: 0.5 })} shadow={false} />
          <Box size={[1.6, 0.05, 0.05]} position={[-0.8, 0.6, 0.2]} color="#2a2f3a" shadow={false} />
        </group>
      ))}
    </>
  );
}

/** Sliding gate parked open along the fence, and closed doors in the boundary. */
function Gates({ yard }: { yard: YardConfig }) {
  return (
    <>
      {yard.gates.map((g) => {
        if (g.parkedPanel) {
          const [x0, x1] = g.parkedPanel;
          const len = x1 - x0;
          return (
            <group key={g.id} position={yardToWorld((x0 + x1) / 2, g.a[1] + 0.35)}>
              <Box size={[len, 0.1, 0.1]} position={[0, 2.3, 0]} color="#8d97ad" />
              <Box size={[len, 0.1, 0.1]} position={[0, 0.25, 0]} color="#8d97ad" />
              {Array.from({ length: Math.round(len / 2) + 1 }, (_, i) => (
                <Box key={i} size={[0.08, 2.1, 0.08]} position={[-len / 2 + (i * len) / Math.round(len / 2), 1.27, 0]} color="#a7b0c4" />
              ))}
              <Box size={[len, 0.14, 0.12]} position={[0, 2.42, 0]} color={palette.yellow} />
              <Box size={[len + 0.6, 0.08, 0.25]} position={[0.3, 0.04, 0]} color="#6b7894" shadow={false} />
            </group>
          );
        }
        if (g.closed) {
          const len = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
          const heading = Math.atan2(g.b[1] - g.a[1], g.b[0] - g.a[0]);
          return (
            <group key={g.id} position={yardToWorld((g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2)} rotation={[0, heading, 0]}>
              <Box size={[len, 3.4, 0.18]} position={[0, 1.7, 0]} color="#c9d2e3" />
              {Array.from({ length: 10 }, (_, i) => (
                <Box key={i} size={[len, 0.05, 0.2]} position={[0, 0.3 + i * 0.32, 0]} color="#aab4c8" shadow={false} />
              ))}
              <Box size={[len + 0.5, 0.45, 0.35]} position={[0, 3.6, 0]} color={palette.blue} />
              <Box size={[0.25, 3.8, 0.3]} position={[-len / 2 - 0.12, 1.9, 0]} color={palette.blue} />
              <Box size={[0.25, 3.8, 0.3]} position={[len / 2 + 0.12, 1.9, 0]} color={palette.blue} />
            </group>
          );
        }
        return null;
      })}
    </>
  );
}

export function Props({ yard }: { yard: YardConfig }) {
  const charge = yard.areas.find((a) => a.id === 'R-CHARGE');
  return (
    <Merge>
      {charge && <Chargers x={charge.rect.x + charge.rect.w - 0.3} ys={[28.6, 31.2]} h={charge.elevation ?? 0} />}
      <Gates yard={yard} />
    </Merge>
  );
}
