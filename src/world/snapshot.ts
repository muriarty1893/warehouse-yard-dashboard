import { devYard } from '../config/devYard';
import { forklifts, trucks, workers, type TruckSpec } from '../config/fleet';
import { hashString } from '../domain/seed';
import type { BayKind, Cargo, Rect, TruckBay } from '../domain/types';
import { CARRIER_NAMES, parkInBay } from '../domain/vehicles';
import { areaAt } from '../domain/yard';
import { usableFloor } from './clearance';
import { entityTime, useControl } from '../sim/control';
import { compileRoute, evalRoute, newPose, type CompiledRoute, type RoutePose } from '../sim/route';
import type { EntityRef } from '../state/ui';
import type { Overlay } from '../state/layers';
import { labelledCargo, useInventory } from './inventory';
import { inYard } from './placement';
import { carriedAt, jobPose } from '../sim/jobs';
import { planOf, useLoading, type PlanStatus } from '../loading/store';
import { fmtClock, fmtDuration } from './time';

/**
 * World State snapshot (spec §19): the system's current understanding of the
 * yard, derived from the simulation clock. The dashboard reads only this; the
 * 3D twin reads the same sources, so both always agree.
 */

export const yard = devYard;
/** Current cargo records (edited by hand through the inventory store). */
export const currentCargo = () => useInventory.getState().cargo;

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
  /** Stopped by a manager (hold / emergency stop). */
  held: boolean;
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
  scripted: boolean;
  held: boolean;
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

export interface AreaState {
  id: string;
  name: string;
  kind: string;
  color: string;
  /** Pallet spots taken vs. spots that fit on the usable floor (corridors excluded). */
  used: number;
  capacity: number;
  units: number;
}

export interface Alert {
  id: string;
  level: 'info' | 'warn';
  text: string;
  /** What clicking the alert does: select an entity, or switch on a map overlay. */
  ref?: EntityRef;
  overlay?: Overlay;
}

export interface Kpis {
  cargo: number;
  cargoDelta: number;
  trucksOnSite: number;
  arrivalsToday: number;
  inbound: number;
  /** Storage spots taken across all areas. */
  storagePct: number;
  spotsUsed: number;
  spotsTotal: number;
  departuresToday: number;
  /** Truck loading spaces / docks in use. */
  docksBusy: number;
  docksTotal: number;
  staged: number;
  forkliftsWorking: number;
  forkliftsTotal: number;
  /** Cargo units without any source document / with only drafts. */
  docsMissing: number;
  docsDraft: number;
  documents: number;
}

export interface WorldSnapshot {
  t: number;
  clock: string;
  trucks: TruckState[];
  forklifts: ForkliftState[];
  workers: WorkerState[];
  bays: BayState[];
  areas: AreaState[];
  kpis: Kpis;
  alerts: Alert[];
}

// ---------------------------------------------------------------------------
// Static lookups

const inRect = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

