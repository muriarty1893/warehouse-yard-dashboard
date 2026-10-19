import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SPEEDS, useSim } from '../sim/clock';
import { useUi } from '../state/ui';
import { useView } from '../state/view';
import { focusEntity } from '../ui/focus';
import { yardToWorld } from './kit';
import { entityObject } from './registry';

export const YARD_CENTER: [number, number, number] = [86, 0, -50];
export const HOME_POSITION: [number, number, number] = [YARD_CENTER[0] + 92, 118, YARD_CENTER[2] + 128];
export const MIN_DISTANCE = 12;
export const MAX_DISTANCE = 380;

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

interface Flight {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
  duration: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

/**
 * Strategy-game camera: animated zoom / rotate / home / focus requests from
 * the UI, follow mode, and keyboard control (WASD pan, Q/E rotate, Z/X zoom).
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const flight = useRef<Flight | null>(null);
  const keys = useRef(new Set<string>());
  const followPos = useRef<THREE.Vector3 | null>(null);
  const command = useView((s) => s.command);
  const follow = useView((s) => s.follow);

  const fly = (toPos: THREE.Vector3, toTarget: THREE.Vector3, duration = 0.9) => {
    if (!controls) return;
    flight.current = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos, toTarget, start: performance.now(), duration };
  };

  useEffect(() => {
    if (!command || !controls) return;
    const target = flight.current?.toTarget.clone() ?? controls.target.clone();
    const offset = (flight.current?.toPos.clone() ?? camera.position.clone()).sub(target);
    switch (command.kind) {
      case 'zoom': {
        const d = THREE.MathUtils.clamp(offset.length() * command.factor, MIN_DISTANCE, MAX_DISTANCE);
        fly(target.clone().add(offset.setLength(d)), target, 0.45);
        break;
      }
      case 'rotate':
        fly(target.clone().add(offset.applyAxisAngle(UP, command.angle)), target, 0.6);
        break;
      case 'home':
        useView.getState().setFollow(null);
        fly(new THREE.Vector3(...HOME_POSITION), new THREE.Vector3(...YARD_CENTER), 1.1);
        break;
      case 'focus': {
        const obj = command.ref ? entityObject(command.ref) : undefined;
        const p = obj ? obj.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(...yardToWorld(command.x, command.y, command.h ?? 0));
        p.y = Math.max(0, p.y);
        const dist = command.distance ?? 42;
        fly(p.clone().add(offset.setLength(dist)), p, 1.0);
        break;
      }
    }
  }, [command?.id]);

  useEffect(() => {
    followPos.current = null;
  }, [follow]);

  // Keyboard: held keys for movement, one-shot keys for actions.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      keys.current.add(k);
      const view = useView.getState();
      const sim = useSim.getState();
      switch (k) {
        case 'h':
          view.send({ kind: 'home' });
          break;
        case 'f': {
          const sel = useUi.getState().selected;
          if (sel) focusEntity(sel);
          break;
        }
        case 'escape':
          useUi.getState().select(null);
          view.setFollow(null);
          view.toggleHelp(false);
          break;
        case ' ':
          e.preventDefault();
          sim.togglePause();
          break;
        case '1':
        case '2':
        case '3':
        case '4':
          sim.setSpeed(SPEEDS[Number(k) - 1]);
          break;
        case '?':
          view.toggleHelp();
          break;
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  useFrame((_, dt) => {
    if (!controls) return;
    const step = Math.min(dt, 0.05);

    const f = flight.current;
    if (f) {
      const u = Math.min(1, (performance.now() - f.start) / (f.duration * 1000));
      const e = ease(u);
      camera.position.lerpVectors(f.fromPos, f.toPos, e);
      controls.target.lerpVectors(f.fromTarget, f.toTarget, e);
      if (u >= 1) flight.current = null;
    }

    const followed = follow ? entityObject(follow) : undefined;
    if (followed && !flight.current) {
      const p = followed.getWorldPosition(tmp);
      p.y = 0;
      if (followPos.current) {
        const delta = p.clone().sub(followPos.current);
        camera.position.add(delta);
        controls.target.add(delta);
      }
      followPos.current = p.clone();
    }

    const k = keys.current;
    if (k.size === 0) return;
    const offset = camera.position.clone().sub(controls.target);
    const dist = offset.length();
    fwd.copy(offset).negate().setY(0).normalize();
    right.crossVectors(fwd, UP).normalize();
    const pan = new THREE.Vector3();
    if (k.has('w') || k.has('arrowup')) pan.add(fwd);
    if (k.has('s') || k.has('arrowdown')) pan.sub(fwd);
    if (k.has('d') || k.has('arrowright')) pan.add(right);
    if (k.has('a') || k.has('arrowleft')) pan.sub(right);
    if (pan.lengthSq() > 0) {
      flight.current = null;
      if (useView.getState().follow) useView.getState().setFollow(null);
      pan.normalize().multiplyScalar(step * Math.max(20, dist * 0.9) * (k.has('shift') ? 2.2 : 1));
      camera.position.add(pan);
      controls.target.add(pan);
    }
    let turn = 0;
    if (k.has('q')) turn += 1;
    if (k.has('e')) turn -= 1;
    if (turn) {
      flight.current = null;
      offset.applyAxisAngle(UP, turn * step * 1.4);
      camera.position.copy(controls.target).add(offset);
    }
    let zoom = 0;
    if (k.has('z') || k.has('=') || k.has('+')) zoom -= 1;
    if (k.has('x') || k.has('-') || k.has('_')) zoom += 1;
    if (zoom) {
      flight.current = null;
      const d = THREE.MathUtils.clamp(dist * (1 + zoom * step * 1.6), MIN_DISTANCE, MAX_DISTANCE);
      camera.position.copy(controls.target).add(offset.setLength(d));
    }
  });

  return null;
}
