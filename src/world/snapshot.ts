import { devYard } from '../config/devYard';
import { forklifts, trucks, workers, type TruckSpec } from '../config/fleet';
import { hashString, seedCargo } from '../domain/seed';
import type { BayKind, Rect, TruckBay } from '../domain/types';
import { CARRIER_NAMES, parkInBay } from '../domain/vehicles';
import { allPositions, positionIndex } from '../domain/yard';
import { compileRoute, evalRoute, newPose, type CompiledRoute, type RoutePose } from '../sim/route';
import { fmtClock, fmtDuration } from './time';

/**
 * World State snapshot (spec §19): the system's current understanding of the
 * yard, derived from the simulation clock. The dashboard reads only this; the
 * 3D twin reads the same sources, so both always agree.
 */

export const yard = devYard;
export const cargo = seedCargo(devYard);
export const positions = positionIndex(devYard);

export type TruckStatus = 'scheduled' | 'en-route' | 'at-gate' | 'docking' | 'loading' | 'unloading' | 'departing' | 'departed' | 'waiting' | 'dropped';
export type ForkliftStatus = 'picking' | 'carrying' | 'loading' | 'returning' | 'charging' | 'idle';
export type BayStatus = 'available' | 'docking' | 'loading' | 'unloading' | 'waiting' | 'dropped';

export interface Progress {
  done: number;
  total: number;
}

export interface ShipmentStep {
  label: string;
  state: 'done' | 'active' | 'pending';
  time: string;
  eta: boolean;
}

export interface Shipment {
  id: string;
  direction: 'inbound' | 'outbound';
  customer: string;
  /** Destination (outbound) or origin (inbound). */
  place: string;
  pallets: number;
  weightT: number;
}

export interface TruckState {
  id: string;
  carrier: string;
  kind: TruckSpec['kind'];
  plate: string;
  driver: string;
  status: TruckStatus;
  detail: string;
  onSite: boolean;
  x: number;
  y: number;
  bayId: string | null;
  where: string;
  speedKmh: number;
  progress: Progress | null;
  /** Simulated seconds until the current activity ends (or arrival). */
  etaSec: number | null;
  shipment: Shipment;
  steps: ShipmentStep[];
  scripted: boolean;
}

export interface ForkliftState {
  id: string;
  operator: string;
  model: string;
  status: ForkliftStatus;
  detail: string;
  battery: number;
  carrying: string | null;
  movesToday: number;
  speedKmh: number;
  charger: string;
  where: string;
  x: number;
  y: number;
}

export interface WorkerState {
  id: string;
  name: string;
  role: string;
  moving: boolean;
  where: string;
  x: number;
  y: number;
}

export interface BayState {
  id: string;
  kind: BayKind;
  truckId: string | null;
  carrier: string | null;
  status: BayStatus;
  progress: Progress | null;
  x: number;
  y: number;
}

export interface ZoneState {
  id: string;
  name: string;
  kind: string;
  color: string;
  used: number;
  total: number;
  units: number;
}

export interface Alert {
  id: string;
  level: 'info' | 'warn';
  text: string;
}

export interface Kpis {
  cargo: number;
  cargoDelta: number;
  trucksOnSite: number;
  arrivalsToday: number;
  inbound: number;
  storagePct: number;
  positionsUsed: number;
  positionsTotal: number;
  departuresToday: number;
  docksBusy: number;
  docksTotal: number;
  baysBusy: number;
  baysTotal: number;
  staged: number;
  forkliftsWorking: number;
  forkliftsTotal: number;
}

export interface WorldSnapshot {
  t: number;
  clock: string;
  trucks: TruckState[];
  forklifts: ForkliftState[];
  workers: WorkerState[];
  bays: BayState[];
  zones: ZoneState[];
  kpis: Kpis;
  alerts: Alert[];
}

// ---------------------------------------------------------------------------
// Static lookups

const inRect = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

const AREA_NAMES: Record<string, string> = {
  'FK-APRON': 'Forklift apron',
  'FK-CORRIDOR': 'Forklift corridor',
  'FK-AISLE-N': 'Forklift aisle',
  'FK-AISLE-S': 'Forklift aisle',
  'R-CHARGE': 'Charging area',
  'R-FUEL': 'Fuel area',
  'LANE-MAIN': 'Main lane',
  'LANE-CIRC': 'Circulation lane',
  'WALK-GATE': 'Gate walkway',
  'WALK-WEST': 'West walkway',
  'WALK-SOUTH': 'Walkway',
  'WALK-DOOR': 'Walkway',
};

