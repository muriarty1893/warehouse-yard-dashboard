import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Screen positions for DOM things that follow the 3D yard (world tags, the
 * selection card): one projection pass per frame, written straight to the
 * elements, no React state per frame (spec §4.2, HD 620 budget).
 */

type Target = { at: () => [number, number, number] | null; move: (x: number, y: number, visible: boolean) => void };
const targets = new Map<string, Target>();

/** Follow a world point; `move` gets its screen position every frame. Returns the unregister function. */
export function track(id: string, at: Target['at'], move: Target['move']) {
  targets.set(id, { at, move });
  return () => {
    if (targets.get(id)?.move === move) targets.delete(id);
  };
}

const v = new THREE.Vector3();

export function Projector() {
  useFrame(({ camera, size }) => {
    for (const t of targets.values()) {
      const p = t.at();
      if (!p) {
        t.move(0, 0, false);
        continue;
      }
      v.set(p[0], p[1], p[2]).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      t.move(((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height, visible);
    }
  });
  return null;
}
