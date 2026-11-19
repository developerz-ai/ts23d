// Warden Hall surfaces that carry the story at RTS-hero distance: the hall floor as laid
// flagstones (each its own tone, scorched, ash-drifted or mud-trodden where the stage says), the
// team chevron painted onto those flags (worn: every flag's piece its own shade, some flaked off),
// and stain decals on wall faces (rain streaks under the sills, fading down the wall). All colour
// is decided here per flag or per vertex, so it reads in the sheet's flat colour and in the hero.

import {
  applyAffine,
  box,
  frame,
  hex,
  type Lod,
  type Mesh,
  merge,
  prism,
  type Rng,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import { teamShade } from '../_lib/rts/style.ts';
import { HALF_X, HALF_Y, PLINTH, PLINTH_OUT } from './plan.ts';

/** Warm grey sandstone flags, a step lighter than the slate plinth rim. */
export const FLAG: Vec3 = hex('#857c6c');
/** Flag thickness above the plinth top. */
export const FLAG_T = 0.03;
/** Top of the floor (where loose things now rest). */
export const FLOOR = PLINTH + FLAG_T;

/** A stain on the floor: plan centre, radius, the colour it pulls toward and how far (0..1). */
export interface Stain {
  readonly at: readonly [number, number];
  readonly radius: number;
  readonly color: Vec3;
  readonly k: number;
}

/** Soot black, wood ash grey, trodden mud, lime mortar splash. */
export const STAIN = {
  scorch: hex('#1e1b18'),
  ash: hex('#9a948a'),
  mud: hex('#4a3f31'),
  mortar: hex('#c9c4b6'),
} as const;

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** The stains' pull at plan point (x, y), applied in order (soft-edged discs). */
function stained(c: Vec3, x: number, y: number, stains: readonly Stain[]): Vec3 {
  let out = c;
  for (const s of stains) {
    const d = Math.hypot(x - s.at[0], y - s.at[1]) / s.radius;
    if (d < 1) out = mix(out, s.color, s.k * Math.min(1, (1 - d * d) * 1.4));
  }
  return out;
}

/** Recolour a mesh per vertex: `f(colour, x, y)`. */
function recolour(m: Mesh, f: (c: Vec3, x: number, y: number) => Vec3): Mesh {
  const colors = new Float32Array(m.colors.length);
  for (let i = 0; i < colors.length; i += 3) {
    const c: Vec3 = [m.colors[i] ?? 0, m.colors[i + 1] ?? 0, m.colors[i + 2] ?? 0];
    colors.set(f(c, m.positions[i] ?? 0, m.positions[i + 1] ?? 0), i);
  }
  return { ...m, colors };
}

/** One floor cell: plan rect x0..x1 × y0..y1. */
interface Cell {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/** The flag layout: rows across X, each row's flags of random length along Y (broken joints). */
function layout(lod: Lod, rng: Rng): Cell[] {
  const X = HALF_X + PLINTH_OUT - 0.25;
  const Y = HALF_Y + PLINTH_OUT - 0.25;
  const row = lod === 0 ? 1.05 : lod === 1 ? 2.1 : (2 * X) / 3;
  const len = lod === 0 ? [0.8, 1.5] : lod === 1 ? [1.8, 3.2] : [(2 * Y) / 3, (2 * Y) / 3];
  const out: Cell[] = [];
  for (let x0 = -X; x0 < X - 1e-6; x0 += row) {
    const x1 = Math.min(X, x0 + row);
    let y0 = -Y;
    while (y0 < Y - 1e-6) {
      let y1 = Math.min(Y, y0 + rng.range(len[0] ?? 1, len[1] ?? 1));
      if (Y - y1 < (len[0] ?? 1) * 0.5) y1 = Y;
      out.push({ x0, x1, y0, y1 });
      y0 = y1;
    }
  }
  return out;
}

/**
 * The flagstone floor over the plinth top: LOD0 ~1 m flags with 4 cm joints (the darker slate
 * shows through), each flag its own tone; LOD1 2 m slabs; LOD2 a 3 × 3 field of tones, tops only.
 * `stains` scorch, ash or muddy them per vertex. Returns the layout too, for the painted emblem.
 */
export function floor(
  lod: Lod,
  rng: Rng,
  stains: readonly Stain[],
): { mesh: Mesh; cells: readonly Cell[] } {
  const cells = layout(lod, rng);
  const joint = lod === 2 ? 0 : 0.04;
  const flags = cells.map((c) => {
    const k = rng.range(0.82, 1.1);
    const warm = rng.range(-0.05, 0.05);
    const tone: Vec3 = [FLAG[0] * k * (1 + warm), FLAG[1] * k, FLAG[2] * k * (1 - warm)];
    return box({
      size: [c.x1 - c.x0 - joint, c.y1 - c.y0 - joint, FLAG_T],
      at: [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, PLINTH],
      color: tone,
      strip: 'concrete',
      omit: lod === 2 ? ['bottom', 'front', 'back', 'left', 'right'] : ['bottom'],
    });
  });
  // The far floor's few vertices would spread one stain over a whole third: half strength there.
  const far = lod === 2 ? stains.map((st) => ({ ...st, k: st.k * 0.5 })) : stains;
  return { mesh: recolour(merge(flags), (c, x, y) => stained(c, x, y, far)), cells };
}

/** Clip a convex polygon to an axis-aligned rect (Sutherland–Hodgman). */
function clip(poly: readonly Vec2[], c: Cell): Vec2[] {
  let out: Vec2[] = [...poly];
  const edges: [0 | 1, number, 1 | -1][] = [
    [0, c.x0, 1],
    [0, c.x1, -1],
    [1, c.y0, 1],
    [1, c.y1, -1],
  ];
  for (const [axis, v, s] of edges) {
    const inn = (p: Vec2): boolean => (p[axis] - v) * s >= 0;
    const next: Vec2[] = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i] ?? [0, 0];
      const b = out[(i + 1) % out.length] ?? a;
      if (inn(a)) next.push(a);
      if (inn(a) !== inn(b)) {
        const t = (v - a[axis]) / (b[axis] - a[axis]);
        next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    out = next;
    if (out.length < 3) return [];
  }
  return out;
}

/** Drop consecutive near-duplicate points (clipping leaves them on a corner). */
const dedupe = (p: readonly Vec2[]): Vec2[] =>
  p.filter((a, i) => {
    const b = p[(i + 1) % p.length] ?? a;
    return Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-4;
  });

const area = (p: readonly Vec2[]): number =>
  Math.abs(
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length] ?? a;
      return s + a[0] * b[1] - b[0] * a[1];
    }, 0) / 2,
  );

