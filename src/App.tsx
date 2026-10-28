import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { HOME_POSITION } from './scene/CameraRig';
import { YardScene } from './scene/YardScene';
import { settings } from './settings';
import { frameStep } from './sim/clock';
import { useUi } from './state/ui';
import { useView } from './state/view';
import { GameRoot } from './ui/game/GameRoot';
import { useGame } from './game/store';
import { GameClock } from './scene/game/GameClock';

/**
 * While the planner's 2D plan covers the view the scene renders on demand,
 * four times a second, so the sim clock (advanced per frame) keeps going.
 */
function PlanTicker() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    frameStep.max = 0.3;
    const id = window.setInterval(() => invalidate(), 250);
    return () => {
      window.clearInterval(id);
      frameStep.max = 0.1;
    };
  }, [invalidate]);
  return null;
}

export default function App() {
  // Temporary until the campaign screens exist (plan Task 17): start a shift straight away.
  // Dev only: ?shift=<id>&bot=good|basic&t=<seconds> plays the shift with a test bot up to t (screenshots, checks).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const g = useGame.getState();
    if (g.shift) return;
    g.openBriefing(q.get('shift') ?? 'opening-gate');
    useGame.getState().startShift();
    const bot = q.get('bot');
    const until = Number(q.get('t') ?? 0);
    if (import.meta.env.DEV && bot && until > 0) void import('./game/devPlay').then((m) => m.devPlay(bot, until));
  }, []);
  const select = useUi((s) => s.select);
  const drawing = useView((s) => !!s.planner && s.plannerView === 'plan');
  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows="percentage"
        flat={settings.ao}
        gl={{ antialias: settings.msaa > 0, toneMapping: THREE.NeutralToneMapping }}
        dpr={[1, settings.dpr]}
        camera={{ position: HOME_POSITION, fov: 30, near: 1, far: 2000 }}
        onPointerMissed={(e) => e.type === 'click' && select(null)}
        frameloop={drawing ? 'demand' : 'always'}
      >
        <YardScene />
        {drawing && <PlanTicker />}
      </Canvas>
      <GameClock />
      {settings.ui && <GameRoot />}
    </div>
  );
}
