import { useLayoutEffect, useRef, type DependencyList, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const noop = () => {};

/** Shared vertex-colour materials, one per surface finish. */
const vcMaterials = new Map<string, THREE.MeshStandardMaterial>();
function vcMaterial(roughness: number, metalness: number) {
  const key = `${roughness.toFixed(2)}|${metalness.toFixed(2)}`;
  let m = vcMaterials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness });
    vcMaterials.set(key, m);
  }
  return m;
}

/** Plain, opaque, non-glowing colour: can share a vertex-coloured material with others. */
function isPlain(m: THREE.Material): m is THREE.MeshStandardMaterial {
  const s = m as THREE.MeshStandardMaterial;
  return (
    s.isMeshStandardMaterial === true &&
    !s.map &&
    !s.emissiveMap &&
    !s.transparent &&
    s.side === THREE.FrontSide &&
    s.emissive.r + s.emissive.g + s.emissive.b === 0 &&
    !s.vertexColors
  );
}

/**
 * Bakes the static meshes under it into one mesh per material, so a truck or
 * a building costs a handful of draw calls instead of dozens. Subtrees marked
 * `userData.noMerge` (wheels, forks, …) stay live. Re-bakes when `deps` change.
 */
export function Merge({ children, deps = [] }: { children: ReactNode; deps?: DependencyList }) {
  const root = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const group = root.current;
    if (!group) return;
    group.updateWorldMatrix(true, true);
    const inverse = group.matrixWorld.clone().invert();

    const buckets = new Map<string, { material: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
    const hidden: THREE.Mesh[] = [];
    const visit = (obj: THREE.Object3D) => {
      if (obj !== group && obj.userData.noMerge) return;
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && !(obj as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(mesh.material) && mesh.visible) {
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        const plain = isPlain(mesh.material);
        const keep = plain ? ['position', 'normal'] : ['position', 'normal', 'uv'];
        for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
        let material = mesh.material;
        let key = `${mesh.material.uuid}|${mesh.castShadow}`;
        if (plain) {
          // Bake the colour into the vertices; everything with the same finish shares one draw call.
          const src = mesh.material as THREE.MeshStandardMaterial;
          const n = g.attributes.position.count;
          const colors = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) colors.set([src.color.r, src.color.g, src.color.b], i * 3);
          g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          material = vcMaterial(src.roughness, src.metalness);
          key = `${material.uuid}|${mesh.castShadow}`;
        }
        const bucket = buckets.get(key) ?? { material, cast: mesh.castShadow, geos: [] };
        bucket.geos.push(g);
        buckets.set(key, bucket);
        hidden.push(mesh);
      }
      for (const child of obj.children) visit(child);
    };
    visit(group);

    const merged: THREE.Mesh[] = [];
    for (const { material, cast, geos } of buckets.values()) {
      const geometry = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!geometry) continue;
      const m = new THREE.Mesh(geometry, material);
      m.castShadow = cast;
      m.receiveShadow = true;
      merged.push(m);
      group.add(m);
    }
    const saved = hidden.map((m) => m.raycast);
    for (const m of hidden) {
      m.visible = false;
      m.raycast = noop;
    }
    return () => {
      for (const m of merged) {
        group.remove(m);
        m.geometry.dispose();
      }
      hidden.forEach((m, i) => {
        m.visible = true;
        m.raycast = saved[i];
      });
    };
  }, deps);

  return <group ref={root}>{children}</group>;
}
