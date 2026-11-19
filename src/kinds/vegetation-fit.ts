// The fit that puts a finished tree onto its real numbers at every LOD: crown spread across X and
// Y, height from the ground (the trunk's base, z = 0) to the top, DBH across the trunk's Y extent.
// Plus the two ground rules for foliage: cards that would hang into the soil are shortened about
// their root, and a blob impostor's underside is flattened just above the ground.

import { boundsOf, type Mesh, type Vec3 } from '../core/index.ts';
import { axisAt } from './vegetation-mesh.ts';
import type { Stem } from './vegetation-skeleton.ts';

/** Foliage stays this far above the trunk's base, metres (no card or blob face in the soil). */
const GROUND_CLEARANCE = 0.05;

/** Horizontal offsets from the trunk axis times `f`: the LOD2 impostor trunk's radius scale. */
export function widen(m: Mesh, trunk: Stem, f: number): Mesh {
  const positions = new Float32Array(m.positions);
  for (let i = 0; i < positions.length; i += 3) {
    const c = axisAt(trunk, positions[i + 2] ?? 0);
    positions[i] = c[0] + ((positions[i] ?? 0) - c[0]) * f;
    positions[i + 1] = c[1] + ((positions[i + 1] ?? 0) - c[1]) * f;
  }
  return { ...m, positions, colors: new Float32Array(m.colors) };
}

/**
 * Cards of `perCard` vertices each (the first is the card's root on the bark): one that reaches
 * below the ground is scaled about its root until its lowest point clears it. Planar stays planar.
 */
export function liftCards(m: Mesh, perCard: number, groundZ: number): Mesh {
  const floor = groundZ + GROUND_CLEARANCE;
  const positions = new Float32Array(m.positions);
  for (let v = 0; v + perCard <= positions.length / 3; v += perCard) {
    const root: Vec3 = [
      positions[v * 3] ?? 0,
      positions[v * 3 + 1] ?? 0,
      positions[v * 3 + 2] ?? 0,
    ];
    let low = root[2];
    for (let j = 0; j < perCard; j++) low = Math.min(low, positions[(v + j) * 3 + 2] ?? low);
    if (low >= floor || root[2] <= floor) continue;
    const f = (root[2] - floor) / (root[2] - low);
    for (let j = 0; j < perCard; j++)
      for (let k = 0; k < 3; k++) {
        const i = (v + j) * 3 + k;
        positions[i] = (root[k] ?? 0) + ((positions[i] ?? 0) - (root[k] ?? 0)) * f;
      }
  }
  return { ...m, positions };
}

/** No vertex below the ground clearance: the blob impostor's underside flattens above the soil. */
export function clampToGround(m: Mesh, groundZ: number): Mesh {
  const floor = groundZ + GROUND_CLEARANCE;
  const positions = new Float32Array(m.positions);
  for (let i = 2; i < positions.length; i += 3) positions[i] = Math.max(positions[i] ?? 0, floor);
  return { ...m, positions };
}

/** x·sx, y·sy, (z − z0)·sz; normals by the inverse transpose, renormalised. */
export function fitMesh(m: Mesh, s: Vec3, z0: number): Mesh {
  const positions = new Float32Array(m.positions.length);
  const normals = new Float32Array(m.normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (m.positions[i] ?? 0) * s[0];
    positions[i + 1] = (m.positions[i + 1] ?? 0) * s[1];
    positions[i + 2] = ((m.positions[i + 2] ?? 0) - z0) * s[2];
    const nx = (m.normals[i] ?? 0) / s[0];
    const ny = (m.normals[i + 1] ?? 0) / s[1];
    const nz = (m.normals[i + 2] ?? 0) / s[2];
    const l = Math.hypot(nx, ny, nz) || 1;
    normals[i] = nx / l;
    normals[i + 1] = ny / l;
    normals[i + 2] = nz / l;
  }
  return { ...m, positions, normals };
}

export interface TreeFit {
  readonly trunk: Mesh;
  readonly roots: Mesh | null;
  /** Skeleton space → asset space, for meshes and for points (the crown pivot). */
  readonly mesh: (m: Mesh) => Mesh;
  readonly point: (p: Vec3) => Vec3;
}

/**
 * Fits trunk + crown onto `spread` × `spread` × `height`. The trunk (and the root flare hugging
 * it) is rebuilt with the radius scale that makes its Y extent exactly `dbh` after the fit, the
 * trunk's lowest point lands on z = 0, and the height runs from there to the top of the wood and
 * leaves (the buried root flare is below the ground and does not count).
 */
export function fitTree(o: {
  readonly trunk: (radiusScale: number) => Mesh;
  readonly roots: ((radiusScale: number) => Mesh) | null;
  readonly crown: readonly Mesh[];
  readonly spread: number;
  readonly height: number;
  readonly dbh: number;
}): TreeFit {
  const rough = o.trunk(1);
  const all = [rough, ...o.crown, ...(o.roots ? [o.roots(1)] : [])]
    .filter((m) => m.indices.length > 0)
    .map(boundsOf);
  const span = (k: 0 | 1 | 2): number =>
    Math.max(1e-6, Math.max(...all.map((b) => b.max[k])) - Math.min(...all.map((b) => b.min[k])));
  const sx = o.spread / span(0);
  const sy = o.spread / span(1);
  const tb = boundsOf(rough);
  const radiusScale = o.dbh / (Math.max(1e-6, tb.max[1] - tb.min[1]) * sy);
  const trunk = o.trunk(radiusScale);
  const z0 = boundsOf(trunk).min[2];
  const top = Math.max(
    boundsOf(trunk).max[2],
    ...o.crown.filter((m) => m.indices.length > 0).map((m) => boundsOf(m).max[2]),
  );
  const s: Vec3 = [sx, sy, o.height / Math.max(1e-6, top - z0)];
  return {
    trunk: fitMesh(trunk, s, z0),
    roots: o.roots ? fitMesh(o.roots(radiusScale), s, z0) : null,
    mesh: (m) => fitMesh(m, s, z0),
    point: (p) => [p[0] * s[0], p[1] * s[1], (p[2] - z0) * s[2]],
  };
}
