# Third-party assets

| Kit | Version | Creator | License | Source |
|---|---|---|---|---|
| Nature Kit | 2.1 | Kenney (www.kenney.nl) | CC0 1.0 | https://kenney.nl/assets/nature-kit |
| City Kit Roads | 2.2 | Kenney (www.kenney.nl) | CC0 1.0 | https://kenney.nl/assets/city-kit-roads |

Licenses were checked on the original kenney.nl pages and in each kit's `License.txt`
(kept next to the source models). CC0 needs no attribution; Kenney is credited anyway.

Only the models listed in `asset-manifest.json` are kept here. `npm run assets:env`
bundles them into `public/assets/env/{nature,roads}.glb` with these edits:

- Nature Kit: `KHR_materials_unlit` removed (so the models take the scene's light and shadows), roughness 0.85.
- City Kit Roads: the shared `colormap.png` lightened towards lavender to match the yard's palette.
