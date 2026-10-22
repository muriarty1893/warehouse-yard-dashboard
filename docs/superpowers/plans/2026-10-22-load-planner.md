# Load Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A truck load planner inside the Docktor yard twin. It packs yard cargo into a truck at a loading bay, checks axles at departure and after every drop, and animates the forklift loading run.

**Architecture:**
- **Solver.** A pure-TypeScript solver in `src/loading/` (vehicles, axle statics, packer, candidates/overflow, seeded optimiser in a Web Worker). A persisted `useLoading` store keeps the recommended, confirmed and loaded plans apart.
- **Planner mode.** Planner mode is a view state that hides the yard dashboard. It shows planner panels, flies the camera to the bay and renders a cutaway truck with the packed units.
- **Loading run.** The loading run is a set of one-shot forklift routes built on an A* grid, evaluated on the existing sim clock.

**Tech Stack:** React 19, TypeScript 7 (strict), three.js 0.186 via React Three Fiber 9 + drei, Zustand 5 (persist), Tailwind 4, Vitest 5, Vite 8 (module Web Worker).

**Spec:** `docs/superpowers/specs/2026-10-22-load-planner-design.md`. Read it before any task; section numbers below (§1.4 etc.) refer to it.

## Global Constraints

**Code style and boundaries**
- TypeScript strict, no `any`. Match the surrounding style:
  - 2-space indent, single quotes, long single lines like the existing files
  - JSDoc on exported things, sparse inline comments
- `src/loading/*` and `src/sim/grid.ts` / `src/sim/loadingRun.ts` must not import `three`, React, `src/scene/*` or `src/ui/*`.
- No airsup code, names or branding. All UI uses `src/ui/kit.tsx` / `src/ui/panel.tsx` and the theme tokens in `src/index.css` (`ink`, `muted`, `faint`, `brand`, `line`).

**Units and fixed values**
- Units: metres and kilograms internally. Show tonnes with 2 decimals ("6.52 t"), kg with thousands separators ("6,521 kg").
- Stop colours, fixed, index = stop number − 1: `['#f0932b', '#2f5ff0', '#22b35e', '#7a5af0', '#e0527a']`. Routes have 1–5 stops.
- Axle status thresholds:
  - `ok` < 90%
  - `near` 90–100% inclusive
  - `over` > 100%
  - `light` = steer share below `minSteerShare` (0.20)

**Persistence**
- `docktor.inventory` goes to version 3 with a migration. `docktor.loading` is version 1.
- Both use the same safe storage and layout-hash guard (`inventory.ts`).

**Commands and commits**
- Commands: `npm test`, `npm run typecheck`, `npm run build`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work happens on branch `load-planner`.

**Performance**
- Planner mode (idle and during a run) stays within 10% of the yard view's fps.
- Measure with headless `/usr/bin/chromium --ignore-gpu-blocklist --enable-gpu --use-angle=gl`; the Playwright MCP browser is software-rendered.

## Review Focus

1. **Empty plans.** A route with no packable candidates (none in the yard, all under other units, all containers) must show an empty truck with "No cargo for this route", and Confirm must be disabled. Never crash. → Task 4 test `empty route gives an empty plan`, Task 6 test `confirm refuses an empty plan`.
2. **One-stop routes.** A route of exactly one stop has only the departure state, and the last stop cannot be removed. → Task 1 test `single stop has only the departure state`, Task 6 test `route keeps at least one stop`.
3. **Stale saved plans.** Saved plans that reference cargo which no longer exists (reset, new day, older save) must load without errors and read as out of date. → Task 6 test `hydrated plan with unknown cargo is out of date`.
4. **Units that can never fit.** A unit heavier than the whole payload, or larger than the interior, is left out with its reason. Packing still terminates. → Task 3 test `unit heavier than the payload is left out`.
5. **No forklift path.** When a unit is boxed in and no forklift path exists, that trip is skipped with "No forklift path to CARGO-x" and the run continues. → Task 12 test `boxed-in unit is skipped with a reason`.

---

## File Structure

**`src/loading/` — the solver (pure)**

| File | Responsibility |
|---|---|
| `types.ts` | Shared plan types (`PackItem`, `Placement`, `LoadPlan`, `AxleReport`, …) |
| `vehicles.ts` | `VEHICLES` presets, `vehicleById`, `axleCoefficients` |
| `axles.ts` | Statics: axle loads, checks, after-drop states, distribution curve, CoG window |
| `pack.ts` | Extreme-point packer with the §1.5 rules |
| `plan.ts` | `buildPlan` = pack + axle report + rows + stats |
| `candidates.ts` | Route candidates, left-out reasons, `planAll` with overflow |
| `optimise.ts`, `optimise.worker.ts` | Seeded search, ranking, worker wrapper + client |
| `frame.ts` | Box frame ↔ model-local ↔ yard coordinate helpers |
| `store.ts` | `useLoading` persisted store, auto re-plan, out-of-date detection |

**`src/config/` — data**

| File | Responsibility |
|---|---|
| `routes.ts` | Default routes per plannable truck, the queue order |
| `cities.ts` | lat/lon for the yard and the 12 destinations, `stopEtas` |

**`src/sim/` — the loading run**

| File | Responsibility |
|---|---|
| `grid.ts` | Occupancy grid + A* + path simplification |
| `loadingRun.ts` | Builds one-shot forklift routes and trip timings for a confirmed plan |
| `jobs.ts` | `useJobs` store: active job routes, in-transit set, `floorAt` |

**`src/scene/loading/` — 3D**

| File | Responsibility |
|---|---|
| `LoadView.tsx` | Planner-mode scene pieces: packed units, axle chips, row anchors, viewport offset |
| `PackedUnits.tsx` | Instanced cargo prims inside the truck (ghost/solid) |
| `CarriedUnit.tsx` | The unit on a forklift's forks during a run |

**`src/ui/planner/` — the planner screen**

| File | Responsibility |
|---|---|
| `PlannerDashboard.tsx` | Layout shell |
| `PlannerTopBar.tsx` | Truck chip, view switch, actions |
| `VehicleRail.tsx`, `RouteRail.tsx` | The left rail |
| `AxleCard.tsx`, `DistributionChart.tsx` | The right column |
| `PlannerKpis.tsx`, `PlannerTable.tsx` | The bottom area |
| `RowCards.tsx` | Row card overlay |
| `PlanDrawing.tsx` | 2D plan view |
| `UrgentPicker.tsx` | Urgent-unit picker |
| `format.ts` | `fmtT`, `fmtKg`, `STOP_COLORS` |

**Modified files**

| Area | Files |
|---|---|
| Domain & data | `src/domain/types.ts`, `src/domain/seed.ts`, `src/world/inventory.ts`, `src/world/placement.ts`, `src/world/snapshot.ts`, `src/config/fleet.ts` |
| Sim & view state | `src/sim/route.ts`, `src/sim/clock.ts`, `src/state/view.ts`, `src/App.tsx` |
| Scene | `src/scene/YardScene.tsx`, `src/scene/CameraRig.tsx`, `src/scene/vehicles/Truck.tsx`, `src/scene/vehicles/Forklift.tsx`, `src/scene/cargo/CargoLayer.tsx`, `src/scene/DevHooks.tsx` |
| UI | `src/ui/Dashboard.tsx`, `src/ui/DetailPanel.tsx`, `src/ui/OpsTable.tsx`, `src/ui/CargoForm.tsx`, `src/ui/CargoDetail.tsx` |