/**
 * The team chevron painted on the flags (a V pointing +X, `len` × `span`, arms `arm` deep along X,
 * centred at plan `at`): cut flag by flag, inset from every joint, each piece its own worn shade,
 * about one in eight flaked away (LOD0). Two convex arms, so clipping stays exact.
 */
export function emblem(
  lod: Lod,
  rng: Rng,
  cells: readonly Cell[],
  at: readonly [number, number],
  size: { readonly len: number; readonly span: number; readonly arm: number },
  /** Darkening per piece at plan (x, y): soot over the paint in a ruin (1 = clean). */
  dim: (x: number, y: number) => number = () => 1,
): Mesh {
  const { len, span, arm } = size;
  const [cx, cy] = at;
  // Each arm a parallelogram (convex), the two meeting along the centreline.
  const arms: Vec2[][] = [1, -1].map((s) => [
    [cx + len / 2, cy],
    [cx - len / 2 + arm, cy + (s * span) / 2],
    [cx - len / 2, cy + (s * span) / 2],
    [cx + len / 2 - arm, cy],
  ]);
  const inset = lod === 2 ? 0 : 0.05;
  // LOD2: each arm whole (two quads' worth), not cut by the far floor's three-by-three field.
  const cut: readonly Cell[] = lod === 2 ? [{ x0: -99, x1: 99, y0: -99, y1: 99 }] : cells;
  const out: Mesh[] = [];
  for (const poly of arms)
    for (const c of cut) {
      const piece = dedupe(
        clip(poly, {
          x0: c.x0 + inset,
          x1: c.x1 - inset,
          y0: c.y0 + inset,
          y1: c.y1 - inset,
        }),
      );
      if (piece.length < 3 || area(piece) < 0.02) continue;
      if (lod === 0 && rng.next() < 0.12) continue;
      const mx = piece.reduce((s, p) => s + p[0], 0) / piece.length;
      const my = piece.reduce((s, p) => s + p[1], 0) / piece.length;
      const k = (lod === 2 ? 1 : rng.range(0.6, 0.92)) * dim(mx, my);
      out.push(
        prism({
          profile: piece,
          depth: 0.006,
          plane: 'xy',
          centred: false,
          color: teamShade(Math.max(0.3, k)),
          strip: 'concrete',
        }),
      );
    }
  return applyAffine(merge(out), frame([1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, FLOOR - 0.002]));
}

/**
 * A rain streak down a wall face from `top` (plan point on the face, z), `w0` wide there and `w1`
 * at its foot `len` below: a 4 mm decal, dark at the top and fading to the stone tone `to`.
 * `along` runs with the wall, `out` is the face's outward normal.
 */
export function streak(
  top: Vec3,
  along: Vec3,
  out: Vec3,
  o: {
    readonly w0: number;
    readonly w1: number;
    readonly len: number;
    readonly from: Vec3;
    readonly to: Vec3;
  },
): Mesh {
  const profile: Vec2[] = [
    [-o.w0 / 2, 0],
    [-o.w1 / 2, -o.len],
    [0, -o.len * 1.08],
    [o.w1 / 2, -o.len],
    [o.w0 / 2, 0],
  ];
  const slab = prism({ profile, depth: 0.004, plane: 'xz', color: o.from, strip: 'concrete' });
  const shaded = recolourZ(slab, (z) => mix(o.from, o.to, Math.min(1, -z / o.len) ** 0.8));
  // Local x along the wall, local y out of it, z up: keep the frame right-handed.
  const up: Vec3 = [0, 0, 1];
  const c: Vec3 = [
    along[1] * out[2] - along[2] * out[1],
    along[2] * out[0] - along[0] * out[2],
    along[0] * out[1] - along[1] * out[0],
  ];
  const x: Vec3 = c[2] * up[2] >= 0 ? along : [-along[0], -along[1], -along[2]];
  const at: Vec3 = [top[0] + out[0] * 0.003, top[1] + out[1] * 0.003, top[2]];
  return applyAffine(shaded, frame(x, out, up, at));
}

function recolourZ(m: Mesh, f: (z: number) => Vec3): Mesh {
  const colors = new Float32Array(m.colors.length);
  for (let i = 0; i < colors.length; i += 3) colors.set(f(m.positions[i + 2] ?? 0), i);
  return { ...m, colors };
}
