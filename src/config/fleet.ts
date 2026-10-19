import type { Carrier, Pose } from '../domain/types';
import { parkInBay, type TruckKind } from '../domain/vehicles';
import { heightAt, positionIndex } from '../domain/yard';
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
}

export interface ForkliftSpec {
  id: string;
  operator: string;
  model: string;
  status: string;
  /** Battery % at the start of the simulated shift. */
  battery: number;
  charger: string;
  /** Truck this forklift's shuttle loads, and the position it picks from. */
  serves?: string;
  pick?: string;
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

const positions = positionIndex(devYard);
const pos = (id: string) => {
  const p = positions.get(id);
  if (!p) throw new Error(`Unknown storage position ${id}`);
  return p;
};
const parked = (bayId: string, kind: TruckKind) => parkInBay(bayById(bayId), kind);

export const trucks: TruckSpec[] = [
  { id: 'TRUCK-102', driver: 'Murat Demir', capacity: 12, activity: 'loading', kind: 'rigid', carrier: 'docktor', plate: '34 DKT 102', status: 'Loading at L1', pose: parked('L1', 'rigid'), doorsOpen: true },
  { id: 'TRUCK-109', driver: 'Serkan Uçar', capacity: 12, activity: 'loading', kind: 'rigid', carrier: 'nordline', plate: '16 NRD 109', status: 'Loading at L3', pose: parked('L3', 'rigid'), doorsOpen: true },
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
    carrier: 'bluepeak',
    plate: '06 BLP 107',
    status: '',
    route: bayVisit(bayById('L4'), { period: 150, offset: 75, dwell: 28, inbound: false }),
  },
];

export const forklifts: ForkliftSpec[] = [
  {
    id: 'FL-01', pick: 'B16', battery: 82, charger: 'C1', serves: 'TRUCK-102',
    operator: 'Mert Yılmaz',
    model: 'Toyota 8FBE18',
    status: '',
    load: 'cartons',
    route: platformShuttle({ pick: pos('B16'), bay: bayById('L1'), truckId: 'TRUCK-102', laneY: 31.6 }),
  },
  {
    id: 'FL-02', pick: 'A05', battery: 71, charger: 'C2',
    operator: 'Elif Kaya',
    model: 'Linde E20',
    status: '',
    load: 'bag',
    route: rampShuttle({ pick: pos('A05'), laneY: 18.4, offset: 9 }),
  },
  { id: 'FL-03', battery: 66, charger: 'C1', operator: 'Can Demir', model: 'Jungheinrich EFG 216', status: 'Idle in Zone C', pose: { x: 60.2, y: 22, heading: Math.PI } },
  { id: 'FL-04', battery: 38, charger: 'C1', operator: '—', model: 'Toyota 8FBE18', status: 'Charging · C1', pose: { x: 62.2, y: 28.6, heading: Math.PI } },
  { id: 'FL-05', battery: 54, charger: 'C2', operator: '—', model: 'Linde E20', status: 'Charging · C2', pose: { x: 62.2, y: 31.2, heading: Math.PI } },
];

export const workers: WorkerSpec[] = [
  { id: 'W-01', name: 'Ali Şahin', role: 'Dock checker', vest: '#ff8a2a', route: walkLoop([[39, 30.2], [55, 30.2], [55, 31.2], [39, 31.2]], { status: 'Checking loading strip' }) },
  { id: 'W-02', name: 'Ayşe Çelik', role: 'Loading supervisor', vest: '#d4ef3c', pose: { x: 47.6, y: 28.3, heading: -Math.PI / 2 } },
  { id: 'W-03', name: 'Emre Polat', role: 'Gate officer', vest: '#d4ef3c', pose: { x: 51.8, y: 2.6, heading: Math.PI } },
  { id: 'W-04', name: 'Selin Koç', role: 'Inventory clerk', vest: '#ff8a2a', route: walkLoop([[3, 9.0], [16, 9.0], [16, 10.0], [3, 10.0]], { status: 'Counting Zone A', speed: 0.9 }) },
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