---

# Milestone 1 — Solver

### Task 1: Vehicles and axle statics

**Files:**
- Create: `src/loading/types.ts`, `src/loading/vehicles.ts`, `src/loading/axles.ts`
- Test: `src/loading/axles.test.ts`

**Interfaces:**
- Produces (in `types.ts`):

  ```ts
  export type VehicleId = 'rigid-12' | 'rigid-18' | 'rigid-26' | 'semi-136' | 'container-40';
  export type AxleId = 'front' | 'rear' | 'steer' | 'drive' | 'trailer';
  export interface AxleSpec { id: AxleId; label: string; tareKg: number; ratingKg: number }
  export interface VehicleSpec {
    id: VehicleId; label: string; axleCount: number;
    inner: { l: number; w: number; h: number }; deck: number;
    axles: AxleSpec[];
    statics: { kind: 'rigid'; front: number; rear: number }
           | { kind: 'artic'; kingpin: number; trailer: number; steerAhead: number; driveBehind: number; kingpinTareKg: number };
    gvwKg: number; payloadKg: number; minSteerShare: number; overallLength: number;
    /** Drawing: model kind, model-local x of the inner front wall, door plane → model origin, rear axle positions (model-local x). */
    model: { kind: 'rigid' | 'semi' | 'container'; frontWall: number; doorsToOrigin: number; rearAxles: number[]; frontAxle: number };
  }
  /** A point mass in the box frame (x from the inner front wall towards the doors). */
  export interface Mass { x: number; kg: number; stop: number }
  export type AxleStatus = 'ok' | 'near' | 'over' | 'light';
  export interface AxleLoad { id: AxleId; label: string; kg: number; ratingKg: number; pct: number; status: AxleStatus }
  export interface LoadState { afterStop: number; label: string; payloadKg: number; cogX: number | null; axles: AxleLoad[]; issues: string[] }
  export interface CurvePoint { x: number; maxKg: number }
  export interface AxleReport { states: LoadState[]; ok: boolean; issues: string[]; curve: CurvePoint[]; window: [number, number] | null; cogX: number | null; payloadKg: number }
  ```
- Produces (in `vehicles.ts`):
  - `VEHICLES: Record<VehicleId, VehicleSpec>`, with values exactly as in spec §1.3. The model numbers are:

    | Vehicle | `frontWall` | `doorsToOrigin` | `rearAxles` | `frontAxle` |
    |---|---|---|---|---|
    | rigid-26 | 4.2 | 3.4 | [0, −1.3] | 5.3 |
    | rigid-18 | 4.6 | 2.8 | [0] | 5.8 |
    | rigid-12 | 3.9 | 2.4 | [0] | 4.9 |
    | semi-136 | 0.8 | 12.7 | [−9.0, −10.3, −11.6] | 3.6 |
    | container-40 | 0.1 | 12.25 | [−9.0, −10.3, −11.6] | 3.6 |

  - Other fields: `overallLength` 8.6 / 9.9 / 10.5 / 16.5 / 16.5 (rigid-12, -18, -26, semi, container); `minSteerShare` 0.2; tractor `steerAhead` 3.6 and `driveBehind` 0.65.
  - `vehicleById(id: VehicleId): VehicleSpec`.
  - `axleCoefficients(v: VehicleSpec): { id: AxleId; label: string; tareKg: number; ratingKg: number; a: number; b: number }[]`. Each axle load = `tareKg + P·(a + b·x)`, derivation in spec §1.4. For artic, the kingpin tare splits onto steer/drive by `driveBehind/(steerAhead+driveBehind)`.
- Produces (in `axles.ts`):
  - `axleLoads(v: VehicleSpec, masses: Mass[]): AxleLoad[]`
  - `loadState(v, masses, afterStop: number): LoadState`. The label is `'Depart'` for afterStop 0, else `After ${n}`.
  - `axleReport(v: VehicleSpec, masses: Mass[], stops: number): AxleReport`. It returns states for afterStop 0…stops−1; a state after stop k drops masses with `stop ≤ k`.
  - `distributionCurve(v): CurvePoint[]` (100 samples over [0, inner.l])
  - `cogWindow(v, payloadKg): [number, number] | null`

- [ ] **Step 1: Write the failing tests** in `src/loading/axles.test.ts`:
  - `rigid-18: 5.8 t at x=1.7 puts the front axle at its 7.5 t rating`: front kg ≈ 7500 (`toBeCloseTo(7500, 0)`), rear ≈ 6600, front status `'near'`, rear `'ok'`.
  - `semi-136: 20 t at x=6.8 splits 7244 / 11905 / 16250`: steer ≈ 7244, drive ≈ 11905, trailer ≈ 16250 (`toBeCloseTo(…, 0)`). The sum equals 15,400 + 20,000.
  - `steer too light is reported`: rigid-18 with 9.7 t at x = 7.3 → front status `'light'` (or `'over'` for rear), `issues` non-empty, and the report is not `ok`.
  - `after-drop states drop earlier stops first`: stops = 3, masses at stop 1 (x = 6.5, 2 t), stop 2 (x = 3, 2 t), stop 3 (x = 1, 2 t). Expect `states.length === 3`, payload 6000 → 4000 → 2000, and CoG moving towards the front (decreasing).
  - `single stop has only the departure state`: `axleReport(v, masses, 1).states.length === 1`.
  - `distribution curve matches brute force`: for 10 sampled x, `maxKg` ≈ the largest P (bisection on `loadState` of one mass at x) with no issues, within 1 kg.
  - `cog window contains the plan's legal CoG`: for P = 4000 on rigid-18, window is non-null, `window[0] < window[1]`, and a single mass at the window middle has no issues.
