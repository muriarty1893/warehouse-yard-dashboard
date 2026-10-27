import { Environment, Lightformer, MapControls } from '@react-three/drei';
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Suspense } from 'react';
import { devYard } from '../config/devYard';
import { workers } from '../config/fleet';
import { settings } from '../settings';
import { SimClock } from '../sim/clock';
import { useLayers } from '../state/layers';
import { CargoLayer } from './cargo/CargoLayer';
import { Overlays } from './cargo/Overlays';
import { Placement } from './cargo/Placement';
import { Lighting } from './Lighting';
import { GameForklifts, GameTrucks } from './game/GameVehicles';
import { LoadView } from './loading/LoadView';
import { RouteLines } from './RouteLines';
import { GateArea } from './site/Gate';
import { CameraRig, MAX_DISTANCE, MIN_DISTANCE, YARD_CENTER } from './CameraRig';
import { DevHooks } from './DevHooks';
import { palette } from './kit';
import { Buildings } from './site/Buildings';
import { Nature, RoadTiles } from './site/EnvAssets';
import { Ground } from './site/Ground';
import { Props } from './site/Props';
import { Scenery } from './site/Scenery';
import { Traffic } from './vehicles/Traffic';
import { Worker } from './vehicles/Worker';

export function YardScene() {
  const yard = devYard;
  const nature = useLayers((s) => s.nature);
  const traffic = useLayers((s) => s.traffic);

  return (
    <>
      <SimClock />
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[palette.background, 300, 700]} />

      <Lighting />
      <Environment resolution={256} frames={1} environmentIntensity={0.12}>
        <Lightformer form="rect" intensity={2.5} position={[0, 20, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-30, 8, 20]} rotation-y={Math.PI / 3} scale={[30, 10, 1]} color="#dfe8ff" />
        <Lightformer form="rect" intensity={1} position={[30, 8, -20]} rotation-y={-Math.PI / 3} scale={[30, 10, 1]} />
      </Environment>

      <Ground yard={yard} />
      <Suspense fallback={null}>
        <RoadTiles gateX={(yard.gates[0].a[0] + yard.gates[0].b[0]) / 2} />
        {nature && <Nature />}
      </Suspense>
      <Scenery yard={yard} />
      <Buildings yard={yard} />
      <Props yard={yard} />
      <GateArea />
      <CargoLayer />
      <Overlays />
      <Placement />
      <RouteLines />
      <GameTrucks />
      <LoadView />
      <GameForklifts />
      {workers.map((w) => (
        <Worker key={w.id} spec={w} />
      ))}
      {traffic && <Traffic />}

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
