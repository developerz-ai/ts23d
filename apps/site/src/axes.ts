// GLB roots follow glTF: authoring +X (front) → +Z, +Y (left) → +X, +Z (up) → +Y. Play code works
// in a frame where the front is +X and the left is −Z (heading 0 drives along +X). One wrapper
// turns a loaded root into that frame, so vehicles, props and terrain all agree.

import { Group, type Object3D } from 'three';

/** Wrap `o` so its authoring front faces three.js +X: authoring (x, y, z) → world (x, z, −y). */
export function frontToX(o: Object3D): Group {
  const g = new Group();
  g.name = `${o.name || 'asset'}_frame`;
  g.rotation.y = Math.PI / 2;
  g.add(o);
  return g;
}

/** Authoring-space footprint (Z-up) of a box measured on an unwrapped GLB root (glTF frame). */
export const authoringFromGltf = (x: number, _y: number, z: number): [number, number] => [z, x];
