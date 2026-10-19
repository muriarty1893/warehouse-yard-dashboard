# Docktor · 3D Yard

The 3D yard twin for **Docktor** (spec: `~/Desktop/Docktor/Docktor-Authoritative-Spec-Build-Brief.md`),
styled after the WareTrack demo, with an operations dashboard on top. No camera/CV pipeline or live data yet:
vehicles and people are simulated, cargo and documents are entered by hand.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # routes, placement rules, layout checks (vitest)
npm run typecheck
npm run build
npm run assets:env # rebuild public/assets/env/*.glb from assets-src/
```

## The yard

Generated from config in **meters** (x east, y north); nothing is hand-placed in the scene.
`src/config/devYard.ts` is traced from `yardplan.png` (≈ 65.5 × 42 m, scale from the road lanes):

- high precast-concrete **walls** all round, a huge two-leaf **sliding door** at the entrance
  (opens for trucks), the medium garage door on the east wall;
- main office building (3 floors) and staff building (tea room / lunch room) with their doors;
- the **raised hold spaces** under canopies (no walls), forklift ramp, stairs, safety rails, chargers,
  the managers' tables at the loading edge;
- 4 truck loading spaces and 2 parking spaces along the south wall;
- **storage is free-form**: the yellow spaces on the plan are storage areas with no fixed slots.
  Cargo goes wherever there is room; aisles open and close with the day's workload.

Keep-clear corridors (`src/world/clearance.ts`) are swept from every truck, forklift and walker route,
plus parked vehicles, bays, the ramp, doors and fixtures. Demo cargo and anything placed by hand stay out of them.

The previous layouts are on branches: `l-shaped-dev-yard` (L-shaped demo).

## Working with cargo and documents

- **Register cargo** (top bar, or `C`): ID, kind, goods, destination, weight, dimensions, and optionally the
  source document right away. Then *Place on map* (click a free spot, or a unit to stack on it; `R` turns it)
  or *Use recommended* (free floor nearest the loading strip, covered areas first).
- **Source documents** (bill of lading, CMR, delivery note / irsaliye, invoice, packing list, customs):
  number, date, shipper, consignee, carrier, from/to, pieces, weight, value, item list, notes,
  a photo of the paper, draft or confirmed. Add / edit from the cargo card or the *Cargo* tab.
  Confirmed paperwork prints a label on the unit in 3D.
- **Move** (`M`) / **Edit** / **Release** a unit; every change goes into its history.
- *Docs* tab: all documents, export to CSV / JSON. Search finds cargo by bill number, shipper or consignee.
- Everything is saved in this browser (localStorage). *Workload* in the yard card: Quiet / Normal / Busy / Peak
  refills the demo cargo, *Next day* rearranges it; your own entries are kept. *Reset* restores the demo data.

## Controls

Mouse: drag to pan, right-drag to rotate, scroll to zoom, click to select, double-click to fly there.
Minimap: click or drag to move the camera.

| Key | | Key | |
|---|---|---|---|
| `W A S D` / arrows | pan (Shift = fast) | `C` | register cargo |
| `Q` `E` | rotate | `M` | move the selected cargo |
| `Z` `X` | zoom | `R` | turn the unit being placed |
| `H` / `T` | home / top-down view | `G` | hold / resume the selected vehicle |
| `F` | focus selection | `L` / `O` | layers panel / cycle map colouring |
| `Space`, `1`–`4` | pause, sim speed | `N` | day / night |
| `/` | search | `Esc` | cancel / clear |

**Map layers** (`L`): colour the map by storage space, paperwork state or destination; high walls,
canopy roofs, name tags, vehicle routes, reference grid (A1…N9), minimap, trees, road traffic;
time of day (morning / day / dusk / night, or follow the yard clock). **Stop all** in the top bar
holds every moving vehicle.

## Code map

| Where | What |
|---|---|
| `src/config/` | Yard layout, fleet (trucks, forklifts, workers, traffic) |
| `src/domain/` | Types, geometry (polygons, oriented boxes), yard helpers, goods and paperwork generators |
| `src/sim/` | One simulation clock; routes are pure functions of time; manager holds |
| `src/world/` | Inventory store (cargo, documents, events), placement rules, keep-clear corridors, demo days, World State snapshot |
| `src/scene/` | Rendering only: painted floor, procedural buildings, instanced cargo, vehicles, lighting, overlays |
| `src/ui/` | Dashboard: top bar, KPIs, detail cards, forms, layers, minimap, operations table |

## Environment assets

The landscaping uses ready-made **CC0 models by Kenney**: Nature Kit for the trees, bushes,
grass tufts, flowers and rocks, and City Kit Roads for the road tiles and street lights.
Only the models we use are kept in `assets-src/`, together with their `License.txt`,
`asset-manifest.json` (source, license, edits per model) and `CREDITS.md`.
`scripts/build-env-assets.mjs` bundles them into one GLB per kit and adapts them to the scene.

## Performance knobs

URL params: `?ao=1` (ambient occlusion, heavy), `?shadows=1024|0`, `?msaa=0`, `?dpr=1`, `?ui=0`.
Static geometry is merged by surface finish (vertex colours) and cargo casts shadows from one box per unit,
so a full yard stays at ~30 fps on an Intel HD 620. Night lighting uses emissive materials and light pools, no real lights.
