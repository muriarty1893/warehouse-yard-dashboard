import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SPEEDS, useSim } from '../sim/clock';
import { useUi } from '../state/ui';
import { useView } from '../state/view';
import { devYard } from '../config/devYard';
import { yardBounds } from '../domain/yard';
import { cancelPlacing, startMove, toggleHold } from '../ui/actions';
import { focusEntity } from '../ui/focus';
import { useLayers } from '../state/layers';
import { yardToWorld } from './kit';
import { entityObject } from './registry';

const yb = yardBounds(devYard);
const span = Math.max(yb.w, yb.h);
export const YARD_CENTER: [number, number, number] = [yb.cx, 0, -yb.cy + 2];
export const HOME_POSITION: [number, number, number] = [YARD_CENTER[0] + span * 0.62, span * 0.98, YARD_CENTER[2] + span * 1.12];
export const MIN_DISTANCE = 8;
export const MAX_DISTANCE = 260;

/** Where the camera looks (yard coords) and from which side; read by the minimap. */
export const cameraView = { x: yb.cx, y: yb.cy, yaw: 0, distance: 0 };

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
  maxPolarAngle: number;
}

interface Flight {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromFov: number;
  toFov: number;
  /** Near plane to switch to when the flight lands (clips what stands between camera and subject). */
  near: number;
  start: number;
  duration: number;
}

/** How far the camera may tilt towards the horizon: the yard view, and the planner's side view. */
const YARD_POLAR = 1.22;
const PLANNER_POLAR = 1.56;

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
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const flight = useRef<Flight | null>(null);
  const keys = useRef(new Set<string>());
  const followPos = useRef<THREE.Vector3 | null>(null);
  const command = useView((s) => s.command);
  const follow = useView((s) => s.follow);
  const planner = useView((s) => !!s.planner);
  /** Where the camera was before the planner framed a truck. */
  const saved = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; fov: number; near: number } | null>(null);

  const fly = (toPos: THREE.Vector3, toTarget: THREE.Vector3, duration = 0.9, toFov = camera.fov, near = saved.current?.near ?? camera.near) => {
    if (!controls) return;
    // Drop any clipping right away; a new one applies once the camera is in place.
    if (camera.near !== (saved.current?.near ?? camera.near)) {
      camera.near = saved.current?.near ?? camera.near;
      camera.updateProjectionMatrix();
    }
    flight.current = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos, toTarget, fromFov: camera.fov, toFov, near, start: performance.now(), duration };
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
      case 'top': {
        useView.getState().setFollow(null);
        const c = new THREE.Vector3(yb.cx, 0, -yb.cy);
        fly(c.clone().add(new THREE.Vector3(0, span * 2.1, 0.8)), c, 1.1);
        break;
      }
      case 'focus': {
        const obj = command.ref ? entityObject(command.ref) : undefined;
        const p = obj ? obj.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(...yardToWorld(command.x, command.y, command.h ?? 0));
        p.y = Math.max(0, p.y);
        const dist = command.distance ?? 42;
        fly(p.clone().add(offset.setLength(dist)), p, 1.0);
        break;
      }
      case 'frame': {
        if (!saved.current) saved.current = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov, near: camera.near };
        useView.getState().setFollow(null);
        const to = new THREE.Vector3(...yardToWorld(command.x, command.y, command.h));
        const dir = new THREE.Vector3(Math.cos(command.pitch) * Math.cos(command.yaw), Math.sin(command.pitch), -Math.cos(command.pitch) * Math.sin(command.yaw));
        fly(to.clone().add(dir.multiplyScalar(command.distance)), to, 1.0, command.fov, command.near ?? saved.current.near);
        break;
      }
      case 'restore': {
        const s = saved.current;
        if (s) fly(s.pos, s.target, 0.9, s.fov, s.near);
        saved.current = null;
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
      const ui = useUi.getState();
      if (ui.dialog) return;
      const k = e.key.toLowerCase();
      keys.current.add(k);
      const view = useView.getState();
      const sim = useSim.getState();
      const sel = ui.selected;
      switch (k) {
        case 't':
          view.send({ kind: 'top' });
          break;
        case 'c':
          ui.openDialog({ kind: 'cargo' });
          keys.current.clear();
          break;
        case 'm':
          if (sel?.kind === 'cargo') startMove(sel.id);
          break;
        case 'r':
          if (ui.placing) ui.rotatePlacing();
          break;
        case 'g':
          if (sel?.kind === 'truck' || sel?.kind === 'forklift') toggleHold(sel.id);
          break;
        case 'l':
          view.toggleLayers();
          break;
        case 'o':
          useLayers.getState().cycleOverlay();
          break;
        case 'n': {
          const layers = useLayers.getState();
          layers.set({ hour: layers.hour >= 19 || layers.hour < 6 ? 14.5 : 22, followClock: false });
          break;
        }
        case 'h':
          view.send({ kind: 'home' });
          break;
        case 'f':
          if (sel) focusEntity(sel);
          break;
        case 'escape':
          if (ui.placing) {
            cancelPlacing();
            break;
          }
          if (view.planner && !ui.selected) {
            view.closePlanner();
            break;
          }
          ui.select(null);
          view.setFollow(null);
          view.toggleHelp(false);
          view.toggleLayers(false);
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
      if (f.fromFov !== f.toFov) {
        camera.fov = f.fromFov + (f.toFov - f.fromFov) * e;
        camera.updateProjectionMatrix();
      }
      if (u >= 1) {
        if (camera.near !== f.near) {
          camera.near = f.near;
          camera.updateProjectionMatrix();
        }
        flight.current = null;
      }
    }
    // Low side views only in the planner; back to the yard limit once the camera has flown home.
    const polar = planner ? PLANNER_POLAR : flight.current ? controls.maxPolarAngle : YARD_POLAR;
    if (controls.maxPolarAngle !== polar) controls.maxPolarAngle = polar;

    cameraView.x = controls.target.x;
    cameraView.y = -controls.target.z;
    cameraView.yaw = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    cameraView.distance = camera.position.distanceTo(controls.target);
    // A clipped planner view must not cut into the truck when zoomed in.
    if (saved.current && !flight.current && camera.near > saved.current.near) {
      const most = Math.max(saved.current.near, cameraView.distance - 3.5);
      if (camera.near > most) {
        camera.near = most;
        camera.updateProjectionMatrix();
      }
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
