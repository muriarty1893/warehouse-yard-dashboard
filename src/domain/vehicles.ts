import type { Carrier, Pose, TruckBay } from './types';

export const CARRIER_NAMES: Record<Carrier, string> = {
  docktor: 'Docktor',
  nordline: 'Nordline',
  cargoviva: 'Cargoviva',
  bluepeak: 'Bluepeak',
};

/**
 * Vehicle reference geometry shared by the 3D models and the motion scripts.
 * Origins: rigid truck = rear axle center; semi = fifth wheel (kingpin);
 * forklift = body center. +x is forward.
 */
export const RIGID = { rear: 3.4, front: 7.1, width: 2.55 };
export const SEMI = { trailerRear: 12.7, cabFront: 5.1, width: 2.55, trailerLag: 9.5 };
export const FORKLIFT = { carryOffset: 1.45 };

export type TruckKind = 'rigid' | 'semi' | 'trailer' | 'container';

/** Where a truck's origin sits when parked in a bay with its rear at the bay's back edge. */
export function parkInBay(bay: TruckBay, kind: TruckKind, clearance = 0.25): Pose {
  const dx = Math.cos(bay.heading);
  const dy = Math.sin(bay.heading);
  const rearX = bay.center[0] - (dx * bay.length) / 2;
  const rearY = bay.center[1] - (dy * bay.length) / 2;
  const back = (kind === 'rigid' ? RIGID.rear : SEMI.trailerRear) + clearance;
  return { x: rearX + dx * back, y: rearY + dy * back, heading: bay.heading };
}

/** The bay's back edge (dock face / rear stop bar). */
export function bayRear(bay: TruckBay): [number, number] {
  return [
    bay.center[0] - (Math.cos(bay.heading) * bay.length) / 2,
    bay.center[1] - (Math.sin(bay.heading) * bay.length) / 2,
  ];
}
