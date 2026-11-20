// Factory Zimmerit on the Tiger I (late 1943): the `zimmerit` strip (horizontal combed ridges in
// trowel-wide vertical columns, as a height field) and the coating that carries it: a 6 mm slab
// laid on each coated plate, split into columns so every trowel stroke gets its own V range and
// its own ridge phase, with flaked patches cut back to red-oxide primer by a crisp 4.5 mm step
// (marching squares over a world-space noise). LOD2 has no slab: the plate faces themselves take
// the strip (`coatFaces`), so the ridged tone carries to the far LOD. Figures: README "Zimmerit".

import {
  defineMaterial,
  dmath,
  type Mesh,
  MeshBuilder,
  type Rng,
  stripRect,
  tex,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';

/** Hull ridge pitch (photo estimate 2–3 cm; modellers' count over the pannier ≈ 1.6–1.8 cm). */
export const HULL_PITCH = 0.022;
/** Turret (Wegmann) ridges are coarser: ≈ 35 mm (22–23 ridges up an 0.8 m turret side). */
export const TURRET_PITCH = 0.034;
/** One trowel stroke wide (photo estimate 10–16 cm); one V range of the strip. */
export const COLUMN = 0.13;
/** Total coating 6 mm (Tank Museum): 2 mm base + 4 mm patterned layer. */
const COAT = 0.006;
const RELIEF = 0.004;
/** Flaked patches keep a skin of base layer/primer; the step to the coat face is crisp. */
const FLOOR = 0.0015;
/** Panel edges sink into the plate so the coating is seated, not hovering. */
const SINK = 0.003;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- the strip
// U runs up the plate (≈ 1 mm texels over a 4 m span: the ridges resolve at true pitch), V runs
// across one trowel column (COLUMN over 64 px ≈ 2 mm texels: the column seam resolves).

const ridges = tex
  .fn((xm, _ym, ctx) => {
    const n = Math.max(1, Math.round(ctx.tileU / HULL_PITCH));
    return 0.5 + 0.5 * dmath.cos((2 * Math.PI * n * xm) / ctx.tileU);
  }, 'ridges(22mm)')
  // Hand-combed: each ridge waves a few millimetres across the column.
  .warp(tex.noise({ size: 0.12, sizeV: 0.05, seed: 1 }), 0.006);
const pressure = tex.noise({ size: 0.15, sizeV: 0.3, seed: 2 }).levels(0.25, 0.75, 0.55, 1);
const edge = (lo: number, hi: number, name: string) =>
  tex.fn((_xm, ym, ctx) => smooth(lo, hi, Math.min(ym, ctx.metresV - ym)), name);
/** Where two strokes meet the ridges die into a ragged flat lip with a fine groove. */
const seam = edge(0.004, 0.016, 'seam').warp(
  tex.noise({ size: 0.03, sizeV: 0.02, seed: 3 }),
  0.006,
);
const groove = edge(0, 0.003, 'groove');
const lip = tex.noise({ size: 0.02, seed: 4 }).remap(0.45, 0.75);
const body = ridges.smoothstep(0.2, 0.85).mul(pressure).mul(0.8).add(0.1);
const zimH = seam
  .lerp(lip, body)
  .mul(groove.remap(0.3, 1))
  .add(tex.noise({ size: 0.004, sizeV: 0.006, octaves: 2, seed: 5 }).sub(0.5).mul(0.16))
  .clamp();

export const ZIMMERIT = defineMaterial({
  id: 'zimmerit',
  scaleMetres: COLUMN,
  spanMetres: 4,
  roughness: 0.88,
  graph: tex.material({
    height: zimH,
    depth: RELIEF,
    // Near-white paste: the vertex colour is the paint sprayed over it (three-tone camo).
    albedo: zimH.remap(0.7, 0.94),
    roughness: zimH.remap(0.94, 0.8),
  }),
  description:
    'Factory Zimmerit (Tiger I, late 1943): horizontal combed ridges ≈ 22 mm pitch, 4 mm relief, in 13 cm trowel columns; vertex colour is the paint.',
  sources: [
    'https://tankmuseum.org/article/zimmerit (6 mm total: 2 mm + 4 mm)',
    'https://panzerworld.com/zimmerit (Tiger Ausf. E: vertical columns of horizontal ridges)',
    'https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_101I-299-1802-08,_Nordfrankreich,_Michael_Wittmann_auf_Panzer_VI_(Tiger_I).jpg',
  ],
});

// ---------------------------------------------------------------- the coating slab

/** A coated plate: plan path at z0 (on the plate face, outward on the walker's right), height
 *  range, and lean (inward run per metre of rise: TAN9 front/rear, −TAN25 nose, 0 vertical). */
export interface CoatWall {
  readonly path: readonly Vec2[];
  readonly z0: number;
  readonly z1: number;
  readonly lean?: number;
  /** Ridge pitch on this plate (U scale of the strip). */
  readonly pitch?: number;
  /** Extra flaking (0..1) on this plate: front and sides take the crew's boots. */
  readonly wear?: number;
}

export interface CoatOptions {
  /** Grid cell across the plate (≤ COLUMN) and up it, metres. */
  readonly ds: number;
  readonly dt: number;
  /** Flake field at a point in the part's space: > 0.5 means flaked. */
  readonly flake: (p: Vec3) => number;
  /** Paint, raw-paste edge and primer colours. */
  readonly paint: Vec3;
  readonly paste: Vec3;
  readonly primer: Vec3;
  readonly rng: Rng;
}

/** The coating, split by what it is: `coat` (zimmerit strip, gets the camo), `bare` (flaked
 *  floors on the primer: the caller strips and reprojects them like any painted steel). */
export interface Coating {
  readonly coat: Mesh;
  readonly bare: Mesh;
}

type Frame = {
  readonly at: (s: number, t: number, h: number) => Vec3;
  readonly n: (s: number) => Vec3;
};

/** Plate frame: (s along the path, t up the slant, h out of the face) → part space. */
function frameOf(w: CoatWall): Frame & { readonly len: number; readonly knots: number[] } {
  const lean = w.lean ?? 0;
  const k = dmath.hypot(1, lean);
  const segN: Vec2[] = [];
  const knots = [0];
  for (let i = 0; i + 1 < w.path.length; i++) {
    const a = w.path[i] as Vec2;
    const b = w.path[i + 1] as Vec2;
    const l = dmath.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    segN.push([(b[1] - a[1]) / l, -(b[0] - a[0]) / l]);
    knots.push((knots[i] ?? 0) + l);
  }
  const seg = (s: number): number => {
    let i = 0;
    while (i < segN.length - 1 && s > (knots[i + 1] ?? 0)) i++;
    return i;
  };
  /** Plan offset direction: the segment normal, mitred at interior knots. */
  const offset = (s: number): Vec2 => {
    const i = seg(s);
    const n = segN[i] as Vec2;
    const knot = [i, i + 1].find(
      (j) => j > 0 && j < segN.length && Math.abs(s - (knots[j] ?? 0)) < 1e-6,
    );
    if (knot === undefined) return n;
    const p = segN[knot - 1] as Vec2;
    const q = segN[knot] as Vec2;
    const m: Vec2 = [p[0] + q[0], p[1] + q[1]];
    const d = m[0] * q[0] + m[1] * q[1] || 1;
    return [m[0] / d, m[1] / d];
  };
  const at = (s: number, t: number, h: number): Vec3 => {
    const i = seg(s);
    const a = w.path[i] as Vec2;
    const f = (s - (knots[i] ?? 0)) / ((knots[i + 1] ?? 1) - (knots[i] ?? 0) || 1);
    const b = w.path[i + 1] as Vec2;
    const o = offset(s);
    const rise = t / k;
    const back = lean * rise;
    const ho = h / k;
    return [
      a[0] + (b[0] - a[0]) * f - o[0] * back + o[0] * ho,
      a[1] + (b[1] - a[1]) * f - o[1] * back + o[1] * ho,
      w.z0 + rise + lean * ho,
    ];
  };
  const n = (s: number): Vec3 => {
    const o = offset(s);
    const l = dmath.hypot(o[0], o[1], lean) || 1;
    return [o[0] / l, o[1] / l, lean / l];
  };
  return { at, n, len: knots[knots.length - 1] ?? 0, knots };
}

/** Sorted grid stops along [0, len]: column seams, path knots, then no cell wider than `d`. */
function stops(len: number, fixed: readonly number[], d: number): number[] {
  const base = [...new Set([0, len, ...fixed.filter((x) => x > 0 && x < len)])].sort(
    (a, b) => a - b,
  );
  const out: number[] = [];
  for (let i = 0; i + 1 < base.length; i++) {
    const a = base[i] ?? 0;
    const b = base[i + 1] ?? 0;
    if (b - a < 0.004) continue;
    const n = Math.max(1, Math.ceil((b - a) / d - 1e-9));
    for (let k = 0; k < n; k++) out.push(a + ((b - a) * k) / n);
  }
  out.push(len);
  return out;
}

type P2 = readonly [number, number];

/** Build the coating on a set of plates. */
export function coating(walls: readonly CoatWall[], o: CoatOptions): Coating {
  const coat = new MeshBuilder();
  const bare = new MeshBuilder();
  const zr = stripRect(ZIMMERIT);
  const half = 0.5 / 4096;
  const vOf = (f: number): number =>
    zr.v0 + half + Math.min(1, Math.max(0, f)) * (zr.v1 - zr.v0 - 2 * half);
  for (const w of walls) {
    const fr = frameOf(w);
    const H = (w.z1 - w.z0) * dmath.hypot(1, w.lean ?? 0);
    const cols = Math.max(1, Math.round(fr.len / COLUMN));
    const colW = fr.len / cols;
    const seams = Array.from({ length: cols - 1 }, (_, i) => (i + 1) * colW);
    const S = stops(fr.len, [...seams, ...fr.knots], o.ds);
    const T = stops(H, [], o.dt);
    const phase = Array.from({ length: cols }, () => o.rng.range(0, 1));
    const pitchK = HULL_PITCH / (w.pitch ?? HULL_PITCH);
    const wear = w.wear ?? 0;
    // Coat where the field is under 0.5; plate edges flake more (knocks, boots, tools).
    const value = (s: number, t: number): number => {
      const e = Math.min(s, fr.len - s, t, H - t);
      return 0.5 - (o.flake(fr.at(s, t, 0)) + wear * 0.12 + 0.14 * (1 - smooth(0, 0.12, e)));
    };
    const F = S.map((s) => T.map((t) => value(s, t)));
    const f = (i: number, j: number): number => F[i]?.[j] ?? 0;
    /** One vertex of the coat face (or its raw edge) with UVs in its column. */
    const cv = (s: number, t: number, h: number, col: number, n: Vec3, c: Vec3): number =>
      coat.vertex({
        p: fr.at(s, t, h),
        n,
        uv: [
          zr.u0 + ((t * pitchK + (phase[col] ?? 0) * 4) / zr.metres) * (zr.u1 - zr.u0),
          // Rim faces (col −1) read the middle of a column: they merge across seams.
          vOf(col < 0 ? 0.5 : (s - col * colW) / colW),
        ],
        color: c,
      });
    const face = (poly: readonly P2[], col: number, onCoat: boolean): void => {
      if (poly.length < 3) return;
      if (onCoat) {
        const ids = poly.map(([s, t]) => cv(s, t, COAT, col, fr.n(s), o.paint));
        for (let k = 1; k + 1 < ids.length; k++)
          coat.tri(ids[0] ?? 0, ids[k] ?? 0, ids[k + 1] ?? 0);
        return;
      }
      const ids = poly.map(([s, t]) =>
        bare.vertex({ p: fr.at(s, t, FLOOR), n: fr.n(s), uv: [0, 0], color: o.primer }),
      );
      for (let k = 1; k + 1 < ids.length; k++) bare.tri(ids[0] ?? 0, ids[k] ?? 0, ids[k + 1] ?? 0);
    };
    /** A step face along a→b from h0 up to h1, facing the walker's right (out of the region). */
    const step = (a: P2, b: P2, h0: number, h1: number, col: number, raw: boolean): void => {
      const da = fr.at(a[0], a[1], 0);
      const db = fr.at(b[0], b[1], 0);
      const up = fr.n((a[0] + b[0]) / 2);
      const t: Vec3 = [db[0] - da[0], db[1] - da[1], db[2] - da[2]];
      const nx: Vec3 = [
        t[1] * up[2] - t[2] * up[1],
        t[2] * up[0] - t[0] * up[2],
        t[0] * up[1] - t[1] * up[0],
      ];
      const l = dmath.hypot(nx[0], nx[1], nx[2]) || 1;
      const n: Vec3 = [nx[0] / l, nx[1] / l, nx[2] / l];
      const c = raw ? o.paste : o.paint;
      const ids = [
        cv(a[0], a[1], h0, col, n, c),
        cv(b[0], b[1], h0, col, n, c),
        cv(b[0], b[1], h1, col, n, c),
        cv(a[0], a[1], h1, col, n, c),
      ];
      coat.quad(ids[0] ?? 0, ids[1] ?? 0, ids[2] ?? 0, ids[3] ?? 0);
    };
    const colOf = (i: number): number =>
      Math.min(cols - 1, Math.floor(((S[i] ?? 0) + (S[i + 1] ?? 0)) / 2 / colW));
    const segOf = (i: number): number => {
      const m = ((S[i] ?? 0) + (S[i + 1] ?? 0)) / 2;
      return fr.knots.filter((k) => k < m).length;
    };
    /** Sub-cell (i, j): 1 all coat, −1 all flaked, 0 cut by a flake edge. */
    const kindOf = (i: number, j: number): number => {
      const c = [f(i, j), f(i + 1, j), f(i + 1, j + 1), f(i, j + 1)];
      return c.every((x) => x > 0) ? 1 : c.every((x) => x <= 0) ? -1 : 0;
    };
    // Groups: the sub-cells of one column on one flat stretch of the path. A row of a group that
    // is all coat (or all flaked) merges with its neighbours into one quad (most of every plate);
    // mixed rows go sub-cell by sub-cell, marching squares where a flake edge cuts.
    for (let g0 = 0; g0 + 1 < S.length; ) {
      let g1 = g0 + 1;
      while (g1 + 1 < S.length && colOf(g1) === colOf(g0) && segOf(g1) === segOf(g0)) g1++;
      const col = colOf(g0);
      const sA = S[g0] ?? 0;
      const sB = S[g1] ?? 0;
      const rowKind = (j: number): number => {
        const k = kindOf(g0, j);
        for (let i = g0 + 1; i < g1; i++) if (kindOf(i, j) !== k) return 0;
        return k;
      };
      let j = 0;
      while (j + 1 < T.length) {
        const kind = rowKind(j);
        if (kind !== 0) {
          let k = j + 1;
          while (k + 1 < T.length && rowKind(k) === kind) k++;
          const t0 = T[j] ?? 0;
          const t1 = T[k] ?? 0;
          face(
            [
              [sA, t0],
              [sB, t0],
              [sB, t1],
              [sA, t1],
            ],
            col,
            kind > 0,
          );
          j = k;
          continue;
        }
        for (let i = g0; i < g1; i++) {
          const k = kindOf(i, j);
          const s0 = S[i] ?? 0;
          const s1 = S[i + 1] ?? 0;
          const t0 = T[j] ?? 0;
          const t1 = T[j + 1] ?? 0;
          if (k === 0) cell(i, j, s0, s1, col);
          else
            face(
              [
                [s0, t0],
                [s1, t0],
                [s1, t1],
                [s0, t1],
              ],
              col,
              k > 0,
            );
        }
        j++;
      }
      g0 = g1;
    }
    // Panel rim: sink into the plate, rise to the coat or the flaked floor, split at crossings;
    // straight runs of one state merge into one face.
    const rim = (pts: P2[], vals: number[]): void => {
      const runs: { a: P2; b: P2; on: boolean }[] = [];
      const add = (a: P2, b: P2, on: boolean): void => {
        const r = runs[runs.length - 1];
        const lo = Math.min(r?.a[0] ?? 0, b[0]);
        const hi = Math.max(r?.a[0] ?? 0, b[0]);
        const bend = fr.knots.some((k) => k > lo + 1e-6 && k < hi - 1e-6);
        if (r && r.on === on && !bend) r.b = b;
        else runs.push({ a, b, on });
      };
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k] as P2;
        const b = pts[k + 1] as P2;
        const fa = vals[k] ?? 0;
        const fb = vals[k + 1] ?? 0;
        if (fa > 0 === fb > 0) add(a, b, fa > 0);
        else {
          const m = cut(a, b, fa, fb);
          add(a, m, fa > 0);
          add(m, b, fb > 0);
        }
      }
      // Painted where the coat runs to the plate edge, raw paste where it flaked there.
      for (const r of runs) step(r.a, r.b, -SINK, r.on ? COAT : FLOOR, -1, !r.on);
    };
    const last = S.length - 1;
    const top = T.length - 1;
    // Walk the rim with the panel on the left, so every step faces out.
    rim(S.map((s): P2 => [s, H]).reverse(), S.map((_, i) => f(i, top)).reverse());
    rim(
      S.map((s): P2 => [s, 0]),
      S.map((_, i) => f(i, 0)),
    );
    rim(
      T.map((t): P2 => [fr.len, t]),
      T.map((_, j) => f(last, j)),
    );
    rim(T.map((t): P2 => [0, t]).reverse(), T.map((_, j) => f(0, j)).reverse());

    /** Marching squares on one mixed cell: coat polygon, flake polygon(s), the broken edge. */
    function cell(i: number, j: number, s0: number, s1: number, col: number): void {
      const t0 = T[j] ?? 0;
      const t1 = T[j + 1] ?? 0;
      const P: P2[] = [
        [s0, t0],
        [s1, t0],
        [s1, t1],
        [s0, t1],
      ];
      const v = [f(i, j), f(i + 1, j), f(i + 1, j + 1), f(i, j + 1)];
      const inn = v.map((x) => x > 0);
      const saddle = inn[0] === inn[2] && inn[1] === inn[3] && inn[0] !== inn[1];
      const walk = (keep: boolean): P2[] => {
        const out: P2[] = [];
        for (let k = 0; k < 4; k++) {
          const a = P[k] as P2;
          const b = P[(k + 1) % 4] as P2;
          if (inn[k] === keep) out.push(a);
          if (inn[k] !== inn[(k + 1) % 4]) out.push(cut(a, b, v[k] ?? 0, v[(k + 1) % 4] ?? 0));
        }
        return out;
      };
      // Crossing point on edge k (corner k → k+1).
      const x = (k: number): P2 =>
        cut(P[k] as P2, P[(k + 1) % 4] as P2, v[k] ?? 0, v[(k + 1) % 4] ?? 0);
      face(walk(true), col, true);
      if (saddle) {
        // Saddles join the coat (one hexagon); the flake splits into two corner triangles.
        for (const k of [0, 1, 2, 3].filter((q) => !inn[q]))
          face([P[k] as P2, x(k), x((k + 3) % 4)], col, false);
      } else face(walk(false), col, false);
      // Broken edges, walked with the flake on the right so each step faces into the flake.
      if (saddle) {
        for (const q of [0, 1, 2, 3].filter((k) => !inn[k]))
          step(x((q + 3) % 4), x(q), FLOOR, COAT, col, true);
        return;
      }
      const outK = [0, 1, 2, 3].find((k) => inn[k] && !inn[(k + 1) % 4]);
      const inK = [0, 1, 2, 3].find((k) => !inn[k] && inn[(k + 1) % 4]);
      if (outK !== undefined && inK !== undefined) step(x(outK), x(inK), FLOOR, COAT, col, true);
    }
  }
  return { coat: coat.build(), bare: bare.build() };
}

