import { describe, expect, it } from 'vitest';
import { forklifts, trucks, workers } from '../config/fleet';
import { Path2 } from './path';
import { compileRoute, evalRoute, newPose } from './route';

const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('Path2', () => {
  it('fillets a right-angle corner with the requested radius', () => {
    const p = new Path2([[0, 0], [10, 0], [10, 10]], 4);
    // Two straights of 6 m plus a quarter circle of radius 4.
    expect(p.length).toBeCloseTo(12 + (Math.PI / 2) * 4, 6);
    const mid = p.at(p.length / 2);
    expect(mid.dir).toBeCloseTo(Math.PI / 4, 6);
  });

  it('extends the end tangents beyond the path', () => {
    const p = new Path2([[0, 0], [5, 0]]);
    expect(p.at(-2).x).toBeCloseTo(-2);
    expect(p.at(7).x).toBeCloseTo(7);
  });
});

describe('scripted routes', () => {
  const routed = [...trucks, ...forklifts, ...workers].filter((s) => s.route);

  it.each(routed.map((s) => [s.id, s] as const))('%s moves continuously (no jumps or heading snaps)', (_, spec) => {
    const route = compileRoute(spec.route!);
    const pose = newPose();
    let prev: { x: number; y: number; h: number; th: number } | null = null;
    const dt = 0.02;
    for (let t = 0; t < route.duration; t += dt) {
      evalRoute(route, t + (spec.route!.offset ?? 0), pose);
      if (prev) {
        // Even at road speed a vehicle moves < 0.3 m per 20 ms.
        expect(Math.hypot(pose.x - prev.x, pose.y - prev.y)).toBeLessThan(0.3);
        expect(angleDiff(pose.heading, prev.h)).toBeLessThan(0.08);
        expect(angleDiff(pose.trailerHeading, prev.th)).toBeLessThan(0.08);
      }
      prev = { x: pose.x, y: pose.y, h: pose.heading, th: pose.trailerHeading };
    }
  });

  it('a period never cuts a route short', () => {
    for (const s of routed) {
      const r = compileRoute(s.route!);
      expect(r.period).toBeGreaterThanOrEqual(r.duration);
    }
  });
});
