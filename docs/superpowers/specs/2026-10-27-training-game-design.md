# Yard manager training game — design

**Date:** 2026-10-27 · **Status:** approved in chat, awaiting spec review · **Branch:** `training-game`

The Docktor yard twin becomes a training game for yard managers. The player runs a shift:
trucks arrive at the gate, the player decides which bay each one gets, where incoming cargo is
stored, which truck loads first and when it leaves, and the forklift crew carries those decisions
out against the clock. The shift is scored in money, and every fine names the rule behind it, so
the game teaches the job by letting the player make the mistakes.

The game replaces the twin on `main`. The current twin stays in git history.

## Decisions taken in brainstorming

| Question | Decision |
|---|---|
| What the game is for | **Training for yard managers.** The real rules stay real; scenarios and scores teach them. |
| Who the player is | **The yard manager / dispatcher.** |
| What happens to the twin | **The game replaces it** on `main`; the twin stays in git history. |
| Structure | **A campaign of 9 shifts**, 1–3 stars each, 1 star unlocks the next. No endless mode. |
| How orders are given | **The player decides, the crew executes.** Forklifts work a job queue in the player's priority order. No direct forklift control. |
| Time | **Tight.** Deadlines and gate waiting fees create the pressure. |
| Score | **Money**, tycoon-style: trucks pay, mistakes are fined, stars come from profit targets. |
| What money does | **Each shift has its own budget**, spent during the shift on ways out of trouble (temp forklift, overtime, rushed papers). Nothing carries over between shifts. |
| Pause | **Esc pauses and covers the yard** with a menu. The clock keeps running in every panel, including the load planner. Speed-up 2× / 4×. |
| How shifts are made | **A recipe plus a fixed seed.** A retry is the same shift. |
| Load planner | **Stays automatic.** It never allows an overload or something stacked on a fragile unit; the player's mistakes are about time, order, storage, paperwork and money. No hand-packing. |
| Architecture | **A new game engine in plain TypeScript built on the existing parts** (approach 1). |
| Look | **"Broadcast scoreboard"** (option F): slanted panels, big italic condensed numbers, navy / Docktor blue / hot orange. |
| HUD layout | **Truck timeline** (layout 3): every truck of the shift as a bar against the clock along the bottom; crew, papers and spending in a right-hand column. |

Mockups from brainstorming are in `.superpowers/brainstorm/` (git-ignored): `visual-style-2.html`
(option F), `layout.html` (layout 3), `screens.html` (campaign, briefing, report, pause).

## Principles

- **Every fine teaches.** Each fine is posted with its time, the truck or unit it belongs to and
  the rule behind it, in plain language. The report lists them all.
- **Fair and repeatable.** The same recipe, seed and actions always give the same shift, to the cent.
  Luck never decides a star.
