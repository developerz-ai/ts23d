// Play-mode ground, the three.js half: one LOD per terrain chunk, and fitting bodies to the slope.

import { Group, LOD, Mesh, type Object3D } from 'three';
import { LODS, loadBuilt } from '../compile.ts';
import { groundY } from './height.ts';

const SWAP = [0, 75, 160];

/** One three.js LOD per chunk, each level the chunk node from that LOD's GLB. */
export async function terrainChunks(): Promise<LOD[]> {
  const scenes = await Promise.all(
    LODS.map(
      async (lod) =>
        (await loadBuilt({ target: { kind: 'terrain' }, lod, keepParts: true, animations: false }))
          .scene,
    ),
  );
  const chunks = new Map<string, LOD>();
  scenes.forEach((scene, level) => {
    const nodes: Object3D[] = [];
    scene.traverse((n) => {
      if (n.name.startsWith('chunk_')) nodes.push(n);
    });
    for (const node of nodes) {
      let lod = chunks.get(node.name);
      if (!lod) {
        lod = new LOD();
        // Authoring (x, y) → world (x, -y).
        lod.position.set(node.position.x, 0, -node.position.y);
        chunks.set(node.name, lod);
      }
      node.position.set(0, 0, 0);
      const upright = new Group();
      upright.rotation.x = -Math.PI / 2;
      upright.add(node);
      node.traverse((m) => {
        if (m instanceof Mesh) m.receiveShadow = true;
      });
      lod.addLevel(upright, SWAP[level] ?? 0);
    }
  });
  return [...chunks.values()];
}

export interface Fit {
  readonly y: number;
  readonly pitch: number;
  readonly roll: number;
}

/** Height, pitch and roll for a body of length × width at (X, Z) facing `heading`, from 4 samples. */
export function fitToGround(
  X: number,
  Z: number,
  heading: number,
  length: number,
  width: number,
): Fit {
  const fx = Math.cos(heading);
  const fz = -Math.sin(heading);
  const lx = -Math.sin(heading);
  const lz = -Math.cos(heading);
  const L = length / 2;
  const W = width / 2;
  const hF = groundY(X + fx * L, Z + fz * L);
  const hB = groundY(X - fx * L, Z - fz * L);
  const hL = groundY(X + lx * W, Z + lz * W);
  const hR = groundY(X - lx * W, Z - lz * W);
  return {
    y: Math.max((hF + hB + hL + hR) / 4, groundY(X, Z)),
    pitch: Math.atan2(hF - hB, length),
    roll: Math.atan2(hL - hR, width),
  };
}
