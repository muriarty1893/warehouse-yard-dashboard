import type { AxleId, VehicleId, VehicleSpec } from './types';

/**
 * Vehicle presets (spec §1.3): typical EU figures, kept in one table so they
 * can become editable later. `rigid-26` is the body of the yard's own trucks
 * and matches the rigid truck model in the scene.
 */

const TRACTOR = { steerAhead: 3.6, driveBehind: 0.65 };
const TRAILER_AXLES = [-9.0, -10.3, -11.6];

export const VEHICLES: Record<VehicleId, VehicleSpec> = {
  'rigid-12': {
    id: 'rigid-12',
    label: 'Rigid 12 t box',
    axleCount: 2,
    inner: { l: 6.2, w: 2.45, h: 2.4 },
    deck: 1.05,
    axles: [
      { id: 'front', label: 'Front axle', tareKg: 3600, ratingKg: 4600 },
      { id: 'rear', label: 'Rear axle', tareKg: 2400, ratingKg: 8000 },
    ],
    statics: { kind: 'rigid', front: -1.0, rear: 3.9 },
    gvwKg: 12000,
    payloadKg: 6000,
    minSteerShare: 0.2,
    overallLength: 8.6,
    model: { kind: 'rigid', frontWall: 3.9, doorsToOrigin: 2.4, rearAxles: [0], frontAxle: 4.9 },
  },
  'rigid-18': {
    id: 'rigid-18',
    label: 'Rigid 18 t box',
    axleCount: 2,
    inner: { l: 7.3, w: 2.48, h: 2.5 },
    deck: 1.15,
    axles: [
      { id: 'front', label: 'Front axle', tareKg: 4600, ratingKg: 7500 },
      { id: 'rear', label: 'Rear axle', tareKg: 3700, ratingKg: 11500 },
    ],
    statics: { kind: 'rigid', front: -1.2, rear: 4.6 },
    gvwKg: 18000,
    payloadKg: 9700,
    minSteerShare: 0.2,
    overallLength: 9.9,
    model: { kind: 'rigid', frontWall: 4.6, doorsToOrigin: 2.8, rearAxles: [0], frontAxle: 5.8 },
  },
  'rigid-26': {
    id: 'rigid-26',
    label: 'Rigid 26 t box, 3 axles',
    axleCount: 3,
    inner: { l: 7.5, w: 2.45, h: 2.65 },
    deck: 1.1,
    axles: [
      { id: 'front', label: 'Front axle', tareKg: 5900, ratingKg: 9000 },
      { id: 'rear', label: 'Rear tandem', tareKg: 5300, ratingKg: 19000 },
    ],
    statics: { kind: 'rigid', front: -1.1, rear: 4.85 },
    gvwKg: 26000,
    payloadKg: 14800,
    minSteerShare: 0.2,
    overallLength: 10.5,
    model: { kind: 'rigid', frontWall: 4.2, doorsToOrigin: 3.4, rearAxles: [0, -1.3], frontAxle: 5.3 },
  },
  'semi-136': {
    id: 'semi-136',
    label: 'Semi-trailer 13.6 m',
    axleCount: 6,
    inner: { l: 13.6, w: 2.48, h: 2.7 },
    deck: 1.2,
    axles: [
      { id: 'steer', label: 'Steer axle', tareKg: 5600, ratingKg: 8000 },
      { id: 'drive', label: 'Drive tandem', tareKg: 2800, ratingKg: 19000 },
      { id: 'trailer', label: 'Trailer axles', tareKg: 4600, ratingKg: 24000 },
    ],
    statics: { kind: 'artic', kingpin: 0.8, trailer: 11.1, ...TRACTOR, kingpinTareKg: 2400 },
    gvwKg: 40000,
    payloadKg: 24600,
    minSteerShare: 0.2,
    overallLength: 16.5,
    model: { kind: 'semi', frontWall: 0.8, doorsToOrigin: 12.7, rearAxles: TRAILER_AXLES, frontAxle: 3.6 },
  },
  'container-40': {
    id: 'container-40',
    label: '40 ft container on chassis',
    axleCount: 6,
    inner: { l: 12.03, w: 2.35, h: 2.39 },
    deck: 1.4,
    axles: [
      { id: 'steer', label: 'Steer axle', tareKg: 5600, ratingKg: 8000 },
      { id: 'drive', label: 'Drive tandem', tareKg: 2800, ratingKg: 19000 },
      { id: 'trailer', label: 'Chassis axles', tareKg: 5800, ratingKg: 24000 },
    ],
    statics: { kind: 'artic', kingpin: 0.1, trailer: 10.2, ...TRACTOR, kingpinTareKg: 2500 },
    gvwKg: 40000,
    payloadKg: 23300,
    minSteerShare: 0.2,
    overallLength: 16.5,
    model: { kind: 'container', frontWall: 0.1, doorsToOrigin: 12.25, rearAxles: TRAILER_AXLES, frontAxle: 3.6 },
  },
};

export const vehicleById = (id: VehicleId): VehicleSpec => VEHICLES[id];

export interface AxleCoefficient {
  id: AxleId;
  label: string;
  tareKg: number;
  ratingKg: number;
  a: number;
  b: number;
}

/**
 * Axle loads are linear in the payload: load = tare + P·(a + b·x) for a
 * payload P with its centre of gravity at box-frame x (spec §1.4).
 */
export function axleCoefficients(v: VehicleSpec): AxleCoefficient[] {
  const spec = (id: AxleId) => {
    const a = v.axles.find((x) => x.id === id);
    if (!a) throw new Error(`${v.id} has no ${id} axle`);
    return a;
  };
  const s = v.statics;
  if (s.kind === 'rigid') {
    const wb = s.rear - s.front;
    return [
      { ...spec('front'), a: s.rear / wb, b: -1 / wb },
      { ...spec('rear'), a: -s.front / wb, b: 1 / wb },
    ];
  }
  const span = s.trailer - s.kingpin;
  // Share of the kingpin load the steer axle takes through the fifth-wheel lever.
  const fs = s.driveBehind / (s.steerAhead + s.driveBehind);
  const ak = s.trailer / span;
  const bk = -1 / span;
  const steer = spec('steer');
  const drive = spec('drive');
  return [
    { ...steer, tareKg: steer.tareKg + fs * s.kingpinTareKg, a: fs * ak, b: fs * bk },
    { ...drive, tareKg: drive.tareKg + (1 - fs) * s.kingpinTareKg, a: (1 - fs) * ak, b: (1 - fs) * bk },
    { ...spec('trailer'), a: -s.kingpin / span, b: 1 / span },
  ];
}
