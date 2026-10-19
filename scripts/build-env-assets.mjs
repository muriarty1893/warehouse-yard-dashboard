// Bundles the selected CC0 Kenney models in assets-src/ into one GLB per kit
// for the scene's environment (trees, bushes, grass, rocks, road tiles).
//
//   npm run assets:env
//
// Each model becomes a named root node (its file name), so the app can pick
// models out of the bundle. Nature Kit models ship with KHR_materials_unlit;
// that is removed so they take the yard's sun, shadows and fill light.
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, prune, unpartition, weld } from '@gltf-transform/functions';
import { readdirSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import { basename, join } from 'node:path';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const OUT = 'public/assets/env';
mkdirSync(OUT, { recursive: true });

/**
 * Lighten a texture towards a pale lavender: c' = L − (L − c)·k. Used on the
 * road colormap so Kenney's dark asphalt matches the yard's pale lavender roads.
 */
const LAVENDER = [234, 237, 252];
function lighten(texture, k) {
  const png = PNG.sync.read(Buffer.from(texture.getImage()));
  for (let i = 0; i < png.data.length; i += 4) {
    for (let c = 0; c < 3; c++) png.data[i + c] = Math.round(LAVENDER[c] - (LAVENDER[c] - png.data[i + c]) * k);
  }
  texture.setImage(new Uint8Array(PNG.sync.write(png)));
}

async function bundle(srcDir, outFile, { lit, lightenTextures }) {
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.glb')).sort();
  const target = await io.read(join(srcDir, files[0]));
  const scenes = [];

  for (const [i, file] of files.entries()) {
    const doc = i === 0 ? target : await io.read(join(srcDir, file));
    const id = basename(file, '.glb');
    if (lit) {
      for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_unlit') ext.dispose();
      for (const m of doc.getRoot().listMaterials()) m.setRoughnessFactor(0.85).setMetallicFactor(0);
    }
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    const root = doc.createNode(id);
    for (const child of scene.listChildren()) {
      scene.removeChild(child);
      root.addChild(child);
    }
    scene.addChild(root);
    if (i > 0) {
      const map = mergeDocuments(target, doc);
      scenes.push(map.get(scene));
    } else {
      scenes.push(scene);
    }
  }

  // One scene holding every model root.
  const main = scenes[0];
  for (const s of scenes.slice(1)) {
    for (const child of s.listChildren()) {
      s.removeChild(child);
      main.addChild(child);
    }
    s.dispose();
  }
  // Neutral scene name: it must not collide with a model name.
  main.setName(basename(outFile, '.glb'));
  target.getRoot().setDefaultScene(main);

  if (lightenTextures) for (const t of target.getRoot().listTextures()) lighten(t, lightenTextures);

  await target.transform(unpartition(), dedup(), prune(), weld());
  await io.write(join(OUT, outFile), target);

  console.log(`\n${outFile}`);
  for (const node of main.listChildren()) {
    const b = getBounds(node);
    const size = b.max.map((v, k) => (v - b.min[k]).toFixed(3));
    console.log(`  ${node.getName().padEnd(22)} size ${size.join(' × ')}  min-y ${b.min[1].toFixed(3)}`);
  }
}

await bundle('assets-src/kenney-nature-kit', 'nature.glb', { lit: true });
await bundle('assets-src/kenney-city-kit-roads', 'roads.glb', { lit: false, lightenTextures: 0.55 });
