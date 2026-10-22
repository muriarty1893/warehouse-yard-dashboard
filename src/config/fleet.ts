import type { Carrier, Pose, Vec2 } from '../domain/types';
import type { VehicleId } from '../loading/types';
import { parkInBay, type TruckKind } from '../domain/vehicles';
import { heightAt } from '../domain/yard';
import type { RouteSpec } from '../sim/route';
import { bayVisit, platformShuttle, rampShuttle, walkLoop } from '../sim/tasks';
import { bayById, devYard, road } from './devYard';

/**
 * Simulated vehicles and people for the dev yard (spec §44). Static ones sit
 * in a bay; scripted ones follow a route that is a pure function of time.
 */

export interface TruckSpec {
  id: string;
  kind: TruckKind;
  carrier: Carrier;
  plate: string;
  driver: string;
  status: string;
  /** What a parked truck is doing (scripted trucks get this from their route). */
  activity?: 'unloading' | 'loading' | 'waiting' | 'dropped';
  /** Pallet places. */
  capacity: number;
  pose?: Pose;
  route?: RouteSpec;
  doorsOpen?: boolean;
  containerColor?: string;
  /** Can be given a load plan (spec §1.1), and the body the planner starts from. */
  plannable?: boolean;
  body?: VehicleId;
}

export interface ForkliftSpec {
  id: string;
  operator: string;
  model: string;
  status: string;
  /** Battery % at the start of the simulated shift. */
  battery: number;
  charger: string;
  /** Truck this forklift's shuttle loads, and the floor spot it picks from. */
  serves?: string;
  pick?: Vec2;
  pose?: Pose;
  route?: RouteSpec;
  load?: 'cartons' | 'wrap-blue' | 'bag';
}

export interface WorkerSpec {
  id: string;
  name: string;
  role: string;
  vest: string;
  pose?: Pose;
  route?: RouteSpec;
}

export interface TrafficSpec {
  kind: 'car' | 'rigid' | 'semi';
  color: string;
  carrier?: Carrier;
  lane: 'westbound' | 'eastbound';
  speed: number;
  start: number;
}

export const parked = (bayId: string, kind: TruckKind) => parkInBay(bayById(bayId), kind);

/** Pallets the scripted forklifts keep picking (front of the platform band, edge of the open yard). */
export const PICKS = { platform: [33.0, 33.2] as Vec2, ground: [17.0, 20.6] as Vec2 };

export const trucks: TruckSpec[] = [
  { id: 'TRUCK-102', driver: 'Murat Demir', capacity: 12, activity: 'loading', kind: 'rigid', carrier: 'docktor', plate: '34 DKT 102', status: 'Loading at L1', pose: parked('L1', 'rigid'), doorsOpen: true, plannable: true, body: 'rigid-26' },
  { id: 'TRUCK-109', driver: 'Serkan Uçar', capacity: 12, activity: 'loading', kind: 'rigid', carrier: 'nordline', plate: '16 NRD 109', status: 'Loading at L4', pose: parked('L4', 'rigid'), doorsOpen: true, plannable: true, body: 'rigid-26' },
  { id: 'TRUCK-110', driver: 'Barış Tan', capacity: 12, activity: 'waiting', kind: 'rigid', carrier: 'bluepeak', plate: '06 BLP 110', status: 'Waiting for a bay · P2', pose: parked('P2', 'rigid'), plannable: true, body: 'rigid-26' },
  {
    id: 'TRUCK-104',
    driver: 'Cem Aksoy',
    capacity: 12,
    kind: 'rigid',
    carrier: 'cargoviva',
    plate: '35 CGV 104',
    status: '',
    route: bayVisit(bayById('L2'), { period: 150, offset: 0, dwell: 30, inbound: true }),
  },
  {
    id: 'TRUCK-107',
    driver: 'Eren Bulut',
    capacity: 12,
    kind: 'rigid',
    carrier: 'docktor',
    plate: '34 DKT 107',
    status: '',
    route: bayVisit(bayById('L3'), { period: 150, offset: 75, dwell: 28, inbound: false }),
  },
];

