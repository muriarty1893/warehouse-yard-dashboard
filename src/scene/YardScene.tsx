import { Environment, Lightformer, MapControls } from '@react-three/drei';
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Suspense, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { devYard } from '../config/devYard';
import { forklifts, trucks, workers } from '../config/fleet';
import { settings } from '../settings';
import { SimClock } from '../sim/clock';
import { cargo, positions } from '../world/snapshot';
import { CargoLayer } from './cargo/CargoLayer';
import { CameraRig, MAX_DISTANCE, MIN_DISTANCE, YARD_CENTER } from './CameraRig';
import { DevHooks } from './DevHooks';
import { palette } from './kit';
import { Buildings } from './site/Buildings';
import { Nature, RoadTiles } from './site/EnvAssets';
import { Ground } from './site/Ground';
import { Props } from './site/Props';
import { Scenery } from './site/Scenery';
import { Forklift } from './vehicles/Forklift';
import { Traffic } from './vehicles/Traffic';
import { Truck } from './vehicles/Truck';
import { Worker } from './vehicles/Worker';

function Sun() {
  const ref = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    const light = ref.current;
    if (!light) return;
    light.target.position.set(...YARD_CENTER);
    light.target.updateMatrixWorld();
    const cam = light.shadow.camera;
    cam.left = -75;
    cam.right = 75;
    cam.top = 70;
    cam.bottom = -70;
    cam.near = 20;
    cam.far = 420;
    cam.updateProjectionMatrix();
  }, []);
  return (
    <directionalLight
      ref={ref}
      position={[YARD_CENTER[0] - 80, 170, YARD_CENTER[2] + 95]}
      intensity={3.4}
      color="#fffaf0"
      castShadow={settings.shadowMap > 0}
      shadow-mapSize={[settings.shadowMap, settings.shadowMap]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.05}
      shadow-radius={3}
    />
  );
}

export function YardScene() {
  const yard = devYard;

  return (
    <>
      <SimClock />
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[palette.background, 300, 700]} />

      <hemisphereLight args={['#ffffff', '#b9c2da', 0.9]} />
      <Sun />
      <Environment resolution={256} frames={1} environmentIntensity={0.12}>
        <Lightformer form="rect" intensity={2.5} position={[0, 20, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-30, 8, 20]} rotation-y={Math.PI / 3} scale={[30, 10, 1]} color="#dfe8ff" />
        <Lightformer form="rect" intensity={1} position={[30, 8, -20]} rotation-y={-Math.PI / 3} scale={[30, 10, 1]} />
      </Environment>

      <Ground yard={yard} />
      <Suspense fallback={null}>
        <RoadTiles gateX={(yard.gates[0].a[0] + yard.gates[0].b[0]) / 2} />
        <Nature />
      </Suspense>
      <Scenery yard={yard} />
      <Buildings yard={yard} />
      <Props yard={yard} />
      <CargoLayer cargo={cargo} positions={positions} />
      {trucks.map((t) => (
        <Truck key={t.id} spec={t} />
      ))}
      {forklifts.map((f) => (
        <Forklift key={f.id} spec={f} />
      ))}
      {workers.map((w) => (
        <Worker key={w.id} spec={w} />
      ))}
      <Traffic />

      <MapControls
        makeDefault
        target={YARD_CENTER}
        enableDamping
        dampingFactor={0.08}
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        maxPolarAngle={1.22}
        screenSpacePanning={false}
        zoomToCursor
      />

      <CameraRig />
      <DevHooks />
      {settings.ao && (
        <EffectComposer multisampling={settings.msaa} enableNormalPass={false}>
          <N8AO aoRadius={2.5} distanceFalloff={0.6} intensity={2.4} quality="medium" halfRes />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      )}
    </>
  );
}
