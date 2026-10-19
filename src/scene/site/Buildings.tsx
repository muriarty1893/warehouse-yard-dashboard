import { useMemo } from 'react';
import * as THREE from 'three';
import type { Building, Ramp, TruckBay, YardConfig } from '../../domain/types';
import {
  Box,
  canvasTexture,
  corrugatedTexture,
  Cyl,
  drawLogoMark,
  FONT,
  glassMat,
  mat,
  palette,
  RBox,
  roundRect,
  yardToWorld,
} from '../kit';
import { Merge } from '../Merge';

const DOOR_W = 3.4;
const DOCK_H = 1.25;
const DOOR_TOP = 5.0;

function wallMaterial() {
  const tex = corrugatedTexture('wall', palette.wall, '#f3f5fa', '#cdd4e3').clone();
  tex.needsUpdate = true;
  tex.repeat.set(1 / 1.6, 1);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
}

function roofMaterial(length: number) {
  const tex = corrugatedTexture('roof', palette.blue, '#4271f5', '#2550d6').clone();
  tex.needsUpdate = true;
  tex.repeat.set(length / 1.4, 1);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
}

function signTexture(title: string, subtitle: string) {
  return canvasTexture(`sign|${title}|${subtitle}`, 1024, 192, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 0, 0, w, h, 36);
    ctx.fill();
    drawLogoMark(ctx, 28, 28, h - 56);
    ctx.fillStyle = palette.navy;
    ctx.font = `800 78px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Docktor', h + 6, 100);
    ctx.fillStyle = palette.blue;
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(`${title} · ${subtitle}`, h + 8, 154);
  });
}

function dockNumberTexture(n: string) {
  return canvasTexture(`docknum|${n}`, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = palette.blue;
    roundRect(ctx, 0, 0, w, h, 22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 68px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n, w / 2, h / 2 + 4);
  });
}

/** Wall from a 2D outline (meters, x along wall, y up) with rectangular holes; outer face at z = 0. */
function wallGeometry(outline: [number, number][], holes: [number, number, number, number][], thickness: number) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const [x, y, w, h] of holes) {
    const hole = new THREE.Path();
    hole.moveTo(x, y);
    hole.lineTo(x + w, y);
    hole.lineTo(x + w, y + h);
    hole.lineTo(x, y + h);
    hole.closePath();
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness);
  return g;
}

function CartonPallet({ position, layers = 2 }: { position: [number, number, number]; layers?: number }) {
  return (
    <group position={position}>
      <Box size={[1.2, 0.14, 1.0]} position={[0, 0.07, 0]} color={palette.wood} />
      {Array.from({ length: layers }).flatMap((_, l) =>
        [-0.3, 0.3].flatMap((dx) =>
          [-0.25, 0.25].map((dz) => (
            <RBox key={`${l}${dx}${dz}`} size={[0.58, 0.4, 0.48]} position={[dx, 0.14 + 0.2 + l * 0.41, dz]} color={palette.cardboard} radius={0.03} />
          )),
        ),
      )}
    </group>
  );
}

function DockDoor({ u, id, stocked }: { u: number; id: string; stocked: boolean }) {
  const frame = mat(palette.blue, { roughness: 0.5 });
  const seal = mat('#30364a', { roughness: 0.9 });
  const openH = DOOR_TOP - DOCK_H;
  const numTex = dockNumberTexture(id.replace('DK-', ''));
  return (
    <group position={[u, 0, 0]}>
      {/* Dock interior seen through the opening. */}
      <mesh position={[0, DOCK_H + openH / 2, -0.3 - 2.5]} material={mat('#56627e', { side: THREE.BackSide, roughness: 1 })}>
        <boxGeometry args={[DOOR_W, openH, 5]} />
      </mesh>
      {stocked && (
        <>
          <CartonPallet position={[-0.75, DOCK_H, -2.4]} />
          <CartonPallet position={[0.7, DOCK_H, -3.6]} layers={3} />
        </>
      )}
      {/* Roller door, partly raised. */}
      <RBox size={[DOOR_W, 1.0, 0.1]} position={[0, DOOR_TOP - 0.5, -0.2]} color="#d7dce8" radius={0.03} />
      {/* Frame, seals, bumpers. */}
      <Box size={[0.24, openH + 0.24, 0.3]} position={[-DOOR_W / 2 - 0.12, DOCK_H + openH / 2, 0.1]} material={frame} />
      <Box size={[0.24, openH + 0.24, 0.3]} position={[DOOR_W / 2 + 0.12, DOCK_H + openH / 2, 0.1]} material={frame} />
      <Box size={[DOOR_W + 0.48, 0.26, 0.3]} position={[0, DOOR_TOP + 0.12, 0.1]} material={frame} />
      <RBox size={[0.34, openH + 0.2, 0.45]} position={[-DOOR_W / 2 - 0.42, DOCK_H + openH / 2, 0.22]} material={seal} radius={0.08} />
      <RBox size={[0.34, openH + 0.2, 0.45]} position={[DOOR_W / 2 + 0.42, DOCK_H + openH / 2, 0.22]} material={seal} radius={0.08} />
      <RBox size={[DOOR_W + 1.2, 0.42, 0.45]} position={[0, DOOR_TOP + 0.45, 0.22]} material={seal} radius={0.08} />
      <RBox size={[0.32, 0.5, 0.32]} position={[-1.3, 0.85, 0.32]} color={palette.tire} radius={0.05} />
      <RBox size={[0.32, 0.5, 0.32]} position={[1.3, 0.85, 0.32]} color={palette.tire} radius={0.05} />
      <Box size={[DOOR_W, 0.06, 0.5]} position={[0, DOCK_H - 0.03, 0.2]} color="#9aa3b8" />
      <mesh position={[0, 6.35, 0.03]}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshStandardMaterial map={numTex} roughness={0.6} />
      </mesh>
    </group>
  );
}

function RoofUnit({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RBox size={[2.2, 0.9, 1.5]} position={[0, 0.45, 0]} color="#f3f5f9" radius={0.1} />
      <Cyl r={0.42} h={0.04} position={[-0.5, 0.92, 0]} color="#3a4256" />
      <Cyl r={0.42} h={0.04} position={[0.5, 0.92, 0]} color="#3a4256" />
    </group>
  );
}

export function Warehouse({ b }: { b: Building }) {
  const { x: X, y: Y, w: L, h: D } = b.rect;
  const H = b.height;
  const rise = 1.2;
  const pitch = Math.atan2(rise, D / 2);
  const docks = b.docks ?? [];

  const { south, north, gable, wallMat, roofMat } = useMemo(() => {
    const holes = docks.map((d) => [d.x - X - DOOR_W / 2, DOCK_H, DOOR_W, DOOR_TOP - DOCK_H] as [number, number, number, number]);
    return {
      south: wallGeometry([[0, 0], [L, 0], [L, H], [0, H]], holes, 0.3),
      north: wallGeometry([[0, 0], [L, 0], [L, H], [0, H]], [], 0.3),
      gable: wallGeometry([[0, 0], [D, 0], [D, H], [D / 2, H + rise], [0, H]], [], 0.3),
      wallMat: wallMaterial(),
      roofMat: roofMaterial(L),
    };
  }, [docks, X, L, D, H]);

  const signTex = signTexture(b.name, b.subtitle ?? '');
  const trim = mat(palette.blue, { roughness: 0.5 });
  const slabDepth = D / 2 / Math.cos(pitch) + 0.7;

  return (
    <group position={yardToWorld(X, Y)}>
      <mesh geometry={south} material={wallMat} castShadow receiveShadow />
      <mesh geometry={north} material={wallMat} position={[L, 0, -D]} rotation={[0, Math.PI, 0]} castShadow receiveShadow />
      <mesh geometry={gable} material={wallMat} position={[0, 0, -D]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow />
      <mesh geometry={gable} material={wallMat} position={[L, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow />

      {/* Roof. */}
      <group position={[L / 2, H + rise / 2 + 0.05, -D / 4]} rotation={[pitch, 0, 0]}>
        <mesh material={roofMat} castShadow receiveShadow>
          <boxGeometry args={[L + 1, 0.22, slabDepth]} />
        </mesh>
        {[-0.3, 0.3].map((k) => (
          <Box key={k} size={[L * 0.8, 0.06, 1.2]} position={[0, 0.13, k * slabDepth]} material={mat('#cfe0ff', { roughness: 0.2, metalness: 0.1 })} shadow={false} />
        ))}
      </group>
      <group position={[L / 2, H + rise / 2 + 0.05, (-3 * D) / 4]} rotation={[-pitch, 0, 0]}>
        <mesh material={roofMat} castShadow receiveShadow>
          <boxGeometry args={[L + 1, 0.22, slabDepth]} />
        </mesh>
      </group>
      <Box size={[L + 1.1, 0.25, 0.9]} position={[L / 2, H + rise + 0.12, -D / 2]} color="#dfe5f0" />
      {[0.18, 0.42, 0.66].map((k) => (
        <RoofUnit key={k} position={[L * k, H + rise * 0.55, -D * 0.68]} />
      ))}

      {/* Trim: eaves, corner pilasters, dock face. */}
      <Box size={[L + 0.5, 0.6, 0.45]} position={[L / 2, H - 0.3, 0.1]} material={trim} />
      <Box size={[L + 0.5, 0.6, 0.45]} position={[L / 2, H - 0.3, -D - 0.1]} material={trim} />
      {[
        [0, 0],
        [L, 0],
        [0, -D],
        [L, -D],
      ].map(([px, pz], i) => (
        <Box key={i} size={[0.7, H, 0.7]} position={[px, H / 2, pz]} material={trim} />
      ))}
      <Box size={[L, DOCK_H, 0.36]} position={[L / 2, DOCK_H / 2, 0.06]} color="#cdd3df" />

      {docks.map((d, i) => (
        <DockDoor key={d.id} u={d.x - X} id={d.id} stocked={i % 3 !== 1} />
      ))}

      <mesh position={[L * 0.47, 8.05, 0.06]}>
        <planeGeometry args={[12.8, 2.4]} />
        <meshStandardMaterial map={signTex} roughness={0.5} />
      </mesh>

      {/* West personnel door with canopy (walkway side). */}
      <group position={[-0.05, 0, -9.5]}>
        <RBox size={[0.12, 2.3, 1.2]} position={[0, 1.15, 0]} color={palette.blue} radius={0.03} />
        <Box size={[1.2, 0.12, 2]} position={[-0.6, 2.7, 0]} color="#dfe4ee" />
      </group>
      {/* East end windows (staff area). */}
      <Box size={[0.08, 1.1, D * 0.7]} position={[L + 0.02, 6.6, -D / 2]} material={glassMat()} shadow={false} />
      <Box size={[0.08, 1.1, D * 0.7]} position={[L + 0.02, 3.4, -D / 2]} material={glassMat()} shadow={false} />
    </group>
  );
}

export function Gatehouse({ b }: { b: Building }) {
  const { x, y, w, h } = b.rect;
  return (
    <group position={yardToWorld(x + w / 2, y + h / 2)}>
      <RBox size={[w, 2.7, h]} position={[0, 1.35, 0]} color={palette.white} radius={0.12} />
      <RBox size={[w + 0.06, 1.0, h + 0.06]} position={[0, 1.75, 0]} material={glassMat()} radius={0.1} shadow={false} />
      <RBox size={[w + 1.2, 0.3, h + 1.2]} position={[0, 2.95, 0]} color={palette.blue} radius={0.1} />
      <RBox size={[0.9, 2.1, 0.08]} position={[-w / 4, 1.05, h / 2 + 0.03]} color="#c9d0de" radius={0.03} />
    </group>
  );
}

export function Office({ b }: { b: Building }) {
  const { x, y, w, h } = b.rect;
  const H = b.height;
  const floors = b.floors ?? 2;
  const floorH = H / floors;
  const signTex = signTexture(b.name, b.subtitle ?? '');
  return (
    <group position={yardToWorld(x + w / 2, y + h / 2)}>
      <RBox size={[w, H, h]} position={[0, H / 2, 0]} color={palette.white} radius={0.2} />
      {Array.from({ length: floors }, (_, i) => (
        <RBox key={i} size={[w + 0.08, floorH * 0.45, h + 0.08]} position={[0, i * floorH + floorH * 0.55, 0]} material={glassMat()} radius={0.15} shadow={false} />
      ))}
      <RBox size={[w + 0.4, 0.55, h + 0.4]} position={[0, H + 0.1, 0]} color={palette.blue} radius={0.12} />
      <RoofUnit position={[-w * 0.2, H + 0.35, -h * 0.15]} />
      {w > 12 && <RoofUnit position={[w * 0.22, H + 0.35, -h * 0.1]} />}
      {/* Entrance facing the yard (south). */}
      <RBox size={[Math.min(7, w * 0.5), 0.3, 3]} position={[0, Math.min(3.6, floorH), h / 2 + 1.4]} color={palette.blue} radius={0.08} />
      <mesh position={[0, H - floorH * 0.32, h / 2 + 0.06]}>
        <planeGeometry args={[Math.min(10.6, w * 0.8), Math.min(2, floorH * 0.5)]} />
        <meshStandardMaterial map={signTex} roughness={0.5} />
      </mesh>
    </group>
  );
}

/**
 * Raised hold space under a big canopy, no walls: a concrete platform at dock
 * height, steel columns, a translucent roof with a blue fascia, and dock
 * bumpers where trucks back up to the platform edge.
 */
export function Canopy({ b, bays }: { b: Building; bays: TruckBay[] }) {
  const { x, y, w, h } = b.rect;
  const E = b.elevation ?? 1.2;
  const H = b.height;
  const steel = mat('#5b6b8c', { roughness: 0.45, metalness: 0.4 });
  const blue = mat(palette.blue, { roughness: 0.5 });
  const cols: [number, number][] = [];
  const nx = Math.max(1, Math.round(w / 7.5));
  const ny = Math.max(1, Math.round(h / 7));
  for (let i = 0; i <= nx; i++) for (const j of [0, ny]) cols.push([-w / 2 + 0.4 + (i * (w - 0.8)) / nx, -h / 2 + 0.4 + (j * (h - 0.8)) / ny]);
  for (let j = 1; j < ny; j++) for (const i of [0, nx]) cols.push([-w / 2 + 0.4 + (i * (w - 0.8)) / nx, -h / 2 + 0.4 + (j * (h - 0.8)) / ny]);
  // Bays whose back edge touches this platform's south face get bumpers.
  const docks = bays.filter((bay) => {
    const rearY = bay.center[1] - (Math.sin(bay.heading) * bay.length) / 2;
    return Math.abs(rearY - y) < 0.5 && bay.center[0] > x && bay.center[0] < x + w;
  });
  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cfdcfb', transparent: true, opacity: 0.38, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide }), []);
  return (
    <group position={yardToWorld(x + w / 2, y + h / 2)}>
      {/* Platform */}
      <Box size={[w, E, h]} position={[0, E / 2, 0]} color="#d5dbe6" />
      <Box size={[w + 0.02, 0.12, 0.3]} position={[0, E - 0.06, h / 2 - 0.15]} color={palette.yellow} shadow={false} />
      <Box size={[w + 0.04, 0.35, 0.06]} position={[0, E - 0.18, h / 2 + 0.01]} color="#3a4256" shadow={false} />
      {docks.map((bay) => (
        <group key={bay.id} position={[bay.center[0] - (x + w / 2), 0, h / 2]}>
          {[-1.25, 1.25].map((dx) => (
            <RBox key={dx} size={[0.3, 0.5, 0.25]} position={[dx, E - 0.45, 0.12]} color={palette.tire} radius={0.05} />
          ))}
          <Box size={[2.2, 0.05, 0.6]} position={[0, E + 0.02, -0.3]} color="#9aa3b8" shadow={false} />
        </group>
      ))}
      {/* Columns */}
      {cols.map(([cx, cz], i) => (
        <Box key={i} size={[0.3, H - E, 0.3]} position={[cx, E + (H - E) / 2, cz]} material={steel} />
      ))}
      {/* Roof: beams, translucent panels, fascia */}
      {Array.from({ length: nx + 1 }, (_, i) => (
        <Box key={i} size={[0.25, 0.4, h]} position={[-w / 2 + 0.4 + (i * (w - 0.8)) / nx, H - 0.2, 0]} material={steel} />
      ))}
      <mesh position={[0, H + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={roofMat}>
        <planeGeometry args={[w + 0.6, h + 0.6]} />
      </mesh>
      <Box size={[w + 0.8, 0.5, 0.3]} position={[0, H, h / 2 + 0.3]} material={blue} />
      <Box size={[w + 0.8, 0.5, 0.3]} position={[0, H, -h / 2 - 0.3]} material={blue} />
      <Box size={[0.3, 0.5, h + 0.6]} position={[w / 2 + 0.3, H, 0]} material={blue} />
      <Box size={[0.3, 0.5, h + 0.6]} position={[-w / 2 - 0.3, H, 0]} material={blue} />
    </group>
  );
}

/** Forklift ramp: a sloped concrete wedge from the ground to the platform. */
export function RampMesh({ ramp }: { ramp: Ramp }) {
  const r = ramp.rect;
  const geo = useMemo(() => {
    // Profile in the climb direction (north): length r.h, rise ramp.rise; extruded across r.w.
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(r.h, 0), new THREE.Vector2(r.h, ramp.rise)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: r.w, bevelEnabled: false });
    // shape x → yard north (world −z), shape y → up, extrude → east (world +x).
    g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
    return g;
  }, [r.h, r.w, ramp.rise]);
  return (
    <group position={yardToWorld(r.x, r.y)}>
      <mesh geometry={geo} material={mat('#cdd4e0', { roughness: 0.9 })} castShadow receiveShadow />
      {[0.15, r.w - 0.15].map((dx) => (
        <mesh key={dx} position={[dx, ramp.rise / 2 + 0.06, -r.h / 2]} rotation={[Math.atan2(ramp.rise, r.h), 0, 0]} castShadow>
          <boxGeometry args={[0.18, 0.12, Math.hypot(r.h, ramp.rise)]} />
          <meshStandardMaterial color={palette.yellow} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

export function Buildings({ yard }: { yard: YardConfig }) {
  return (
    <group>
      {yard.buildings.map((b) => (
        <Merge key={b.id}>
          {b.kind === 'warehouse' ? (
            <Warehouse b={b} />
          ) : b.kind === 'gatehouse' ? (
            <Gatehouse b={b} />
          ) : b.kind === 'canopy' ? (
            <Canopy b={b} bays={yard.bays} />
          ) : (
            <Office b={b} />
          )}
        </Merge>
      ))}
      {yard.ramps.map((r) => (
        <RampMesh key={r.id} ramp={r} />
      ))}
    </group>
  );
}