- [ ] **Step 2: Run them.** `npx vitest run src/loading/axles.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement** `types.ts`, `vehicles.ts` and `axles.ts` with the signatures above.
  - The issue strings name the axle and the state, e.g. `Front axle over 7.5 t after stop 1` or `Steer axle too light at departure`.
  - Payload over the preset payload gives `Payload over 9.7 t`.
- [ ] **Step 4: Run them.** `npx vitest run src/loading/axles.test.ts` → PASS. Then run `npm run typecheck` → no errors.
- [ ] **Step 5: Commit** — `git add src/loading && git commit -m "Add vehicle presets and axle statics for the load planner"`, with the trailer.

### Task 2: Cargo fields, inventory actions, migration

**Files:**
- Modify: `src/domain/types.ts`, `src/domain/seed.ts`, `src/world/inventory.ts`, `src/world/placement.ts`, `src/world/snapshot.ts:480-551` (KPIs/areas), `src/config/fleet.ts`
- Test: `src/world/inventory.test.ts` (new)

**Interfaces:**
- Produces:
  - `Cargo.fragile?: boolean`
  - `Cargo.loadedOn?: { truckId: string; stop: number } | null`
  - `CargoEventKind` gains `'planned' | 'loaded'`
  - In `seed.ts`: `FRAGILE_GOODS = ['LED Panel 60×60', 'Ceramic Tiles', 'Kitchen Appliances']`. `makeUnit` sets `fragile: true` when the description is in it.
  - Inventory state gains `epoch: number`. It is incremented by `reset` and `newDay`, so other stores can detect a wholesale change.
  - `loadOnto(cargoId: string, truckId: string, stop: number, where: string): Result`. It sets `loadedOn` and `areaId: null` / `on: null`, and logs `'loaded'` with text `Loaded onto ${truckId} at ${where}`.
  - `logPlanned(ids: string[], truckId: string, stopLabel: (id: string) => string): void`. It logs `'planned'` with text `Planned for ${truckId} · ${stopLabel(id)}`.
  - `dispatch(truckId: string): number`. It releases every unit loaded on that truck with event `'released'` text `Left the yard on ${truckId}`, and returns the count.
  - `locationOf(item)` returns `${loadedOn.truckId}` for loaded units.
  - `inYard(c: Cargo): boolean` (`!c.loadedOn`), exported from `placement.ts`.
  - Placement checks (`checkFloor`, `checkStack`, `recommendSpot`), `areaStates`, `kpis.cargo` and `docsMissing` use only `inYard` units.
  - `TruckSpec` gains `plannable?: boolean` and `body?: VehicleId`. Set them on TRUCK-102, TRUCK-109 and TRUCK-110 (`body: 'rigid-26'`).
- Migration: `persist` version 3 with `migrate(saved, from)`. For `from < 3`, keep every record. Set `fragile` on demo units from `FRAGILE_GOODS`, and add `epoch: 0`.

- [ ] **Step 1: Write the failing tests** in `src/world/inventory.test.ts`. Reset the store with `useInventory.setState(...)` from `demoCargo('normal', 1)` in `beforeEach`.
  - `loadOnto takes a unit out of the yard`: `loadedOn` is set, `inYard` is false, `locationOf` is `'TRUCK-102'`, and the last event is kind `'loaded'`.
  - `loaded units do not block placement`: a floor spot that overlapped the loaded unit now passes `checkFloor`.
  - `dispatch releases only that truck's units`: two loaded on TRUCK-102 and one on TRUCK-109 → returns 2, and TRUCK-109's unit is still present.
  - `migration from v2 keeps manual records and flags fragile goods`: call the exported `migrateInventory({ ...v2State }, 2)`. A manual unit survives, and a demo unit described as `'Ceramic Tiles'` gets `fragile: true`.
  - `reset and newDay bump epoch`.
- [ ] **Step 2: Run them.** `npx vitest run src/world/inventory.test.ts` → FAIL.
- [ ] **Step 3: Implement** the interfaces above. Export `migrateInventory` for the test. Keep `layout.test.ts` green.
- [ ] **Step 4: Run the full suite.** `npm test` → all PASS. Then run `npm run typecheck` → clean.
- [ ] **Step 5: Commit** — "Track fragile and loaded cargo in the inventory".

### Task 3: Packer

**Files:**
- Create: `src/loading/pack.ts`
- Modify: `src/loading/types.ts`
- Test: `src/loading/pack.test.ts`

**Interfaces:**
- Consumes: `VehicleSpec`, `axleLoads` (Task 1).
- Produces (in `types.ts`):

  ```ts
  export interface PackItem { id: string; stop: number; l: number; w: number; h: number; weightKg: number; stackable: boolean; fragile: boolean; urgent: boolean }
  export interface Placement { cargoId: string; stop: number; seq: number; x: number; y: number; z: number; l: number; w: number; h: number; yaw: 0 | 90; weightKg: number; on: string | null }
  export interface LeftOut { cargoId: string; reason: string; to: string | null }
  export interface PackOptions { seed: number; shuffle: boolean; yawFirst: 0 | 90; side: 1 | -1; jitter: number }
  ```
  `Placement.x, y, z` is the min corner in the box frame, and `l, w` are the as-placed extents along box x/y.
- Produces (in `pack.ts`):
  - `pack(v: VehicleSpec, items: PackItem[], opts?: Partial<PackOptions>): { placements: Placement[]; leftOut: LeftOut[] }`
  - Defaults: `{ seed: 0, shuffle: false, yawFirst: 0, side: 1, jitter: 0 }`
  - Rules: exactly §1.5 steps 1–4 (selection, packing order, extreme points, the validity checks, reasons). `seq` is assigned after packing by sorting on (x, z).
  - `shuffle` uses `mulberry32(seed)` from `src/domain/seed.ts` to shuffle ties. `jitter` scales the score weights by `1 ± jitter`.

**Algorithm notes:**
- **Candidate points.** The extreme points are `(0,0,0)` plus, for each placed box, (x + l, y, z), (x, y + w, z) and (x, y, z + h). Drop points outside the interior. Re-generate points after each placement.
- **Support.** Support for z > 0 is the overlap area with boxes whose top is within 1 cm of z, ÷ the footprint area.
- **Door-access test** for a new unit `u` against a placed unit `p`:
  - If `p.stop < u.stop`: fail when `u` lies in `p`'s door corridor (`u.x ≥ p.x + p.l − 0.01`, with y- and z-ranges overlapping).
  - If `p.stop > u.stop`: fail when `p` lies in `u`'s corridor.
  - A unit may rest only on units with `stop ≥` its own.

- [ ] **Step 1: Write the failing tests.** Use a helper `pallet(id, stop, kg, opts?)` → 1.2 × 0.8 × 1.2 stackable.
  - `no overlaps and inside the interior`: 18 mixed items on rigid-26. Every pair of placements is disjoint (2 cm gap), and every placement is within `inner`.
  - `last stop goes to the front wall`: 3 stops × 4 pallets → max x of stop-3 units < min x of stop-1 units.
  - `door access holds for every pair`: random 20 items, stops 1–4, seed 7 → no stop-k unit has a later-stop unit in its corridor.
  - `nothing rests on fragile or non-stackable units`: for every placement with `on`, the unit below is stackable and not fragile.
  - `heavier never on lighter`.
  - `support at least 80%`.
  - `yaw only 0 or 90 and never tipped` (h unchanged).
  - `unit heavier than the payload is left out`: a 7,000 kg item on rigid-12 → `leftOut[0].reason` matches `/Payload/`. The test completes.
  - `too big for the interior is left out`: h = 2.9 on rigid-26 → reason matches `/Too big/`.
  - `urgent units are selected first when payload runs out`: 12 × 900 kg pallets on rigid-12 (6 t), the last one urgent → it is placed.
  - `same seed, same result`: deep-equal across two calls with `{ seed: 3, shuffle: true }`.
- [ ] **Step 2: Run them.** `npx vitest run src/loading/pack.test.ts` → FAIL.
- [ ] **Step 3: Implement** `pack`.
- [ ] **Step 4: Run them.** `npx vitest run src/loading/pack.test.ts` → PASS. Then run `npm run typecheck`.
- [ ] **Step 5: Commit** — "Add the load planner's packer".

### Task 4: Plans, routes, candidates and overflow

**Files:**
- Create: `src/loading/plan.ts`, `src/loading/candidates.ts`, `src/config/routes.ts`, `src/config/cities.ts`
- Modify: `src/loading/types.ts`
- Test: `src/loading/candidates.test.ts`