/** Where the field crosses zero between a (value fa) and b (value fb). */
function cut(a: P2, b: P2, fa: number, fb: number): P2 {
  const t = Math.min(0.95, Math.max(0.05, fa / (fa - fb || 1e-9)));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// ---------------------------------------------------------------- LOD2: the plate takes the strip

/**
 * Move the triangles `on` picks onto the zimmerit strip (U up the plate at the true pitch, V on
 * the middle of a column), so the far LOD keeps the coated tone with no extra geometry. Needs
 * unwelded triangles (the paint pass emits them); colours (camo, weathering) are kept.
 */
export function coatFaces(
  m: Mesh,
  on: (centre: Vec3, n: Vec3) => boolean,
  pitch = HULL_PITCH,
): Mesh {
  const uvs = new Float32Array(m.uvs);
  const zr = stripRect(ZIMMERIT);
  const P = m.positions;
  const at = (i: number): Vec3 => [P[i * 3] ?? 0, P[i * 3 + 1] ?? 0, P[i * 3 + 2] ?? 0];
  for (let t = 0; t < m.indices.length; t += 3) {
    const ids = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const [a, b, c] = ids.map(at) as [Vec3, Vec3, Vec3];
    const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = dmath.hypot(nx, ny, nz) || 1;
    const centre: Vec3 = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ];
    if (!on(centre, [nx / l, ny / l, nz / l])) continue;
    const slant = 1 / Math.max(0.3, dmath.hypot(nx / l, ny / l));
    for (const i of ids) {
      uvs[i * 2] = zr.u0 + ((at(i)[2] * slant * HULL_PITCH) / pitch / zr.metres) * (zr.u1 - zr.u0);
      uvs[i * 2 + 1] = (zr.v0 + zr.v1) / 2;
    }
  }
  return { ...m, uvs };
}