function insideBoundary(x: number, y: number) {
  const b = yard.boundary;
  let inside = false;
  for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
    const [xi, yi] = b[i];
    const [xj, yj] = b[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Human name of the place a point is in. */
export function whereIs(x: number, y: number): string {
  for (const bay of yard.bays) {
    const along = (x - bay.center[0]) * Math.cos(bay.heading) + (y - bay.center[1]) * Math.sin(bay.heading);
    const across = -(x - bay.center[0]) * Math.sin(bay.heading) + (y - bay.center[1]) * Math.cos(bay.heading);
    if (Math.abs(along) <= bay.length / 2 && Math.abs(across) <= bay.width / 2) return bay.id;
  }
  for (const z of yard.zones) if (inRect(z.rect, x, y)) return z.name;
  for (const a of yard.areas) if (inRect(a.rect, x, y) && AREA_NAMES[a.id]) return AREA_NAMES[a.id];
  for (const b of yard.buildings) if (inRect(b.rect, x, y)) return b.name;
  if (!insideBoundary(x, y)) return y < 0 ? 'Public road' : 'Outside yard';
  return y > 47 && x < 90 ? 'Truck court' : 'Yard';
}

function bayAt(x: number, y: number, kind: TruckSpec['kind']): TruckBay | null {
  for (const bay of yard.bays) {
    const p = parkInBay(bay, kind);
    if (Math.hypot(p.x - x, p.y - y) < 1.5) return bay;
  }
  return null;
}

const CUSTOMERS = ['Anadolu Market', 'Ege Seramik', 'Konya Tarım', 'Marmara Elektrik', 'Kapadokya Mobilya', 'Akdeniz Gıda', 'Bursa Tekstil', 'Karadeniz Lojistik'];
const CITIES = ['Ankara', 'İzmir', 'Bursa', 'Konya', 'Adana', 'Antalya', 'Kayseri', 'Samsun', 'Eskişehir', 'Gaziantep'];

interface TruckModel {
  spec: TruckSpec;
  route: CompiledRoute | null;
  bay: TruckBay | null;
  shipment: Shipment;
  /** Pallets already done when the shift starts (parked trucks). */
  base: number;
  /** Seconds per pallet for parked trucks without a forklift shuttle. */
  pace: number;
  travelSec: number;
}

function shipmentFor(spec: TruckSpec, inbound: boolean): Shipment {
  const h = hashString(spec.id);
  const pallets = Math.max(1, Math.min(spec.capacity, Math.round(spec.capacity * (0.5 + ((h >>> 4) % 50) / 100))));
  return {
    id: `#SHP-${78400 + (h % 600)}`,
    direction: inbound ? 'inbound' : 'outbound',
    customer: CUSTOMERS[h % CUSTOMERS.length],
    place: CITIES[(h >>> 3) % CITIES.length],
    pallets,
    weightT: Math.round(pallets * (0.45 + ((h >>> 6) % 30) / 100) * 10) / 10,
  };
}

const truckModels: TruckModel[] = trucks.map((spec) => {
  const route = spec.route ? compileRoute(spec.route) : null;
  let bay: TruckBay | null = null;
  if (route) {
    const work = route.legs.find((l) => l.leg.phase === 'working');
    if (work && work.kind === 'wait') bay = bayAt(work.hold.x, work.hold.y, spec.kind);
  } else if (spec.pose) {
    bay = bayAt(spec.pose.x, spec.pose.y, spec.kind);
  }
  const unloading = spec.activity === 'unloading' || (bay?.kind === 'dock' && !!route);
  const h = hashString(spec.id);
  return {
    spec,
    route,
    bay,
    shipment: shipmentFor(spec, unloading),
    base: 1 + (h % 4),
    pace: 18 + (h % 10),
    travelSec: 600 + (h % 900),
  };
});

const forkliftModels = forklifts.map((spec) => ({ spec, route: spec.route ? compileRoute(spec.route) : null, base: 10 + (hashString(spec.id) % 18) }));
const workerModels = workers.map((spec) => ({ spec, route: spec.route ? compileRoute(spec.route) : null }));

const tmp = newPose();
const tmpPrev = newPose();

function speedOf(route: CompiledRoute, t: number, pose: RoutePose) {
  evalRoute(route, t - 0.25, tmpPrev);
  if (!tmpPrev.visible) return 0;
  return (Math.hypot(pose.x - tmpPrev.x, pose.y - tmpPrev.y) / 0.25) * 3.6;
}

/** Completed loops of a looping route at time t. */
const cyclesDone = (route: CompiledRoute, t: number) => Math.max(0, Math.floor((t - (route.spec.offset ?? 0)) / route.period));

const forkliftOf = (truckId: string) => forkliftModels.find((f) => f.spec.serves === truckId && f.route);

function steps(labels: string[], times: number[], current: number, t: number): ShipmentStep[] {
  return labels.map((label, i) => ({
    label,
    state: i < current ? 'done' : i === current ? 'active' : 'pending',
    time: fmtClock(times[i]),
    eta: times[i] > t,
  }));
}

// ---------------------------------------------------------------------------

function truckState(m: TruckModel, t: number): TruckState {
  const { spec, route, bay, shipment } = m;
  const verb = shipment.direction === 'inbound' ? 'Unloading' : 'Loading';
  const base: Omit<TruckState, 'status' | 'detail' | 'onSite' | 'x' | 'y' | 'where' | 'speedKmh' | 'progress' | 'etaSec' | 'steps'> = {
    id: spec.id,
    carrier: CARRIER_NAMES[spec.carrier],
    kind: spec.kind,
    plate: spec.plate,
    driver: spec.driver,
    bayId: bay?.id ?? null,
    shipment,
    scripted: !!route,
  };
  const labels = ['Checked in', `At ${bay?.id ?? 'bay'}`, verb, 'Departed', shipment.direction === 'inbound' ? 'Released' : 'Delivered'];

  if (route) {
    const pose = evalRoute(route, t, tmp);
    const start = t - pose.local;
    const legStart = (i: number) => start + route.legs[i].t0;
    const legEnd = (i: number) => legStart(i) + route.legs[i].duration;
    const gateIn = route.legs.findIndex((l) => l.leg.phase === 'gate');
    const work = route.legs.findIndex((l) => l.leg.phase === 'working');
    const gateOut = route.legs.length - 2;
    const nextStart = pose.visible ? start : t + pose.untilStart;
    const shift = nextStart - start;
    const times = [legStart(gateIn) + shift, legStart(work) + shift, legEnd(work) + shift, legEnd(gateOut) + shift, legEnd(gateOut) + shift + m.travelSec];
    const total = shipment.pallets;

    if (!pose.visible || pose.phase === 'arriving' || pose.phase === 'departed') {
      const leaving = pose.visible && pose.phase === 'departed';
      const eta = leaving ? null : (pose.visible ? legEnd(0) : t + pose.untilStart + route.legs[0].duration) - t;
      return {
        ...base,
        status: leaving ? 'departed' : pose.visible ? 'en-route' : 'scheduled',
        detail: leaving ? `Departed · to ${shipment.place}` : `Arriving at Gate 1 in ${fmtDuration(eta ?? 0)}`,
        onSite: false,
        x: pose.x,
        y: pose.y,
        where: pose.visible ? 'Public road' : 'Off site',
        speedKmh: pose.visible ? speedOf(route, t, pose) : 0,
        progress: leaving ? { done: total, total } : null,
        etaSec: eta,
        steps: steps(labels, times, leaving ? 4 : 0, t),
      };
    }
    const working = pose.phase === 'working';
    const done = working ? Math.min(total, Math.floor(pose.legT * (total + 1))) : pose.leg > work ? total : 0;
    const status: TruckStatus =
      pose.phase === 'gate' ? 'at-gate' : pose.phase === 'docking' ? 'docking' : working ? (shipment.direction === 'inbound' ? 'unloading' : 'loading') : 'departing';
    const current = pose.leg < work ? (pose.leg <= gateIn ? 0 : 1) : working ? 2 : 3;
    const etaSec = working ? legEnd(work) - t : pose.leg < work ? legStart(work) - t : null;
    return {
      ...base,
      status,
      detail:
        status === 'at-gate'
          ? pose.leg <= gateIn
            ? 'Checking in at Gate 1'
            : 'Checking out at Gate 1'
          : status === 'docking'
            ? `Docking at ${bay?.id}`
            : working
              ? `${bay?.id} · ${done}/${total} pallets`
              : 'Leaving the yard',
      onSite: true,
      x: pose.x,
      y: pose.y,
      where: whereIs(pose.x, pose.y),
      speedKmh: speedOf(route, t, pose),
      progress: working || pose.leg > work ? { done, total } : null,
      etaSec,
      steps: steps(labels, times, current, t),
    };
  }

  // Parked trucks.
  const pose = spec.pose ?? { x: 0, y: 0, heading: 0 };
  const total = shipment.pallets;
  let status: TruckStatus = 'waiting';
  let progress: Progress | null = null;
  let etaSec: number | null = null;
  let detail = spec.status;
  let current = 1;
  if (spec.activity === 'loading' || spec.activity === 'unloading') {
    const fl = forkliftOf(spec.id);
    const pace = fl?.route ? fl.route.period : m.pace;
    const done = (m.base + (fl?.route ? cyclesDone(fl.route, t) : Math.floor(t / pace))) % (total + 1);
    progress = { done, total };
    status = spec.activity;
    etaSec = (total - done) * pace;
    detail = `${bay?.id} · ${done}/${total} pallets`;
    current = 2;
  } else if (spec.activity === 'dropped') {
    status = 'dropped';
  }
  // Parked trucks checked in before the simulated shift started.
  const checkedIn = -30 - m.base * 25;
  const workDone = t + (etaSec ?? 120);
  const times = [checkedIn, checkedIn + 30, workDone, workDone + 30, workDone + 30 + m.travelSec];
  return {
    ...base,
    status,
    detail,
    onSite: true,
    x: pose.x,
    y: pose.y,
    where: bay?.id ?? whereIs(pose.x, pose.y),
    speedKmh: 0,
    progress,
    etaSec,
    steps: steps(labels, times, current, t),
  };
}

function forkliftState(m: (typeof forkliftModels)[number], t: number): ForkliftState {
  const { spec, route } = m;
  const common = { id: spec.id, operator: spec.operator, model: spec.model, charger: spec.charger };
  if (!route) {
    const p = spec.pose ?? { x: 0, y: 0, heading: 0 };
    const charging = spec.status.startsWith('Charging');
    const battery = charging ? Math.min(100, spec.battery + t * 0.04) : Math.max(15, spec.battery - t * 0.002);
    return {
      ...common,
      status: charging ? 'charging' : 'idle',
      detail: spec.status,
      battery,
      carrying: null,
      movesToday: m.base,
      speedKmh: 0,
      where: whereIs(p.x, p.y),
      x: p.x,
      y: p.y,
    };
  }
  const pose = evalRoute(route, t, tmp);
  const cycles = cyclesDone(route, t);
  const truck = spec.serves ?? 'truck';
  const bay = truckModels.find((tm) => tm.spec.id === spec.serves)?.bay?.id ?? '';
  const statusMap: Record<string, ForkliftStatus> = { picking: 'picking', carrying: 'carrying', working: 'loading', returning: 'returning' };
  const status = statusMap[pose.phase ?? ''] ?? 'returning';
  const detail =
    status === 'picking' ? `Picking at ${spec.pick}` : status === 'carrying' ? `To ${bay} · ${truck}` : status === 'loading' ? `Loading ${truck} at ${bay}` : 'Returning to pick';
  const top = cargo.filter((c) => c.positionId === spec.pick).sort((a, b) => b.stackLevel - a.stackLevel)[0];
  return {
    ...common,
    status,
    detail,
    battery: Math.max(15, spec.battery - t * 0.012),
    carrying: pose.carry ? (top?.id ?? 'Pallet') : null,
    movesToday: m.base + cycles * 2 + (pose.leg >= 2 ? 1 : 0),
    speedKmh: speedOf(route, t, pose),
    where: whereIs(pose.x, pose.y),
    x: pose.x,
    y: pose.y,
  };
}

const allSlots = allPositions(yard);

function zoneStates(): ZoneState[] {
  const usedSlots = new Set(cargo.map((c) => c.positionId));
  return yard.zones
    .filter((z) => z.grid)
    .map((z) => {
      const slots = allSlots.filter((p) => p.zoneId === z.id);
      return {
        id: z.id,
        name: z.name,
        kind: z.kind === 'container' ? 'Containers' : z.id === 'A' ? 'Palletized goods' : z.id === 'B' ? 'Industrial' : 'Mixed freight',
        color: z.color,
        used: slots.filter((p) => usedSlots.has(p.id)).length,
        total: slots.length,
        units: cargo.filter((c) => c.positionId.startsWith(z.id)).length,
      };
    });
}
const zonesStatic = zoneStates();

export function computeSnapshot(t: number): WorldSnapshot {
  const truckStates = truckModels.map((m) => truckState(m, t));
  const forkliftStates = forkliftModels.map((m) => forkliftState(m, t));
  const workerStates: WorkerState[] = workerModels.map(({ spec, route }) => {
    const p = route ? evalRoute(route, t, tmp) : null;
    const x = p ? p.x : (spec.pose?.x ?? 0);
    const y = p ? p.y : (spec.pose?.y ?? 0);
    return { id: spec.id, name: spec.name, role: spec.role, moving: !!p?.moving, where: whereIs(x, y), x, y };
  });

  const bays: BayState[] = yard.bays.map((bay) => {
    const truck = truckStates.find((ts) => ts.bayId === bay.id && ts.onSite && ['docking', 'loading', 'unloading', 'waiting', 'dropped', 'departing'].includes(ts.status) && (ts.status !== 'departing' || ts.where === bay.id));
    const status: BayStatus = !truck
      ? 'available'
      : truck.status === 'loading' || truck.status === 'unloading' || truck.status === 'docking' || truck.status === 'dropped'
        ? truck.status
        : 'waiting';
    return { id: bay.id, kind: bay.kind, truckId: truck?.id ?? null, carrier: truck?.carrier ?? null, status, progress: truck?.progress ?? null, x: bay.center[0], y: bay.center[1] };
  });

  const loaded = forkliftModels.reduce((s, f) => s + (f.route ? cyclesDone(f.route, t) : 0), 0);
  const unloader = truckModels.find((m) => m.spec.activity === 'unloading');
  const received = unloader ? Math.floor(t / unloader.pace) : 0;
  const visits = truckModels.filter((m) => m.route).map((m) => ({ m, n: Math.max(0, Math.floor((t - (m.route!.spec.offset ?? 0)) / m.route!.period) + 1) }));
  const departed = truckModels
    .filter((m) => m.route)
    .reduce((s, m) => {
      const r = m.route!;
      const local = t - (r.spec.offset ?? 0);
      const legs = r.legs;
      const departAt = legs[legs.length - 1].t0;
      return s + (local < 0 ? 0 : Math.floor(local / r.period) + ((((local % r.period) + r.period) % r.period) >= departAt ? 1 : 0));
    }, 0);
  const positionsUsed = zonesStatic.reduce((s, z) => s + z.used, 0);
  const positionsTotal = zonesStatic.reduce((s, z) => s + z.total, 0);
  const docks = bays.filter((b) => b.kind === 'dock');
  const loadingBays = bays.filter((b) => b.kind === 'loading');

  const kpis: Kpis = {
    cargo: cargo.length - loaded + received,
    cargoDelta: received - loaded,
    trucksOnSite: truckStates.filter((s) => s.onSite).length,
    arrivalsToday: visits.reduce((s, v) => s + v.n, 0),
    inbound: truckStates.filter((s) => s.status === 'en-route' || s.status === 'scheduled').length,
    storagePct: (positionsUsed / positionsTotal) * 100,
    positionsUsed,
    positionsTotal,
    departuresToday: departed,
    docksBusy: docks.filter((b) => b.status !== 'available').length,
    docksTotal: docks.length,
    baysBusy: loadingBays.filter((b) => b.status !== 'available').length,
    baysTotal: loadingBays.length,
    staged: bays.filter((b) => b.kind === 'staging' && b.status !== 'available').length,
    forkliftsWorking: forkliftStates.filter((f) => f.status !== 'charging' && f.status !== 'idle').length,
    forkliftsTotal: forkliftStates.length,
  };

  const alerts: Alert[] = [];
  for (const f of forkliftStates) if (f.battery < 45) alerts.push({ id: `bat-${f.id}`, level: 'warn', text: `${f.id} battery ${Math.round(f.battery)}% · ${f.status === 'charging' ? `charging at ${f.charger}` : 'send to charger'}` });
  for (const tr of truckStates) if (tr.status === 'at-gate') alerts.push({ id: `gate-${tr.id}`, level: 'info', text: `${tr.id} · ${tr.detail}` });
  for (const tr of truckStates) if (tr.status === 'en-route' && tr.etaSec !== null) alerts.push({ id: `eta-${tr.id}`, level: 'info', text: `${tr.id} (${tr.carrier}) arriving in ${fmtDuration(tr.etaSec)}` });
  for (const z of zonesStatic) if (z.used / z.total > 0.8) alerts.push({ id: `zone-${z.id}`, level: 'warn', text: `${z.name} at ${Math.round((z.used / z.total) * 100)}% of positions` });

  return { t, clock: fmtClock(t), trucks: truckStates, forklifts: forkliftStates, workers: workerStates, bays, zones: zonesStatic, kpis, alerts };
}
