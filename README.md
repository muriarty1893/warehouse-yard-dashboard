# Docktor · 3D Yard

A digital twin of a logistics yard for **Docktor**: a game-like 3D view of the yard with an
operations dashboard on top. Trucks, forklifts and workers move through the yard, cargo sits
in free-form storage areas, and each unit can carry its source documents (bill, CMR, delivery note,
invoice), entered by hand. A load planner packs the trucks at the loading bays from the cargo in the yard.

**Live demo: https://warehouse-yard-dashboard.vercel.app/**

![Docktor yard twin: walled yard with free-form storage, loading bays and the operations dashboard](docs/screenshot.png)

## Load planner

Select a truck at a loading bay and press **Plan load**. The planner proposes how the truck is
packed from the yard units bound for its stops, and the manager decides.

![Load planner: a cut-away truck with its planned load, axle loads, load distribution and the cargo table](docs/load-planner.png)

**Planning**
- **Packing:** the last stop goes to the front wall and every stop can come out through the doors.
  Nothing is stacked on fragile or weak units.
- **Weight checks:** every axle is checked at departure and after each drop, and a load-distribution chart
  shows the legal centre-of-gravity window.
- **Planner controls:**
  - pick the truck's own body or another vehicle
  - reorder the route
  - mark units urgent or exclude them
  - **Optimise** tries ~1,000 layouts and keeps the best
- **Left-out units:** units that don't fit go to the next truck on the route or wait in the yard, each with
  its reason.
- **Views:** 3D, Side, Top and a 2D Plan drawing with the loading order.

**Loading**
- **Confirm** stores the plan.
- **Load at dock** sends two forklifts through the yard (up the ramp too) to bring each unit into the
  truck, one at a time inside the truck.
- **Follow** keeps the camera on the forklift, **Skip** finishes the run, and **Dispatch** sends the truck
  off with its load.

## How it's made

- **React + TypeScript + Vite**, 3D with **three.js** via **React Three Fiber** and drei, UI with
  **Tailwind CSS**, state in **Zustand**.
- The whole yard is generated from one config file in meters (`src/config/devYard.ts`), traced from
  a hand-drawn plan: walls, buildings, raised hold spaces, ramp, loading bays, storage areas.
  Buildings, vehicles and cargo are procedural low-poly geometry; trees and roads are CC0 models by Kenney.
- Vehicle movement is simulated: routes are pure functions of time, so pausing and speeding up are free.
  Cargo placement keeps clear of every route automatically.
- **Load planner:**
  - The solver is plain TypeScript in `src/loading` (vehicle presets, axle statics, an extreme-point packer, seeded search in a Web Worker).
  - The loading run is one-shot forklift routes over an A* grid of the yard (`src/sim`).
  - The solver's recommended plan, the manager's confirmed plan and what was actually loaded are kept apart.
- Cargo, documents, history and load plans are saved in the browser (localStorage).

```bash
npm install
npm run dev
npm test
```