- **The player decides, the crew does.** The game never makes a manager decision for the player.
  Defaults are offered (a suggested storage area, the planner's recommended plan) but the player
  confirms them.
- **Real rules.** Axle limits, stacking, fragile units, drop order and paperwork behave as in the
  current planner and yard; the game adds time and money on top.
- **HD 620 budget.** The full yard plus HUD must hold ≈30 fps on the user's Intel HD 620
  (see the earlier performance work: AO off by default, merged and instanced geometry).

---

## 1. How a shift plays

### 1.1 Clock

- A shift runs **06:00–14:00** on the on-screen clock. Engine time `t` is sim seconds since the
  shift started; the shift clock shows `06:00 + t × 0.8 min` (`SHIFT_MIN_PER_SEC = 0.8`), so a full
  shift takes **10 real minutes at 1×**. The constant is tuned during balancing.
- Vehicles move at their real speeds in sim seconds; only the clock on screen is compressed.
  All fees "per minute" are per **shift** minute.
- Speeds are **1× / 2× / 4×** (8× goes). Keys `1`, `2`, `3` pick them.
- **Esc** pauses: the clock stops and a solid pause screen covers the yard (Resume, Restart shift,
  How to play, Quit to campaign). There is no other pause.
- The load planner does not stop the clock (it already renders on demand and keeps the clock
  running, `PlanTicker` in `App.tsx`).
- At 14:00 (later if overtime was bought) the shift ends. Every truck not yet gone, at the gate or
  in the yard, costs the **unserved truck** fine. Then the report opens.

### 1.2 Inbound trucks

1. **Arriving:** drives in from the road on its recipe time (which may differ from the time on the
   briefing timeline; see incidents).
2. **Waiting:** waiting trucks line up at the kerb outside the yard wall, east of the gate,
   nose to the gate (clear of the traffic lanes). Any of them can be called in; the ones behind move
   up. (P1/P2 inside the gate don't work: they face east with the wall behind them, so a truck
   coming in from the gate can't get in or out without driving through another one.) The **gate
   waiting fee** runs after the free minutes, per truck.
3. **Docking:** the player selects the truck and picks a free bay. The truck drives in and
   reverses onto the bay (the existing `bayVisit` legs, cut into one-shot stages).
4. **Unloading:** the player picks the **storage area** for its cargo. The selection card suggests
   one (covered if the cargo needs cover, else the nearest with room) but the player must confirm.
   One unload job per unit enters the crew queue. The crew picks the exact spot inside the area
   with the existing placement checks (`recommendSpot`, restricted to one area).
5. Each unit set down pays the **handling fee**. When the truck is empty it leaves on its own.

If the chosen area has no room left, the remaining unload jobs stop with "Area full" and the
selection card asks for another area. The truck's time keeps running meanwhile.

### 1.3 Outbound trucks

1. **Arriving / waiting / docking** as inbound. Each outbound truck has its **stops** (cities) and
   a **departure deadline**, both shown on the timeline and the selection card.
2. **Plan load** opens the existing planner on that truck. The truck's body and stops are fixed
   by the shift: the vehicle rail and route reordering are hidden in the game. Urgent, exclude,
   Optimise and the views stay.
3. **Confirm** stores the plan and puts one load job per planned unit into the crew queue, in the
   plan's loading order. It replaces "Load at dock" (no Follow/Skip run).
4. When every planned unit is aboard the truck shows **Loaded**; the player presses **Dispatch**.
   The player may dispatch earlier; anything still planned but not aboard is left behind.
5. On dispatch the truck pays the **delivery fee** per unit aboard, then:
   - the **late departure** fine if it leaves after its deadline, per minute late;
   - the **missing papers** fine per unit aboard whose papers are not complete;
   - the **missed truck** fine per planned unit left behind.

The planner shows a warning on units with missing papers, and Dispatch asks for confirmation
when the load is incomplete or has units with missing papers.

### 1.4 Crew

- Each shift has a set number of forklifts (from the recipe; the rest stay parked on charge).
- Jobs are grouped: one group per truck order (*Load TRUCK-109*, *Unload TRUCK-104 → Main hold*)
  or per move order (*Cover 4 units → Hold 2*). The **crew queue** lists the groups in priority
  order. The player reorders groups with drag **or up/down buttons**, and **Urgent** on a truck
  moves its group to the top. Order inside a group is fixed (loading order, unloading order).
- **Dispatcher:** whenever a forklift is free or the queue changes, the highest group with a
  job that can start gives that job to the **nearest free forklift**. The forklift's route is
  planned once, at that moment, over the yard's A* grid (`src/sim/grid.ts`) and compiled with the
  existing route code (`src/sim/route.ts`), so between decisions motion stays a pure function of
  time.
- **One forklift inside a truck at a time.** A forklift carrying the next unit waits at the
  dock face until the truck is clear, as the current loading run does. The dock-face and in-truck
  path geometry of `src/sim/loadingRun.ts` is reused per job; its whole-run scheduling goes.
- **Move jobs:** selecting units in the yard (the existing cargo selection) offers **Move to…**
  an area. The rain warning offers a one-click "Move unwrapped units under cover".

### 1.5 Paperwork

- From shift 4, some units (in the yard at the start or arriving on inbound trucks) have papers
  **missing**. Papers are a single flag per unit: complete or missing. Document forms, photos and numbers go.
- A **clerk** fixes missing papers one unit at a time, in the order of the papers panel
  (reorderable like the crew queue), taking 20 shift minutes per unit by default (set per recipe).
- **Rush** fixes one unit's papers immediately for the rush fee.

### 1.6 Incidents

Set by the recipe, at fixed times:

| Incident | Effect |
|---|---|
| **Breakdown** | A forklift goes out of action for the recipe's duration (e.g. 60 shift minutes), starting **after it finishes its current job**. |
| **Early / late truck** | The truck arrives at a different time from the briefing timeline. |
| **Rain** | Warned 45 minutes ahead (toast + timeline marker). Damage-prone units (cartons, bags) still in an uncovered area (Open yard, Gate-side) 10 minutes after the rain starts are **damaged**: written off with the damage fine. Wrapped pallets, crates, drums, pipes and machines are fine. |
| **Rush order** | An outbound truck that is not on the briefing timeline arrives with a tight deadline and double delivery pay. |
| **Bay closed** | A bay can't take trucks between two times. A truck already on it finishes. |

### 1.7 Money

- **Profit** is the score: earnings − fines − spending. The HUD shows it live, including fees
  still running (a truck waiting past its free minutes ticks the profit down).
- **Cash** = the shift's budget + profit. Spending needs enough cash; spend buttons grey out when
  it runs short. Fines may push cash below zero.
- Starting prices (tuned in balancing):

| Item | Amount |
|---|---|
| Handling fee, per unit stored | +€40 |
| Delivery fee, per unit dispatched | +€80 (rush order: +€160) |
| Gate waiting fee | 5 free minutes, then −€12 per minute |
| Late departure | −€15 per minute late |
| Missing papers, per unit dispatched | −€300 |
| Missed truck, per planned unit left behind | −€240 |
| Damaged unit (rain) | −€200 |
| Unserved truck at shift end | −€500 |
| Temp forklift | −€150 per shift hour, rented in whole hours |
| Overtime | −€400 per 30 minutes, at most 2 |
| Rush papers | −€40 per unit |

- Waiting and late fines are posted to the ledger when the period ends (truck docks / departs),
  as one line with its duration ("TRUCK-104 waited 15 min at the gate · −€180").
- **Stars:** three profit targets per shift (see §5.3 for how they are set).

---

## 2. The campaign

| # | Shift | New | Pressure |
|---|---|---|---|
| 1 | Opening the gate | Inbound trucks, bays, gate waiting fee | 4 trucks, 2 bays, plenty of time |
| 2 | Where it goes | Choosing the storage area | One outbound truck late in the shift needs stored cargo; storing it far away costs time |
| 3 | First load | Outbound trucks: planner, Confirm, Dispatch, deadlines | Inbound and outbound mixed |
| 4 | Paper chase | Missing papers, the clerk, rushing, the missing-papers fine | Some outbound units can't leave clean until their papers are fixed |
| 5 | The queue | Reordering jobs, urgent trucks | More work than the crew can do in time |
| 6 | Breakdown | Breakdown incident, temp forklift | The breakdown lands just before a deadline |
| 7 | Bad weather | Rain and cover, a closed bay | Moving cargo under cover takes forklifts off the trucks |
| 8 | Rush order | Rush order, overtime | Taking the rush truck makes something else late |
| 9 | Peak day | Nothing new | Everything at once, tight deadlines, little slack |

- Mechanics not yet taught are switched off in the recipe and hidden in the UI: the papers panel
  and Rush appear from shift 4, Temp forklift from shift 6, Overtime from shift 8.
- **Each shift:** briefing → shift → report. The first time a mechanic appears, a short hint
  explains it; hints can be dismissed and are remembered.
- **Progress** (stars, best profit per shift, hints seen) is saved in localStorage under
  `docktor.campaign`. 1 star unlocks the next shift. Any unlocked shift can be replayed.

---

## 3. Architecture

### 3.1 New module `src/game/` (plain TypeScript, no React, no three.js)

| File | Responsibility |
|---|---|
| `recipes.ts` | The 9 shifts as data: seed, bays and forklifts available, starting yard fill, truck schedule, incidents and times, budget, prices, star targets, mechanics switched on, hints. |
| `generate.ts` | `generateShift(recipe) → ShiftSetup`: starting yard cargo (reusing the fill logic in `src/world/demo.ts`), inbound trucks with their units and missing papers, outbound trucks with stops and deadlines, the incident timeline, and the planned (briefing) timeline. Seeded with `mulberry32`. |
| `engine.ts` | `act(state, action, t)` applies a player decision; `advance(state, t)` fires everything due by `t` in time order and returns the events (for toasts and hints). Both change the state object they are given and read nothing else: the only randomness is the seeded rng held in the state, so the same recipe and actions give the same result. |
| `crew.ts` | The dispatcher (§1.4): job groups, picking the next job, nearest free forklift, the one-in-truck rule, planning each job's route over the grid. |
| `ledger.ts` | Ledger entries `{ t, kind, amount, rule, ref }`, the price table, running fees, profit and cash. |
| `report.ts` | Builds the report from the ledger: totals, fines in time order, and the lesson (the rule behind the biggest loss, with its advice line from the recipe's hint table). |
| `progress.ts` | Campaign progress in localStorage (versioned, with a migration hook like `docktor.inventory` has). |
| `store.ts` | Zustand bridge: holds the shift state, calls `advance` with the sim clock (a few times a second for state, every frame only for poses), forwards UI actions to `act`, exposes selectors to the HUD and the scene. |
| `bots.ts` | Test-only policies (§5.2) and `runShift(recipe, policy)` for headless runs. |

**Main types (sketch):**

```ts
type Action =
  | { kind: 'assignBay'; truckId: string; bayId: string }
  | { kind: 'chooseArea'; truckId: string; areaId: string }
  | { kind: 'confirmPlan'; truckId: string; plan: ConfirmedPlan }
  | { kind: 'dispatch'; truckId: string }
  | { kind: 'moveUnits'; unitIds: string[]; areaId: string }
  | { kind: 'reorder'; queue: 'crew' | 'papers'; id: string; to: number }
  | { kind: 'urgent'; truckId: string }
  | { kind: 'rushPapers'; unitId: string }
  | { kind: 'rentForklift'; hours: number }
  | { kind: 'overtime' };

interface ShiftState {
  recipeId: string; t: number; end: number; rng: number;
  trucks: GameTruck[];      // stage, bay, stops, deadline, units, route + t0 for the current stage
  forklifts: GameForklift[]; // job, route + t0, broken-until, temp-until
  cargo: Cargo[];           // the existing Cargo type: x/y/yaw or on, areaId, loadedOn, + papers, damaged
  groups: JobGroup[];       // crew queue
  papers: string[];         // clerk queue (unit ids)
  ledger: LedgerEntry[];
  incidents: IncidentState[];
  log: { t: number; action: Action }[]; // replay and tests
}
```

Truck stages: `scheduled → arriving → waiting → docking → docked → departing → gone`. Each moving
stage holds one compiled one-shot route and its start time; a parked truck holds a fixed pose.

### 3.2 Data flow

```
recipe + seed ──generate──▶ ShiftState
player action ──act──────▶ ShiftState (+ routes planned once)
sim clock ─────advance───▶ events, fees ─▶ ledger
ShiftState ──▶ HUD (scoreboard, timeline, queues)   ──▶ scene (poses = route at clock.t)
shift end ──▶ report ──▶ progress
```

### 3.3 What stays

- The yard config, all site, vehicle and cargo 3D, cargo rendering and the placement checks.
- `src/sim/grid.ts` (A*), `src/sim/route.ts` (compile/evaluate), `src/sim/clock.ts` (speeds become
  1/2/4).
- The camera rig and the camera buttons (a small strip at the right edge).
- The load planner and its solver (`src/loading/*`, `src/ui/planner/*`), with the changes in §1.3:
  stops come from the shift (not `DEFAULT_ROUTES`), candidate cargo comes from the shift's yard
  cargo, vehicle rail and route reorder hidden, Confirm queues jobs. The planner is restyled with
  the game's theme tokens (§4.1) but keeps its layout.
- Road traffic and the walking workers, as background.

### 3.4 What goes

- Scripted truck and forklift loops (`src/config/fleet.ts` routes, `src/sim/tasks.ts` users),
  holds and Stop all (`src/sim/control.ts`).
- The Load-at-dock run as a whole (`src/sim/dockRun.ts`, `src/sim/jobs.ts`, the run scheduling in
  `src/sim/loadingRun.ts`), replaced by the crew.
- The world snapshot (`src/world/snapshot.ts`), replaced by engine selectors.
- The twin dashboard: KPI cards, ops table, shipment tracker, detail panel, layers panel, search,
  top bar, minimap, toasts (replaced), cargo and document forms, workload buttons
  (`src/ui/{KpiCards,OpsTable,ShipmentTracker,DetailPanel,CargoDetail,CargoForm,DocumentForm,LayersPanel,TopBar,Minimap,Toasts,Dashboard,documents}.tsx/ts`).
- The hand-entry inventory store and its persistence (`src/world/inventory.ts`); cargo now
  belongs to the shift.

Tests for removed code are removed with it (`dockRun.test.ts`, `jobs.test.ts`,
`loadingRun.test.ts` for the run parts, `inventory.test.ts`, `snapshot.test.ts`).

### 3.5 Edge cases

- **Area full:** unloading stops with "Area full"; the player picks another area for the rest.
- **Unreachable unit:** a unit no forklift can reach (blocked in) is skipped by the dispatcher
  and flagged "No forklift access" on the group, as the planner does today.
- **Breakdown mid-job:** takes effect after the current job.
- **Temp forklift ends mid-job:** finishes the job, then drives out.
- **Dispatch with a forklift inside the truck:** Dispatch waits for it to clear the truck.
- **Bay closed while a truck is docking:** the truck finishes docking; the closure applies to the
  next truck.
- **Reload:** restarts the shift (no mid-shift save).
- **Corrupt or old progress data:** migrated or reset, never crashes (same pattern as
  `docktor.inventory`).

---

## 4. UI

### 4.1 Look: broadcast scoreboard

- **Shapes:** slanted panels (`skewX(-12deg)` on the panel, content un-skewed), square corners,
  solid fills, one soft drop shadow. No blur, no `backdrop-filter`.
- **Type:** Barlow (body) and Barlow Condensed italic 800 (numbers, headings, buttons, tags),
  bundled with `@fontsource` including **latin-ext** (Turkish city names: ş, ğ, ı, İ). Inter goes.
  Numbers use tabular figures.
- **Colours (tokens in `src/index.css` `@theme`):**

| Token | Value | Use |
|---|---|---|
| `navy` | `#0b1d4f` | Panels, text on light |
| `brand` | `#2f5ff0` | Panel headers, inbound, selection |
| `hot` | `#ff6b1a` | Accents, progress, "now" line; orange buttons and tags carry **navy** text |
| `go` | `#0f7a3d` | Outbound tags, earnings |
| `stop` | `#d02a25` | Fines, late |
| `paper` | `#ffffff` | Light panels (cash, selection card, report) |

- **Contrast:** all text ≥ 4.5:1 against its background (white on navy/brand/go/stop, navy on
  hot/paper). Colour is never the only signal: tags carry text (IN / OUT / LATE), waiting bars are
  striped, late bars carry a label, fines carry a minus sign.
- **Motion:** toasts slide in, TV lower-third style (200 ms) and leave faster (150 ms); numbers tick.
  With `prefers-reduced-motion` they appear without sliding.

### 4.2 Shift HUD (layout 3)

- **Scoreboard** (top): shift tag *3/9 First load*; the clock with its 06:00→14:00 progress line
  and speed buttons; profit with stars and "next ★ at €…".
- **Truck timeline** (bottom, left of the right column): one row per truck of the shift against
  06:00–14:00, planned part pale, waiting striped, docked solid, late red, a tick at each
  deadline, an orange "now" line, incident markers (rain). Clicking a row selects the truck.
  Plain HTML/SVG, re-rendered 4×/s, not per frame.
- **Right column:** crew queue (groups with rank, tag, forklifts on it, up/down buttons, drag);
  papers panel (clerk progress, Rush with price); spend buttons (Temp forklift, Overtime) with
  prices and the cash left.
- **Selection card:** anchored to the selected truck or unit in the 3D view with a pin line.
  Actions follow the truck's stage: *Send to bay* (free bays enabled, busy/closed disabled with the
  reason), *Store in* (areas with fill %, covered marked), *Plan load*, *Dispatch*, *Urgent*;
  for units: *Move to…*, *Rush papers*.
- **World tags:** small slanted tags over bays (*L1 · 3/8*, *L3 · FREE*) and over trucks with a
  running fee. At most ~12, positioned from one `useFrame` projection pass (no per-tag `<Html>`).
- **Money toasts:** lower-third style, top left under the scoreboard: amount block (red/green) + what
  happened + the rule. Auto-dismiss after 4 s, at most 3 visible.
- **Hints:** a dismissible callout pointing at the relevant panel, first time per mechanic.

### 4.3 Screens around a shift

- **Campaign:** nine shift cards over the dimmed yard; finished ones show stars and best profit,
  the next one is outlined orange with Play, the rest are locked; total stars top right.
- **Briefing:** what's new, the rule (with the actual amount), a mini timeline of the day's
  trucks, the three profit targets, the budget, bays and forklifts; Start shift.
- **Report:** profit and stars as a full-time scoreboard with "€… short of ★★" and best-so-far;
  money breakdown; every fine with time, what happened and the rule; one lesson; Campaign,
  Retry, Next shift.
- **Pause (Esc):** solid cover, Resume, Restart shift, How to play, Quit to campaign.

### 4.4 Input

Mouse first. Keyboard: `Esc` pause, `1`/`2`/`3` speed, `Tab` order through HUD controls with
visible focus, Enter/Space activate. Every drag (queue reorder) has up/down buttons too.
Desktop only; no touch layout.

---

## 5. Testing and balancing

### 5.1 Engine and generator tests (Vitest)

- Truck stages and stage routes; inbound unload end to end; outbound plan → load → dispatch.
- Fees: waiting fee only after the free minutes; late fine per minute; missed-truck and
  missing-papers fines on dispatch; unserved-truck fine at shift end; damage only for
  damage-prone units in uncovered areas after the grace time.
- Crew: priority order, nearest free forklift, one in the truck at a time, loading order kept,
  area full, unreachable units, breakdown after the current job, temp forklift in and out.
- Papers: clerk order, reorder, rush.
- Spending can't exceed cash.
- The ledger always sums to the profit shown; running fees included in the live profit.
- **Determinism:** replaying a recorded action log gives an identical ledger.
- Every recipe generates a valid shift: cargo placed legally (existing placement checks), every
  truck's units exist, every deadline reachable in principle.

### 5.2 Bots

- **Basic bot:** bays first come first served, the suggested storage area, the planner's
  recommended plan, dispatch as soon as loaded.
- **Good bot:** bays and queue ordered by deadline, rushes papers when cheaper than the fine,
  moves units out of the rain, rents a forklift when a deadline would otherwise be missed.

`runShift` advances the engine in large steps without rendering; a full shift runs in well under
a second.

### 5.3 Star targets and `npm run balance`

- ★ = the basic bot's profit (rounded down to €100), so every shift can be passed.
- ★★★ = 95 % of the good bot's profit (rounded down to €100).
- ★★ = halfway.
- `npm run balance` prints each shift's bot profits and targets. A test fails if a shift's
  targets are out of order or the basic bot can't reach ★.

### 5.4 Before calling it done

- `npm test`, `npm run typecheck`, `npm run build`.
- A play-through of all 9 shifts in the browser.
- An fps check on the HD 620 with headless Chromium (`--ignore-gpu-blocklist --enable-gpu
  --use-angle=gl`): ≥ 30 fps at 1600×920 with a full yard, the HUD and the timeline.
- README rewritten for the game, with a new screenshot.

---

## Out of scope

Hand-packing loads; endless mode; money carried between shifts or upgrades; mid-shift save; touch
and mobile; sound; languages other than English; accounts and leaderboards; forklift collisions or
traffic between vehicles; overload or crushed-fragile fines (the planner makes them impossible);
hazmat and temperature (left out of the planner earlier, still out).

## New and changed files (overview)

- **New:** `src/game/{types,recipes,generate,places,legs,crew,planning,engine,ledger,select,report,progress,motion,store,bots}.ts` + tests;
  `src/ui/game/{Scoreboard,Timeline,CrewQueue,PapersPanel,SpendBar,SelectionCard,WorldTags,MoneyToasts,Hint,Campaign,Briefing,Report,PauseMenu,GameRoot}.tsx`;
  a `balance` npm script.
- **Changed:** `src/App.tsx` (game root instead of the dashboard), `src/index.css` (theme tokens,
  fonts), `src/sim/clock.ts` (speeds), the dock-face and in-truck geometry of `src/sim/loadingRun.ts`
  (moved into `src/game/legs.ts`; the rest of the file goes),
  `src/world/placement.ts` (`recommendSpot` restricted to an area), `src/scene/*` vehicle and cargo
  layers (poses and cargo from the game store), `src/loading/store.ts` and `src/ui/planner/*`
  (shift stops and cargo, hidden controls, Confirm queues jobs, theme), `package.json` (fonts,
  `balance`), `README.md`.
- **Removed:** see §3.4.
