import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { clock, useSim } from '../sim/clock';
import { useLayers } from '../state/layers';
import { useUi } from '../state/ui';
import { useView } from '../state/view';
import { useLoading } from '../loading/store';
import { useGame } from '../game/store';
import { useProgress } from '../game/progress';

interface ControlsLike {
  target: { set: (x: number, y: number, z: number) => void };
  update: () => void;
}

/** Dev-only handle for scripted screenshots: window.__yard.view([x,y,z], [tx,ty,tz]). */
export function DevHooks() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__yard = {
      clock,
      stores: { ui: useUi, view: useView, layers: useLayers, sim: useSim, loading: useLoading, game: useGame, progress: useProgress },
      /** Frames per second over `ms` (performance checks). */
      fps(ms = 3000) {
        return new Promise<number>((resolve) => {
          let n = 0;
          const t0 = performance.now();
          const step = () => {
            n += 1;
            if (performance.now() - t0 < ms) requestAnimationFrame(step);
            else resolve((n * 1000) / (performance.now() - t0));
          };
          requestAnimationFrame(step);
        });
      },
      camera,
      gl,
      scene,
      view(pos: [number, number, number], target: [number, number, number]) {
        camera.position.set(...pos);
        controls?.target.set(...target);
        controls?.update();
      },
    };
  }, [camera, controls, gl, scene]);
  return null;
}
