# Docktor · 3D Yard

A digital twin of a logistics yard for **Docktor**: a game-like 3D view of the yard with an
operations dashboard on top. Trucks, forklifts and workers move through the yard, cargo sits
in free-form storage areas, and each unit can carry its source documents (bill, CMR, delivery note,
invoice), entered by hand.

**Live demo: https://warehouse-yard-dashboard.vercel.app/**

![Docktor yard twin: walled yard with free-form storage, loading bays and the operations dashboard](docs/screenshot.png)

## How it's made

- **React + TypeScript + Vite**, 3D with **three.js** via **React Three Fiber** and drei, UI with
  **Tailwind CSS**, state in **Zustand**.
- The whole yard is generated from one config file in meters (`src/config/devYard.ts`), traced from
  a hand-drawn plan: walls, buildings, raised hold spaces, ramp, loading bays, storage areas.
  Buildings, vehicles and cargo are procedural low-poly geometry; trees and roads are CC0 models by Kenney.
- Vehicle movement is simulated: routes are pure functions of time, so pausing and speeding up are free.
  Cargo placement keeps clear of every route automatically.
- Cargo, documents and history are saved in the browser (localStorage).
- **Load planner** (select a truck at a loading bay → *Plan load*): a TypeScript solver in `src/loading`
  packs the yard units bound for the truck's stops, last stop at the front wall. It checks every axle at
  departure and after each drop, and *Optimise* searches ~1,000 layouts in a Web Worker. The solver's
  recommended plan, the manager's confirmed plan and what was actually loaded are kept apart. *Load at
  dock* sends forklifts along A* paths through the yard to load the truck on the sim clock.

```bash
npm install
npm run dev
```