**Interfaces:**
- Consumes: `pack`, `axleReport` (Tasks 1, 3); `Cargo`, `isStackable`, `hasOnTop`, `inYard` (Task 2).
- Produces (in `types.ts`):

  ```ts
  export interface RowStat { index: number; x0: number; x1: number; fillPct: number; kg: number; topId: string | null }
  export interface PlanStats { units: number; candidates: number; weightKg: number; remainingKg: number; volumePct: number; weightPct: number; rowsUsed: number; rows: number; limitedBy: string }
  export interface LoadPlan {
    vehicle: VehicleId; route: string[]; placements: Placement[]; leftOut: LeftOut[];
    checks: AxleReport; rows: RowStat[]; stats: PlanStats;
    seed: number; tried: number; ms: number;
    /** Hash of route + vehicle + overrides; per-unit fingerprints of the goods and of the yard spot. */
    inputsHash: number; units: Record<string, { goods: number; spot: number }>;
  }
  export interface TruckPlanInput { truckId: string; route: string[]; vehicle: VehicleId; include: { cargoId: string; stop: number }[]; exclude: string[]; urgent: string[] }
  /** A plan straight from the packer, before hashing and search stats. */
  export type PlanCore = Omit<LoadPlan, 'inputsHash' | 'units' | 'tried' | 'ms'>;
  ```
- Produces (in `plan.ts`):
  - `buildPlan(v: VehicleSpec, items: PackItem[], route: string[], opts?: Partial<PackOptions>): PlanCore`
  - Rows: `round(inner.l / 1.2)` equal rows.
  - `limitedBy`: the worst axle label if its pct ≥ 90; else `'floor space'` if `volumePct ≥ 85` or any reason mentions space; else `'payload'`.
- Produces (in `candidates.ts`):
  - `fingerprint(c: Cargo): { goods: number; spot: number }`. `goods` hashes dims, weight, look, fragile and destination; `spot` hashes x, y, yaw and on.
  - `candidatesFor(input: TruckPlanInput, cargo: Cargo[], taken: Set<string>): { items: PackItem[]; blocked: LeftOut[] }`. Blocked reasons as in §1.2: `'Container — goes on a chassis, not into a truck'`, `` `Under ${topId} — move it first` ``, `'Too big for this vehicle (…)'`.
  - `planAll(inputs: TruckPlanInput[], cargo: Cargo[], confirmed: Record<string, LoadPlan | null>): Record<string, LoadPlan>`. The queue is the `inputs` order:
    - Each truck skips units taken by another truck's confirmed plan, or already placed earlier in this pass.
    - Then it fills each `leftOut.to` per §1.7: the truck that took the unit, else the next truck whose route has its destination and has room, else `null`.
- Produces (in `routes.ts`):
  - `PLAN_QUEUE = ['TRUCK-102', 'TRUCK-109', 'TRUCK-110']`
  - `DEFAULT_ROUTES: Record<string, string[]>`, values exactly as in spec §1.1
- Produces (in `cities.ts`):
  - `CITIES: Record<string, [lat: number, lon: number]>` for `Yard` (Istanbul 40.85, 29.30) and the 12 destinations of `DESTINATIONS`, at published city-centre coordinates
  - `stopEtas(departYardSeconds: number, route: string[]): number[]` per §1.1 (great-circle × 1.25, 70 km/h, +30 min per drop)

- [ ] **Step 1: Write the failing tests.** Fixtures are built with `demoCargo('normal', 1)` plus hand-made units.
  - `candidates are the route's yard units`: every item's cargo destination ∈ route, and none is loaded or taken.
  - `containers, units under others and too-big units are left out with reasons` (three asserts on reason text).
  - `include adds a unit at the chosen stop; exclude removes one; urgent sets urgent`.
  - `empty route gives an empty plan`: a route `['Nowhere']` gives 0 placements, `stats.units === 0`, and `checks.window === null` (no throw).
  - `overflow goes to the next truck on the queue that covers the destination`: shrink TRUCK-102 to `rigid-12` with route `['Ankara']` and enough Ankara units → some `leftOut.to === 'TRUCK-110'`.
  - `a unit is planned on at most one truck`.
  - `stopEtas increase along the route` and `Ankara is about 4–6 h from the yard`.
- [ ] **Step 2: Run them.** `npx vitest run src/loading/candidates.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** `npx vitest run src/loading` → PASS. Then run `npm run typecheck`.
- [ ] **Step 5: Commit** — "Plan trucks from yard cargo with overflow to the next truck".

### Task 5: Optimise and its worker

**Files:**
- Create: `src/loading/optimise.ts`, `src/loading/optimise.worker.ts`
- Test: `src/loading/optimise.test.ts`

**Interfaces:**
- Consumes: `buildPlan` (Task 4).
- Produces:
  - `rankPlans(a: PlanCore, b: PlanCore): number`, negative when `a` is better. Lexicographic, exactly as in §1.6:
    1. checks ok
    2. urgent units placed
    3. units placed
    4. weight placed
    5. min axle headroom across all states (larger wins)
    6. |CoG − window centre| (smaller wins)
  - `optimise(v: VehicleSpec, items: PackItem[], route: string[], opts?: { maxTries?: number; budgetMs?: number; now?: () => number }): { plan: PlanCore; tried: number; ms: number }`. Defaults: 1000 tries, 600 ms budget.
    - Seed 0 is the baseline (no shuffle).
    - Seeds 1…N use `shuffle: true`, `yawFirst` and `side` taken from the seed's bits, and `jitter: 0.2`.
  - `optimiseInWorker(args): Promise<…same…>` in `optimise.ts`. It uses `new Worker(new URL('./optimise.worker.ts', import.meta.url), { type: 'module' })`, and falls back to `optimise` chunked with `setTimeout(0)` every 50 tries when `typeof Worker === 'undefined'`.

- [ ] **Step 1: Write the failing tests.**
  - `same inputs, same best plan`: two runs with `now` stubbed to a counter → deep-equal plans.
  - `never ranks an illegal plan above a legal one`: hand-build two plans → `rankPlans(legalFewer, illegalMore) < 0`.
  - `respects the try budget`: `maxTries: 25` → `tried === 25`.
  - `is at least as good as the baseline`: `rankPlans(result.plan, baseline) <= 0`.
- [ ] **Step 2: Run them.** `npx vitest run src/loading/optimise.test.ts` → FAIL.
- [ ] **Step 3: Implement** (the worker file posts `optimise(...)` results back; no other logic).
- [ ] **Step 4: Run them.** `npx vitest run src/loading/optimise.test.ts` → PASS. Then run `npm run build`; it must bundle the worker.
- [ ] **Step 5: Commit** — "Add seeded Optimise for load plans".

### Task 6: Loading store

**Files:**
- Create: `src/loading/store.ts`
- Modify: `src/world/inventory.ts` (export `LAYOUT` and `safeStorage`)
- Test: `src/loading/store.test.ts`

**Interfaces:**
- Consumes: `planAll`, `fingerprint`, `candidatesFor` (Task 4); `useInventory`, `epoch`, `logPlanned` (Task 2); `trucks` (fleet); `DEFAULT_ROUTES`, `PLAN_QUEUE`.
- Produces:

  ```ts
  export type PlanStatus = 'draft' | 'confirmed' | 'loading' | 'loaded' | 'dispatched';
  export interface ConfirmedPlan extends LoadPlan { confirmedAt: number; by: string; overriddenChecks: string[]; reason: string | null }
  export interface TruckPlanState { truckId: string; route: string[]; vehicle: VehicleId; include: { cargoId: string; stop: number }[]; exclude: string[]; urgent: string[];
    recommended: LoadPlan | null; confirmed: ConfirmedPlan | null; keptOutdated: boolean; status: PlanStatus }
  export const useLoading: UseBoundStore<…> // state: { epoch: number; trucks: Record<string, TruckPlanState> } + actions below
  ```
- Actions:
  - `setRoute(truckId, route)`: requires 1–5 stops, otherwise ignored.
  - `moveStop(truckId, from, to)`, `addStop(truckId, city)`, `removeStop(truckId, index)` (no-op on the last stop).
  - `setVehicle(truckId, id)`.
  - `toggleExclude(truckId, cargoId)`, `addUrgent(truckId, cargoId, stop)`, `clearUrgent(truckId, cargoId)`.
  - `replan()`: runs the baseline `planAll` for all `PLAN_QUEUE` trucks in `draft` status.
  - `applyOptimised(truckId, plan, tried, ms)`.
  - `confirm(truckId, opts?: { overrideReason: string })`: a plan with failing checks needs `overrideReason`. An empty plan is refused. On success it logs `logPlanned`; with an override, each event text ends with ` · checks overridden: ${reason}`.
  - `keep(truckId)`: sets `keptOutdated` and logs a `'planned'` event on the changed unit, `Plan for ${truckId} kept after ${outdated reason}`.
  - `reopen(truckId)`: back to draft.
  - `setStatus(truckId, status)`, `newPlan(truckId)`, `resetAll()`.
- Selectors (exported functions):
  - `planOf(s, truckId): LoadPlan | null` (confirmed if present, else recommended)
  - `outdated(state: TruckPlanState, cargo: Cargo[]): string | null`. It returns e.g. `"CARGO-18452 moved"`, `"… edited"` or `"… released"`, comparing the confirmed plan's `units` with current fingerprints. Units loaded on this truck count as matching.
- **Behaviour:**
  - On module load, subscribe to `useInventory`. When `cargo` changes, run `replan()` for drafts. When `epoch` changes, run `resetAll()`.
  - Persist: name `docktor.loading`, version 1, `safeStorage`, with a guard on `layout === LAYOUT`.

- [ ] **Step 1: Write the failing tests.** Inventory is seeded with `demoCargo('normal', 1)`, and the store is reset per test.
  - `drafts re-plan when cargo changes`: moving a planned unit changes `recommended.units[id].spot`.
  - `confirmed plans are not re-planned; outdated names the unit`: confirm, then move a planned unit → `recommended` is unchanged, and `outdated(...)` matches `/moved$/`.
  - `confirm refuses an empty plan`.
  - `confirm with failing checks needs a reason and stores it`.
  - `route keeps at least one stop`.
  - `hydrated plan with unknown cargo is out of date`: inject a confirmed plan whose `units` has `CARGO-00001` → `outdated` matches `/released$/`.
  - `new day clears plans`.
- [ ] **Step 2: Run them.** `npx vitest run src/loading/store.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the suite.** `npm test` → all PASS. Then run `npm run typecheck`.
- [ ] **Step 5: Commit** — "Add the loading store with recommended, confirmed and loaded plans".

