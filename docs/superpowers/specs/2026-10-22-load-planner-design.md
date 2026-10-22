# Load planner — design

**Date:** 2026-10-22 · **Status:** approved in chat, awaiting spec review · **Branch:** `load-planner`

Docktor's second optimisation engine (spec §34–§35, phase 10): plan how a truck at a
loading bay is packed with cargo that is already in the yard, check it against axle and
weight limits for every stop of its route, and show the loading happen in the twin.

The interaction model is inspired by airsup's cargo load planner
(airsup.ai/lab/cargo-load): pick a vehicle and it packs itself, axle loads after
every drop, a load-distribution chart, 3D / side / top / plan views, and a forklift loading
run at the dock. Nothing of airsup's code or branding is used. Everything is built in
Docktor's own UI kit and data model.

## Decisions taken in brainstorming

| Question | Decision |
|---|---|
| Where the cargo comes from | **Yard cargo.** Units in the yard whose destination is on the truck's route. Loading moves them out of yard storage. |
| Where the planner lives | **A mode inside the yard view.** The same canvas, the camera flies to the bay, and planner panels replace the yard dashboard. |
| Rules beyond weight/axles/CoG/stop order | **Stacking & fragile**, **overflow to the next truck**. No hazmat, no temperature/reefers. |
| Solver | **TypeScript heuristic in the browser** with a seeded search ("Optimise") in a Web Worker. No backend. |

## Principles carried over from the Docktor rules

- The planner **recommends**, and the manager decides. Recommended plan, confirmed plan and
  what was actually loaded are stored separately and never collapsed.
- Every unit left out carries a plain-language reason. Every check that fails names the
  axle and the stop.
- Manager overrides (include/exclude/urgent/route order/confirm despite a failed check) are
  stored next to the recommendation and logged as events.
- The solver is pure TypeScript with no three.js and no React. It consumes World State and
  returns a plan.
- Geometry stays data-driven: vehicles are presets in config, and the 3D models are generated
  from them.

---

## 1. Data & solver

### 1.1 Plannable trucks and routes

- Plannable: trucks parked at a loading bay with `activity: 'loading'` (TRUCK-102 at L1,
  TRUCK-109 at L4) and TRUCK-110 waiting at P2 (the "next truck" that takes overflow).
  `TruckSpec` gets `plannable?: boolean` and `body?: VehicleId`.
- The scripted visitors (TRUCK-104 at L2, TRUCK-107 at L3) keep their looping behaviour and
  cannot be planned.
- New `src/config/routes.ts` gives each plannable truck a default ordered route of 2–5 stops,
  drawn from the destinations the demo cargo already uses:
  - TRUCK-102: Eskişehir → Ankara → Kayseri
  - TRUCK-109: Konya → Adana → Mersin → Gaziantep
  - TRUCK-110: Ankara → Kayseri → Samsun → Trabzon (overlaps TRUCK-102, so overflow has
    somewhere to go)
- New `src/config/cities.ts` holds latitude/longitude for the 12 demo destinations and the yard
  (Istanbul). Stop ETAs = planned departure + great-circle distance × 1.25 road factor at
  70 km/h + 30 min per drop. These are display-only estimates.
- The manager can reorder, add and remove stops. Route edits persist per truck.

### 1.2 Candidate cargo

A yard unit is a candidate for a truck when its destination is on the route, and it is
neither loaded nor assigned to another truck's confirmed plan. Candidates that can never be
packed are listed as left out, with a reason:

