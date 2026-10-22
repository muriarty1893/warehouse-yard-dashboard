import { useMemo } from 'react';
import { FORKLIFT } from '../../domain/vehicles';
import { planOf, useLoading } from '../../loading/store';
import { useJobs } from '../../sim/jobs';
import { useInventory } from '../../world/inventory';
import { buildCargoPrims, makePrimAssets, type Prim, type PrimKind } from '../cargo/cargoPrims';
import { PrimMesh } from '../cargo/CargoLayer';

const noop = () => {};

/**
 * The actual unit on a forklift's forks during a loading run, in the
 * carriage's frame: lengthwise when it travels lengthwise in the truck.
 */
export function CarriedUnit({ cargoId }: { cargoId: string }) {
  const unit = useInventory((s) => s.cargo.find((c) => c.id === cargoId));
  const truckId = useJobs((s) => s.run?.truckId ?? null);
  const turned = useLoading((s) => (truckId ? planOf(s, truckId)?.placements.find((p) => p.cargoId === cargoId)?.yaw === 90 : false));
  const assets = useMemo(makePrimAssets, []);
  const byKind = useMemo(() => {
    if (!unit) return [];
    // Drawn at the origin of the carriage, then moved out onto the forks.
    const { prims } = buildCargoPrims([{ ...unit, x: 0, y: 0, yaw: turned ? Math.PI / 2 : 0, on: null, loadedOn: null }], new Set(), () => 0.06);
    const groups = new Map<PrimKind, Prim[]>();
    for (const p of prims) groups.set(p.kind, [...(groups.get(p.kind) ?? []), p]);
    return [...groups.entries()];
  }, [unit, turned]);
  return (
    <group position={[FORKLIFT.carryOffset, 0, 0]}>
      {byKind.map(([kind, list]) => (
        <PrimMesh key={`${kind}|${list.length}`} prims={list} asset={assets[kind]} onHover={noop} onClick={noop} onDoubleClick={noop} />
      ))}
    </group>
  );
}