const AREA_NAMES: Record<string, string> = {
  'LANE-GATE': 'Gate lane',
  'FK-RAMP': 'Forklift lane',
  'R-CHARGE': 'Charging area',
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
  const area = areaAt(yard, x, y);
  if (area) return area.name;
  for (const r of yard.ramps) if (inRect(r.rect, x, y)) return 'Forklift ramp';
  for (const a of yard.areas) if (inRect(a.rect, x, y) && AREA_NAMES[a.id]) return AREA_NAMES[a.id];
  for (const b of yard.buildings) if (inRect(b.rect, x, y)) return b.name;
  if (!insideBoundary(x, y)) return y < 0 ? 'Public road' : 'Outside yard';
  return 'Yard';
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
  const workLeg = route?.legs.find((l) => l.leg.phase === 'working');
  const unloading = spec.activity === 'unloading' || !!workLeg?.leg.status?.startsWith('Unloading');
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

/** Seconds per unit when the forklifts load a planned truck (two share the trips). */
const PLANNED_PACE = 35;

/** A plannable truck's shipment as its load plan describes it (spec §3.3). */
function planned(m: TruckModel): { shipment: Shipment; units: number; status: PlanStatus } | null {
  const s = useLoading.getState();
  const t = s.trucks[m.spec.id];
  const plan = planOf(s, m.spec.id);
  if (!t || !plan) return null;
  const n = plan.route.length;
  return {
    shipment: { ...m.shipment, direction: 'outbound', place: `${plan.route[0] ?? '—'}${n > 1 ? ` +${n - 1}` : ''}`, pallets: plan.placements.length, weightT: Math.round(plan.stats.weightKg / 100) / 10 },
    units: plan.placements.length,
    status: t.status,
  };
}

function truckState(m: TruckModel, t: number): TruckState {
  const { spec, route, bay } = m;
  const plan = route ? null : planned(m);
  const shipment = plan?.shipment ?? m.shipment;
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
    held: false,
  };
  const labels = ['Checked in', `At ${bay?.id ?? 'bay'}`, verb, 'Departed', shipment.direction === 'inbound' ? 'Released' : 'Delivered'];

  const held = useControl.getState().holds[spec.id] !== undefined;
  if (route) {
    const te = entityTime(spec.id, t);
    const pose = evalRoute(route, te, tmp);
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
        held: held && pose.visible,
        status: leaving ? 'departed' : pose.visible ? 'en-route' : 'scheduled',
        detail: leaving ? `Departed · to ${shipment.place}` : `Arriving at Gate 1 in ${fmtDuration(eta ?? 0)}`,
        onSite: false,
        x: pose.x,
        y: pose.y,
        where: pose.visible ? 'Public road' : 'Off site',
        speedKmh: pose.visible && !held ? speedOf(route, te, pose) : 0,
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
      held,
      status,
      detail: held
        ? `On hold · ${whereIs(pose.x, pose.y)}`
        : status === 'at-gate'
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
      speedKmh: held ? 0 : speedOf(route, te, pose),
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
  if (plan && plan.status === 'dispatched') {
    detail = 'Dispatched';
    current = 3;
  } else if (plan && plan.status === 'loaded') {
    status = 'loading';
    progress = { done: plan.units, total: plan.units };
    detail = 'Loaded · ready to depart';
    current = 3;
  } else if (plan && (spec.activity === 'loading' || plan.status === 'loading')) {
    const done = currentCargo().filter((c) => c.loadedOn?.truckId === spec.id).length;
    status = 'loading';
    progress = { done, total: plan.units };
    etaSec = (plan.units - done) * PLANNED_PACE;
    detail = `${bay?.id} · ${done}/${plan.units} units`;
    current = 2;
  } else if (spec.activity === 'loading' || spec.activity === 'unloading') {
    const fl = forkliftOf(spec.id);
    const pace = fl?.route ? fl.route.period : m.pace;
    const done = (m.base + (fl?.route ? cyclesDone(fl.route, entityTime(fl.spec.id, t)) : Math.floor(t / pace))) % (total + 1);
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

const JOB_STATUS: Record<string, ForkliftStatus> = { picking: 'picking', carrying: 'carrying', working: 'loading', returning: 'returning' };

function forkliftState(m: (typeof forkliftModels)[number], t: number): ForkliftState {
  const { spec, route } = m;
  const common = { id: spec.id, operator: spec.operator, model: spec.model, charger: spec.charger };
  const job = jobPose(spec.id, t, tmp);
  if (job) {
    return {
      ...common,
      status: JOB_STATUS[job.phase ?? ''] ?? 'returning',
      detail: job.status,
      battery: Math.max(15, spec.battery - t * 0.012),
      carrying: carriedAt(spec.id, t),
      movesToday: m.base,
      speedKmh: 0,
      where: whereIs(job.x, job.y),
      x: job.x,
      y: job.y,
      scripted: true,
      held: false,
    };
  }
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
      scripted: false,
      held: false,
    };
  }
  const te = entityTime(spec.id, t);
  const held = useControl.getState().holds[spec.id] !== undefined;
  const pose = evalRoute(route, te, tmp);
  const cycles = cyclesDone(route, te);
  const truck = spec.serves ?? 'truck';
  const bay = truckModels.find((tm) => tm.spec.id === spec.serves)?.bay?.id ?? '';
  const statusMap: Record<string, ForkliftStatus> = { picking: 'picking', carrying: 'carrying', working: 'loading', returning: 'returning' };
  const status = statusMap[pose.phase ?? ''] ?? 'returning';
  const detail = held
    ? `On hold · ${whereIs(pose.x, pose.y)}`
    : !spec.serves
    ? pose.status
    : status === 'picking'
      ? `Picking at ${spec.pick}`
      : status === 'carrying'
        ? `To ${bay} · ${truck}`
        : status === 'loading'
          ? `Loading ${truck} at ${bay}`
          : 'Returning to pick';
  const pick = spec.pick;
  const near = pick ? currentCargo().filter((c) => inYard(c) && Math.hypot(c.x - pick[0], c.y - pick[1]) < 1) : [];
  const top = near.find((c) => !near.some((o) => o.on === c.id));
  return {
    ...common,
    status,
    detail,
    battery: Math.max(15, spec.battery - te * 0.012),
    carrying: pose.carry ? (top?.id ?? 'Pallet') : null,
    movesToday: m.base + cycles * 2 + (pose.leg >= 2 ? 1 : 0),
    speedKmh: held ? 0 : speedOf(route, te, pose),
    where: whereIs(pose.x, pose.y),
    x: pose.x,
    y: pose.y,
    scripted: true,
    held,
  };
}

/** Floor one stored unit needs, access space included (≈ a pallet plus its share of the gaps). */
export const SPOT_M2 = 3.4;
const capacities = new Map(yard.storage.map((a) => [a.id, Math.floor(usableFloor(a) / SPOT_M2)]));
/** Big units (crates, machines) take two spots. */
export const spotsOf = (c: Cargo) => (c.dims.l * c.dims.w > 2.2 ? 2 : 1);

function areaStates(cargo: Cargo[]): AreaState[] {
  return yard.storage.map((a) => {
    const units = cargo.filter((c) => c.areaId === a.id);
    return {
      id: a.id,
      name: a.name,
      kind: a.description ?? '',
      color: a.color,
      used: units.filter((c) => !c.on).reduce((s, c) => s + spotsOf(c), 0),
      capacity: capacities.get(a.id) ?? 1,
      units: units.length,
    };
  });
}

export function computeSnapshot(t: number): WorldSnapshot {
  const { cargo: all, documents, events } = useInventory.getState();
  const cargo = all.filter(inYard);
  const areas = areaStates(cargo);
  const truckStates = truckModels.map((m) => truckState(m, t));
  const forkliftStates = forkliftModels.map((m) => forkliftState(m, t));
  const workerStates: WorkerState[] = workerModels.map(({ spec, route }) => {
    const p = route ? evalRoute(route, entityTime(spec.id, t), tmp) : null;
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

  const visits = truckModels.filter((m) => m.route).map((m) => ({ m, n: Math.max(0, Math.floor((entityTime(m.spec.id, t) - (m.route!.spec.offset ?? 0)) / m.route!.period) + 1) }));
  const departed = truckModels
    .filter((m) => m.route)
    .reduce((s, m) => {
      const r = m.route!;
      const local = entityTime(m.spec.id, t) - (r.spec.offset ?? 0);
      const legs = r.legs;
      const departAt = legs[legs.length - 1].t0;
      return s + (local < 0 ? 0 : Math.floor(local / r.period) + ((((local % r.period) + r.period) % r.period) >= departAt ? 1 : 0));
    }, 0);
  const spotsUsed = areas.reduce((s, a) => s + a.used, 0);
  const spotsTotal = areas.reduce((s, a) => s + a.capacity, 0);
  const docks = bays.filter((b) => b.kind === 'loading' || b.kind === 'dock');

  const documented = new Set(documents.map((d) => d.cargoId));
  const confirmed = labelledCargo(documents);
  const kpis: Kpis = {
    cargo: cargo.length,
    cargoDelta: events.filter((e) => e.kind === 'registered').length - events.filter((e) => e.kind === 'released').length,
    trucksOnSite: truckStates.filter((s) => s.onSite).length,
    arrivalsToday: visits.reduce((s, v) => s + v.n, 0),
    inbound: truckStates.filter((s) => s.status === 'en-route' || s.status === 'scheduled').length,
    storagePct: (Math.min(spotsUsed, spotsTotal) / spotsTotal) * 100,
    spotsUsed,
    spotsTotal,
    departuresToday: departed,
    docksBusy: docks.filter((b) => b.status !== 'available').length,
    docksTotal: docks.length,
    staged: bays.filter((b) => (b.kind === 'staging' || b.kind === 'parking') && b.status !== 'available').length,
    forkliftsWorking: forkliftStates.filter((f) => f.status !== 'charging' && f.status !== 'idle').length,
    forkliftsTotal: forkliftStates.length,
    docsMissing: cargo.filter((c) => !documented.has(c.id)).length,
    docsDraft: cargo.filter((c) => documented.has(c.id) && !confirmed.has(c.id)).length,
    documents: documents.length,
  };

  const alerts: Alert[] = [];
  const held = [...truckStates, ...forkliftStates].filter((e) => e.held);
  if (held.length) alerts.push({ id: 'held', level: 'warn', text: `${held.length} vehicle${held.length > 1 ? 's' : ''} on hold · ${held.map((e) => e.id).join(', ')}`, ref: { kind: truckStates.includes(held[0] as TruckState) ? 'truck' : 'forklift', id: held[0].id } });
  if (kpis.docsMissing) alerts.push({ id: 'docs-missing', level: 'warn', text: `${kpis.docsMissing} cargo units have no source document`, overlay: 'documents' });
  if (kpis.docsDraft) alerts.push({ id: 'docs-draft', level: 'info', text: `${kpis.docsDraft} cargo units only have draft documents to confirm`, overlay: 'documents' });
  for (const f of forkliftStates) if (f.battery < 45) alerts.push({ id: `bat-${f.id}`, level: 'warn', text: `${f.id} battery ${Math.round(f.battery)}% · ${f.status === 'charging' ? `charging at ${f.charger}` : 'send to charger'}`, ref: { kind: 'forklift', id: f.id } });
  for (const tr of truckStates) if (tr.status === 'at-gate') alerts.push({ id: `gate-${tr.id}`, level: 'info', text: `${tr.id} · ${tr.detail}`, ref: { kind: 'truck', id: tr.id } });
  for (const tr of truckStates) if (tr.status === 'en-route' && tr.etaSec !== null) alerts.push({ id: `eta-${tr.id}`, level: 'info', text: `${tr.id} (${tr.carrier}) arriving in ${fmtDuration(tr.etaSec)}`, ref: { kind: 'truck', id: tr.id } });
  for (const a of areas) if (a.used / a.capacity > 0.85) alerts.push({ id: `area-${a.id}`, level: 'warn', text: `${a.name} is ${Math.round((a.used / a.capacity) * 100)}% full · little room left`, overlay: 'areas' });

  return { t, clock: fmtClock(t), trucks: truckStates, forklifts: forkliftStates, workers: workerStates, bays, areas, kpis, alerts };
}
