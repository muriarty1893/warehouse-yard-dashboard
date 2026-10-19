import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { clock, useSim } from '../sim/clock';
import { useControl } from '../sim/control';
import { useLayers } from '../state/layers';
import { useUi } from '../state/ui';
import { useView } from '../state/view';
import { useInventory } from '../world/inventory';
import { useWorld } from '../world/store';
import { placeAt, startMove } from '../ui/actions';

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
      actions: { placeAt, startMove },
      stores: { ui: useUi, view: useView, layers: useLayers, inventory: useInventory, world: useWorld, control: useControl, sim: useSim },
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
