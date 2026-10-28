import type { Carrier, Cargo, Pose } from '../domain/types';
import type { LoadPlan, Placement, VehicleId } from '../loading/types';
import type { RouteSpec } from '../sim/route';
import type { FillLevel } from '../world/demo';

/**
 * The training game's model (spec §1, §3.1). Plain data: the engine changes
 * a ShiftState in place and reads nothing else, so a recipe plus the same
 * actions always gives the same shift.
 *
 * Engine time `t` is sim seconds since the shift started; the clock on screen
 * runs SHIFT_MIN_PER_SEC shift minutes per sim second.
 */

export const SHIFT_START_MIN = 360; // 06:00
export const SHIFT_LENGTH_MIN = 480; // to 14:00
export const SHIFT_MIN_PER_SEC = 0.6;
export const shiftMinutes = (t: number) => t * SHIFT_MIN_PER_SEC;
export const secondsFor = (minutes: number) => minutes / SHIFT_MIN_PER_SEC;

/** The crew's lunch, 12:00–13:00 (minutes after 06:00): no forklift job or paperwork starts. */
export const LUNCH = { fromMin: 360, toMin: 420 };
export const atLunch = (t: number) => t >= secondsFor(LUNCH.fromMin) && t < secondsFor(LUNCH.toMin);

/** When work of `seconds` started at t is done, with lunch taken out of the middle. */
export function workDone(t: number, seconds: number): number {
  const from = secondsFor(LUNCH.fromMin);
  const to = secondsFor(LUNCH.toMin);
  const start = atLunch(t) ? to : t;
  const end = start + seconds;
  return start < from && end > from ? end + (to - from) : end;
}

