# Yard Manager Training Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Docktor yard twin into a 9-shift training game for yard managers: trucks arrive, the player assigns bays, storage areas, load plans and priorities, the forklift crew carries them out against the clock, and the shift is scored in money.

**Architecture:** A deterministic shift engine in plain TypeScript (`src/game/`) holds all game state. Player decisions go through `act`, and time goes through `advance`, which fires due events in strict time order. Every vehicle movement is a one-shot route planned at decision time and played back from the sim clock, as the current twin does. A Zustand bridge feeds the existing 3D scene and a new "broadcast scoreboard" HUD. The existing load planner is reused, with the shift as its data source.

**Tech Stack:** TypeScript, React 19, React Three Fiber 9 + drei 10, Zustand 5, Tailwind CSS 4, Vitest 5 (node environment), Vite 8.

**Spec:** `docs/superpowers/specs/2026-10-27-training-game-design.md`. Read it before starting any task; section numbers below (§) refer to it. Mockups: `.superpowers/brainstorm/*/content/{visual-style-2,layout,screens}.html` (option F, layout 3).

## Global Constraints

- Work on branch `training-game`. Commit messages are plain sentences like the repo history ("Add the crew dispatcher"), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `src/game/*` imports no React and no three.js, except `store.ts` (Zustand) and `motion.ts` (route evaluation only).
- Engine functions change the state object they are given and read nothing else (no `Date.now`, no `Math.random`, no store reads). The same recipe and actions give the same ledger, to the cent.
- Shift clock: 06:00–14:00, `SHIFT_MIN_PER_SEC = 0.8` (10 real minutes at 1×). All "per minute" amounts are per shift minute. Speeds are 1× / 2× / 4×, on keys `1` / `2` / `3`. `Esc` pauses and covers the yard.
- Prices (`DEFAULT_PRICES`): handling +€40/unit; delivery +€80/unit (rush order +€160); gate waiting fee 5 free min then −€12/min; late departure −€15/min; missing papers −€300/unit; missed truck −€240/unit; damaged −€200/unit; unserved truck −€500; temp forklift −€150/shift hour; overtime −€400 per 30 min, max 2; rush papers −€40/unit. Money amounts are whole euros (`Math.round`).
- Rain: warned 45 shift min ahead. Damage check 10 min after the start hits units with look `cartons` or `bag` standing in an uncovered storage area (`covered` falsy: Open yard `OY`, Gate-side `GS`).
- One forklift inside a truck at a time, with a 1.5 s gap between them (`MARGIN`). Clerk default: 20 shift min per unit.
- Stars: ★ = basic bot profit, ★★★ = 95 % of the good bot's profit, ★★ = halfway. Each target is rounded down to €100.
- Progress persists in localStorage under `docktor.campaign`.
- UI: Barlow + Barlow Condensed (italic 800) via `@fontsource`, including latin-ext. Tokens `navy #0b1d4f`, `brand #2f5ff0`, `hot #ff6b1a`, `go #0f7a3d`, `stop #d02a25`, `paper #ffffff`. Text contrast ≥ 4.5:1; orange fills carry navy text. Colour is never the only signal. No `backdrop-filter` or blur.
- HD 620 budget: ≥ 30 fps at 1600×920 with a full yard and the HUD. The timeline re-renders 4×/s, not every frame. World tags are positioned in one projection pass, at most ~12.
- Copy is English and plain. Every fine names its rule.

## Review Focus

1. **Big time steps.** At 4× speed, or after a background tab sleeps, one `advance` call covers many events. Advancing 0 → T in one call must give exactly the same ledger and positions as stepping 0.25 s at a time. (Task 5)
2. **Actions in the wrong stage.** Examples: assigning a bay twice, dispatching an inbound truck, choosing an area before docking, any action after the shift ended. Each must return `{ ok: false, reason }` and leave the state unchanged. (Tasks 5, 6)
3. **A bay counted free too early.** The bay is free only once the departing truck has pulled out (`clearAt`), not when Dispatch is pressed. Docking a new truck earlier must be refused with "Bay L1 is still being cleared". (Task 5)
4. **Planner offered units it can't have.** Units being carried, aboard a truck, written off, or held by another truck's confirmed plan must never be candidates. (Task 6)
5. **Stale state after Restart or switching shifts.** Loading drafts, toasts, the hint, paused state and clock speed must all reset on `startShift`. (Task 11)

---

### Task 1: Shift types, clock and money

**Files:**
- Create: `src/game/types.ts`, `src/game/ledger.ts`
- Test: `src/game/ledger.test.ts`

**Interfaces:**
- Produces (`types.ts`, used by every later task):

```ts
import type { Carrier, Cargo, Pose } from '../domain/types';
import type { FillLevel } from '../world/demo';
import type { LoadPlan, Placement, VehicleId } from '../loading/types';
import type { RouteSpec } from '../sim/route';

export const SHIFT_START_MIN = 360;   // 06:00
export const SHIFT_LENGTH_MIN = 480;  // to 14:00
export const SHIFT_MIN_PER_SEC = 0.8;
export const shiftMinutes = (t: number) => t * SHIFT_MIN_PER_SEC;
export const secondsFor = (minutes: number) => minutes / SHIFT_MIN_PER_SEC;
export function clockLabel(t: number): string; // "HH:MM" of SHIFT_START_MIN + shiftMinutes(t), floored

export type Mechanic = 'storage' | 'outbound' | 'papers' | 'queue' | 'tempForklift' | 'rain' | 'bayClosed' | 'rushOrder' | 'overtime';
export type HintKey = 'basics' | Mechanic;

export interface Prices { handling: number; delivery: number; rushDelivery: number; gateFreeMin: number; gatePerMin: number; latePerMin: number; missingPapers: number; missedTruck: number; damaged: number; unserved: number; tempForkliftPerHour: number; overtime: number; rushPapers: number }

export interface TruckEntry {
  id: string; kind: 'inbound' | 'outbound'; carrier: Carrier;
  arriveMin: number;                 // minutes after 06:00, actual
  plannedArriveMin: number | null;   // on the briefing timeline; null = rush order (not shown)
  units: number;                     // inbound: units aboard; outbound: yard units to provide for its stops
  stops?: string[];                  // outbound
  deadlineMin?: number;              // outbound
  feeds?: string;                    // inbound: units go to this outbound truck's stops
  missingPapers?: number;
  rush?: boolean;
}
export type Incident =
  | { kind: 'breakdown'; forkliftId: string; atMin: number; durationMin: number }
  | { kind: 'rain'; atMin: number }
  | { kind: 'bayClosed'; bayId: string; fromMin: number; toMin: number };

export interface Recipe {
  id: string; no: number; name: string; teaches: string;
  briefing: { newTitle: string; newText: string; rule: string };
  seed: number; bays: string[]; forklifts: string[]; fill: FillLevel;
  mechanics: Mechanic[]; trucks: TruckEntry[]; incidents: Incident[];
  budget: number; prices?: Partial<Prices>; clerkMin?: number;
  targets: [number, number, number];
}

export interface Motion { spec: RouteSpec; t0: number; until: number }
export type TruckStage = 'scheduled' | 'arriving' | 'waiting' | 'docking' | 'docked' | 'departing' | 'gone';
export interface GameTruck {
  id: string; kind: 'inbound' | 'outbound'; carrier: Carrier; vehicle: VehicleId;
  stage: TruckStage; arriveAt: number; plannedArriveAt: number | null;
  stops: string[]; deadline: number | null; rush: boolean; urgent: boolean;
  slot: number | null; bayId: string | null; areaId: string | null;
  load: Placement[];      // inbound: as packed at arrival; outbound: the confirmed plan's placements
  aboard: string[];       // unit ids aboard now
  plan: LoadPlan | null;  // outbound confirmed plan
  busyUntil: number;      // a forklift is inside until then
  dispatchPending: boolean;
  times: { arrived?: number; leftKerb?: number; docked?: number; departed?: number; clearAt?: number };
  motion: Motion | null; pose: Pose;
}
export interface GameForklift { id: string; temp: boolean; pose: Pose; motion: Motion | null; jobId: string | null; brokenUntil: number | null; breakdownPendingSec: number | null; leaveAt: number | null; arrivesAt: number | null }
export type JobKind = 'unload' | 'load' | 'move';
export interface Job {
  id: string; kind: JobKind; groupId: string; unitId: string; truckId: string | null;
  placement: Placement | null; areaId: string | null;
  status: 'queued' | 'active' | 'done' | 'cancelled'; blocked: string | null;
  forkliftId: string | null; pickAt: number | null; setAt: number | null; doneAt: number | null;
  picked: boolean; set: boolean;
}
export interface JobGroup { id: string; kind: JobKind; label: string; truckId: string | null; areaId: string | null; jobIds: string[] }
export interface GameCargo extends Cargo { papers: 'ok' | 'missing'; transitJob: string | null; gone: boolean }
export type EntryKind = 'handling' | 'delivery' | 'gateWait' | 'late' | 'missingPapers' | 'missedTruck' | 'damaged' | 'unserved' | 'tempForklift' | 'overtime' | 'rushPapers';
export interface LedgerEntry { t: number; kind: EntryKind; amount: number; text: string; rule: string; ref: string }
export type GameEvent =
  | { kind: 'money'; entry: LedgerEntry }
  | { kind: 'hint'; key: HintKey }
  | { kind: 'notice'; t: number; text: string; tone: 'info' | 'warn' }
  | { kind: 'over' };
export interface ShiftState {
  recipe: Recipe; prices: Prices; t: number; end: number; overtimeBought: number; rng: number; seq: number;
  trucks: GameTruck[]; forklifts: GameForklift[]; cargo: GameCargo[];
  jobs: Job[]; groups: JobGroup[];       // groups in priority order
  papers: { queue: string[]; startedAt: number | null };
  ledger: LedgerEntry[];
  fired: string[];                        // ids of incident/hint events already fired
  over: boolean;
  log: { t: number; action: Action }[];
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
export interface Due { t: number; order: number; id: string; run: () => GameEvent[] }
```

