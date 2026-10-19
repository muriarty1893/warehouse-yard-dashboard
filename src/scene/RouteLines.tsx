import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { devYard } from '../config/devYard';
import { forklifts, groundAt, trucks } from '../config/fleet';
import { yardBounds } from '../domain/yard';
import { compileRoute, evalRoute, newPose } from '../sim/route';
import { useLayers } from '../state/layers';
import { useUi } from '../state/ui';
import { yardToWorld } from './kit';

/**
 * Planned routes of the moving vehicles as lines on the floor: all of them
 * with the "routes" layer, otherwise just the selected vehicle's.
 */

const yb = yardBounds(devYard);

type Pts = [number, number, number][];

function routeLines(route: ReturnType<typeof compileRoute>): Pts[] {
  const pose = newPose();
  const lines: Pts[] = [];
  let cur: Pts = [];
  let last: [number, number] | null = null;
  for (let t = 0; t <= route.duration; t += 0.1) {
    evalRoute(route, (route.spec.offset ?? 0) + t, pose);
    const inside = pose.x > yb.x0 - 6 && pose.x < yb.x1 + 6 && pose.y > yb.y0 - 8 && pose.y < yb.y1;
    if (!inside) {
      if (cur.length > 1) lines.push(cur);
      cur = [];
      last = null;
      continue;
    }
    if (last && Math.hypot(pose.x - last[0], pose.y - last[1]) < 0.3) continue;
    last = [pose.x, pose.y];
    cur.push(yardToWorld(pose.x, pose.y, groundAt(pose.x, pose.y) + 0.07));
  }
  if (cur.length > 1) lines.push(cur);
  return lines;
}

const ROUTES = [
  ...trucks.filter((t) => t.route).map((t) => ({ id: t.id, kind: 'truck' as const, lines: routeLines(compileRoute(t.route!)) })),
  ...forklifts.filter((f) => f.route).map((f) => ({ id: f.id, kind: 'forklift' as const, lines: routeLines(compileRoute(f.route!)) })),
];

export function RouteLines() {
  const all = useLayers((s) => s.routes);
  const selected = useUi((s) => (s.selected?.kind === 'truck' || s.selected?.kind === 'forklift' ? s.selected.id : null));
  const shown = useMemo(() => ROUTES.filter((r) => all || r.id === selected), [all, selected]);
  return (
    <group>
      {shown.flatMap((r) =>
        r.lines.map((pts, i) => (
          <Line
            key={`${r.id}${i}`}
            points={pts}
            color={r.kind === 'truck' ? '#2f5ff0' : '#e8a10c'}
            lineWidth={r.id === selected ? 3.2 : 2}
            dashed
            dashSize={0.8}
            gapSize={0.45}
            transparent
            opacity={r.id === selected ? 0.95 : 0.6}
            depthWrite={false}
          />
        )),
      )}
    </group>
  );
}