---

# Milestone 2 — Planner mode

> UI tasks have no unit tests beyond pure helpers. Their "tests" are a checklist verified in the dev server (`npm run dev`, port 5199) through `window.__yard` and screenshots. Use the Playwright MCP for layout screenshots, and headless chromium with GPU flags for fps.

### Task 7: Planner mode shell and camera

**Files:**
- Create: `src/ui/planner/PlannerDashboard.tsx`, `src/ui/planner/PlannerTopBar.tsx`, `src/ui/planner/format.ts`, `src/loading/frame.ts`
- Modify: `src/state/view.ts`, `src/ui/Dashboard.tsx`, `src/ui/DetailPanel.tsx`, `src/ui/OpsTable.tsx`, `src/scene/CameraRig.tsx`, `src/scene/DevHooks.tsx`
- Test: `src/loading/frame.test.ts`

**Interfaces:**
- Produces (in `view.ts`):
  - `planner: { truckId: string } | null`
  - `plannerView: '3d' | 'side' | 'top' | 'plan'`
  - `openPlanner(truckId)`, `closePlanner()`, `setPlannerView(v)`
  - `CameraCommand` gains `{ kind: 'frame'; x: number; y: number; h: number; yaw: number; pitch: number; distance: number; fov: number }` and `{ kind: 'restore' }`.
  - `CameraRig` saves the camera position, target and fov on the first `frame` after `openPlanner`, and flies back on `restore`. It lerps `fov` during a flight. In planner mode, Esc closes the planner.
- Produces (in `frame.ts`):
  - `truckPoseFor(bay: TruckBay, v: VehicleSpec): Pose` — the doors at the bay rear plus 0.25 m, using `doorsToOrigin`
  - `boxToLocal(v, x): number` = `v.model.frontWall − x`
  - `boxToYard(pose: Pose, v: VehicleSpec, x: number, y: number): Vec2` — y is measured from the right wall; the box centreline is at `inner.w / 2`
  - `bayFitWarning(bay, v): string | null` — §1.3 text
- Produces (in `format.ts`): `fmtT(kg)` → `"6.52 t"`, `fmtKg(kg)` → `"6,521 kg"`, `STOP_COLORS`.
- Behaviour:
  - `Dashboard` renders `PlannerDashboard` instead of the yard panels while `planner` is set (toasts and dialogs stay).
  - `PlannerTopBar` holds: logo, truck chip `${id} · ${bay} · ${n} stops`, sim speed controls (reuse the TopBar pieces), `Segmented` for the views, placeholder action buttons wired in later tasks, and an × button.
  - `TruckDetail` shows **Plan load** for `plannable` trucks. Docks-tab rows of the ops table get a `ClipboardList` icon button that opens the planner for that bay's truck.
  - Camera presets, relative to the truck pose (h = deck + 1.2):
    - 3D: yaw = truck heading + 145°, pitch 32°, distance 24, fov 30
    - Side: yaw = heading + 90°, pitch 4°, distance 46, fov 15
    - Top: pitch 89°, distance 60, fov 15

- [ ] **Step 1: Write the failing test** `src/loading/frame.test.ts`:
  - `rigid-26 parks where the yard's trucks park`: `truckPoseFor(L1, rigid-26)` equals `parkInBay(L1, 'rigid')` within 1 mm.
  - `box front wall and doors map to the truck's ends`: `boxToYard(pose, v, inner.l, w/2)` is within 0.15 m of `bayRear(L1)` plus 0.25 m along the heading.
  - `semi overhangs bay L1`: `bayFitWarning(L1, semi-136)` matches `/longer than bay L1/`, and `rigid-26` gives `null`.
- [ ] **Step 2: Run it.** `npx vitest run src/loading/frame.test.ts` → FAIL.
- [ ] **Step 3: Implement** `frame.ts`, then the view state, CameraRig commands, the shell and the entry points.
- [ ] **Step 4: Verify.**
  - `npx vitest run src/loading/frame.test.ts` → PASS. Then run `npm run typecheck`.
  - In the dev server: select TRUCK-102 → **Plan load**. The yard panels are gone, the top bar shows "TRUCK-102 · L1 · 3 stops", and the camera flies to L1.
  - Side/Top switch the camera. Esc returns to the earlier camera and the yard dashboard.
- [ ] **Step 5: Commit** — "Add planner mode, its top bar and camera presets".

### Task 8: Truck models, cutaway and packed units

**Files:**
- Create: `src/scene/loading/LoadView.tsx`, `src/scene/loading/PackedUnits.tsx`
- Modify: `src/scene/vehicles/Truck.tsx`, `src/scene/YardScene.tsx`