/** "HH:MM" on the shift clock at engine time t. */
export function clockLabel(t: number): string {
  const total = Math.floor(SHIFT_START_MIN + shiftMinutes(t) + 1e-9);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type Mechanic = 'storage' | 'outbound' | 'papers' | 'queue' | 'tempForklift' | 'rain' | 'bayClosed' | 'rushOrder' | 'overtime';
export type HintKey = 'basics' | Mechanic;

export interface Prices {
  handling: number;
  delivery: number;
  rushDelivery: number;
  gateFreeMin: number;
  gatePerMin: number;
  latePerMin: number;
  missingPapers: number;
  missedTruck: number;
  damaged: number;
  unserved: number;
  tempForkliftPerHour: number;
  overtime: number;
  rushPapers: number;
}

export interface TruckEntry {
  id: string;
  kind: 'inbound' | 'outbound';
  carrier: Carrier;
  /** Minutes after 06:00, actual. */
  arriveMin: number;
  /** On the briefing timeline; null = rush order (not shown). */
  plannedArriveMin: number | null;
  /** Inbound: units aboard; outbound: yard units to provide for its stops. */
  units: number;
  stops?: string[];
  deadlineMin?: number;
  /** Inbound: its units go to this outbound truck's stops. */
  feeds?: string;
  missingPapers?: number;
  rush?: boolean;
}

export type Incident =
  | { kind: 'breakdown'; forkliftId: string; atMin: number; durationMin: number }
  | { kind: 'rain'; atMin: number }
  | { kind: 'bayClosed'; bayId: string; fromMin: number; toMin: number };

export interface Recipe {
  id: string;
  no: number;
  name: string;
  teaches: string;
  briefing: { newTitle: string; newText: string; rule: string };
  seed: number;
  bays: string[];
  forklifts: string[];
  fill: FillLevel;
  mechanics: Mechanic[];
  trucks: TruckEntry[];
  incidents: Incident[];
  budget: number;
  prices?: Partial<Prices>;
  clerkMin?: number;
  /** Rain shifts: how many cartons and bags start out in the open (default 8). */
  exposed?: number;
  targets: [number, number, number];
}

export interface Motion {
  spec: RouteSpec;
  t0: number;
  until: number;
}

export type TruckStage = 'scheduled' | 'arriving' | 'waiting' | 'docking' | 'docked' | 'departing' | 'gone';

export interface GameTruck {
  id: string;
  kind: 'inbound' | 'outbound';
  carrier: Carrier;
  vehicle: VehicleId;
  stage: TruckStage;
  arriveAt: number;
  plannedArriveAt: number | null;
  stops: string[];
  deadline: number | null;
  rush: boolean;
  urgent: boolean;
  slot: number | null;
  bayId: string | null;
  areaId: string | null;
  /** Inbound: as packed at arrival; outbound: the confirmed plan's placements. */
  load: Placement[];
  /** Unit ids aboard now. */
  aboard: string[];
  /** Outbound confirmed plan. */
  plan: LoadPlan | null;
  /** A forklift is inside until then. */
  busyUntil: number;
  dispatchPending: boolean;
  times: { arrived?: number; leftKerb?: number; docked?: number; departed?: number; clearAt?: number };
  motion: Motion | null;
  pose: Pose;
}

export interface GameForklift {
  id: string;
  temp: boolean;
  pose: Pose;
  motion: Motion | null;
  jobId: string | null;
  brokenUntil: number | null;
  breakdownPendingSec: number | null;
  leaveAt: number | null;
  arrivesAt: number | null;
}

export type JobKind = 'unload' | 'load' | 'move';

export interface Job {
  id: string;
  kind: JobKind;
  groupId: string;
  unitId: string;
  truckId: string | null;
  placement: Placement | null;
  areaId: string | null;
  status: 'queued' | 'active' | 'done' | 'cancelled';
  blocked: string | null;
  forkliftId: string | null;
  pickAt: number | null;
  setAt: number | null;
  doneAt: number | null;
  /** Forklift at the dock face going in / coming out (truck jobs). */
  enterAt: number | null;
  leaveAt: number | null;
  /** Where the forklift stands when the job is done. */
  end: Pose | null;
  picked: boolean;
  set: boolean;
}

export interface JobGroup {
  id: string;
  kind: JobKind;
  label: string;
  truckId: string | null;
  areaId: string | null;
  jobIds: string[];
}

export interface GameCargo extends Cargo {
  papers: 'ok' | 'missing';
  transitJob: string | null;
  gone: boolean;
}

export type EntryKind = 'handling' | 'delivery' | 'gateWait' | 'late' | 'missingPapers' | 'missedTruck' | 'damaged' | 'unserved' | 'tempForklift' | 'overtime' | 'rushPapers';

export interface LedgerEntry {
  t: number;
  kind: EntryKind;
  amount: number;
  text: string;
  rule: string;
  ref: string;
}

export type GameEvent =
  | { kind: 'money'; entry: LedgerEntry }
  | { kind: 'hint'; key: HintKey }
  /** `until`: engine time the notice stays up to (else the HUD lets it go after a few seconds). */
  | { kind: 'notice'; t: number; text: string; tone: 'info' | 'warn'; until?: number }
  | { kind: 'over' };

export interface ShiftState {
  recipe: Recipe;
  prices: Prices;
  t: number;
  end: number;
  overtimeBought: number;
  rng: number;
  seq: number;
  trucks: GameTruck[];
  forklifts: GameForklift[];
  cargo: GameCargo[];
  jobs: Job[];
  /** Groups in priority order. */
  groups: JobGroup[];
  papers: { queue: string[]; startedAt: number | null };
  ledger: LedgerEntry[];
  /** Ids of incident and hint events already fired. */
  fired: string[];
  over: boolean;
  log: { t: number; action: Action }[];
  /** Admin mode: spending is never refused for lack of cash. */
  freeCash?: boolean;
}

export type Action =
  | { kind: 'assignBay'; truckId: string; bayId: string }
  | { kind: 'chooseArea'; truckId: string; areaId: string }
  | { kind: 'confirmPlan'; truckId: string; plan: LoadPlan }
  | { kind: 'dispatch'; truckId: string }
  | { kind: 'moveUnits'; unitIds: string[]; areaId: string }
  | { kind: 'reorder'; queue: 'crew' | 'papers'; id: string; to: number }
  | { kind: 'urgent'; truckId: string }
  | { kind: 'rushPapers'; unitId: string }
  | { kind: 'rentForklift'; hours: number }
  | { kind: 'overtime' };

export type ActionResult = { ok: true } | { ok: false; reason: string };

/** One pending event: engine.advance runs the earliest (t, order, id) first. */
export interface Due {
  t: number;
  order: number;
  id: string;
  run: () => GameEvent[];
}
