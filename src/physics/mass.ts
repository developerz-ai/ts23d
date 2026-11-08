// Mass properties of a compiled asset in its own frame (metres, Z up): per shell, volume ×
// density of its strip (or area × wall thickness for hollow `shell` parts), summed into mass,
// centre of mass and the inertia tensor, then diagonalised for KHR_physics_rigid_bodies.
// Solid parts integrate the UNION of their shells (solid.ts), so overlapping merged pieces count
// once; open shells borrow their convex hull only where a ray falls through a hole, and are counted.

import type { CompiledAsset, Mesh, Part, Quat, Vec3 } from '../core/index.ts';
import { worldMesh, worldTransforms } from '../core/index.ts';
import { densityOf, triangleStrip } from './density.ts';
import { eigenSym, type Mat3, quatFromAxes } from './linalg.ts';
import {
  accumulate,
  addSheet,
  addTetra,
  emptyMoments,
  inertiaAboutCom,
  type Moments,
} from './moments.ts';
import { type Shell, shellsOf } from './shells.ts';
import { solidMass, triangle } from './solid.ts';

type AssetPhysics = NonNullable<CompiledAsset['physics']>;

export interface PartMass {
  readonly name: string;
  readonly mass: number;
  /** Solid volume counted (m³; hollow shells count area × thickness). */
  readonly volume: number;
  /** Estimated ± error of `volume` (m³) where overlapping/open shells were ray-integrated; 0 exact. */
  readonly volumeError: number;
  /** The strip carrying most of the part's area (its physics material). */
  readonly strip: string;
  readonly openShells: number;
  readonly invertedShells: number;
}

export interface MassProperties {
  /** kg (the recipe's `physics.mass` when set). */
  readonly mass: number;
  /** Mass from volume × density, before any override. */
  readonly computedMass: number;
  readonly centerOfMass: Vec3;
  /** Inertia tensor about the centre of mass, kg·m², asset frame. */
  readonly inertia: Mat3;
  /** Principal moments (descending) and the rotation from the asset frame to their axes. */
  readonly inertiaDiagonal: Vec3;
  readonly inertiaOrientation: Quat;
  readonly parts: readonly PartMass[];
  readonly openShells: number;
  /** Σ of the parts' `volumeError` (m³): how far the union integration may be off. */
  readonly volumeError: number;
}

function dominantStrip(m: Mesh, tris: readonly number[]): string {
  const area = new Map<string, number>();
  for (const t of tris) {
    const s = triangleStrip(m.uvs, m.indices, t);
    const tmp = emptyMoments();
    const a = addSheet(tmp, ...triangle(m, t), 1);
    area.set(s, (area.get(s) ?? 0) + a);
  }
  let best = 'plain';
  let most = -1;
  for (const [s, a] of [...area].sort(([x], [y]) => (x < y ? -1 : 1)))
    if (a > most) [best, most] = [s, a];
  return best;
}

/** Hollow shell: area × wall, capped at the solid it encloses when closed. */
function hollowMass(m: Mesh, s: Shell, rho: number, wall: number) {
  const solid = emptyMoments();
  const sheet = emptyMoments();
  let vol = 0;
  let area = 0;
  for (const t of s.triangles) {
    const [a, b, c] = triangle(m, t);
    vol += addTetra(solid, a, b, c, rho);
    area += addSheet(sheet, a, b, c, rho * wall);
  }
  const inverted = s.closed && vol < 0;
  if (!s.closed || area * wall < Math.abs(vol))
    return { moments: sheet, volume: area * wall, inverted };
  const out = emptyMoments();
  accumulate(out, solid, inverted ? -1 : 1);
  return { moments: out, volume: Math.abs(vol), inverted };
}

function partMass(part: Part, mesh: Mesh, phys: AssetPhysics | undefined, into: Moments): PartMass {
  const wall = part.shell ?? phys?.shell;
  const shells = shellsOf(mesh);
  const rhos = shells.map(
    (s) => part.density ?? densityOf(dominantStrip(mesh, s.triangles), phys?.density),
  );
  const own = emptyMoments();
  let volume = 0;
  let volumeError = 0;
  let openShells = 0;
  let invertedShells = 0;
  if (wall === undefined) {
    const r = solidMass(mesh, shells, rhos);
    accumulate(own, r.moments);
    [volume, volumeError, openShells, invertedShells] = [r.volume, r.error, r.open, r.inverted];
  } else
    shells.forEach((s, i) => {
      const r = hollowMass(mesh, s, rhos[i] ?? 0, wall);
      accumulate(own, r.moments);
      volume += r.volume;
      if (!s.closed) openShells++;
      if (r.inverted) invertedShells++;
    });
  accumulate(into, own);
  const all = shells.flatMap((s) => s.triangles);
  return {
    name: part.name,
    mass: own.mass,
    volume,
    volumeError,
    strip: dominantStrip(mesh, all),
    openShells,
    invertedShells,
  };
}

/** Mass, centre of mass and inertia of `asset` (pass the LOD0 compile: it is the real shape). */
export function massProperties(asset: CompiledAsset, phys = asset.physics): MassProperties {
  const world = worldTransforms(asset.parts);
  const total = emptyMoments();
  const parts: PartMass[] = [];
  for (const p of asset.parts) {
    const t = world.get(p.name);
    if (!p.mesh || !t || p.mesh.indices.length === 0) continue;
    parts.push(partMass(p, worldMesh(p.mesh, t), phys, total));
  }
  const computedMass = total.mass;
  if (phys?.mass !== undefined && computedMass > 0) {
    const k = phys.mass / computedMass;
    const scaled = emptyMoments();
    accumulate(scaled, total, k);
    Object.assign(total, scaled);
  }
  const { com, inertia } = inertiaAboutCom(total);
  const eig = eigenSym(inertia);
  return {
    mass: total.mass,
    computedMass,
    centerOfMass: com,
    inertia,
    inertiaDiagonal: eig.values,
    inertiaOrientation: quatFromAxes(...eig.axes),
    parts,
    openShells: parts.reduce((n, p) => n + p.openShells, 0),
    volumeError: parts.reduce((n, p) => n + p.volumeError, 0),
  };
}