**Interfaces:**
- Consumes: `VEHICLES`, `truckPoseFor`, `boxToLocal` (Tasks 1, 7); `planOf` (Task 6); `buildCargoPrims`, `makePrimAssets` (existing).
- Produces:
  - `RigidTruck` takes `v: VehicleSpec`. The box length is `inner.l + 0.2`, the box spans from `frontWall + 0.1` back, axles come from `model`, and the cab front is `frontWall + 2.85`. For `rigid-26` the output must be the current model, within 5 cm on every dimension.
  - `Truck` takes `plannerVehicle?: VehicleSpec` and `cutaway?: boolean`. For a planned truck in planner mode, `YardScene` passes the vehicle chosen in the store, and the pose from `truckPoseFor`.
  - Cutaway: the roof is hidden. The wall facing the camera is swapped to the shared glass material (`mat('#c9d6f2', { transparent: true, opacity: 0.18 })`) each frame from the dot product of camera and wall normal, with edge lines kept. The rear doors are open and the tag is hidden.
  - `PackedUnits({ truckId })`:
    1. Builds virtual `Cargo` records: the real record with `x, y` = `boxToYard` of the placement centre, `yaw` = truck heading (+90° when `yaw === 90`) and `on` = `placement.on`.
    2. Base heights come from deck + `z`, so pass the heights in. Extend `buildCargoPrims` with an optional `baseOf(c) => number` override.
    3. Draws them with instanced meshes like `CargoLayer`.
    4. Units not yet `loadedOn` this truck use a shared ghost material (`opacity: 0.7, transparent`). Loaded units use the normal materials.
    5. Hover/click select the cargo (same `useUi` calls as `CargoLayer`).
    6. Draws a 2 cm stop-coloured outline (one `lineSegments` per stop) at each unit's base.
  - Axle chips: one `Tag`-style DOM label per axle under the truck, `"6.52 t / 7.5"`, with a status colour class.

- [ ] **Step 1: Verify `rigid-26` parity first.** Add the test `rigid model for rigid-26 keeps today's proportions` in `src/loading/frame.test.ts`. It checks that a pure function `rigidLayout(v)` (exported from `frame.ts`, used by `RigidTruck`) returns: box centre 0.45 / length 7.7, front axle 5.3, rear axles [0, −1.3], cab front 7.05. Run it → FAIL, implement `rigidLayout`, run it → PASS.
- [ ] **Step 2: Implement** the parametric `RigidTruck`, the cutaway, `PackedUnits` and the axle chips. Mount `<LoadView />` in `YardScene`; it renders nothing when the planner is closed.
- [ ] **Step 3: Verify.**
  - `npm run typecheck`, then `npm test`.
  - In the dev server, planner on TRUCK-102: ghost units sit inside the box, stop colours are visible, and the camera-side wall is see-through on all three camera views.
  - Choosing a vehicle in `__yard.stores` (`useLoading.getState().setVehicle('TRUCK-102','semi-136')`) swaps the model, and the packed units fill the trailer.
  - Take a screenshot.
- [ ] **Step 4: Commit** — "Draw planned trucks as cutaways with their packed units".

### Task 9: Left rail and right column

**Files:**
- Create: `src/ui/planner/VehicleRail.tsx`, `src/ui/planner/RouteRail.tsx`, `src/ui/planner/AxleCard.tsx`, `src/ui/planner/DistributionChart.tsx`
- Modify: `src/ui/planner/PlannerDashboard.tsx`

**Interfaces:**
- Consumes: store actions (Task 6), `stopEtas` (Task 4), `fmtT`, `STOP_COLORS`, `bayFitWarning`.

**Content (§2.1):**
- `VehicleRail`:
  - "Own body · Rigid 26 t" first, then the other presets.
  - Each row shows `label`, `${inner.l} m · ${fmtT(payloadKg)} payload · ${axleCount} axles`.
  - The selected row is highlighted.
- `RouteRail`:
  - Rows: stop number chip in `STOP_COLORS`, city, ETA (`fmtClock` of the depart time + `stopEtas`).
  - Drag & drop to reorder (HTML5 DnD), with ↑/↓ buttons for keyboard users and a remove ×. The × is disabled when only one stop is left.
  - An "Add stop" select lists destinations that have yard cargo and aren't on the route.
  - Planned departure = now + `stats.units` × 70 sim s.
- Status note under the route (first that applies):
  1. `outdated(...)`, with Re-plan / Keep buttons
  2. the bay-fit warning
  3. `N units overflow → TRUCK-110`, or `N units wait for the next truck`
- `AxleCard`:
  - Bars per axle of the departure state (kg / rating, a tick at 100%).
  - Header chip from the worst state: Legal / Near limit / Over / Steer too light.
  - Matrix: columns = `states[].label`, rows = axles, cells = pct coloured by status. Tones: `ok` green, `near` amber, `over` red, `light` violet.
- `DistributionChart` (SVG, 320 × 170):
  - The `curve` as an area, with the legal window band shaded.
  - The plan point (CoG, payload), and after-drop points joined by a dotted line.
  - Axle position markers on the x-axis.
  - Caption: `CoG ${cogX} m from the front wall, legal ${w0}–${w1} m for ${fmtT(payload)}`, or "No cargo yet".

- [ ] **Step 1: Write the failing test** `src/ui/planner/format.test.ts` → `fmtT(6521) === '6.52 t'` and `fmtKg(6521) === '6,521 kg'`. Run it → FAIL, implement, run → PASS. (Pure helpers only.)
- [ ] **Step 2: Implement** the four components and place them in `PlannerDashboard`:
  - left rail 264 px
  - right column 360 px
  - top 76 px
  - bottom area reserved 300 px

  Below 1280 px wide, the right column stacks under the free canvas area and the table shows 4 rows (Tailwind `xl:` breakpoints).
- [ ] **Step 3: Verify in the dev server.**
  - Reordering the stops re-plans: the units swap ends and the after-drop matrix columns change.
  - Choosing `rigid-12` shows more overflow.
  - Take a screenshot at 1440 × 900.
- [ ] **Step 4: Commit** — "Add the planner's vehicle, route, axle and load-distribution panels".

### Task 10: KPIs, cargo table, urgent picker, row cards, viewport

**Files:**
- Create: `src/ui/planner/PlannerKpis.tsx`, `src/ui/planner/PlannerTable.tsx`, `src/ui/planner/UrgentPicker.tsx`, `src/ui/planner/RowCards.tsx`
- Modify: `src/scene/loading/LoadView.tsx`, `src/ui/planner/PlannerTopBar.tsx`, `src/state/ui.ts` (dialog kind `'urgent'`)

**Interfaces:**
- Consumes: `planOf`, the store actions, `optimiseInWorker` (Task 5), `useUi` select/hover.
- Produces: a mutable `rowAnchors: { x: number; y: number; visible: boolean }[]` in `LoadView.tsx`.
  - `LoadView` projects each row's top-centre to screen pixels. It runs in `useFrame`, but only when `camera.matrixWorld` or the plan changed.
  - `RowCards` positions its cards and an SVG leader-line layer from it in a `requestAnimationFrame` loop that writes `style.transform` directly. No React re-render per frame.

**Content (§2.1):**
- `PlannerKpis` — five tiles:
  1. Cargo weight (`% of payload`)
  2. Remaining capacity (`limitedBy`)
  3. Fill `volume% · weight%`
  4. Rows used `n / rows`
  5. Units loaded `X of Y`
