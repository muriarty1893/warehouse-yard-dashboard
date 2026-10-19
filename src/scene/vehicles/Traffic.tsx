import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { roadLength, traffic, type TrafficSpec } from '../../config/fleet';
import { road } from '../../config/devYard';
import { clock } from '../../sim/clock';
import { glassMat, mat, RBox, Wheel, yardToWorld } from '../kit';
import { Merge } from '../Merge';
import { Truck } from './Truck';

function Car({ color }: { color: string }) {
  return (
    <group>
      <RBox size={[4.3, 0.7, 1.85]} position={[0, 0.62, 0]} material={mat(color, { roughness: 0.35, metalness: 0.1 })} radius={0.25} />
      <RBox size={[2.3, 0.62, 1.66]} position={[-0.25, 1.22, 0]} material={glassMat()} radius={0.22} />
      <RBox size={[1.9, 0.1, 1.6]} position={[-0.3, 1.55, 0]} material={mat(color, { roughness: 0.35, metalness: 0.1 })} radius={0.05} />
      {[1.35, -1.35].map((x) => [0.82, -0.82].map((z) => <Wheel key={`${x}${z}`} r={0.33} w={0.24} position={[x, 0.33, z]} />))}
    </group>
  );
}

/** Through-traffic on the public road: constant speed, wraps around. */
function RoadVehicle({ spec, index }: { spec: TrafficSpec; index: number }) {
  const ref = useRef<THREE.Group>(null);
  const east = spec.lane === 'eastbound';
  const y = east ? road.eastbound : road.westbound;
  useFrame(() => {
    if (!ref.current) return;
    const d = (((spec.start + spec.speed * clock.t) % roadLength) + roadLength) % roadLength;
    const x = east ? road.x0 + d : road.x1 - d;
    ref.current.position.set(...yardToWorld(x, y));
  });
  return (
    <group ref={ref} rotation={[0, east ? 0 : Math.PI, 0]}>
      {spec.kind === 'car' ? (
        <Merge>
          <Car color={spec.color} />
        </Merge>
      ) : (
        <Truck interactive={false} spec={{ id: `ROAD-${index}`, kind: spec.kind, carrier: spec.carrier ?? 'nordline', plate: '', driver: '', capacity: 0, status: 'Passing by', pose: { x: 0, y: 0, heading: 0 } }} />
      )}
    </group>
  );
}

export function Traffic() {
  return (
    <group>
      {traffic.map((t, i) => (
        <RoadVehicle key={i} spec={t} index={i} />
      ))}
    </group>
  );
}
