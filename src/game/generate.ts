import { road } from '../config/devYard';
import { DESTINATIONS, hashString, isStackable, makeUnit, mulberry32, type UnitLook } from '../domain/seed';
import { pack } from '../loading/pack';
import type { PackItem } from '../loading/types';
import { vehicleById } from '../loading/vehicles';
import { buildGrid, reachUnit } from '../sim/grid';
import { demoCargo } from '../world/demo';
import { DEFAULT_PRICES } from './ledger';
import { FORKLIFT_HOMES } from './places';
import { secondsFor, SHIFT_LENGTH_MIN, type GameCargo, type GameForklift, type GameTruck, type Recipe, type ShiftState } from './types';

/**
 * A shift from its recipe (spec §3.1 generate.ts): the starting yard, the
 * trucks with their units, missing papers and the crew, all from the
 * recipe's seed, so a retry is the same shift.
 */

const INBOUND_LOOKS: UnitLook[] = ['cartons', 'wrap-blue', 'wrap-white', 'bag', 'cartons', 'crate'];

/** Seeded Fisher–Yates. */
function shuffled<T>(rng: () => number, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newShift(recipe: Recipe): ShiftState {
  const rng = mulberry32(recipe.seed);
  const vehicle = vehicleById('rigid-26');
  const cargo: GameCargo[] = demoCargo(recipe.fill, recipe.seed).map((c) => ({ ...c, pinned: false, papers: 'ok', transitJob: null, gone: false }));

  // Outbound stops get exactly the units the recipe asks for: every other unit bound there is sent elsewhere first.
  const outbound = recipe.trucks.filter((t) => t.kind === 'outbound');
  const served = new Set(outbound.flatMap((t) => t.stops ?? []));
  const elsewhere = DESTINATIONS.filter((d) => !served.has(d));
  for (const c of cargo) if (served.has(c.destination)) c.destination = elsewhere[hashString(c.id) % elsewhere.length];

  const grid = buildGrid(cargo);
  const hasTop = new Set(cargo.map((c) => c.on).filter((id): id is string => !!id));
  const free = shuffled(
    rng,
    cargo.filter((c) => !c.on && !hasTop.has(c.id) && c.look !== 'container' && c.look !== 'group-cartons' && reachUnit(grid, cargo, c)),
  );
  const unitsOf = new Map<string, string[]>();
  for (const t of outbound) {
    const stops = t.stops ?? [];
    const mine = free.splice(0, t.units);
    mine.forEach((c, i) => (c.destination = stops[i % stops.length]));
    unitsOf.set(t.id, mine.map((c) => c.id));
  }

  const trucks: GameTruck[] = [];
  let serial = 0;
  for (const entry of recipe.trucks) {
    const truck: GameTruck = {
      id: entry.id,
      kind: entry.kind,
      carrier: entry.carrier,
      vehicle: vehicle.id,
      stage: 'scheduled',
      arriveAt: secondsFor(entry.arriveMin),
      plannedArriveAt: entry.plannedArriveMin === null ? null : secondsFor(entry.plannedArriveMin),
      stops: entry.stops ?? [],
      deadline: entry.deadlineMin === undefined ? null : secondsFor(entry.deadlineMin),
      rush: !!entry.rush,
      urgent: false,
      slot: null,
      bayId: null,
      areaId: null,
      load: [],
      aboard: [],
      plan: null,
      busyUntil: -Infinity,
      dispatchPending: false,
      times: {},
      motion: null,
      pose: { x: road.spawnEast, y: road.westbound, heading: Math.PI },
    };
    if (entry.kind === 'inbound') {
      const fed = entry.feeds ? recipe.trucks.find((t) => t.id === entry.feeds)?.stops : undefined;
      const units: GameCargo[] = [];
      for (let i = 0; i < entry.units; i++) {
        serial += 1;
        const look = INBOUND_LOOKS[Math.floor(rng() * INBOUND_LOOKS.length)];
        const destination = fed?.length ? fed[i % fed.length] : elsewhere[Math.floor(rng() * elsewhere.length)];
        const unit = makeUnit(rng, `CARGO-9${String(serial).padStart(4, '0')}`, look, { destination });
        units.push({ ...unit, x: 0, y: 0, yaw: 0, on: null, areaId: null, loadedOn: { truckId: entry.id, stop: 1 }, papers: 'ok', transitJob: null, gone: false });
      }
      const items: PackItem[] = units.map((u) => ({ id: u.id, stop: 1, l: u.dims.l, w: u.dims.w, h: u.dims.h, weightKg: u.weightKg, stackable: isStackable(u.look), fragile: !!u.fragile, urgent: false }));
      const packed = pack(vehicle, items, { seed: recipe.seed });
      const placed = new Set(packed.placements.map((p) => p.cargoId));
      truck.load = packed.placements;
      for (const u of units) {
        if (!placed.has(u.id)) continue;
        truck.aboard.push(u.id);
        cargo.push(u);
      }
      unitsOf.set(entry.id, truck.aboard);
    }
    trucks.push(truck);
  }

  // Missing papers: the first N units of each truck that has some, queued for the clerk in truck order.
  const queue: string[] = [];
  for (const entry of recipe.trucks) {
    const ids = (unitsOf.get(entry.id) ?? []).slice(0, entry.missingPapers ?? 0);
    for (const id of ids) {
      const c = cargo.find((u) => u.id === id);
      if (c) c.papers = 'missing';
      queue.push(id);
    }
  }

  const forklifts: GameForklift[] = recipe.forklifts.map((id) => ({
    id,
    temp: false,
    pose: FORKLIFT_HOMES[id] ?? { x: 40, y: 20, heading: 0 },
    motion: null,
    jobId: null,
    brokenUntil: null,
    breakdownPendingSec: null,
    leaveAt: null,
    arrivesAt: null,
  }));

  return {
    recipe,
    prices: { ...DEFAULT_PRICES, ...recipe.prices },
    t: 0,
    end: secondsFor(SHIFT_LENGTH_MIN),
    overtimeBought: 0,
    rng: recipe.seed,
    seq: 0,
    trucks,
    forklifts,
    cargo,
    jobs: [],
    groups: [],
    papers: { queue, startedAt: queue.length ? 0 : null },
    ledger: [],
    fired: [],
    over: false,
    log: [],
  };
}