| Case | Reason shown |
|---|---|
| `look === 'container'` (12 m ISO box) | "Container — goes on a chassis, not into a truck" (the `container-40` preset in 1.3 packs *into* a container's interior; a yard container never goes inside any preset) |
| Another unit stands on it | "Under CARGO-x — move it first" |
| Taller or wider than the vehicle's interior, even rotated | "Too big for this vehicle (h 2.9 m > 2.65 m)" |

Manager overrides per truck: **include** (adds a unit whose destination is not on the route,
dropped at a stop the manager picks), **exclude**, **urgent** (packed first; others give way).
"Urgent unit" in the top bar opens a cargo picker (search over yard units) that adds the unit as
included + urgent and asks which stop it drops at.

### 1.3 Vehicles

`src/loading/vehicles.ts`. Coordinates are in the **box frame**: x is measured from the inner
front wall towards the doors, y across, and z up from the deck. Axle positions are given in the
same x. Values are typical EU figures, kept in one table so they can become editable later.

| Id | Label | Inner L × W × H (m) | Deck (m) | Axles (x, tare t, rating t) | GVW t | Payload t |
|---|---|---|---|---|---|---|
| `rigid-12` | Rigid 12 t box | 6.20 × 2.45 × 2.40 | 1.05 | front −1.00 / 3.6 / 4.6 · rear 3.90 / 2.4 / 8.0 | 12 | 6.0 |
| `rigid-18` | Rigid 18 t box | 7.30 × 2.48 × 2.50 | 1.15 | front −1.20 / 4.6 / 7.5 · rear 4.60 / 3.7 / 11.5 | 18 | 9.7 |
| `rigid-26` | Rigid 26 t box, 3 axles (the yard's trucks) | 7.50 × 2.45 × 2.65 | 1.10 | front −1.10 / 5.9 / 8.0 · tandem 4.85 / 5.3 / 19.0 | 26 | 14.8 |
| `semi-136` | Semi-trailer 13.6 m | 13.60 × 2.48 × 2.70 | 1.20 | steer / 5.6 / 8.0 · drive tandem / 2.8 / 19.0 · trailer tri-axle 11.10 / 4.6 / 24.0; kingpin 0.80 (trailer tare on kingpin 2.4) | 40 | 24.6 |
| `container-40` | 40 ft container on chassis | 12.03 × 2.35 × 2.39 | 1.40 | steer / 5.6 / 8.0 · drive tandem / 2.8 / 19.0 · chassis tri-axle 10.20 / 5.8 / 24.0; kingpin 0.10 (tare on kingpin 2.5) | 40 | 23.3 |

- Tractor geometry for the two articulated presets, taken from the existing 3D model: the
  steer axle is 3.60 m ahead of the fifth wheel and the drive-tandem centre is 0.65 m behind
  it.
- `rigid-26` matches the current `RigidTruck` model: front axle at +5.3, rear wheels at 0
  and −1.3, box from −3.4 to +4.3. It is the default body for the yard's rigid trucks.
- Each preset also carries:
  - `minSteerShare`: 0.20. For rigids it is the share of the vehicle's actual total mass on
    the front axle. For articulated presets it is the share of the tractor's axle load.
  - `overallLength`: used for the bay-fit warning.
- **Bay fit:** if `overallLength` > bay length + 1.5 m, the planner warns, e.g. "18.0 m —
  longer than bay L1 (9 m), blocks the lane". It still plans; this is a what-if.

### 1.4 Axle statics (`src/loading/axles.ts`)

- **Linear model.** For a payload `P` with its centre of gravity at box-frame `x`, every axle
  load is linear in `P`:

  `load_j(P, x) = tare_j + P · (α_j + β_j · x)`

  The coefficients `α_j`, `β_j` come from lever arms:
  - Rigid: `rear = P·(x − x_f)/(x_r − x_f)` and `front = P − rear`.
  - Articulated: the trailer group and the kingpin split `P` by lever arms. The kingpin load
    then splits onto steer and drive through the fifth-wheel lever.
- **Checks.** For a set of placed units:
  - every axle ≤ its rating
  - total ≤ GVW, payload ≤ the preset payload
  - steer ≥ `minSteerShare` of the relevant mass
- **When they run.** At **departure** and **after each drop** (stop 1 unloaded, then stops
  1–2, …, up to the state before the last stop). Each state reports per-axle load, % of
  rating, and status `ok` (< 90%), `near` (90–100%) or `over`. A steer share under the minimum
  is reported as status `light`.
- **Load-distribution curve.** For each x in [0, L] (100 samples), the maximum payload `P(x)`
  is the minimum of:
  - the preset payload
  - each axle's bound `(rating − tare)/(α + β·x)`
  - the min-steer bound, where it is an upper bound
- **Legal CoG window** for the plan's payload `P₀`: the x-range where `P(x) ≥ P₀`.
- **Report.** The plan's CoG x, the window, and the CoG/payload point after each drop.

### 1.5 Packer (`src/loading/pack.ts`)

Deterministic for a given input and seed.

1. **Selection.** Sort candidates: urgent first, then route order, then weight descending.
   Accept while the accepted weight stays ≤ payload. The rest become overflow with the reason
   "Payload: 14.8 t limit reached".
2. **Packing order.** Stop descending (the last stop goes to the front wall), then
   non-stackable before stackable, then weight descending, then footprint descending.
3. **Placement.** For each unit, try the extreme points generated by the walls, the floor and
   the already-placed boxes (their corners and tops), with yaw 0° and 90° (never tipped).
   Pick the valid point with the lowest score = `x + 0.3·z + side·0.05·y` (`side` is ±1, the
   left/right preference). A point is valid when:
   - **Inside:** the box fits in the interior.
   - **No overlap:** a 2 cm gap on every side between units.
   - **Support** (above the floor): ≥ 80% of the footprint rests on units that:
     - are stackable (`isStackable(look)`)
     - are not `fragile`
     - each weigh ≥ the new unit
     - belong to the same stop or a later stop
   - **Door access:** an earlier stop's unit must be able to come out through the doors. For a
     unit of stop k, no unit of a stop > k may occupy the corridor between it and the doors
     (x beyond its far edge, overlapping its y- and z-ranges), and none may rest on it. This
     is checked both ways when placing.
   - **Departure axles:** adding the unit keeps every axle at or under its rating.
4. **When nothing is valid**, the unit is left out with the most specific reason: "No floor
   space left", "Would overload the front axle (8.0 t)", "Fragile units below", or "No room by
   the doors for stop 1".
5. **After packing**, run the after-drop checks (1.4) and attach them to the plan. A failure
   does not remove units. It is reported, and blocks a plain **Confirm** (see 2.1).
6. **Rows.** The interior is cut into rows of ≈1.2 m from the front wall (`round(L / 1.2)`
   rows). For each row: fill % (unit volume inside the row ÷ row volume), its heaviest unit,
   and kg.

`Placement = { cargoId, stop, seq, x, y, z, l, w, h, yaw: 0 | 90, on: string | null }`. Here
`x, y, z` is the min corner in the box frame, `seq` is the loading order (sorted by x, then
z), and `on` is the unit underneath.

### 1.6 Optimise (`src/loading/optimise.ts`, `optimise.worker.ts`)

- **Variants.** Up to 1,000 seeded variants (mulberry32, seeds 1…N). Each one shuffles the ties
  in the selection order and in the packing order within a stop, flips the yaw preference and
  the side preference, and jitters the score weights (±20%).
- **Budget.** Stop at 1,000 variants or 600 ms, whichever comes first.
- **Ranking, lexicographic** (best first):
  1. all checks pass, at departure and after every drop
  2. urgent units loaded
  3. units loaded
  4. weight loaded
  5. smallest axle headroom (% of rating), largest wins
  6. CoG distance to the window centre, smallest wins

  > Note: "all checks pass" was third in the chat summary. It is moved first here so a layout
  > that overloads an axle can never outrank a legal one.
- **Result.** The best plan, plus `{ tried, ms, seed }`. The UI shows "1,000 layouts in
  480 ms".
- **Threading.** The worker is a thin wrapper around the pure function. Tests call the
  function directly, and the UI falls back to running it on the main thread in chunks if
  `Worker` is unavailable.
- **Baseline.** The automatic plan, made whenever inputs change, is the deterministic baseline
  (seed 0, no shuffling). Optimise replaces it with the best variant.

### 1.7 Overflow

Route units that were not packed go, in route order, to the next plannable truck (queue: 102 →
109 → 110) whose route has their destination, and that truck's candidates include them. If no
truck fits, they show as "Waits for next truck". A unit is offered to one truck at a time. A
truck's confirmed plan takes precedence over another truck's draft.

### 1.8 State

**Cargo** (`src/domain/types.ts`):

- `fragile?: boolean`. Seeded on demo goods whose description is LED panel, ceramic tiles or
  kitchen appliances. Editable in the cargo form.
- `loadedOn?: { truckId: string; stop: number } | null`. While it is set, the unit is in the
  truck, not in yard storage.
- New `CargoEventKind`s: `'planned'` and `'loaded'`. Dispatch reuses `'released'` with the text
  "Left the yard on TRUCK-102".

**Inventory** (`src/world/inventory.ts`):

- `loadOnto(cargoId, truckId, stop)`: sets `loadedOn` and clears `areaId`/`on`, then logs
  "Loaded onto TRUCK-102 at L1 · stop 2 Ankara".
- `dispatch(truckId)`: releases every unit with `loadedOn.truckId === truckId`.
- `locationOf()` returns "TRUCK-102 (L1)" for loaded units.
- Placement checks ignore loaded units, and so do the yard KPIs.
- The persist version goes 2 → 3, with a `migrate` that keeps every record and derives
  `fragile` for demo units from their description.

**Loading store** (`src/loading/store.ts`, `useLoading`, persisted as `docktor.loading` through
the same safe storage and layout-hash guard as the inventory):

```ts
interface TruckPlanState {
  truckId: string;
  route: string[];                 // destinations, in drop order
  vehicle: VehicleId;              // what-if preset, defaults to the truck's body
  include: { cargoId: string; stop: number }[];
  exclude: string[];
  urgent: string[];                // cargo ids; an urgent unit not on the route is also in `include`
  recommended: LoadPlan | null;    // latest solver output
  confirmed: ConfirmedPlan | null; // what the manager accepted (a copy, never mutated)
  run: LoadingRun | null;          // active / finished Load at dock
  status: 'draft' | 'confirmed' | 'loading' | 'loaded' | 'dispatched';
}
interface LoadPlan {
  vehicle: VehicleId; route: string[];
  placements: Placement[];
  leftOut: { cargoId: string; reason: string; to: string | null }[]; // `to` = overflow truck
  checks: AxleReport; rows: RowStat[]; stats: PlanStats;
  seed: number; tried: number; ms: number;
  inputsHash: number;              // hash of the candidate units' records + route + vehicle + overrides
}
interface ConfirmedPlan extends LoadPlan { confirmedAt: number; by: string; overriddenChecks: string[] }
```

**Out of date.** When the inventory changes (a unit moved, edited, released or registered),
the draft is re-planned with the baseline. A **confirmed** plan is never re-planned silently:
if its `inputsHash` no longer matches, the planner shows "Plan out of date — CARGO-x moved"
with **Re-plan** and **Keep**. Keeping is logged.

"Reset demo data" and "New day" clear all plans. Routes go back to their defaults.

---

## 2. Planner screen & 3D views

### 2.1 Entering, leaving, layout

- **Entering:**
  - The detail panel of a plannable truck gets a **Plan load** button.
  - The bay rows of the ops table get a plan icon.
  - Both set `useView.planner = { truckId }`. `useView` also gets
    `plannerView: '3d' | 'side' | 'top' | 'plan'` (default `'3d'`) and remembers the camera
    pose to fly back to.
- **Leaving:** Esc or × clears it, and the camera flies back to where it was.
- **Hidden in planner mode:** the yard dashboard (KPI cards, minimap, ops table, shipment
  tracker, layers panel). The 3D yard keeps running.
- **Top bar:**
  - Docktor logo
  - truck chip "TRUCK-102 · L1 · 3 stops" and the sim clock with speeds (existing)
  - view switch **3D | Side | Top | Plan**
  - **Urgent unit**
  - **Optimise**, with a progress state
  - the primary action, which follows `status`:

    | Status | Primary action |
    |---|---|
    | `draft` | **Confirm plan**, or **Confirm anyway…** with a reason prompt when a check fails |
    | `confirmed` | **Load at dock** |
    | `loading` | **Skip**, plus a **Follow** toggle |
    | `loaded` | **Dispatch** |
  - × to close
- **Left rail:**
  - **Vehicle** list: the truck's own body first ("Own body · Rigid 26 t"), then the presets,
    each with inner length, payload and axle count. Selecting a preset re-plans and swaps the
    model at the bay.
  - **Route:** numbered, colour-coded stops (fixed palette of 5 stop colours) with ETAs. Drag
    to reorder; add a stop (from destinations that have yard cargo) and remove one.
  - **Status note**, e.g. "3 units overflow → TRUCK-110", the bay-fit warning, or "Plan out of
    date".
- **Right column:**
  - **Axle loads** card:
    - one bar per axle (load / rating, a tick at 100%)
    - a status chip (**Legal**, **Near limit**, **Over**, **Steer too light**)
    - a small matrix: columns Depart · After 1 · After 2 …, rows = axles, cells = % coloured
      by status
  - **Load distribution** chart (SVG):
    - the `P(x)` curve with the legal-window band shaded
    - the plan's point, plus points after each drop joined by a dotted line
    - axle markers on the x-axis
    - a caption like "CoG 2.97 m from the front wall, legal 2.37–3.85 m for 8.15 t"
- **Bottom:**
  - **KPI row:**
    - cargo weight (% of payload)
    - remaining capacity, naming the limiting factor ("payload" / "rear axle" / "floor space")
    - fill: volume % · weight %
    - rows used
    - units loaded X of Y (route candidates)
  - **Cargo table**, one row per route candidate:
    - columns: item (description), cargo ID, yard location, dims, weight, stop, status
    - statuses: Planned · Loaded · Overflow → TRUCK-110 · Left out (reason) · Urgent
    - filters **All · On this truck · Overflow · Fragile**, plus search
    - row actions: exclude/include, urgent
    - clicking a row highlights the unit in 3D, and clicking a unit in 3D highlights its row
- **Sizing:** designed for ≥ 1280 px. Below 1280 px the right column moves under the canvas
  area and the table shows 4 rows.

### 2.2 3D view

- **Camera.** It flies to the bay and frames the truck from the rear three-quarter on the
  platform side. Orbit stays enabled, limited to the truck area.
- **Truck cutaway.** The planned truck's model gets `cutaway`: the roof and the camera-side
  wall become a glass material, with an outline kept at the box edges. The rear doors are open.
- **Models.** The rigid model becomes parametric (box length, axle list from the preset), so
  `rigid-12/18/26` can be drawn. `semi-136` and `container-40` reuse `Tractor` + `Trailer` /
  `ContainerChassis`.
- **Packed units:**
  - drawn with the existing cargo primitives (`cargoPrims.ts`) in one instanced mesh, placed in
    the box frame and transformed to the truck pose
  - a thin stop-coloured outline at each unit's base
  - hover/select work like yard cargo
  - in `draft`/`confirmed` status they are drawn at 70% opacity (planned). Once loaded they are
    solid.
- **Row cards.** One HTML overlay (not drei `Html` per card) with a card per row: row number,
  fill %, heaviest unit's cargo ID, kg. Leader lines go to the row's top centre. Positions come
  from projecting anchor points, and the DOM is only updated when the camera matrix changes.
- **Axle chips** under each axle: "6.52 t / 7.5", coloured by status.

### 2.3 Side, Top, Plan

- **Side** and **Top** are camera presets, square to the truck, with a narrow FOV (15°). Top
  hides the roof.
- **Plan** is an SVG drawing over the canvas, with no WebGL:
  - **top view:** interior outline, front wall / doors labels, units as rectangles with
    loading-order numbers and stop colours, row dividers, CoG marker
  - **side elevation:** stacked heights, axle triangles with "load / rating"
  - a caption "N units, X t · numbers are the loading order, front wall to doors"
- While Plan is open, the canvas switches to `frameloop="demand"`.

---

## 3. Load at dock, yard integration, testing

### 3.1 Loading run (`src/sim/loadingRun.ts`, `src/sim/grid.ts`, `src/sim/jobs.ts`)

- **Only at a dock.** **Load at dock** is only enabled for a truck parked at a loading bay
  (L1–L4). TRUCK-110 at P2 can be planned (it takes overflow), but the button reads "Not at a
  loading bay" and stays disabled.
- **Start.** **Load at dock** creates a `LoadingRun` at the current sim time:
  `{ t0, trips: Trip[], forklifts: ['FL-01', 'FL-03'] }`. FL-01 is the forklift that serves
  this bay, plus the idle FL-03. A truck without a serving forklift uses FL-03 and FL-02.
- **Order.** Units go in loading order (`seq`, front wall first). Trips alternate between the
  two forklifts.
- **Grid.** `grid.ts` builds an occupancy grid at 0.25 m over the yard. Blocked:
  - outside the boundary, the walls, non-canopy buildings, fixtures, parked trucks
  - other cargo (footprints inflated by 0.6 m)
  - the platform edge, as height jumps > 0.3 m between neighbouring cells; the ramp cells stay
    open

  A* runs with 8 neighbours. The path is simplified by line-of-sight, then turned into a
  `drive` leg with corner radii.
- **A trip** is a list of legs on the forklift:
  1. Drive from its current position to an approach point in front of a free side of the unit
     (preferring its long axis).
  2. `wait`: lift. The unit is on the forks from here.
  3. Reverse out, then drive (via the ramp when the unit is on the ground) to the bay's dock
     face.
  4. Wait for the truck to be free, if the other forklift is inside.
  5. Drive straight in along the truck axis, offset to the unit's y.
  6. `wait`: lower to the unit's z and set down.
  7. Reverse out, ready for the next trip.

  At most one forklift is inside the truck at a time; the second one waits at the dock face.
- **Timing.** Trips are ordinary `RouteSpec`s, evaluated on the sim clock, so pause, speeds and
  hold all work. `RouteSpec` gets `once?: boolean`: the route plays from `offset` once, and
  outside that window the pose is invalid, so the forklift's normal route takes over again.
  `jobs.ts` (`useJobs`) maps a forklift id to its job route, and both `Forklift.tsx` and the
  snapshot use the job route while it is active.
- **Carried unit.** `Forklift.tsx` draws the actual unit on the forks, using the cargo
  primitives instead of the fixed `ForkLoad`.
- **Hand-offs.** Each trip knows its pick time and set-down time.
  - From the pick time, the unit is hidden from the yard (`CargoLayer` gets an "in transit"
    set from the run and the clock).
  - At set-down, the world sync tick calls `loadOnto`. This is idempotent: units already
    loaded are skipped.
- **Skip.** Applies every remaining set-down at once and ends the run.
- **Follow.** Uses the existing `useView.follow` on the active forklift.
- **When a unit moves mid-run.** If a unit in the run is moved or released by hand while the
  run is going, its trip is dropped and the run notes it.

### 3.2 Dispatch

**Dispatch** calls `inventory.dispatch(truckId)`. The loaded units leave the yard with
"Left the yard on TRUCK-102" events. The plan is archived, and the truck's status becomes
"Dispatched". The parked truck stays drawn in its bay. Driving it out is out of scope.
**New plan** starts a fresh `draft` with the default route.

### 3.3 Yard integration

- **`snapshot.ts`.** For a truck with a plan, the `Shipment` comes from it:
  - `place` = first stop "+N"
  - `pallets` = planned units
  - `weightT` = planned tonnes

  Progress = loaded / planned, and the truck detail reads "Loading · 5/14 units".
- **Ops table.** Bay rows show loaded / planned. Search hits for a truck show its plan status.
- **Cargo detail.** It shows "Planned for TRUCK-102 · stop 2" or "Loaded on TRUCK-102".
- **Cargo form.** A **Fragile** checkbox.

### 3.4 Performance (HD 620 budget)

- **Draw calls.** Packed units go in one instanced mesh, and the row cards in one DOM overlay.
  The truck glass is one material, and it does not cast shadows.
- **Optimise** runs in a worker. The canvas uses demand frameloop while Plan is open.
- **Target.** Planner mode, idle and during a loading run, stays within 10% of the yard
  view's frame rate. It is measured in headless Chromium with GPU flags, the same way the yard
  was measured (~30 fps).

### 3.5 Testing

**Vitest:**

| Area | Cases |
|---|---|
| Packer | no overlaps, inside interior, ≥ 80% support, door-access rule, nothing on fragile, stackability, heavier-below, yaw only 0/90 |
| Axles | hand-worked cases for `rigid-18` and `semi-136`; after-drop states; min steer; distribution curve vs brute force; CoG window |
| Optimise | same seed → same plan; never ranks an illegal plan above a legal one |
| Candidates & overflow | containers, units under others and too-big units are left out with reasons; overflow goes to the right truck |
| Grid | reaches a platform unit, reaches an open-yard unit via the ramp, never crosses cargo or the platform edge |
| Loading run | trips in `seq` order, one forklift in the truck at a time, set-down times increase |
| Inventory | `loadOnto` / `dispatch` events; migration v2 → v3 keeps manual records |

**Browser (Playwright):** a screenshot of each view (3D, Side, Top, Plan); a loading run
start → skip → dispatch; a frame-rate check against the yard baseline.

### 3.6 Delivery

Three milestones. Each one leaves the app working.

1. **Solver:** `src/loading` (vehicles, axles, packer, candidates, overflow, optimise + worker,
   store) with tests. No UI yet.
2. **Planner mode:** the view state, planner panels, cutaway truck, packed units, row cards,
   Side/Top/Plan, the fragile flag in the form, and snapshot integration.
3. **Load at dock:** grid + A*, the loading run, job routes, the carried unit, `loadOnto`,
   Dispatch, and the perf check.

## Out of scope

Hazmat / ADR, temperature and reefers, trucks driving away after dispatch, planning the
scripted L2/L3 visitors, unstacking (picking a unit from under another), load-securing
equipment (straps, airbags), a backend solver, OCR.

## New and changed files

**New:**

- `src/config/routes.ts`, `src/config/cities.ts`
- `src/loading/{vehicles,axles,pack,candidates,optimise,optimise.worker,store,types}.ts` + tests
- `src/sim/{grid,loadingRun,jobs}.ts` + tests
- `src/scene/loading/{LoadView,PackedUnits,RowCards}.tsx`
- `src/ui/planner/{PlannerDashboard,PlannerTopBar,VehicleRail,RouteRail,AxleCard,DistributionChart,PlannerKpis,PlannerTable,PlanDrawing,UrgentPicker}.tsx`

**Changed:**

| Area | Files |
|---|---|
| Domain & data | `src/domain/types.ts`, `src/domain/seed.ts`, `src/world/inventory.ts`, `src/world/placement.ts`, `src/world/snapshot.ts`, `src/config/fleet.ts` |
| Sim & view state | `src/sim/route.ts`, `src/state/view.ts`, `src/App.tsx` |
| Scene | `src/scene/vehicles/Truck.tsx`, `src/scene/vehicles/Forklift.tsx`, `src/scene/cargo/CargoLayer.tsx`, `src/scene/CameraRig.tsx` |
| UI | `src/ui/Dashboard.tsx`, `src/ui/DetailPanel.tsx`, `src/ui/OpsTable.tsx`, `src/ui/CargoForm.tsx`, `src/ui/CargoDetail.tsx` |
