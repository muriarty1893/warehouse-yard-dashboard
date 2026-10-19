import type * as THREE from 'three';
import type { EntityRef } from '../state/ui';

/** Live scene objects of moving entities, so the camera can focus on / follow them. */
const objects = new Map<string, THREE.Object3D>();
const key = (ref: EntityRef) => `${ref.kind}:${ref.id}`;

export const registerEntity = (ref: EntityRef, obj: THREE.Object3D | null) => {
  if (obj) objects.set(key(ref), obj);
  else objects.delete(key(ref));
};

export const entityObject = (ref: EntityRef) => objects.get(key(ref));