- `PlannerTable`:
  - Columns: item, cargo ID, yard location (`locationOf`), dims `l×w×h m`, weight, stop chip, status pill.
  - Statuses:

    | Status | Tone |
    |---|---|
    | Planned | blue |
    | Loaded | green |
    | Overflow → X | amber |
    | Left out | gray, with the reason as a title/tooltip |
    | Urgent | red badge, alongside the other status |
  - Filters (`Segmented`): All · On this truck · Overflow · Fragile. Plus a search box.
  - Row actions: exclude/include, mark urgent.
  - Clicking a row selects the cargo, and the 3D brackets show it. Selecting cargo in 3D scrolls its row into view.
- `UrgentPicker` dialog:
  - Search over yard units that are not loaded and not on a confirmed plan.
  - A stop select.
  - **Add as urgent** → `addUrgent`.
- `PlannerTopBar`:
  - **Optimise** runs `optimiseInWorker` and shows "Optimising…" while it runs (disabled). Then it applies the result and toasts `${tried} layouts in ${ms} ms`.
  - **Confirm plan** opens a reason prompt when checks fail. It is disabled when the plan is empty.
- Viewport: while the planner is open, `LoadView` calls `camera.setViewOffset`. The projection centre sits in the free area between the rails, measured from the DOM rects of `[data-planner-rail]` elements. It is cleared on close and on resize.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify in the dev server.**
  - Optimise toasts "N layouts in M ms" and the 3D view stays responsive (worker).
  - Row ↔ 3D selection works both ways.
  - Urgent adds a unit, and another unit becomes overflow when space is short.
  - Row cards track the camera while orbiting.
  - The truck sits centred in the free area.
  - Take a screenshot.
- [ ] **Step 3: Run checks.** `npm run typecheck`, then `npm test`.
- [ ] **Step 4: Commit** — "Add planner KPIs, cargo table, urgent picker and row cards".

### Task 11: Plan view, cargo form, yard integration

**Files:**
- Create: `src/ui/planner/PlanDrawing.tsx`
- Modify: `src/App.tsx`, `src/sim/clock.ts`, `src/ui/CargoForm.tsx`, `src/ui/CargoDetail.tsx`, `src/world/snapshot.ts`, `src/ui/TopBar.tsx` (search hits)
- Test: `src/world/snapshot.test.ts` (new)

**Interfaces:**
- `PlanDrawing` (SVG, fills the free area as an opaque card):
  - Top view: interior outline, "FRONT WALL" / "DOORS", units with `seq` numbers in stop colours, row dividers, CoG marker.
  - Side elevation: stacked boxes, axle triangles with `load / rating`.
  - Caption: `${units} units, ${fmtT(weight)} · numbers are the loading order, front wall to doors`.
- `App.tsx`: `frameloop={plannerView === 'plan' ? 'demand' : 'always'}`, plus a `PlanTicker` (inside Canvas) that calls `invalidate()` every 250 ms in that mode. `SimClock` caps `dt` at 0.3 s in that mode (else 0.1).
- `CargoForm`: a **Fragile** `Toggle`, saved to `fragile` (new and edit).
- `CargoDetail`: a row "Load" reading `Planned for TRUCK-102 · stop 2 Ankara`, `Loaded on TRUCK-102`, or nothing.
- `snapshot.ts`: for a truck with `planOf` and status ≠ draft-without-plan:
  - `shipment` = `{ id, direction: 'outbound', customer, place: route[0] + (n > 1 ? ' +' + (n−1) : ''), pallets: placements.length, weightT }`
  - parked trucks: `progress` = loaded / planned, `detail` = `${bay} · ${loaded}/${planned} units`, and status `'loading'` while running
  - status `'loaded'` reads "Loaded · ready to depart", and `'dispatched'` reads "Dispatched"
- `TopBar` search: truck hits add `plan: ${status}` to the subtitle.

- [ ] **Step 1: Write the failing test** `src/world/snapshot.test.ts`.
  - `a planned truck's shipment comes from its plan`: confirm TRUCK-102's plan → `computeSnapshot(t).trucks` TRUCK-102 `shipment.pallets === placements.length` and `shipment.place` starts with `'Eskişehir'`.
  - `progress counts loaded units`: after `loadOnto` of 2 planned units → `progress.done === 2`.
- [ ] **Step 2: Run it.** `npx vitest run src/world/snapshot.test.ts` → FAIL.
- [ ] **Step 3: Implement** everything in this task.
- [ ] **Step 4: Verify.**
  - `npm test` → PASS. Then run `npm run typecheck`.
  - In the dev server:
    - The Plan view shows the drawing, and the sim clock keeps advancing (top bar time changes).
    - The Fragile toggle persists across a reload.
    - The ops table L1 row shows `x/y`.
  - Take a screenshot of the Plan view.
- [ ] **Step 5: Commit** — "Add the 2D plan view, fragile flag and yard integration".

---

# Milestone 3 — Load at dock

### Task 12: Grid and A*

**Files:**
- Create: `src/sim/grid.ts`
- Test: `src/sim/grid.test.ts`

**Interfaces:**
- Consumes: `devYard`, `heightAt`, `trucks` + `parkInBay`, `inYard`, `footprint` (placement), `obbCorners`.
- Produces:

  ```ts
  export interface Grid { cell: number; x0: number; y0: number; nx: number; ny: number; blocked: Uint8Array; h: Float32Array }
  export function buildGrid(cargo: Cargo[], opts?: { ignore?: Set<string>; inflate?: number }): Grid
  export function findPath(grid: Grid, from: Vec2, to: Vec2): Vec2[] | null
  export function approachFor(grid: Grid, c: Cargo, alongLength: boolean): { stand: Vec2; heading: number } | null
  ```
- Grid details:
  - cell 0.25, inflate default 0.6
  - Blocked: outside the boundary, the walls, non-canopy buildings, fixtures (sizes from `clearance.ts` — export its `FIXTURE_SIZE`), parked trucks, and in-yard cargo footprints except `ignore`.
  - The edge between two neighbours is impassable when |Δh| > 0.3.
- A*: 8-connected; diagonal moves are not allowed through blocked corners. Octile heuristic.
- Simplification: line-of-sight string pulling. Points are returned at cell centres, with the exact `from` / `to` at the ends.
- `approachFor`: the forklift stands `1.45 + l/2` (or `w/2`) from the unit centre along the chosen axis, facing it. It tries both ends of the axis and then the other axis, returning the first free standing point.

- [ ] **Step 1: Write the failing tests.**
  - `reaches a platform unit from the loading strip`: path from (44, 30.4) to the approach of a HS1 unit is non-null.
  - `reaches an open-yard unit via the ramp`: path from (44, 30.4) to (17, 20.6) is non-null, and some path point lies in the ramp rect.
  - `never crosses cargo or the platform edge`: densely sample every path segment (0.1 m); no sample is in a blocked cell, and no consecutive samples differ in height by > 0.3.
  - `boxed-in unit has no approach`: surround a unit with four units 0.3 m away → `approachFor(...) === null`.