- Produces (`ledger.ts`): `DEFAULT_PRICES: Prices`, `RULES: Record<EntryKind, (p: Prices) => string>`, `post(s: ShiftState, e: Omit<LedgerEntry, 'rule'>): GameEvent`, `runningFees(s: ShiftState, t: number): { ref: string; kind: 'gateWait' | 'late'; minutes: number; amount: number }[]`, `postedProfit(s): number`, `profit(s, t): number` (posted + running), `cash(s, t): number` (= `recipe.budget + profit`), `gateWaitAmount(p: Prices, minutes: number): number`, `lateAmount(p: Prices, minutes: number): number`, `fmtMoney(n: number): string` ("+€640", "−€180", "€4,280" with `sign: false`).

- [ ] **Step 1: Write the failing tests** (`ledger.test.ts`). Build a minimal `ShiftState` with a local helper (one waiting truck, one docked outbound truck with a deadline):

```ts
test('clock label', () => {
  expect(clockLabel(0)).toBe('06:00');
  expect(clockLabel(secondsFor(90))).toBe('07:30');
});
test('gate waiting: 5 free minutes, then €12 a minute', () => {
  expect(gateWaitAmount(DEFAULT_PRICES, 4)).toBe(0);
  expect(gateWaitAmount(DEFAULT_PRICES, 15)).toBe(-120);
});
test('late departure: €15 a minute', () => expect(lateAmount(DEFAULT_PRICES, 10)).toBe(-150));
test('running fees count towards the live profit', () => {
  const s = stateWithWaitingTruck({ waitSince: 0 });
  expect(runningFees(s, secondsFor(15))).toEqual([{ ref: 'TRUCK-1', kind: 'gateWait', minutes: 15, amount: -120 }]);
  expect(profit(s, secondsFor(15))).toBe(-120);
  expect(cash(s, secondsFor(15))).toBe(s.recipe.budget - 120);
});
test('post fills in the rule and returns a money event', () => {
  const s = stateWithWaitingTruck({ waitSince: 0 });
  const ev = post(s, { t: 1, kind: 'late', amount: -180, text: 'TRUCK-1 left 12 min late', ref: 'TRUCK-1' });
  expect(s.ledger[0].rule).toBe('Departure deadline · €15 per minute');
  expect(ev).toEqual({ kind: 'money', entry: s.ledger[0] });
});
test('money format', () => {
  expect(fmtMoney(640)).toBe('+€640');
  expect(fmtMoney(-180)).toBe('−€180');
  expect(fmtMoney(4280, { sign: false })).toBe('€4,280');
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/game/ledger.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `types.ts` and `ledger.ts`**

`runningFees`: for each truck in stage `waiting`, minutes = `shiftMinutes(t − times.arrived)`, giving the gate amount. For each outbound truck that hasn't departed (stage `docking`/`docked`/`waiting`) with `t > deadline`, minutes = `shiftMinutes(t − deadline)`, giving the late amount. Skip zero amounts. `RULES` copy: gateWait "Gate waiting fee · 5 free minutes, then €12 per minute", late "Departure deadline · €15 per minute", missingPapers "Papers must be complete before a unit leaves · €300 per unit", missedTruck "Unit missed its truck · €240", damaged "Rain damage · cartons and bags need cover · €200 per unit", unserved "Truck still waiting at the end of the shift · €500", handling "€40 per unit stored", delivery "€80 per unit delivered", tempForklift "Temp forklift · €150 per hour", overtime "Overtime · €400 per 30 minutes", rushPapers "Rushed papers · €40 per unit". Build each string from the `Prices` passed in, not from literals.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/game/ledger.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/types.ts src/game/ledger.ts src/game/ledger.test.ts
git commit -m "Add the shift types, clock and money ledger"
```

---

### Task 2: Recipes and the shift generator

