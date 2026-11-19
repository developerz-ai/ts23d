// A creature's sculpt cells per LOD (× the author's `cells` multipliers), and its hero-tier LOD0 (ADR 012, `budget.heroTextures`):
// lighter geometry — body and head meshed at coarser cells without the meshed relief; the LOD0
// strand cards stay (LOD1's wide cards read as solid chips up close) — while the fine field (the
// LOD0 sculpt, its LOD0 relief and a finer octave) is tagged onto each sculpted part's mesh, in
// that part's own coordinates, for the hero bake (finish/hero.ts) to carry into normal, AO and
// height maps.

import { affine, type Lod, type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import { type BakeSource, withBakeSource } from '../passes/index.ts';
import type { Field } from '../primitives/index.ts';
import type { Bones } from './creature-bones.ts';
import type { Piece, Relief } from './creature-mesh.ts';
import type { Surface } from './creature-spec.ts';
import { relief } from './creature-surface.ts';

/** Cell growth per LOD: legged bodies (legs become tubes at LOD2) and legless ones. */
const LOD_SCALE = [1, 2.2, 6.5] as const;
const LOD_SCALE_LEGLESS = [1, 2, 3.5] as const;
/** Head cell ÷ head length per LOD. */
const HEAD_RES = [0.017, 0.033, 0.11] as const;

/** Cell growth of the hero LOD0 over plain LOD0 (triangles fall ≈ with the square). */
export const HERO_CELL = { body: 3, head: 2.2, eye: 1.5 } as const;

/** Body sculpt cell at LOD0, metres. */
export function bodyRes(b: Bones): number {
  return Math.max(0.0025, b.limbR > 0 ? b.limbR * 0.165 : b.height * 0.06);
}

export interface CreatureCells {
  /** Body cell of the plain LOD (the relief's scale), the meshed body cell, the head cell. */
  readonly res0: number;
  readonly res: number;
  readonly hres: number;
}

/** A cell multiplier: one number for every LOD, or one per LOD. */
export type CreatureCellScale = number | readonly [number, number, number];

/** Sculpt cell multipliers (`CreatureOptions.cells`): > 1 = coarser cells, fewer triangles
 *  (≈ 1 ÷ k²). The default body cell follows the limb radius, which over-meshes a small animal
 *  (a 6 kg fox: ~91 k body triangles); this sets the density directly. */
export interface CreatureCellOptions {
  readonly body?: CreatureCellScale;
  readonly head?: CreatureCellScale;
}

/** Outside this a multiplier is a typo: finer than ⅓ runs the mesher out of grid, coarser than
 *  4× loses the limbs. */
const CELL_RANGE = [0.33, 4] as const;

function cellScale(v: CreatureCellScale | undefined, lod: Lod, name: string): number {
  const all = typeof v === 'number' ? [v] : (v ?? [1]);
  const bad = all.find((k) => !(Number.isFinite(k) && k >= CELL_RANGE[0] && k <= CELL_RANGE[1]));
  if (bad !== undefined)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `creature: cells.${name} is ${bad}`,
      fix: `give cells.${name} a multiplier between ${CELL_RANGE[0]} and ${CELL_RANGE[1]}, or one per LOD (1 = the default cell, 1.3 ≈ 40 % fewer triangles)`,
    });
  return all[lod] ?? all[0] ?? 1;
}

export function creatureCells(
  b: Bones,
  lod: Lod,
  hero: boolean,
  cells: CreatureCellOptions = {},
): CreatureCells {
  const res0 =
    bodyRes(b) *
    (b.legs.length > 0 ? LOD_SCALE : LOD_SCALE_LEGLESS)[lod] *
    cellScale(cells.body, lod, 'body');
  return {
    res0,
    res: res0 * (hero ? HERO_CELL.body : 1),
    hres:
      b.head.length *
      HEAD_RES[lod] *
      (hero ? HERO_CELL.head : 1) *
      cellScale(cells.head, lod, 'head'),
  };
}

/** Sculpts are near-exact distances; relief and strokes stretch them (sphere-trace bound). */
const LIPSCHITZ = 2;

/** The relieved field sculptPiece would mesh: relief only near the surface. */
export function relieved(f: Field, r: Relief | null): Field {
  if (!r) return f;
  return (p) => {
    const d = f(p);
    return Math.abs(d) > r.amp * 2.5 ? d : d - r.at(p);
  };
}

/**
 * The hero bake's body field: the LOD0 relief plus a finer octave (½ the cell, clumps ~1.2 cells)
 * that no LOD0 mesh could hold — the detail the hero tier exists to carry.
 */
export function heroField(f: Field, rel: Relief | null, surface: Surface, res0: number): Field {
  return relieved(relieved(f, rel), rel ? relief(surface, res0 * 0.5, res0 * 1.2, 11) : null);
}

/** A sculpt-frame function (field, colour) seen from a part meshed as place(place(m, { pitch }), { at }). */
export function pitched<T>(f: (p: Vec3) => T, pitch: number, at: Vec3 = [0, 0, 0]): (p: Vec3) => T {
  const m = affine({ pitch }).m;
  const q: [number, number, number] = [0, 0, 0];
  return (p) => {
    const x = p[0] - at[0];
    const y = p[1] - at[1];
    const z = p[2] - at[2];
    q[0] = m[0] * x + m[3] * y + m[6] * z;
    q[1] = m[1] * x + m[4] * y + m[7] * z;
    q[2] = m[2] * x + m[5] * y + m[8] * z;
    return f(q);
  };
}

/** A sculpted piece's field and colour seen from its pitched part; `meshed` = the piece's own
 *  mesh when extras (teeth) were merged after it, so only its triangles are baked. */
export function pitchedSource(
  pc: Piece,
  pitch: number,
  at: Vec3 = [0, 0, 0],
  meshed?: Mesh,
): Omit<BakeSource, 'lipschitz'> {
  return {
    field: pitched(pc.field, pitch, at),
    color: pitched(pc.color, pitch, at),
    ...(meshed ? { tris: meshed.indices.length / 3 } : {}),
  };
}

/** Tag a part's mesh with its field and colour when the hero tier is on (`tris`: its first
 *  triangles came from the field, merged extras after them did not); else the mesh as is. */
export const heroTag = (mesh: Mesh, on: boolean, src: Omit<BakeSource, 'lipschitz'>): Mesh =>
  on ? withBakeSource(mesh, { ...src, lipschitz: LIPSCHITZ }) : mesh;
