import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Cargo, Pose } from '../../domain/types';
import { boxToYard } from '../../loading/frame';
import type { LoadPlan, VehicleSpec } from '../../loading/types';
import { useUi } from '../../state/ui';
import { stopColor } from '../../ui/planner/format';
import { buildCargoPrims, makePrimAssets, type Prim, type PrimKind } from '../cargo/cargoPrims';
import { PrimMesh } from '../cargo/CargoLayer';
import { unitBox, yardToWorld } from '../kit';
import { Brackets, Tag } from '../markers';

type Assets = Record<PrimKind, { geometry: THREE.BufferGeometry; material: THREE.Material }>;

/** The same cargo looks, see-through: units planned for the truck but not loaded yet. */
function ghostAssets(assets: Assets): Assets {
  const out = { ...assets };
  for (const k of Object.keys(assets) as PrimKind[]) {
    const m = assets[k].material.clone();
    m.transparent = true;
    m.opacity = 0.7;
    out[k] = { ...assets[k], material: m };
  }
  return out;
}

function Prims({ cargo, base, assets }: { cargo: Cargo[]; base: Map<string, number>; assets: Assets }) {
  const { prims } = useMemo(() => buildCargoPrims(cargo, new Set(), (c) => base.get(c.id)), [cargo, base]);
  const byKind = useMemo(() => {
    const groups = new Map<PrimKind, Prim[]>();
    for (const p of prims) groups.set(p.kind, [...(groups.get(p.kind) ?? []), p]);
    return [...groups.entries()];
  }, [prims]);
  const hover = useUi((s) => s.hover);
  const select = useUi((s) => s.select);
  const onHover = (i: number | null) => {
    if (i !== null) hover({ kind: 'cargo', id: cargo[i].id });
    else if (useUi.getState().hovered?.kind === 'cargo') hover(null);
  };
  const onClick = (i: number) => select({ kind: 'cargo', id: cargo[i].id });
  return (
    <>
      {byKind.map(([kind, list]) => (
        <PrimMesh key={`${kind}|${list.length}`} prims={list} asset={assets[kind]} onHover={onHover} onClick={onClick} onDoubleClick={onClick} />
      ))}
    </>
  );
}

/** A thin stop-coloured frame around each unit's footprint (one draw call). */
function StopOutlines({ plan, v, pose }: { plan: LoadPlan; v: VehicleSpec; pose: Pose }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), []);
  const count = plan.placements.length * 4;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.heading);
    const color = new THREE.Color();
    const t = 0.03;
    let i = 0;
    for (const p of plan.placements) {
      const z = v.deck + p.z + 0.012;
      // Two edges along the box (x) and two across (y), in the box frame: [cx, cy, size along x, size along y].
      const edges: [number, number, number, number][] = [
        [p.x + p.l / 2, p.y, p.l, t],
        [p.x + p.l / 2, p.y + p.w, p.l, t],
        [p.x, p.y + p.w / 2, t, p.w],
        [p.x + p.l, p.y + p.w / 2, t, p.w],
      ];
      for (const [ex, ey, sx, sy] of edges) {
        const [x, y] = boxToYard(pose, v, ex, ey);
        m.compose(new THREE.Vector3(...yardToWorld(x, y, z)), q, new THREE.Vector3(sx, 0.02, sy));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, color.set(stopColor(p.stop)));
        i += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [plan, v, pose]);
  if (!count) return null;
  return <instancedMesh key={count} ref={ref} args={[unitBox, material, count]} raycast={() => null} />;
}

/**
 * The plan's units inside the truck (spec §2.2): still in the yard → drawn
 * see-through where they will go; loaded onto this truck → solid.
 */
export function PackedUnits({ plan, v, pose, truckId, cargo }: { plan: LoadPlan; v: VehicleSpec; pose: Pose; truckId: string; cargo: Cargo[] }) {
  const assets = useMemo((): Assets => makePrimAssets(), []);
  const ghosts = useMemo(() => ghostAssets(assets), [assets]);
  const { loaded, planned, base, boxes } = useMemo(() => {
    const index = new Map(cargo.map((c) => [c.id, c]));
    const base = new Map<string, number>();
    const boxes = new Map<string, { x: number; y: number; z: number; l: number; w: number; h: number; yaw: number }>();
    const loaded: Cargo[] = [];
    const planned: Cargo[] = [];
    for (const p of plan.placements) {
      const c = index.get(p.cargoId);
      if (!c) continue;
      const [x, y] = boxToYard(pose, v, p.x + p.l / 2, p.y + p.w / 2);
      const yaw = pose.heading + (p.yaw === 90 ? Math.PI / 2 : 0);
      base.set(c.id, v.deck + p.z);
      boxes.set(c.id, { x, y, z: v.deck + p.z, l: c.dims.l, w: c.dims.w, h: c.dims.h, yaw });
      const unit: Cargo = { ...c, x, y, yaw, on: p.on, loadedOn: null };
      (c.loadedOn?.truckId === truckId ? loaded : planned).push(unit);
    }
    return { loaded, planned, base, boxes };
  }, [plan, v, pose, truckId, cargo]);

  const hovered = useUi((s) => (s.hovered?.kind === 'cargo' ? s.hovered.id : null));
  const selected = useUi((s) => (s.selected?.kind === 'cargo' ? s.selected.id : null));
  const marked = [...new Set([selected, hovered].filter((id): id is string => !!id && boxes.has(id)))];

  return (
    <group>
      <Prims cargo={loaded} base={base} assets={assets} />
      <Prims cargo={planned} base={base} assets={ghosts} />
      <StopOutlines plan={plan} v={v} pose={pose} />
      {marked.map((id) => {
        const b = boxes.get(id)!;
        return (
          <group key={id} position={yardToWorld(b.x, b.y, b.z)} rotation={[0, b.yaw, 0]}>
            <Brackets size={[b.l + 0.12, b.h + 0.08, b.w + 0.12]} strong={id === selected} />
            <Tag y={b.h + 0.6} title={id} subtitle={cargo.find((c) => c.id === id)?.description ?? ''} variant="light" />
          </group>
        );
      })}
    </group>
  );
}