export const forklifts: ForkliftSpec[] = [
  {
    id: 'FL-01', pick: PICKS.platform, battery: 82, charger: 'C1', serves: 'TRUCK-102',
    operator: 'Mert Yılmaz',
    model: 'Toyota 8FBE18',
    status: '',
    load: 'cartons',
    route: platformShuttle({ pick: PICKS.platform, bay: bayById('L1'), truckId: 'TRUCK-102' }),
  },
  {
    id: 'FL-02', pick: PICKS.ground, battery: 71, charger: 'C2',
    operator: 'Elif Kaya',
    model: 'Linde E20',
    status: '',
    load: 'bag',
    route: rampShuttle({ pick: PICKS.ground, offset: 9 }),
  },
  { id: 'FL-03', battery: 66, charger: 'C1', operator: 'Can Demir', model: 'Jungheinrich EFG 216', status: 'Idle by the main building', pose: { x: 2.1, y: 29.5, heading: Math.PI / 2 } },
  { id: 'FL-04', battery: 38, charger: 'C1', operator: '—', model: 'Toyota 8FBE18', status: 'Charging · C1', pose: { x: 53.2, y: 29.9, heading: Math.PI / 2 } },
  { id: 'FL-05', battery: 54, charger: 'C2', operator: '—', model: 'Linde E20', status: 'Charging · C2', pose: { x: 55.6, y: 29.9, heading: Math.PI / 2 } },
];

export const workers: WorkerSpec[] = [
  { id: 'W-01', name: 'Ali Şahin', role: 'Dock checker', vest: '#ff8a2a', route: walkLoop([[41, 30.1], [51, 30.1], [51, 31.1], [41, 31.1]], { status: 'Checking loading strip' }) },
  { id: 'W-02', name: 'Ayşe Çelik', role: 'Loading supervisor', vest: '#d4ef3c', pose: { x: 48.5, y: 29.25, heading: -Math.PI / 2 } },
  { id: 'W-05', name: 'Deniz Kaya', role: 'Yard manager', vest: '#d4ef3c', pose: { x: 37.3, y: 29.25, heading: -Math.PI / 2 } },
  { id: 'W-03', name: 'Emre Polat', role: 'Gate officer', vest: '#d4ef3c', pose: { x: 51.3, y: 2.2, heading: Math.PI } },
  { id: 'W-04', name: 'Selin Koç', role: 'Inventory clerk', vest: '#ff8a2a', route: walkLoop([[3.5, 12.4], [15.5, 12.4], [15.5, 13.4], [3.5, 13.4]], { status: 'Counting the open yard', speed: 0.9 }) },
];

/** Floor height under every person / forklift comes from the yard (platform, ramp). */
export const groundAt = (x: number, y: number) => heightAt(devYard, x, y);

export const traffic: TrafficSpec[] = [
  { kind: 'car', color: '#e9edf5', lane: 'eastbound', speed: 12, start: 0 },
  { kind: 'semi', color: '#ffffff', carrier: 'bluepeak', lane: 'eastbound', speed: 10, start: 140 },
  { kind: 'car', color: '#2f5ff0', lane: 'eastbound', speed: 12.5, start: 310 },
  { kind: 'car', color: '#8d97ad', lane: 'eastbound', speed: 11.5, start: 450 },
  { kind: 'car', color: '#1d2b5a', lane: 'westbound', speed: 12, start: 60 },
  { kind: 'rigid', color: '#ffffff', carrier: 'cargoviva', lane: 'westbound', speed: 10, start: 260 },
  { kind: 'car', color: '#e9edf5', lane: 'westbound', speed: 13, start: 420 },
];

export const roadLength = road.x1 - road.x0;
