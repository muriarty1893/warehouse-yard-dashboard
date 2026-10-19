import type { Carrier, Pose } from '../domain/types';
import { parkInBay, type TruckKind } from '../domain/vehicles';
import { positionIndex } from '../domain/yard';
import type { RouteSpec } from '../sim/route';
import { dockVisit, forkliftShuttle, loadingVisit, walkLoop } from '../sim/tasks';
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
  { id: 'TRUCK-101', driver: 'Kemal Arslan', capacity: 26, activity: 'unloading', kind: 'semi', carrier: 'docktor', plate: '34 DKT 101', status: 'Unloading at DK-01', pose: parked('DK-01', 'semi'), doorsOpen: true },
  { id: 'TRUCK-105', driver: 'Hakan Yıldız', capacity: 26, activity: 'loading', kind: 'semi', carrier: 'bluepeak', plate: '06 BLP 205', status: 'Loading at DK-05', pose: parked('DK-05', 'semi'), doorsOpen: true },
  { id: 'TRL-0612', driver: '—', capacity: 26, activity: 'dropped', kind: 'trailer', carrier: 'nordline', plate: 'TRL 0612', status: 'Dropped trailer · DK-06', pose: parked('DK-06', 'trailer'), doorsOpen: true },
  { id: 'TRUCK-108', driver: 'Ozan Kılıç', capacity: 12, activity: 'loading', kind: 'rigid', carrier: 'cargoviva', plate: '35 CGV 108', status: 'Loading at L1', pose: parked('L1', 'rigid'), doorsOpen: true },
  { id: 'TRUCK-109', driver: 'Serkan Uçar', capacity: 12, activity: 'loading', kind: 'rigid', carrier: 'nordline', plate: '16 NRD 109', status: 'Loading at L2', pose: parked('L2', 'rigid'), doorsOpen: true },
  { id: 'TRUCK-102', driver: 'Murat Demir', capacity: 12, activity: 'loading', kind: 'rigid', carrier: 'docktor', plate: '34 DKT 102', status: 'Loading at L3', pose: parked('L3', 'rigid'), doorsOpen: true },
  { id: 'TRL-0388', driver: '—', capacity: 26, activity: 'waiting', kind: 'trailer', carrier: 'bluepeak', plate: 'TRL 0388', status: 'Waiting in staging', pose: parked('TS-1', 'trailer') },
  { id: 'TRUCK-111', driver: 'Levent Şen', capacity: 26, activity: 'waiting', kind: 'semi', carrier: 'cargoviva', plate: '35 CGV 111', status: 'Waiting for dock', pose: parked('TS-2', 'semi') },
  { id: 'TRUCK-112', driver: 'Tolga Er', capacity: 1, activity: 'waiting', kind: 'container', carrier: 'docktor', plate: '34 DKT 112', status: 'Container pickup', pose: parked('TS-4', 'container'), containerColor: '#17a99a' },
  { id: 'TRUCK-110', driver: 'Barış Tan', capacity: 12, activity: 'waiting', kind: 'rigid', carrier: 'docktor', plate: '34 DKT 110', status: 'Waiting for L4', pose: parked('TS-6', 'rigid') },
  {
    id: 'TRUCK-104', driver: 'Cem Aksoy', capacity: 26,
    kind: 'semi',
    carrier: 'nordline',
    plate: '16 NRD 104',
    status: '',
    route: dockVisit(bayById('DK-03'), { period: 180, offset: 0, dwell: 30 }),
  },
  {
    id: 'TRUCK-107', driver: 'Eren Bulut', capacity: 12,
    kind: 'rigid',
    carrier: 'bluepeak',
    plate: '06 BLP 107',
    status: '',
    route: loadingVisit(bayById('L4'), { period: 180, offset: 95, dwell: 28, apronX: 97 }),
  },
];

export const forklifts: ForkliftSpec[] = [
  {
    id: 'FL-01', pick: 'A43', battery: 82, charger: 'C1', serves: 'TRUCK-102',
    operator: 'Mert Yılmaz',
    model: 'Toyota 8FBE18',
    status: '',
    load: 'cartons',
    route: forkliftShuttle({ pick: pos('A43'), bay: bayById('L3'), truckId: 'TRUCK-102', laneY: 29.8, apronX: 99 }),
  },
  {
    id: 'FL-02', pick: 'C05', battery: 71, charger: 'C2', serves: 'TRUCK-108',
    operator: 'Elif Kaya',
    model: 'Linde E20',
    status: '',
    load: 'wrap-blue',
    route: forkliftShuttle({ pick: pos('C05'), bay: bayById('L1'), truckId: 'TRUCK-108', laneY: 28.2, apronX: 101.5, offset: 11 }),
  },
  {
    id: 'FL-03', pick: 'B45', battery: 93, charger: 'C3', serves: 'TRUCK-109',
    operator: 'Can Demir',
    model: 'Jungheinrich EFG 216',
    status: '',
    load: 'bag',
    route: forkliftShuttle({ pick: pos('B45'), bay: bayById('L2'), truckId: 'TRUCK-109', laneY: 31, apronX: 100.2, offset: 23 }),
  },
  { id: 'FL-04', battery: 38, charger: 'C1', operator: '—', model: 'Toyota 8FBE18', status: 'Charging · C1', pose: { x: 85, y: 92, heading: Math.PI } },
  { id: 'FL-05', battery: 54, charger: 'C2', operator: '—', model: 'Linde E20', status: 'Charging · C2', pose: { x: 85, y: 96.5, heading: Math.PI } },
  { id: 'FL-06', battery: 66, charger: 'C3', operator: 'Zeynep Arslan', model: 'Toyota 8FBE18', status: 'Idle at DK-02', pose: { x: 26.5, y: 82, heading: -Math.PI / 2 } },
];

export const workers: WorkerSpec[] = [
  { id: 'W-01', name: 'Ali Şahin', role: 'Gate officer', vest: '#ff8a2a', route: walkLoop([[57.4, 20], [57.4, 42], [58.6, 42], [58.6, 3], [57.4, 3]], { status: 'Walking to court' }) },
  { id: 'W-02', name: 'Ayşe Çelik', role: 'Loading supervisor', vest: '#d4ef3c', pose: { x: 96.6, y: 18.6, heading: Math.PI } },
  { id: 'W-03', name: 'Burak Öz', role: 'Dock operator', vest: '#ff8a2a', pose: { x: 19.6, y: 68, heading: Math.PI / 2 } },
  { id: 'W-04', name: 'Deniz Aydın', role: 'Yard checker', vest: '#d4ef3c', route: walkLoop([[3, 60], [3, 90], [4.1, 90], [4.1, 50], [3, 50]], { status: 'Patrolling west walkway', offset: 9 }) },
  { id: 'W-05', name: 'Selin Koç', role: 'Inventory clerk', vest: '#ff8a2a', route: walkLoop([[108, 45.3], [128, 45.3], [128, 46.3], [108, 46.3]], { status: 'Counting Zone A', speed: 0.9 }) },
  { id: 'W-06', name: 'Emre Polat', role: 'Gate officer', vest: '#d4ef3c', pose: { x: 59.4, y: 3.3, heading: -Math.PI / 2 } },
];

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