**Files:**
- Create: `src/game/recipes.ts` (the 9 recipe entries; this task fills in shift 1 and the `HINTS` table; the other 8 are filled in by Task 10), `src/game/generate.ts`, `src/game/fixtures.ts` (test-only recipes and helpers)
- Modify: `src/world/placement.ts:137` (`recommendSpot` gains an area option)
- Test: `src/game/generate.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `demoCargo(fill, day)` (`src/world/demo.ts`); `makeUnit`, `mulberry32`, `hashString` (`src/domain/seed.ts`); `pack(v, items)` (`src/loading/pack.ts`); `vehicleById('rigid-26')`; `buildGrid`, `reachUnit` (`src/sim/grid.ts`).
- Produces:
  - `RECIPES: Recipe[]`, `recipeById(id: string): Recipe`, `HINTS: Record<HintKey, { title: string; text: string; anchor: 'timeline' | 'crew' | 'papers' | 'spend' | 'selection' }>`.
  - `newShift(recipe: Recipe): ShiftState`.
  - `recommendSpot(cargo, item, opts?: { areaId?: string })`: with `areaId`, it only searches that area. The existing callers keep working.
  - `fixtures.ts`: `TEST_RECIPE` (bays L1–L2, forklifts FL-01–FL-03, fill `quiet`, one inbound truck at 06:05 with 4 units, one outbound truck at 06:10 with stops `['Ankara','Konya']`, 4 units, deadline 08:00, budget 1000, all mechanics on, no incidents, targets `[100, 200, 300]`), `withRecipe(patch: Partial<Recipe>): Recipe`.

- [ ] **Step 1: Write the failing tests**

```ts
test('the same recipe gives the same shift', () => {
  expect(JSON.stringify(newShift(TEST_RECIPE))).toBe(JSON.stringify(newShift(TEST_RECIPE)));
});
test('trucks start scheduled, at their recipe times', () => {
  const s = newShift(TEST_RECIPE);
  expect(s.trucks.map((t) => [t.id, t.stage, t.arriveAt])).toEqual([['TRUCK-IN-1', 'scheduled', secondsFor(5)], ['TRUCK-OUT-1', 'scheduled', secondsFor(10)]]);
});
test('an inbound truck arrives packed with its units', () => {
  const t = newShift(TEST_RECIPE).trucks[0];
  expect(t.aboard).toHaveLength(4);
  expect(t.load.map((p) => p.cargoId).sort()).toEqual([...t.aboard].sort());
});
test('an outbound truck has enough reachable yard units for its stops', () => {
  const s = newShift(TEST_RECIPE);
  const grid = buildGrid(s.cargo);
  const mine = s.cargo.filter((c) => ['Ankara', 'Konya'].includes(c.destination) && !c.on && reachUnit(grid, s.cargo, c));
  expect(mine.length).toBeGreaterThanOrEqual(4);
});
test('missing papers are marked and queued for the clerk', () => {
  const s = newShift(withRecipe({ trucks: TEST_RECIPE.trucks.map((t) => (t.kind === 'outbound' ? { ...t, missingPapers: 2 } : t)) }));
  expect(s.cargo.filter((c) => c.papers === 'missing')).toHaveLength(2);
  expect(s.papers.queue).toHaveLength(2);
});
test('forklifts start at their homes, only the recipe’s ones', () => {
  expect(newShift(TEST_RECIPE).forklifts.map((f) => f.id)).toEqual(['FL-01', 'FL-02', 'FL-03']);
});
test('recommendSpot can be held to one area', () => {
  const s = newShift(TEST_RECIPE);
  const spot = recommendSpot(s.cargo, { look: 'cartons', dims: { l: 1.2, w: 0.8, h: 1 } }, { areaId: 'HS2' });
  expect(spot && 'x' in spot && areaAt(devYard, spot.x, spot.y)?.id).toBe('HS2');
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/game/generate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`newShift` steps, all driven by `mulberry32(recipe.seed)`:
1. Yard cargo: `demoCargo(recipe.fill, recipe.seed)` mapped to `GameCargo` (`papers: 'ok', transitJob: null, gone: false`).
2. For each outbound truck: relabel `units` floor units that a forklift can reach (nothing on top, `reachUnit` ok), chosen in seeded order, so their `destination` cycles through the truck's `stops`.
3. For each inbound truck: `makeUnit` × `units`, with destinations from the fed truck's stops when `feeds` is set, else seeded `DESTINATIONS`. Ids are `CARGO-9xxxx`, unique. Pack them with `pack(vehicleById('rigid-26'), items)` (all stop 1); placements go to `load`, ids to `aboard`. The units exist in `cargo` with `loadedOn: { truckId, stop: 1 }`.
4. `missingPapers`: the first N of that truck's units (in seeded order) get `papers: 'missing'`; the papers queue is all missing units in truck order.
5. Forklift homes: FL-01 `{x: 33.0, y: 31.4, heading: 0}`, FL-02 `{x: 17.0, y: 19.2, heading: Math.PI / 2}`, FL-03/04/05 their `pose` from `src/config/fleet.ts`. Export them as `FORKLIFT_HOMES` from `places.ts` in Task 3; until then, keep them in `generate.ts` and move them in Task 3.
6. `end = secondsFor(SHIFT_LENGTH_MIN)`; `prices = { ...DEFAULT_PRICES, ...recipe.prices }`; truck pose = kerb slot 0 placeholder, `stage: 'scheduled'`.

Shift 1 recipe (`opening-gate`): bays L1, L2; forklifts FL-01–03; fill `quiet`; mechanics `[]`; four inbound trucks at 06:10, 06:40, 07:30, 09:00 (4–6 units each, planned = actual); budget 0; targets `[0, 0, 0]` until Task 10. `HINTS` copy: one sentence each, telling the player what to click (e.g. basics: "Trucks wait at the gate. Click one, then pick a free bay. The first 5 minutes are free.").

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/game/generate.test.ts src/world`
Expected: PASS (the existing placement tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src/game/recipes.ts src/game/generate.ts src/game/fixtures.ts src/game/generate.test.ts src/world/placement.ts
git commit -m "Add shift recipes and the seeded shift generator"
```

---

### Task 3: Truck and forklift routes

**Files:**
- Create: `src/game/places.ts`, `src/game/legs.ts`
- Test: `src/game/places.test.ts`, `src/game/legs.test.ts`

**Interfaces:**
- Consumes: `RouteSpec`, `compileRoute`, `evalRoute`, `newPose` (`src/sim/route.ts`); `Grid`, `findPath`, `reachUnit`, `isFree`, `clearUnit` (`src/sim/grid.ts`); `truckPoseFor`, `boxToYard` (`src/loading/frame.ts`); `road`, `devYard`, `bayById`; `FORKLIFT`, `bayRear`.
- Produces (`places.ts`), all routes `once: true` with `offset: t0`, so they are evaluated at absolute engine time:
  - `KERB_Y = -1.8`; `kerbSlot(k: number): Pose` → `{ x: 57 + 12.5 * k, y: KERB_Y, heading: Math.PI }`.
  - `IN_X`, `OUT_X` (gate middle ± 4, as in `src/sim/tasks.ts`).
  - `parkedPose(bay: TruckBay): Pose` = `truckPoseFor(bay, vehicleById('rigid-26'))`.
  - `arriveRoute(slot: Pose, t0: number): RouteSpec`: from `(road.spawnEast, road.westbound)` along the westbound lane to `(slot.x + 9, road.westbound)` at 11 m/s, then pulls over to the slot at 3 m/s.
  - `queueRoute(from: Pose, to: Pose, t0: number): RouteSpec`: creep forward at 2 m/s.
  - `dockRoute(from: Pose, bay: TruckBay, t0: number): RouteSpec`: kerb → `(IN_X, KERB_Y)` → `(IN_X, 6)` (radius 4, 3.2 m/s); a 3 s "Gate check-in" wait; then the `bayVisit` docking legs (turn at y 11.5, 1.2 s wait, reverse in at 1.5 m/s), ending exactly at `parkedPose(bay)`.
  - `departRoute(bay: TruckBay, t0: number): { spec: RouteSpec; clearAt: number }`: leg 1 is parked → `(bx, 15.5)`, with `clearAt` = t0 + that leg's duration. Then the `bayVisit` departing path to check-out, a 2.5 s "Gate check-out", and out along the westbound lane to `road.spawnWest`.
  - `TEMP_IN: Pose` (`{x: IN_X - 2, y: 8, heading: Math.PI / 2}`), `tempInRoute(t0)`, `tempOutRoute(from: Pose, t0)`, and `FORKLIFT_HOMES: Record<string, Pose>` (moved from Task 2).
- Produces (`legs.ts`), lifted from the trip builder `plan` in `src/sim/loadingRun.ts:82-125` (SPEED 2.2, ACCEL 1.4, MARGIN 1.5, TRAVEL_FORK 0.4, the same dock face, queue and entry points):
  - `interface TruckAt { pose: Pose; vehicle: VehicleSpec; bay: TruckBay }`
  - `interface JobRoute { spec: RouteSpec; pickAt: number; setAt: number; doneAt: number; enterAt: number | null; leaveAt: number | null; end: Pose }`
  - `loadRoute(a: { from: Pose; grid: Grid; cargo: Cargo[]; unit: Cargo; truck: TruckAt; placement: Placement; t0: number; truckFreeAt: number }): JobRoute | null`
  - `unloadRoute(a: { from: Pose; grid: Grid; cargo: Cargo[]; unit: Cargo; truck: TruckAt; placement: Placement; spot: { x: number; y: number; yaw: number } | { on: string }; t0: number; truckFreeAt: number }): JobRoute | null`. This reverses a load trip: drive to the queue point, wait for the truck to be free, drive in to the unit, lift, back out, drive to the spot, set down.
  - `moveRoute(a: { from: Pose; grid: Grid; cargo: Cargo[]; unit: Cargo; spot: …; t0: number }): JobRoute | null`
  - In every route the in-truck part starts no earlier than `truckFreeAt + MARGIN`. `enterAt`/`leaveAt` are the times the forklift crosses the dock face. Return null when `findPath`/`reachUnit` fail.

- [ ] **Step 1: Write the failing tests**

```ts
test('kerb slots line up east of the gate, facing west', () => {
  expect(kerbSlot(0)).toEqual({ x: 57, y: -1.8, heading: Math.PI });
  expect(kerbSlot(2).x).toBe(82);
});
test('a docking truck ends parked in its bay', () => {
  const bay = bayById('L2');
  const r = compileRoute(dockRoute(kerbSlot(0), bay, 100));
  const p = evalRoute(r, 100 + r.duration + 1, newPose());
  expect(p.x).toBeCloseTo(parkedPose(bay).x, 1);
  expect(p.y).toBeCloseTo(parkedPose(bay).y, 1);
});
test('a departing truck clears its bay before it reaches the gate', () => {
  const { spec, clearAt } = departRoute(bayById('L1'), 50);
  expect(clearAt).toBeGreaterThan(50);
  expect(clearAt).toBeLessThan(50 + compileRoute(spec).duration);
});
test('a load trip waits for the truck to be free and ends at the dock face', () => {
  const { s, unit, truck, placement } = loadFixture(); // shift with one docked truck at L1 and a reachable unit
  const r = loadRoute({ from: FORKLIFT_HOMES['FL-01'], grid: buildGrid(s.cargo), cargo: s.cargo, unit, truck, placement, t0: 0, truckFreeAt: 500 })!;
  expect(r.enterAt!).toBeGreaterThanOrEqual(501.5);
  expect(r.pickAt).toBeLessThan(r.setAt);
  expect(r.doneAt).toBeCloseTo(compileRoute(r.spec).duration, 3);
});
test('an unload trip sets the unit down at its spot', () => {
  const { s, truck, placement, unit } = unloadFixture();
  const spot = { x: 20, y: 18, yaw: 0 };
  const r = unloadRoute({ from: FORKLIFT_HOMES['FL-02'], grid: buildGrid(s.cargo), cargo: s.cargo, unit, truck, placement, spot, t0: 0, truckFreeAt: -Infinity })!;
  const p = evalRoute(compileRoute(r.spec), r.setAt, newPose());
  expect(Math.hypot(p.x - spot.x, p.y - spot.y)).toBeLessThan(FORKLIFT.carryOffset + 0.3);
});
test('no route to a boxed-in unit', () => expect(loadRoute(boxedInFixture())).toBeNull());
```

Put `loadFixture`, `unloadFixture` and `boxedInFixture` in `fixtures.ts`. They are built from `newShift(TEST_RECIPE)`: dock the truck by setting its pose to `parkedPose(bayById('L1'))` and stage `docked`. The boxed-in fixture surrounds a unit with four others.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/game/places.test.ts src/game/legs.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `places.ts` and `legs.ts`** as specified above. Copy the leg shapes and statuses ("Picking CARGO-…", "To L1 · TRUCK-…", "Waiting for the dock", "Loading TRUCK-…", and for unloads "Unloading TRUCK-…", "To Main hold") from `loadingRun.ts`. Leave `loadingRun.ts` in place; Task 13 deletes it.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/game`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/places.ts src/game/legs.ts src/game/fixtures.ts src/game/*.test.ts src/game/generate.ts
git commit -m "Add one-shot truck and forklift job routes for the game"
```

---

### Task 4: Crew dispatcher

**Files:**
- Create: `src/game/crew.ts`
- Test: `src/game/crew.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `post` (Task 1), Task 3 routes, `recommendSpot` (Task 2), `buildGrid`.
- Produces:
  - `addGroup(s: ShiftState, def: { kind: JobKind; label: string; truckId: string | null; areaId: string | null; units: { unitId: string; placement: Placement | null }[] }): JobGroup`. Appends to the end of `s.groups`; ids come from `s.seq`.
  - `moveGroup(s: ShiftState, groupId: string, to: number): void`
  - `dispatch(s: ShiftState, t: number): void`: assigns jobs to free forklifts (algorithm below).
  - `crewDue(s: ShiftState): Due[]`: one `Due` per active job's next unapplied step: pick (order 10), set (order 11), done (order 12). Running a step applies it:
    - **pick:** the unit leaves its yard spot or the truck (`aboard` loses it on unload).
    - **set:** unload/move puts the unit at its spot (`transitJob = null`), and unload posts the **handling** fee. Load adds the unit to `aboard` with `loadedOn`.
    - **done:** the forklift is free at `end`, the job is `done`, and a pending breakdown starts.
  - `forkliftFree(f: GameForklift, t: number): boolean`: no job, not broken, arrived, not leaving.

**Dispatcher algorithm:**
```
loop:
  free = forklifts free at t; if none → stop
  for group in s.groups (priority order):
    job = first job of the group with status 'queued'      // order inside a group is fixed
    skip if none; skip if job.truckId's truck is not 'docked' or has dispatchPending
    if job.kind is 'unload' or 'move' and the unit has no spot yet:
      spot = recommendSpot(yard cargo, unit, { areaId: job.areaId }) → none: job.blocked = 'Area full'; continue to next group
    candidates = free forklifts sorted by distance from their pose to the pickup point (yard unit, or the dock face for unloads), then id
    for f in candidates: route = loadRoute/unloadRoute/moveRoute(... from f.pose, t0 = t, truckFreeAt = truck.busyUntil)
      first non-null → assign: job active, times set, f.jobId/motion set, truck.busyUntil = route.leaveAt ?? busyUntil,
                       unit.transitJob = job.id (unload/move: unit x/y/yaw/on/areaId set to the spot now so later spots avoid it)
                       job.blocked = null; restart loop
    no forklift could route → job.blocked = 'No forklift access'; continue to next group
  no assignment made in a full pass → stop
```

- [ ] **Step 1: Write the failing tests** (use the fixtures from Task 3):

```ts
test('jobs go out in priority order', () => { /* two groups; moveGroup(second → 0); dispatch with one free forklift → the second group's first job is active */ });
test('the nearest free forklift takes the job', () => { /* FL-01 near the platform, FL-02 in the open yard; load job for a unit near FL-02 → FL-02 */ });
test('only one forklift inside a truck at a time', () => {
  const s = dockedOutboundFixture(); addGroup(s, loadGroupFor(s, 2)); dispatch(s, 0);
  const [a, b] = s.jobs.filter((j) => j.status === 'active');
  expect(routeTimes(s, b).enterAt).toBeGreaterThanOrEqual(routeTimes(s, a).leaveAt + 1.5);
});
test('loading order inside a group is kept', () => { /* three load jobs, two forklifts: job 3 stays queued until job 1 or 2 is done */ });
test('a full area blocks unloading with a reason', () => { /* area HS2 filled; unload group to HS2 → job.blocked === 'Area full', no forklift assigned */ });
test('an unreachable unit blocks its group but not others', () => { /* boxed-in load job first, reachable move job second → move job active, load job blocked 'No forklift access' */ });
test('a broken forklift gets no work', () => { /* f.brokenUntil = 999 → dispatch assigns nothing to it */ });
test('setting down an unloaded unit pays the handling fee', () => {
  const s = dockedInboundFixture(); addGroup(s, unloadGroupFor(s, 'HS1')); dispatch(s, 0);
  runAll(crewDue, s, 10_000);  // helper: run due events in order up to t
  expect(s.ledger.filter((e) => e.kind === 'handling').map((e) => e.amount)).toEqual([40, 40, 40, 40]);
});
```

Write the bodies in full. Add `dockedInboundFixture`, `dockedOutboundFixture`, `loadGroupFor`, `unloadGroupFor`, `routeTimes` and `runAll` to `fixtures.ts`. `runAll(dueFn, s, t)` repeatedly runs the earliest `Due` with `t <= limit`, calling `dispatch` after each.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/game/crew.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `crew.ts`** following the algorithm.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/game`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/crew.ts src/game/crew.test.ts src/game/fixtures.ts
git commit -m "Add the crew dispatcher"
```

---

### Task 5: Engine — gate, bays, inbound trucks, shift end

**Files:**
- Create: `src/game/engine.ts`
- Test: `src/game/engine.inbound.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `validate(s: ShiftState, a: Action, t: number): ActionResult`: no side effects. UI buttons use it to enable/disable and to show the reason.
  - `act(s: ShiftState, a: Action, t: number): ActionResult`: calls `advance(s, t)` first, then `validate`, applies the action, logs it to `s.log`, then calls `dispatch`.
  - `advance(s: ShiftState, t: number): GameEvent[]`: while the earliest `Due` (from `allDue(s)`) has `due.t <= t`, run it, then `dispatch(s, due.t)`. Finally `s.t = t`. Ties are broken by `(t, order, id)`.
  - `allDue(s): Due[]`: crew dues plus the engine's own: truck arrival (order 1), motion ends (order 2), bay clear (order 3), shift end (order 99), plus the incident, papers and temp-forklift dues added in Task 7.
  - `nextDueTime(s): number | null` (used by the bots).
  - `suggestArea(s, truckId): string`: covered if any unit's look is `cartons` or `bag`, else the nearest area with room (the first area for which `recommendSpot` finds a spot, in the order of `recommendSpot`'s own scoring).
- Behaviour in this task:
  - **Arrival** (`arriveAt`): the truck takes the lowest free kerb slot, stage `arriving`, `arriveRoute`. At the motion end the stage becomes `waiting` and `times.arrived` is set.
  - **Kerb queue:** when a slot frees, trucks behind it move up one slot (`queueRoute`). Fees still count from `times.arrived`.
  - **assignBay:** valid only for a `waiting` truck, a bay in `recipe.bays`, not closed, not occupied by a truck in `docking`/`docked`, and not being cleared (`t < clearAt` of a departing truck). Refusal reasons: "Bay L1 is busy", "Bay L1 is still being cleared", "Bay L1 is closed until 11:00", "TRUCK-… is not waiting at the gate". Applying it posts **gateWait** if the amount ≠ 0 (text "TRUCK-104 waited 15 min at the gate"), sets `times.leftKerb`, stage `docking`, `dockRoute`, and frees the slot.
  - **Docked** (motion end): `times.docked`, pose = `parkedPose`. An inbound truck whose `storage` mechanic is off auto-runs `chooseArea(suggestArea)`.
  - **chooseArea:** valid only for a `docked` inbound truck, an area in `devYard.storage`, and only while the truck still has units aboard. It adds an unload group "Unload TRUCK-… → <area name>" with the units in reverse `seq` order. Called again (after "Area full"), it re-targets the queued jobs of that truck to the new area.
  - **Inbound done:** when `aboard` is empty and no job of the truck is active, `departRoute`, stage `departing`, `times.departed`, `times.clearAt`. At the motion end the stage is `gone`.
  - **Shift end** (`s.end`): post running fees (gateWait/late, as in `runningFees`), then **unserved** for every truck in `arriving`/`waiting`/`docking`/`docked`, set `s.over = true`, and emit `{ kind: 'over' }`. After that, `validate` refuses everything with "The shift is over".

- [ ] **Step 1: Write the failing tests**

```ts
test('a truck arrives, waits at the kerb and docks when given a bay', () => {
  const s = newShift(TEST_RECIPE);
  advance(s, secondsFor(6) + 60);
  expect(truck(s, 'TRUCK-IN-1').stage).toBe('waiting');
  expect(act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L1' }, s.t)).toEqual({ ok: true });
  advance(s, s.t + 120);
  expect(truck(s, 'TRUCK-IN-1').stage).toBe('docked');
});
test('waiting past the free minutes is charged when the truck leaves the kerb', () => { /* wait 15 shift min → one gateWait entry of −120 with text 'TRUCK-IN-1 waited 15 min at the gate' */ });
test('unloading pays per unit, then the truck leaves on its own', () => { /* chooseArea HS1 → after enough time: 4 handling entries, stage 'gone' */ });
test('with storage off the suggested area is chosen automatically', () => { /* withRecipe({ mechanics: [] }) → unload group exists right after docking */ });
test('actions in the wrong stage are refused and change nothing', () => {
  const s = newShift(TEST_RECIPE); advance(s, 1);
  const before = JSON.stringify(s);
  expect(act(s, { kind: 'assignBay', truckId: 'TRUCK-IN-1', bayId: 'L1' }, 1)).toEqual({ ok: false, reason: 'TRUCK-IN-1 is not waiting at the gate' });
  expect(act(s, { kind: 'chooseArea', truckId: 'TRUCK-IN-1', areaId: 'HS1' }, 1).ok).toBe(false);
  expect(act(s, { kind: 'dispatch', truckId: 'TRUCK-IN-1' }, 1).ok).toBe(false);
  expect(JSON.stringify(s)).toBe(before);
});
test('a bay is not free until the departing truck has pulled out', () => { /* inbound truck departs from L1; second truck assignBay L1 before clearAt → 'Bay L1 is still being cleared'; after clearAt → ok */ });
test('trucks still at the gate or in the yard at 14:00 are fined', () => { /* never assign bays → at end: gateWait entries posted + one 'unserved' −500 per arrived truck, s.over, validate → 'The shift is over' */ });
test('advance is step-size independent', () => {
  const plan = (s: ShiftState) => { /* scripted actions at fixed times: assignBay at 300, chooseArea at 420 */ };
  const a = runScripted(TEST_RECIPE, plan, 0.25);   // helper: advance in 0.25 s steps, act at the scripted times
  const b = runScripted(TEST_RECIPE, plan, 10_000); // one big step between actions
  expect(b.ledger).toEqual(a.ledger);
  expect(b.trucks.map((t) => t.pose)).toEqual(a.trucks.map((t) => t.pose));
});
```

Write the bodies in full. `truck(s, id)` and `runScripted(recipe, plan, step)` go in `fixtures.ts`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/game/engine.inbound.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `engine.ts`** (inbound part, validation, the `advance` loop and shift end).

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/game`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/engine.ts src/game/engine.inbound.test.ts src/game/fixtures.ts
git commit -m "Run the gate, bays and inbound trucks in the shift engine"
```

---

### Task 6: Engine — outbound trucks and planning

**Files:**
- Create: `src/game/planning.ts`
- Modify: `src/game/engine.ts`
- Test: `src/game/planning.test.ts`, `src/game/engine.outbound.test.ts`

**Interfaces:**
- Consumes: `planAll(inputs, cargo, confirmed)` (`src/loading/candidates.ts`), `TruckPlanInput`, `LoadPlan`.
- Produces (`planning.ts`):
  - `planningCargo(s: ShiftState): Cargo[]`: yard units only. It drops units that are aboard, gone, damaged/written off, or carried right now (`transitJob` with a picked job), and units in another truck's confirmed `plan`.
  - `planTrucks(s: ShiftState): { id: string; route: string[]; vehicle: VehicleId }[]`: outbound trucks in `docked` stage without a confirmed plan, in `times.docked` order.
  - `recommendPlan(s: ShiftState, truckId: string, overrides?: Partial<Pick<TruckPlanInput, 'exclude' | 'urgent' | 'include'>>): LoadPlan`: runs `planAll` over `planTrucks(s)`, with the confirmed plans of the others held.
- Produces (`engine.ts`):
  - **confirmPlan:** valid for a `docked` outbound truck with no plan and at least one placement whose units are all in `planningCargo`. It stores `plan`, `load = plan.placements`, and adds the group "Load TRUCK-…" with placements in `seq` order.
  - **Loaded:** a selector `isLoaded(t: GameTruck): boolean` (every placement aboard).
  - **dispatch:** valid for a `docked` outbound truck (with or without a plan). Queued (unassigned) jobs of the truck are cancelled at once. Active jobs finish: `busyUntil` already covers the last active job's exit from the truck, so their units get aboard. If `t < busyUntil`, it sets `dispatchPending` and the truck departs at `busyUntil` through a due of order 4. On departure it posts:
    - **delivery** (`delivery` or `rushDelivery` × units aboard; text "TRUCK-109 dispatched · 8 units")
    - **late** if past the deadline ("TRUCK-110 left 12 min late")
    - **missingPapers** per aboard unit with missing papers ("CRG-… left without papers")
    - **missedTruck** per planned unit not aboard and not written off ("CARGO-… left behind by TRUCK-…")

    Units aboard become `gone: true`. Then `departRoute`.

- [ ] **Step 1: Write the failing tests**

```ts
// planning.test.ts
test('a docked outbound truck gets a plan from the yard units for its stops', () => { /* dock TRUCK-OUT-1 → recommendPlan(...).placements.length >= 1, all destinations in ['Ankara','Konya'] */ });
test('units carried, aboard, written off or held by another plan are never offered', () => {
  const s = twoOutboundDockedFixture();
  const held = confirmFirstTruck(s);               // confirm TRUCK-OUT-1's plan
  markCarried(s, someUnit(s)); markWrittenOff(s, otherUnit(s));
  const ids = recommendPlan(s, 'TRUCK-OUT-2').placements.map((p) => p.cargoId);
  for (const id of [...held, someUnit(s).id, otherUnit(s).id]) expect(ids).not.toContain(id);
});
// engine.outbound.test.ts
test('confirm, load, dispatch: paid per unit aboard', () => { /* confirm → advance until isLoaded → dispatch → one delivery entry = 80 × units */ });
test('leaving late, with missing papers or units left behind is fined', () => { /* missingPapers 1, dispatch after deadline with one unit not yet loaded → late, missingPapers, missedTruck entries with the right amounts */ });
test('dispatch while a forklift is inside waits for it', () => { /* dispatch mid-load → dispatchPending, departs at busyUntil, queued jobs cancelled */ });
test('wrong-stage outbound actions are refused', () => { /* confirmPlan on inbound truck, confirm twice, dispatch a waiting truck → ok:false, state unchanged */ });
```

Write the bodies in full, adding the fixtures to `fixtures.ts`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/game/planning.test.ts src/game/engine.outbound.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `planning.ts` and the outbound parts of `engine.ts`.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/game`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/planning.ts src/game/engine.ts src/game/*.test.ts src/game/fixtures.ts
git commit -m "Plan, load and dispatch outbound trucks in the shift engine"
```

---

### Task 7: Engine — queue, papers, incidents, spending, moves, hints

**Files:**
- Modify: `src/game/engine.ts`
- Test: `src/game/engine.extras.test.ts`

**Interfaces:**
- Produces, as actions and dues in `engine.ts`:
  - **reorder** `crew`: `moveGroup`. **reorder** `papers`: moves a unit in `papers.queue`; the unit the clerk is working on stays first. Both need the `queue` / `papers` mechanic.
  - **urgent:** the truck's groups move to the top, and `urgent = true` (`queue` mechanic).
  - **Clerk** (due, order 20): the head of `papers.queue` is done `secondsFor(recipe.clerkMin ?? 20)` after `startedAt`. Its papers become `ok`, the head is removed, and the next one starts.
  - **rushPapers:** −€40 (cash must cover it), papers `ok`, removed from the queue. If it was the head, the next unit starts now.
  - **rentForklift**`(hours)`: −€150 × hours, which cash must cover. It adds forklift `FL-T1` (`FL-T2`, … if already rented) with `temp: true` and `arrivesAt` at the end of `tempInRoute`, and `leaveAt = arrivesAt + secondsFor(60 × hours)`. At `leaveAt` it finishes its job, then leaves through `tempOutRoute` and is removed. Needs the `tempForklift` mechanic.
  - **overtime:** −€400, which cash must cover. `end += secondsFor(30)`, at most 2 times ("Overtime is used up"). Needs the `overtime` mechanic.
  - **moveUnits:** the units must be in the yard, not carried, and every unit stacked on one of them must be in the list ("CARGO-… has CARGO-… on top"). This adds the group "Move N units → <area>", with the top units first.
  - **Incidents:**
    - breakdown at `atMin`: if the forklift is idle, `brokenUntil = t + duration`; else `breakdownPendingSec = duration`, applied at its job's `done`. Notice "FL-02 broke down · back at 11:00".
    - rain: a notice at `atMin − 45` ("Rain at 10:30 · N units in the open yard need cover"); damage check at `atMin + 10` (units written off: `gone: true`, −€200 each, removed from any confirmed plan's expected units).
    - bayClosed: notices at `fromMin` and `toMin`; `validate` refuses the bay in between.
    - Rush trucks (`rush: true`) arrive like any other truck; their notice is "Rush order: TRUCK-… · due 11:30 · double pay".
  - **Hint events** (`{ kind: 'hint', key }`), each once per shift, recorded in `fired`:
    - `basics` at t 0
    - `storage` when the first inbound truck docks with the mechanic on
    - `outbound` when the first outbound truck arrives
    - `papers` at the first missing-papers unit's truck arrival
    - `queue` at t 0 when the recipe has it
    - `tempForklift` at the first breakdown
    - `rain` at the rain notice
    - `bayClosed` at the closure
    - `rushOrder` at the rush arrival
    - `overtime` at 13:00

    A hint for a mechanic the recipe doesn't have is never emitted.

- [ ] **Step 1: Write the failing tests**, one per bullet above. Each test names the behaviour and asserts on the ledger, state fields or events, for example:

```ts
test('the clerk fixes papers in queue order, 20 minutes each', () => { /* two missing units; advance secondsFor(20) → first ok, second missing; reorder can't move the head */ });
test('rushing papers costs €40 and needs the cash', () => { /* budget 30 → ok:false 'Not enough cash (€40 needed)'; budget 1000 → −40 entry, papers ok */ });
test('a breakdown waits for the current job to finish', () => { /* busy FL-02 at atMin → still active; after doneAt → brokenUntil = doneAt + duration */ });
test('rain writes off uncovered cartons and bags only', () => { /* cartons in OY damaged −200; drum in OY and cartons in HS1 untouched; written-off unit no longer in planningCargo */ });
test('a temp forklift joins after it arrives and leaves after its hours', () => { /* rentForklift 1 → −150; not free before arrivesAt; gone from s.forklifts after leaveAt + exit */ });
test('overtime moves the end by 30 minutes, twice at most', () => { /* end += secondsFor(30) twice; third → 'Overtime is used up' */ });
test('moving units needs the units on top in the move too', () => { /* move bottom only → refused with reason; bottom + top → group with top first */ });
test('urgent puts a truck’s jobs first', () => { /* two groups; urgent second truck → its group index 0 */ });
test('hints fire once, only for the recipe’s mechanics', () => { /* recipe mechanics ['storage'] → events contain basics and storage once; never 'rain' */ });
test('mechanics that are off refuse their actions', () => { /* mechanics [] → reorder, urgent, rushPapers, rentForklift, overtime all ok:false */ });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/game/engine.extras.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the actions and dues in `engine.ts`. If the file grows past ~500 lines, move the incident dues into `src/game/incidents.ts` (exporting `incidentDue(s): Due[]`).

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/game`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/
git commit -m "Add the job queue, papers, incidents, spending and hints to the engine"
```

---

### Task 8: Selectors, report and replay

**Files:**
- Create: `src/game/select.ts`, `src/game/report.ts`
- Test: `src/game/select.test.ts`, `src/game/report.test.ts`

**Interfaces:**
- Produces (`select.ts`, pure, used by the HUD):
  - `interface Segment { kind: 'plan' | 'wait' | 'dock' | 'late'; from: number; to: number }` (minutes after 06:00)
  - `timelineRows(s, t): { truckId: string; kind: 'inbound' | 'outbound'; segments: Segment[]; deadlineMin: number | null; selectable: boolean }[]`. There's one row per truck with `plannedArriveAt !== null`, plus rush trucks once they arrive.
    - `plan`: planned arrival → planned arrival + 60 min for inbound, or the deadline for outbound.
    - `wait`: arrived → leftKerb (or now).
    - `dock`: leftKerb → departed (or now).
    - `late`: deadline → departed (or now) when past.
  - `bayInfo(s, t): { id: string; truckId: string | null; closedUntilMin: number | null; clearing: boolean; done: number; total: number }[]` for `recipe.bays`.
  - `truckView(s, id, t)`: stage label ("At the gate · 7 min", "Docked at L2 · unloading 2/6", "Loaded · ready to dispatch"), the running fee chip (amount per minute and live total), and `actions` (each `{ action: Action; label: string; result: ActionResult }`, from `validate`).
  - `crewView(s, t)`: groups with rank, label, tag (`LOAD`/`UNLOAD`/`MOVE`), forklift ids on them, done/total, and the blocked reason.
  - `papersView(s, t)`: the queue with clerk minutes left on the head.
  - `briefingRows(recipe)`: the planned trucks only.
  - `rainMoveAction(s): Action | null`: during a rain warning, a `moveUnits` of every `cartons`/`bag` unit in an uncovered area (with the units stacked on them) to the covered area with the most room; null when there are none. Used by the rain notice's one-click button (spec §1.4).
- Produces (`report.ts`):
  - `starsFor(profit: number, targets: [number, number, number]): 0 | 1 | 2 | 3`
  - `interface Report { recipeId: string; profit: number; stars: 0 | 1 | 2 | 3; nextTarget: number | null; earnings: { label: string; amount: number }[]; fines: LedgerEntry[]; spending: LedgerEntry[]; lesson: string }`
  - `buildReport(s: ShiftState): Report`. Earnings are grouped as "58 units delivered × €80" and "26 units stored × €40". Fines are in time order. The lesson comes from the fine kind with the biggest total, via `LESSONS[kind](total)`. With no fines: "A clean shift. Next time, push for more trucks served."
  - `LESSONS` copy:
    - late: "Late departures cost you €X. Give outbound trucks a bay first and confirm their plans early; inbound trucks can wait their 5 free minutes."
    - gateWait: "Gate waiting cost you €X. Give trucks a bay before their 5 free minutes run out."
    - missingPapers: "Units left without papers cost you €X. Put the clerk on the units of the next truck to leave, or rush them."
    - missedTruck: "Units left behind cost you €X. Wait for the last unit, or move it up the queue earlier."
    - damaged: "Rain damage cost you €X. Move cartons and bags under cover as soon as the warning comes."
    - unserved: "Trucks still waiting at the end cost you €X. Keep the bays turning, or buy overtime."
  - `replay(recipe: Recipe, log: ShiftState['log'], until: number): ShiftState`: a fresh shift, with each logged action applied at its time.

- [ ] **Step 1: Write the failing tests**

```ts
test('stars from profit targets', () => {
  expect(starsFor(2999, [3000, 5000, 7000])).toBe(0);
  expect(starsFor(5000, [3000, 5000, 7000])).toBe(2);
  expect(starsFor(9000, [3000, 5000, 7000])).toBe(3);
});
test('the report adds up to the profit', () => { /* finished scripted shift → sum(earnings)+sum(fines)+sum(spending) === profit === postedProfit(s) */ });
test('the lesson names the biggest loss', () => { /* ledger with late −690, gateWait −180 → lesson starts 'Late departures cost you €690' */ });
test('replaying the action log gives the same ledger', () => { const s = scriptedShift(); expect(replay(s.recipe, s.log, s.t).ledger).toEqual(s.ledger); });
test('timeline: a truck that waited then docked', () => { /* arrived at 06:10, leftKerb 06:25 → wait 10–25, dock 25–now */ });
test('truck actions explain why they are disabled', () => { /* waiting truck, L1 busy → action assignBay L1 result { ok:false, reason:'Bay L1 is busy' } */ });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/game/select.test.ts src/game/report.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `select.ts` and `report.ts`.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/game`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/select.ts src/game/report.ts src/game/*.test.ts
git commit -m "Add HUD selectors, the shift report and action replay"
```

---

### Task 9: Campaign progress

**Files:**
- Create: `src/game/progress.ts`
- Test: `src/game/progress.test.ts`

**Interfaces:**
- Consumes: `safeStorage` pattern from `src/world/inventory.ts:96`. Copy it into `progress.ts`, since Task 13 deletes `inventory.ts`.
- Produces: `interface Progress { version: 1; shifts: Record<string, { stars: 0 | 1 | 2 | 3; bestProfit: number }>; hintsSeen: HintKey[] }` and `useProgress` (Zustand + `persist`, name `docktor.campaign`, version 1, `migrate` that returns a fresh `Progress` for unknown or corrupt data) with:
  - `record(recipeId: string, profit: number, stars: 0 | 1 | 2 | 3): { best: boolean }`: keeps the max stars and the max profit.
  - `seeHint(key: HintKey): void`
  - `isUnlocked(no: number): boolean`: shift 1 always; shift n when shift n−1 has ≥ 1 star.
  - `totalStars(): number`
  - `reset(): void`

- [ ] **Step 1: Write the failing tests**: record keeps the best stars and the best profit independently; shift 2 is locked until shift 1 has a star; a corrupt saved value (`'{"state":5}'`) loads as fresh progress without throwing; hints are remembered.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/game/progress.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `progress.ts`.** In tests, stub `localStorage` with an in-memory map; `safeStorage` already tolerates a missing `window`.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/game/progress.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/progress.ts src/game/progress.test.ts
git commit -m "Save campaign progress in the browser"
```

---

### Task 10: Bots, the nine recipes and balancing

**Files:**
- Create: `src/game/bots.ts`, `src/game/balance.test.ts`
- Modify: `src/game/recipes.ts` (shifts 2–9, then the targets for all 9), `package.json` (script `"balance": "BALANCE=1 vitest run src/game/balance.test.ts"`)

**Interfaces:**
- Produces:
  - `type Policy = (s: ShiftState, t: number) => Action[]`
  - `basicBot: Policy`: bays first come first served, `suggestArea`, `recommendPlan` as is, dispatch when loaded, nothing else.
  - `goodBot: Policy`. It:
    - orders bays and the queue by deadline (outbound first, earliest deadline)
    - rushes papers for units on the next truck to leave when the fine would apply
    - moves cartons and bags out of uncovered areas at the rain notice
    - rents one forklift for 2 hours when a breakdown would make a truck late
    - buys overtime when a truck would otherwise be unserved
  - `runShift(recipe: Recipe, policy: Policy, step = 5): { state: ShiftState; report: Report }`. From t 0 to the end: call the policy, `act` each action, then `advance` to `min(t + step, nextDueTime)`.

Starting recipes (then tune times so the good bot clearly beats the basic bot):

| # | id | bays | forklifts | fill | trucks (in / out) | incidents | budget | mechanics added |
|---|---|---|---|---|---|---|---|---|
| 2 | `where-it-goes` | L1–L2 | FL-01–03 | normal | 4 / 1 (fed by one inbound, due 13:00) | — | 0 | storage |
| 3 | `first-load` | L1–L3 | FL-01–03 | normal | 3 / 3 | — | 0 | outbound |
| 4 | `paper-chase` | L1–L3 | FL-01–03 | normal | 3 / 3, 6 units missing papers | — | 500 | papers |
| 5 | `the-queue` | L1–L3 | FL-01–03 | busy | 4 / 4 | — | 500 | queue |
| 6 | `breakdown` | L1–L4 | FL-01–04 | busy | 4 / 4 | breakdown FL-02 09:30, 90 min | 1500 | tempForklift |
| 7 | `bad-weather` | L1–L4 | FL-01–04 | busy | 4 / 4 | rain 10:30; L2 closed 08:00–11:00 | 1500 | rain, bayClosed |
| 8 | `rush-order` | L1–L4 | FL-01–04 | busy | 4 / 4 + rush at 10:00, due 11:30 | — | 2000 | rushOrder, overtime |
| 9 | `peak-day` | L1–L4 | FL-01–05 | peak | 5 / 5 + rush | breakdown + rain | 2000 | — |

Mechanics accumulate (shift n has everything from shifts ≤ n). Briefing copy for each comes from spec §2 ("New today: …", the rule with its amount). Some trucks in shifts 5–9 get `arriveMin` ≠ `plannedArriveMin` (early/late, ±20–40 min).

- [ ] **Step 1: Write `balance.test.ts`** (fails while targets are `[0, 0, 0]`):

```ts
describe.each(RECIPES)('$no $name', (recipe) => {
  const basic = runShift(recipe, basicBot).report.profit;
  const good = runShift(recipe, goodBot).report.profit;
  const floor100 = (n: number) => Math.floor(n / 100) * 100;
  const want: [number, number, number] = [floor100(basic), floor100((basic + 0.95 * good) / 2), floor100(0.95 * good)];
  if (process.env.BALANCE) console.log(recipe.id, { basic, good, targets: want });
  test('targets match the bots', () => expect(recipe.targets).toEqual(want));
  test('targets are in order and the good bot clearly beats the basic one', () => {
    expect(want[0]).toBeLessThan(want[1]); expect(want[1]).toBeLessThan(want[2]);
    expect(good - basic).toBeGreaterThanOrEqual(1000);
  });
  test('the basic bot can pass', () => expect(basic).toBeGreaterThanOrEqual(recipe.targets[0]));
  test('a shift runs headless in under a second', () => { const t0 = performance.now(); runShift(recipe, goodBot); expect(performance.now() - t0).toBeLessThan(1000); });
});
```

- [ ] **Step 2: Implement `bots.ts`** and fill in recipes 2–9.

- [ ] **Step 3: Run the balance script**

Run: `npm run balance`
Expected: one line per shift with `basic`, `good` and `targets`. Tune truck times and counts until each shift shows good − basic ≥ €1000 and the targets are in order. Then copy the printed targets into each recipe's `targets`.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/bots.ts src/game/balance.test.ts src/game/recipes.ts package.json
git commit -m "Add test bots, the nine shifts and balanced star targets"
```

---

### Task 11: Game store and the 3D scene on the engine

**Files:**
- Create: `src/game/motion.ts`, `src/game/store.ts`, `src/scene/GameClock.tsx`
- Modify: `src/sim/clock.ts` (`SPEEDS = [1, 2, 4] as const`), `src/scene/YardScene.tsx`, `src/scene/vehicles/Truck.tsx`, `src/scene/vehicles/Forklift.tsx`, `src/scene/cargo/CargoLayer.tsx`, `src/scene/cargo/Overlays.tsx`, `src/scene/loading/CarriedUnit.tsx`
- Test: `src/game/store.test.ts`, `src/game/motion.test.ts`

**Interfaces:**
- Produces (`motion.ts`):
  - `poseAt(m: Motion | null, rest: Pose, t: number, out: RoutePose): RoutePose`. Compiled routes are cached in a `WeakMap<RouteSpec, CompiledRoute>`. After `until` it returns the route's end pose; with no motion it returns `rest` with `visible: true`.
  - `carriedBy(s: ShiftState, forkliftId: string, t: number): string | null`: the unit while `pickAt <= t < setAt`.
  - `yardUnitsAt(s: ShiftState, t: number): GameCargo[]`: units in the yard and not gone, hidden while carried (`pickAt <= t`), and for unloads not shown before `setAt`.
- Produces (`store.ts`):

```ts
type Screen = 'campaign' | 'briefing' | 'shift' | 'report';
interface GameStore {
  screen: Screen; recipeId: string | null; shift: ShiftState | null; version: number;
  toasts: { id: number; entry: LedgerEntry }[]; notices: { id: number; text: string; tone: 'info' | 'warn' }[];
  hint: HintKey | null; report: Report | null; paused: boolean;
  openCampaign(): void; openBriefing(recipeId: string): void; startShift(): void; restart(): void;
  act(a: Action): ActionResult; tick(): void; setPaused(p: boolean): void; dismissHint(): void; dismissToast(id: number): void;
}
export const useGame: UseBoundStore<StoreApi<GameStore>>;
```

  - `startShift` resets everything: `newShift`, `clock.t = 0`, speed 1, not paused, toasts/notices/hint/report cleared, `useLoading.getState().resetAll()` once Task 12 lands, `useUi` selection cleared.
  - `tick` runs `advance(shift, clock.t)` and turns events into toasts (max 3, auto-dismissed by the HUD after 4 s), notices, and a hint (only if not yet in `useProgress.hintsSeen`; showing it calls `seeHint`). On `over`: `buildReport`, `useProgress.record`, screen `report`, clock paused. Bump `version` on any change.
  - `act` forwards to the engine at `clock.t` and bumps `version`.
- Scene:
  - `GameClock`: a `setInterval(tick, 250)` while the screen is `shift`.
  - `Truck` gets an optional `drive?: (out: RoutePose) => void` prop, used instead of `evalRoute` when given; doors open while `stage === 'docked'`.
  - `Forklift` gets `drive?: (out: RoutePose) => void` and `carry?: () => string | null`, which replace `jobPose`/`carriedAt`.
  - `YardScene` renders `shift.trucks` (not `scheduled`/`gone`) and `shift.forklifts` from `useGame`, each building a `TruckSpec`/`ForkliftSpec` from the game record (rigid, `body: 'rigid-26'`, carrier livery, status = `truckView` stage label). Workers and road traffic stay as they are.
  - `CargoLayer`, `Overlays` and `CarriedUnit` read `yardUnitsAt` and `carriedBy` through `useGame` (re-rendered on `version`).

- [ ] **Step 1: Write the failing tests**

```ts
// store.test.ts (node; zustand works without a DOM)
test('starting a shift resets everything from the last one', () => {
  const g = useGame.getState(); g.openBriefing('opening-gate'); g.startShift();
  clock.t = 400; g.tick(); useGame.setState({ hint: 'basics', toasts: [{ id: 1, entry: fakeEntry }] }); g.setPaused(true); useSim.getState().setSpeed(4);
  g.restart();
  const s = useGame.getState();
  expect([s.shift!.t, s.toasts.length, s.hint, s.paused, clock.t, useSim.getState().speed]).toEqual([0, 0, null, false, 0, 1]);
});
test('ticking turns ledger entries into toasts, at most three', () => { /* scripted shift with 5 handling entries in one tick → 3 toasts, newest kept */ });
test('the end of the shift opens the report and records progress', () => { /* clock.t = shift.end + 1; tick → screen 'report', report.profit === profit, useProgress shifts[id] set */ });
// motion.test.ts
test('a unit is not drawn in the yard while carried', () => { /* active load job: before pickAt in yardUnitsAt, between pickAt and setAt not, carriedBy = unit id */ });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/game/store.test.ts src/game/motion.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `motion.ts`, `store.ts`, `GameClock`, and the scene changes. For now `App.tsx` still mounts the old dashboard; temporarily call `useGame.getState().openBriefing('opening-gate'); startShift()` from a `useEffect` in `App.tsx` so the scene has a shift. Task 17 replaces this with the real flow.

- [ ] **Step 4: Run the tests, the typecheck and the app**

Run: `npm test && npm run typecheck`
Expected: PASS.
Run: `npx vite --port 5321 --strictPort` (background), then capture `http://localhost:5321/?ui=0` with headless chromium (`--ignore-gpu-blocklist --enable-gpu --use-angle=gl --window-size=1600,920 --virtual-time-budget=30000`).
Expected: a truck on the road or at the kerb, forklifts at their homes, and yard cargo drawn.

- [ ] **Step 5: Commit**

```bash
git add src/game/motion.ts src/game/store.ts src/game/*.test.ts src/scene src/sim/clock.ts src/App.tsx
git commit -m "Drive the 3D yard from the shift engine"
```

---

### Task 12: The load planner on the game

**Files:**
- Modify: `src/loading/store.ts`, `src/loading/frame.ts` (`bayOfTruck`), `src/ui/planner/PlannerDashboard.tsx`, `src/ui/planner/RouteRail.tsx`, `src/ui/planner/PlannerTopBar.tsx`, `src/ui/planner/ConfirmPrompt.tsx`, `src/ui/planner/PlannerTable.tsx`, `src/scene/loading/LoadView.tsx`, `src/game/store.ts`
- Test: `src/loading/store.test.ts` (rewritten)

**Interfaces:**
- Produces (`src/loading/store.ts`):

```ts
export interface PlanSource {
  trucks(): { id: string; route: string[]; vehicle: VehicleId }[];   // = planTrucks(shift)
  cargo(): Cargo[];                                                  // = planningCargo(shift)
  bayOf(truckId: string): TruckBay | null;
  papersMissing(cargoId: string): boolean;
  onConfirm(truckId: string, plan: ConfirmedPlan): ActionResult;     // = act confirmPlan
}
export function setPlanSource(src: PlanSource): void;
```

  - Remove `persist`, every `useInventory` use, `DEFAULT_ROUTES`/`PLAN_QUEUE`/`fleet`, and the stop editing (`setRoute`, `moveStop`, `addStop`, `removeStop`, `setVehicle`).
  - `confirm` calls `source.onConfirm` and returns its result; the `by` field becomes "Yard manager".
  - `bayOfTruck(truckId)` delegates to the source.
  - The game store calls `setPlanSource` once at module load, `resetAll()` in `startShift`, and `replan()` after any tick in which yard cargo changed (a pick or set event) or a truck docked.
- UI:
  - Hide `VehicleRail`; `RouteRail` shows the stops read-only.
  - `PlannerTopBar` drops Load at dock, Follow, Skip and Dispatch.
  - After a successful Confirm the planner closes (`useView` planner → null).
  - `PlannerTable` shows a "Papers missing" warning chip on units where `papersMissing` is true.
  - `ConfirmPrompt`'s confirm-anyway reason flow stays.

- [ ] **Step 1: Rewrite `src/loading/store.test.ts`**: a fake `PlanSource` with two trucks and a small cargo list. Draft plans come from the source; Confirm calls `onConfirm` with the plan and sets `confirmed`; an `onConfirm` refusal is passed through and leaves the draft; nothing is written to localStorage.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/loading/store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the store and UI changes.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/loading src/ui/planner src/scene/loading src/game/store.ts
git commit -m "Plan loads from the shift instead of the twin's inventory"
```

---

### Task 13: Remove the twin

**Files:**
- Delete:
  - `src/world/snapshot.ts`, `src/world/snapshot.test.ts`, `src/world/store.ts`, `src/world/inventory.ts`, `src/world/inventory.test.ts`
  - `src/sim/dockRun.ts`, `src/sim/dockRun.test.ts`, `src/sim/jobs.ts`, `src/sim/jobs.test.ts`, `src/sim/loadingRun.ts`, `src/sim/loadingRun.test.ts`, `src/sim/control.ts`, `src/sim/tasks.ts` (move `walkLoop` into `src/config/fleet.ts` first if workers still need it)
  - `src/ui/{KpiCards,OpsTable,ShipmentTracker,DetailPanel,CargoDetail,CargoForm,DocumentForm,LayersPanel,TopBar,Minimap,Toasts,Dashboard,MapButtons}.tsx`, `src/ui/{documents,actions,status}.ts`, `src/scene/cargo/Placement.tsx`, `src/scene/RouteLines.tsx`, `src/config/routes.ts`
- Modify:
  - `src/config/fleet.ts`: keep workers, traffic and forklift static data (names, models); drop the trucks and every scripted truck and forklift route.
  - `src/state/ui.ts`: drop the document and cargo dialogs, `placing` and the old toasts.
  - `src/ui/focus.ts`: positions come from `useGame` and the registry.
  - `src/scene/DevHooks.tsx`: expose `useGame` and `useProgress`.
  - `src/domain/seed.ts`: drop `seedDocuments` and `documentNumber` if unused.
  - `src/App.tsx`: render `<GameRoot />`.
  - `package.json`: remove `@fontsource-variable/inter` in Task 14, not here.
- Create: `src/ui/game/GameRoot.tsx` (for now: the canvas overlay with `GameClock` and the planner dashboard when the planner is open; Task 17 completes it).

**Interfaces:**
- Consumes: everything from Tasks 11–12. Keep the camera buttons from `MapButtons.tsx`: move zoom, rotate and home into `src/ui/game/CameraStrip.tsx` before deleting it.

- [ ] **Step 1: Find every importer of the files to delete**

Run: `grep -rln "world/snapshot\|world/store\|world/inventory\|sim/dockRun\|sim/jobs\|sim/loadingRun\|sim/control\|sim/tasks\|config/routes\|ui/Dashboard\|ui/TopBar" src`
Expected: a list; each one is changed in Step 2 or deleted.

- [ ] **Step 2: Delete and rewire** as listed. Nothing outside the deleted set may still import them.

- [ ] **Step 3: Run the tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS. The test count drops by the deleted test files, and all `src/game` tests pass.

- [ ] **Step 4: Check the app still runs.** Use a headless capture as in Task 11, without `?ui=0`.
Expected: the yard with game trucks, and no console errors (`--enable-logging=stderr`).

- [ ] **Step 5: Commit**

```bash
git add -A src package.json
git commit -m "Remove the twin's dashboard, inventory and scripted traffic"
```

---

### Task 14: Theme and UI kit

**Files:**
- Modify: `src/index.css`, `src/main.tsx` (font imports), `package.json`
- Create: `src/ui/game/kit.tsx`, `src/ui/game/format.ts`
- Test: `src/ui/game/format.test.ts`

**Interfaces:**
- Produces:
  - Fonts: `npm i @fontsource/barlow @fontsource/barlow-condensed` and `npm rm @fontsource-variable/inter`. In `main.tsx` import `@fontsource/barlow/{400,500,600,700}.css` and `@fontsource/barlow-condensed/{700,800,700-italic,800-italic}.css`; these default weight files include latin-ext.
  - `@theme` tokens: `--color-navy`, `--color-brand`, `--color-hot`, `--color-go`, `--color-stop`, `--color-paper`, `--font-sans: 'Barlow'`, `--font-display: 'Barlow Condensed'`. The old `ink`/`muted`/`faint`/`line` tokens are re-pointed to navy-based values so the planner picks up the theme without layout changes.
  - `kit.tsx` components, all Tailwind: `Slant` (skewed wrapper that un-skews its children), `Panel`, `PanelHead({ icon, title, count })`, `Tag({ tone: 'in' | 'out' | 'move' | 'free' | 'late' | 'new' })`, `Btn({ tone: 'hot' | 'paper' | 'brand' | 'ghost', disabledReason? })` (disabled buttons show the reason as `title` and in an `aria-describedby` span), `Chip({ tone: 'ok' | 'warn' | 'bad' })`, `Stars({ n, of: 3 })`, `Num` (display font, italic 800, tabular). Orange (`hot`) fills use navy text.
  - `format.ts`: `minuteX(min: number, endMin: number): number` (0–100 %), `fmtClockMin(min)`, plus `fmtMoney` re-exported from the ledger.

- [ ] **Step 1: Write the failing test**: `minuteX(0, 480) === 0`, `minuteX(240, 480) === 50`, `minuteX(600, 510)` clamps to 100, `fmtClockMin(282) === '10:42'`.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/ui/game/format.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the theme, fonts and kit. Check contrast for each token pair used for text with a 10-line script in the scratchpad (WCAG relative luminance). Every pair must be ≥ 4.5:1; record the results in the commit message body.

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/main.tsx package.json package-lock.json src/ui/game
git commit -m "Add the broadcast scoreboard theme and UI kit"
```

---

### Task 15: Shift HUD

**Files:**
- Create: `src/ui/game/{Scoreboard,Timeline,CrewQueue,PapersPanel,SpendBar,MoneyToasts,Notices}.tsx`, `src/ui/game/keys.ts`
- Modify: `src/ui/game/GameRoot.tsx`
- Test: `src/ui/game/keys.test.ts`

**Interfaces:**
- Consumes: `useGame`, `select.ts` (Task 8), `profit`/`cash` (Task 1), the kit (Task 14).
- Produces, laid out per mockup `layout.html` option 3:
  - **Scoreboard** (top): the shift tag "3/9 First load"; the clock with a progress line 06:00 → end and speed buttons 1×/2×/4× (pause is Esc only); profit (live, from `profit(shift, clock.t)`) with `Stars` and "next ★ at €…".
  - **Timeline** (bottom left, right edge at 28 %): one row per `timelineRows` entry, with segments positioned by `minuteX`.
    - plan is pale, wait is striped orange with a "WAIT" label on wide segments, dock is brand blue, late is stop red with "LATE".
    - A white tick marks each deadline, and an orange "now" line the current time.
    - Rain and closure markers come from the recipe.
    - Clicking a row selects the truck (`useUi.select`) and focuses the camera.
    - Re-rendered from a 250 ms interval, not per frame.
  - **Right column:**
    - `CrewQueue`: rank, tag, label, forklift ids, done/total, blocked reason in orange. Up/down buttons and drag reorder appear only with the `queue` mechanic; Urgent lives on the selection card.
    - `PapersPanel` (with `papers`): the head shows clerk minutes left, and each row has Rush €40 with `disabledReason`.
    - `SpendBar`: Temp forklift (with `tempForklift`; 1-hour rentals) and Overtime (with `overtime`), with prices, the cash left and `disabledReason` from `validate`.
  - **MoneyToasts**: under the scoreboard on the left, in the lower-third style: amount block + text + rule. Auto-dismissed after 4 s, at most 3, newest on top. They slide in over 200 ms and out over 150 ms, with no slide under `prefers-reduced-motion`.
  - **Notices**: an orange strip for warnings (rain, breakdown, rush) above the timeline, auto-dismissed after 8 s. The rain notice carries a "Move under cover" button that acts `rainMoveAction(shift)` (disabled with a reason when it is null).
  - `keys.ts`: `keyAction(e: { key: string; target: unknown }): 'speed1' | 'speed2' | 'speed4' | 'pause' | null`. It ignores keys typed into inputs and textareas. GameRoot wires it to `useSim.setSpeed` and `useGame.setPaused(!paused)`.

- [ ] **Step 1: Write the failing test**: `keyAction({ key: '1', target: {} }) === 'speed1'`, `'3' → 'speed4'`, `'Escape' → 'pause'`, `{ key: '2', target: { tagName: 'INPUT' } } → null`.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/ui/game/keys.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the HUD components** and mount them in `GameRoot` while the screen is `shift`.

- [ ] **Step 4: Check it in the browser**

Run: `npm test && npm run build`. Then start the dev server and capture `http://localhost:5321/` at 1600×920 with headless chromium (GPU flags) after `--virtual-time-budget=60000`.
Expected: the scoreboard, timeline rows and crew queue look like `layout.html` option 3, with no text overflow at 1600×920 and 1280×720 (capture both).

- [ ] **Step 5: Commit**

```bash
git add src/ui/game
git commit -m "Add the shift HUD: scoreboard, truck timeline, crew, papers and spending"
```

---

### Task 16: Selection card, world tags and hints

**Files:**
- Create: `src/ui/game/{SelectionCard,WorldTags,Hint}.tsx`, `src/scene/Projector.tsx`
- Modify: `src/ui/game/GameRoot.tsx`, `src/scene/YardScene.tsx`, `src/state/ui.ts` (multi-select of cargo for Move: `selectedCargo: string[]`, shift-click adds)
- Test: `src/ui/game/anchor.test.ts`

**Interfaces:**
- Produces:
  - `Projector` (inside the canvas): one `useFrame` that projects the anchors (selected entity, bays from `recipe.bays`, trucks with a running fee; ≤ 12) to screen space. It writes `left`/`top` straight onto registered DOM nodes through refs, with no React state per frame.
  - `anchor.ts` (`src/ui/game/anchor.ts`): `cardPlacement(p: { x: number; y: number }, card: { w: number; h: number }, view: { w: number; h: number }, avoid: { top: number; bottom: number; right: number }): { left: number; top: number; pinBelow: boolean }`. It keeps the card on screen, clear of the scoreboard (top), the timeline (bottom) and the right column.
  - `SelectionCard`, for a truck, uses `truckView(...).actions`:
    - waiting: Send to bay, one button per bay (busy/closed disabled, with the reason)
    - docked inbound: Store in, one button per area (fill % and "covered")
    - docked outbound: Plan load (opens the planner), Dispatch (asks to confirm when the load is incomplete or has missing papers), Urgent (with `queue`)

    For selected cargo: Move to… (one button per area) and Rush papers. Each button shows its `result.reason` when disabled.
  - `WorldTags`: slanted tags such as "L1 · 3/8", "L3 · FREE", "L2 · CLOSED", and "€12/min" over a truck with a running fee.
  - `Hint`: a callout anchored to the panel named by `HINTS[key].anchor`, with "Got it" calling `dismissHint`.

- [ ] **Step 1: Write the failing tests** for `cardPlacement`: a point near the right column flips the card to the left of it; a point under the scoreboard pushes the card down; the result always fits inside the view.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/ui/game/anchor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the components.

- [ ] **Step 4: Check in the browser.** With Playwright's `browser_evaluate`, or through `DevHooks`, call `useGame.getState().act(...)` to set up a waiting truck and select it. Capture the screen.
Expected: the card next to the truck with bay buttons (one disabled with a reason), bay tags over L1–L2, and the basics hint visible on a fresh progress.

- [ ] **Step 5: Commit**

```bash
git add src/ui/game src/scene src/state/ui.ts
git commit -m "Add the selection card, world tags and first-time hints"
```

---

### Task 17: Campaign, briefing, report and pause screens

**Files:**
- Create: `src/ui/game/{Campaign,Briefing,Report,PauseMenu,HowToPlay}.tsx`
- Modify: `src/ui/game/GameRoot.tsx`, `src/App.tsx` (remove the temporary auto-start from Task 11)

**Interfaces:**
- Consumes: `useGame` screens, `useProgress`, `RECIPES`, `briefingRows`, `buildReport` output (`useGame.report`).
- Produces, per mockup `screens.html`:
  - **Campaign:** 9 cards (number, name, `teaches`, stars, best profit). The next playable shift is outlined orange with Play; locked shifts show a lock and aren't focusable buttons. Total stars sit top right. Keyboard: Tab and Enter.
  - **Briefing:** shows what's new and the rule from `recipe.briefing`, a mini timeline (`briefingRows`), the three targets, the budget, and bays/forklifts counts. Start shift → `startShift()`.
  - **Report:** profit and stars; "€… short of ★★" (or "All three stars"); best so far with "new best"; the money list; fines with time (`clockLabel`), text and rule; the lesson. Campaign, Retry (`restart`) and Next shift (enabled when the next shift is unlocked).
  - **PauseMenu** (Esc while in a shift): a solid navy cover over the whole canvas with Resume, Restart shift, How to play and Quit to campaign. Opening it pauses the clock and closing it resumes.
  - **HowToPlay:** the `HINTS` texts as one list.
  - **GameRoot flow:** the app opens on Campaign. A reload during a shift returns to Campaign; progress is kept.

- [ ] **Step 1: Check the screens in the browser.** These screens have no pure logic left to unit-test; the flow is covered by the store tests in Task 11. Script the flow with Playwright MCP against the dev server: Campaign → Play shift 1 → Briefing → Start → set `clock.t` past the end through `DevHooks` → Report → Retry → Esc → Pause → Quit.
Expected: each screen appears in order and Report shows a profit and stars. Capture each screen.

- [ ] **Step 2: Implement** the screens and the flow until Step 1 passes.

- [ ] **Step 3: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/game src/App.tsx
git commit -m "Add the campaign, briefing, report and pause screens"
```

---

### Task 18: Verification, performance and README

**Files:**
- Modify: `README.md`, `docs/screenshot.png` (replace), `docs/load-planner.png` (re-capture in the new theme)

- [ ] **Step 1: Run the full suite**

Run: `npm test && npm run typecheck && npm run build && npm run balance`
Expected: all PASS; the balance output matches the recipe targets.

- [ ] **Step 2: Play through all 9 shifts.** Use the dev server, sped up with 4×, and use `DevHooks` to unlock shifts. In each shift use the shift's new mechanic once, finish it, and check that the report's fines match what happened.
Expected: no console errors, and no truck or forklift stuck (each truck either leaves or is listed as unserved).

- [ ] **Step 3: Measure fps on the HD 620.** Run headless `/usr/bin/chromium --ignore-gpu-blocklist --enable-gpu --use-angle=gl --window-size=1600,920` on shift 9 at 1×, with a `requestAnimationFrame` counter injected over 10 s.
Expected: ≥ 30 fps. If lower, profile and fix (`Merge`/instancing for cargo, fewer DOM updates) before continuing.

- [ ] **Step 4: Rewrite the README** for the game: what it is (a training game for yard managers), how a shift plays, the 9 shifts, how it's made (engine, bots, balance), and commands (`npm run dev`, `npm test`, `npm run balance`). Replace the screenshots.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/screenshot.png docs/load-planner.png
git commit -m "Describe the training game in the README"
```