- [ ] **Step 2: Run them.** `npx vitest run src/sim/grid.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** `npx vitest run src/sim/grid.test.ts` → PASS; building the grid takes < 150 ms (assert with `performance.now()`).
- [ ] **Step 5: Commit** — "Add a yard occupancy grid and A* for forklift paths".

### Task 13: One-shot routes, jobs and the loading run

**Files:**
- Create: `src/sim/loadingRun.ts`, `src/sim/jobs.ts`
- Modify: `src/sim/route.ts`
- Test: `src/sim/loadingRun.test.ts`, extend `src/sim/route.test.ts`

**Interfaces:**
- `RouteSpec.once?: boolean`. When set, `evalRoute` uses `local = time − offset`, and `visible = false` when `local < 0` or `local > duration`. Looping routes are unchanged.
- Produces (in `loadingRun.ts`):

  ```ts
  export interface Trip { cargoId: string; forkliftId: string; pickAt: number; setAt: number; skipped: string | null }
  export interface LoadingRun { truckId: string; t0: number; routes: Record<string, RouteSpec>; trips: Trip[]; notes: string[] }
  export function buildLoadingRun(args: { truckId: string; bay: TruckBay; vehicle: VehicleSpec; placements: Placement[]; cargo: Cargo[];
    forklifts: { id: string; start: Pose }[]; t0: number }): LoadingRun
  ```
  - Trips go in `seq` order, alternating forklifts. Legs per §3.1 steps 1–7:
    - lift: wait 2.2 s, fork 0.12 → 0.4
    - set down: wait 2.4 s, fork → `z + 0.12`
    - status texts: `Picking ${id}`, `To ${bay} · ${truckId}`, `Loading ${truckId}`, `Waiting for the dock`
  - The approach axis follows the placement yaw (so the carried unit needs no turn).
  - Grid: each trip ignores units already picked.
  - Dock face = bay rear + 0.75 m onto the platform. Inside the truck, the legs are straight along the truck axis, offset to the placement's y.
  - Mutual exclusion: compile each forklift's legs as they are built (`compileRoute`). If a forklift would arrive at the dock face before the other forklift's previous trip left the truck, insert a `wait` (`Waiting for the dock`).
  - No approach or no path → `skipped = 'No forklift path to CARGO-x'`. That trip has no legs, and the run continues.
- Produces (in `jobs.ts`):
  - `useJobs` store: `{ run: LoadingRun | null; compiled: Record<string, CompiledRoute>; hidden: Set<string> }`
  - `startRun(run)`, `stopRun()`, `tick(t)`: updates `hidden` = picked and not yet set, re-setting only when the set changes
  - `jobPose(forkliftId, t, out): RoutePose | null`
  - `carriedAt(forkliftId, t): string | null`
  - `floorAt(x, y): number`: the deck height inside the active truck's box footprint, else `heightAt`

- [ ] **Step 1: Write the failing tests.**
  - In `route.test.ts`, `a once route plays once`: visible inside [offset, offset + duration] and hidden before and after.
  - `trips follow the loading order`: build from a TRUCK-102 baseline plan at t0 = 100 → setAt increases with `seq` across non-skipped trips.
  - `one forklift in the truck at a time`: the [enter, exit] intervals of trips on different forklifts do not overlap. Read them from the compiled legs whose status starts with `Loading`.
  - `pick before set, both after t0`.
  - `boxed-in unit is skipped with a reason` (fixture as in Task 12) → `skipped` matches `/No forklift path/`, and later trips still have times.
- [ ] **Step 2: Run them.** `npx vitest run src/sim` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** `npx vitest run src/sim` → PASS. Then run `npm run typecheck`.
- [ ] **Step 5: Commit** — "Build forklift loading runs as one-shot routes".

### Task 14: Run the loading in the twin, Skip, Follow, Dispatch, performance

**Files:**
- Create: `src/scene/loading/CarriedUnit.tsx`
- Modify:
  - `src/scene/vehicles/Forklift.tsx`, `src/scene/cargo/CargoLayer.tsx`, `src/world/store.ts`, `src/world/snapshot.ts` (forklift states)
  - `src/ui/planner/PlannerTopBar.tsx`, `src/loading/store.ts`, `src/scene/DevHooks.tsx`

**Interfaces:**
- Consumes: `buildLoadingRun`, `useJobs` (Task 13); `loadOnto`, `dispatch` (Task 2); store `setStatus` (Task 6).
- **Load at dock** (enabled only when the status is `confirmed` and the truck is at an L bay; otherwise the button title says "Not at a loading bay"):
  1. Build the run with forklifts per §3.1.
  2. `useJobs.startRun`, and set the status to `'loading'`.
- `Forklift.tsx`:
  - Each frame, `jobPose(...)` takes precedence over the spec route. A forklift without a spec route (FL-03) still animates its wheels.
  - Height comes from `floorAt` while a job is active.
  - `CarriedUnit` renders the prims of `carriedAt(...)`, re-rendering only when the id changes, in place of `ForkLoad`.
- `CargoLayer` filters out `useJobs.hidden`.
- World sync tick (`store.ts`):
  - Call `useJobs.tick(clock.t)`.
  - For trips with `setAt ≤ t`, not skipped, and the unit not yet loaded: call `loadOnto(id, truckId, stop, bayId)`. If the unit's spot fingerprint changed since confirm, mark the trip skipped with `"CARGO-x was moved by hand"` instead.
  - When every trip is set or skipped: `stopRun()`, status `'loaded'`, and toast `Loaded ${n} units onto ${truckId}`.
- `snapshot.ts`: a forklift on a job reports status from the job pose phase. `carrying` = `carriedAt`.
- **Skip**: `loadOnto` every remaining non-skipped trip now, then `stopRun()`, status `'loaded'`.
- **Follow** toggle: `useView.setFollow({ kind: 'forklift', id })` on the forklift that is currently carrying.
- **Dispatch**:
  1. `inventory.dispatch(truckId)`, status `'dispatched'`.
  2. Toast `${n} units left the yard on ${truckId}`.
  3. The button becomes **New plan** → `newPlan`.
- `DevHooks`: expose `loading: useLoading` and `jobs: useJobs`, plus `fps(ms = 3000): Promise<number>`, which counts `requestAnimationFrame`s.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify end to end in the dev server** (8× speed):
  1. Confirm TRUCK-102.
  2. **Load at dock**. FL-01 and FL-03 drive to units; the units vanish from the yard on pick and ride on the forks. Ground units go up the ramp. Only one forklift is ever inside the truck. The units turn solid in the truck; the table and the ops table count up.
  3. Esc out mid-run and back in. The run continues.
  4. **Skip** completes it.
  5. **Dispatch** removes the units; cargo KPIs drop by n; the events show "Left the yard on TRUCK-102".
  6. Reload → the state persists.
- [ ] **Step 3: Measure performance.**
  - Run `/usr/bin/chromium --headless=new --ignore-gpu-blocklist --enable-gpu --use-angle=gl --remote-debugging-port=9333 http://localhost:5199/`.
  - Read `await __yard.fps()` over CDP (a small node script in the scratchpad):
    - yard view
    - planner idle
    - planner during a run
  - Pass when planner fps ≥ 0.9 × yard fps. Record the numbers in the commit message.
- [ ] **Step 4: Final checks.** `npm test`, `npm run typecheck`, then `npm run build` → all clean.
- [ ] **Step 5: Commit** — "Run Load at dock in the twin, with Skip, Follow and Dispatch".
- [ ] **Step 6: Update `README.md`.** Add one paragraph under "How it's made" on the load planner (solver in `src/loading`, recommended/confirmed/loaded plans). Commit.
