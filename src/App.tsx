import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { HOME_POSITION } from './scene/CameraRig';
import { YardScene } from './scene/YardScene';
import { settings } from './settings';
import { useUi } from './state/ui';
import { Dashboard } from './ui/Dashboard';

export default function App() {
  const select = useUi((s) => s.select);
  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows="percentage"
        flat={settings.ao}
        gl={{ antialias: settings.msaa > 0, toneMapping: THREE.NeutralToneMapping }}
        dpr={[1, settings.dpr]}
        camera={{ position: HOME_POSITION, fov: 30, near: 1, far: 2000 }}
        onPointerMissed={(e) => e.type === 'click' && select(null)}
      >
        <YardScene />
      </Canvas>
      {settings.ui && <Dashboard />}
    </div>
  );
}
