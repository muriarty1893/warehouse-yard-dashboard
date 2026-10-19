# Docktor · 3D Yard

The 3D yard scene for **Docktor** (spec: `~/Desktop/Docktor/Docktor-Authoritative-Spec-Build-Brief.md`),
styled after the WareTrack demo. Scene only: no camera/CV pipeline, no live data, no app UI yet.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # route/path tests (vitest)
npm run typecheck
npm run build
npm run assets:env # rebuild public/assets/env/*.glb from assets-src/
```

Controls: drag to pan, right-drag to rotate, scroll to zoom, click a truck / forklift / worker / cargo to select it.

## How it is built

Everything is generated from config in **meters** (x east, y north). Nothing is hand-placed in the scene.
The previous L-shaped demo yard is kept on the `l-shaped-dev-yard` branch.

| Where | What |
|---|---|
| `src/config/devYard.ts` | The yard traced from `yardplan.png` (≈ 65.5 × 42 m, scale taken from the road lanes): main office building, raised covered hold spaces (canopy, no walls), forklift ramp, 4 truck loading spaces, open storage, staff building, main sliding gate + east garage door. Change numbers here to match real measurements. |
| `src/config/fleet.ts` | Trucks, forklifts, workers, road traffic: static ones sit in a bay, scripted ones follow a route |
| `src/domain/` | Domain types, storage-position generation (`A01…`, `B17`, `D04`), deterministic sample cargo (`CARGO-18492` @ B17, `GROUP-0042` @ C12) |
| `src/sim/` | One simulation clock; routes are pure functions of time (paths with filleted corners, drive/wait legs) |
| `src/scene/` | Rendering only: floor markings painted to canvas, procedural buildings, instanced cargo, vehicles |

## Environment assets

The landscaping uses ready-made **CC0 models by Kenney**: Nature Kit for the trees, bushes,
grass tufts, flowers and rocks, and City Kit Roads for the road tiles and street lights.
Only the models we use are kept in `assets-src/`, together with their `License.txt`,
`asset-manifest.json` (source, license, edits per model) and `CREDITS.md`.
`scripts/build-env-assets.mjs` bundles them into one GLB per kit and adapts them to the scene:
it makes the Nature Kit materials lit and lightens the road texture to lavender.
`src/scene/site/EnvAssets.tsx` draws them instanced, and `src/scene/site/landscape.ts` places them, seeded.

The yard itself (zones, buildings, cargo, trucks, forklifts) stays procedural and config-driven.

## Performance knobs

URL params: `?ao=1` (ambient occlusion, heavy), `?shadows=1024|0`, `?msaa=0`, `?dpr=1`.
The defaults hold ~40+ fps on an Intel HD 620.
