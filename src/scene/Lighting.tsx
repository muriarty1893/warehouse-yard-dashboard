import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { settings } from '../settings';
import { clock } from '../sim/clock';
import { useLayers } from '../state/layers';
import { yardSeconds } from '../world/time';
import { YARD_CENTER } from './CameraRig';
import { glows, palette, poolMaterial } from './kit';

/**
 * Sun, sky and night lighting for an hour of the day: the sun swings from
 * east to west, the light warms at dawn/dusk, and after dark a dim moon takes
 * over while lamps, windows and vehicle lights glow. No real point lights —
 * glow is emissive materials plus additive light pools, cheap enough for an
 * integrated GPU.
 */

const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export interface Sky {
  /** 0 at night … 1 in full daylight. */
  day: number;
  /** Warm low-sun tint, 0 … 1. */
  golden: number;
  sunDir: THREE.Vector3;
}

export function skyAt(hour: number, out: Sky): Sky {
  out.day = smooth(5.6, 7.4, hour) * (1 - smooth(18.6, 20.4, hour));
  out.golden = Math.max(smooth(5.6, 6.6, hour) * (1 - smooth(7, 9, hour)), smooth(16.5, 18.8, hour) * (1 - smooth(19.4, 20.6, hour)));
  const phi = (Math.PI * (THREE.MathUtils.clamp(hour, 5.5, 20.5) - 6)) / 13;
  const el = Math.max(0.12, Math.sin(phi)) * 1.0;
  // Yard x = east, world +z = south: the sun rises east, passes south, sets west.
  out.sunDir.set(Math.cos(phi) * Math.cos(el), Math.sin(el), Math.max(0.15, Math.sin(phi)) * Math.cos(el)).normalize();
  return out;
}

const C = (hex: string) => new THREE.Color(hex);
const DAY_BG = C(palette.background);
const DUSK_BG = C('#f0d2bd');
const NIGHT_BG = C('#101a36');
const SUN_DAY = C('#fffaf0');
const SUN_LOW = C('#ffb877');

export const hourNow = () => (yardSeconds(clock.t) / 3600) % 24;

export function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const moon = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const scene = useThree((s) => s.scene);
  const sky = useMemo<Sky>(() => ({ day: 1, golden: 0, sunDir: new THREE.Vector3() }), []);
  const last = useRef(-1);
  const bg = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const light = sun.current;
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
    if (moon.current) {
      moon.current.target.position.set(...YARD_CENTER);
      moon.current.target.updateMatrixWorld();
    }
  }, []);

  useFrame(() => {
    const { followClock, hour: manual } = useLayers.getState();
    const hour = followClock ? hourNow() : manual;
    if (Math.abs(hour - last.current) < 0.005) return;
    last.current = hour;
    skyAt(hour, sky);
    const night = 1 - sky.day;

    if (sun.current) {
      sun.current.position.set(YARD_CENTER[0], 0, YARD_CENTER[2]).addScaledVector(sky.sunDir, 220);
      sun.current.intensity = 3.4 * sky.day;
      sun.current.color.copy(SUN_DAY).lerp(SUN_LOW, sky.golden * 0.85);
    }
    if (moon.current) moon.current.intensity = 0.55 * night;
    if (hemi.current) {
      hemi.current.intensity = 0.9 - 0.5 * night;
      hemi.current.color.set('#ffffff').lerp(C('#6f86c8'), night);
      hemi.current.groundColor.set('#b9c2da').lerp(C('#1d2645'), night);
    }
    bg.copy(NIGHT_BG).lerp(DAY_BG, sky.day).lerp(DUSK_BG, sky.golden * 0.45 * sky.day);
    if (scene.background instanceof THREE.Color) scene.background.copy(bg);
    if (scene.fog) scene.fog.color.copy(bg);
    scene.environmentIntensity = 0.03 + 0.09 * sky.day;

    const glow = smooth(0.25, 0.85, night);
    for (const g of glows) g.material.emissiveIntensity = g.day + (g.night - g.day) * glow;
    poolMaterial().opacity = glow * 0.85;
    poolMaterial().visible = glow > 0.01;
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffffff', '#b9c2da', 0.9]} />
      <directionalLight
        ref={sun}
        intensity={3.4}
        color="#fffaf0"
        castShadow={settings.shadowMap > 0}
        shadow-mapSize={[settings.shadowMap, settings.shadowMap]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
        shadow-radius={3}
      />
      <directionalLight ref={moon} position={[YARD_CENTER[0] + 60, 160, YARD_CENTER[2] - 40]} intensity={0} color="#a9bcff" />
    </>
  );
}
