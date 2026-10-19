import { useLayoutEffect, useRef, type DependencyList, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const noop = () => {};

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
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
        const key = `${mesh.material.uuid}|${mesh.castShadow}`;
        const bucket = buckets.get(key) ?? { material: mesh.material, cast: mesh.castShadow, geos: [] };
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
