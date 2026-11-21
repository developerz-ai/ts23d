// Bust skin: a sculpt meshed, with a hand-painted look driven by the field itself — the
// texture artist's curvature + occlusion bake, done per vertex: crevices darker and more
// saturated, convex ridges lifted and warmed (brow, cheekbone, knuckles of the face), warm tops,
// cool undersides, a low-frequency mottle so the green never reads as one digital flat, and fine
// skin irregularity (pores/bumps) displaced into the surface at LOD0. Under hair the scalp is
// painted the hair's root colour with strand streaks (`scalp`), so no skin reads through the
// cut-out cards (D57, ../face/scalp-check.ts).

import {
  type DetailRegion,
  dmath,
  type Field,
  type Mesh,
  type Rng,
  type SculptEdit,
  sculptField,
  sdf,
  valueNoise,
  withBakeSource,
} from '@developerz.ai/ts23d';
import { onSkin } from '../face/skin-strip.ts';
import type { V } from './kit.ts';

const clamp = (v: number): number => Math.min(Math.max(v, 0), 1);
const mix = (a: V, b: V, t: number): V => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** The painter's skin palette: base, warm tops/ridges, cool undersides, crevice colour. */
export interface SkinTone {
  readonly skin: V;
  readonly warm: V;
  readonly cool: V;
  readonly cavity: V;
}

/** Hair-coloured scalp inside a hairline (or a beardline): `line` < 0 where the hair grows. */
export interface ScalpPaint {
  readonly line: Field;
  readonly color: V;
  /** Edge ramp, metres (default 4 mm): a beard's cheek line is softer than a hairline. */
  readonly soft?: number;
}

export interface SkinOptions {
  readonly rng: Rng;
  readonly tone: SkinTone;
  /** Skin bump amplitude, metres (0 = smooth). */
  readonly bumps?: number;
  /** Base colour of edits that give none. */
  readonly color?: V;
  /** Mirror the edits across y = 0 (default true). */
  readonly mirror?: boolean;
  /** Keep only where clip ≤ 0 (split one sculpt into parts at a hidden seam). */
  readonly clip?: Field;
  /** Mesh only inside this box (intersected with the edits' bounds): a split part's region. */
  readonly within?: readonly [V, V];
  /** Fine colour breakup on the skin (0 = none … 1): pore-scale specks, warm and dark, the
   *  hand-painted texture of weathered hide. */
  readonly speckle?: number;
  /** Stencil of the normal and curvature samples, metres (default 4 mm). Widen it on a big
   *  skull-stage head: the mesh field's trilinear grid rings in a 4 mm Laplacian. */
  readonly stencil?: number;
  /** Boxes meshed finer (the face of a skull-stage head). */
  readonly detail?: readonly DetailRegion[];
  /** Scalp (and beard) regions painted the hair's colour, edge broken over ±1.5 mm. */
  readonly scalp?: readonly ScalpPaint[];
  /** Map the skin onto the shared pore strip (../face/skin-strip.ts) instead of `plain`: pore
   *  relief in the normal map and a roughness that follows it; `oil` (0 … 1) marks the glossier
   *  T-zone, `matte` (0 … 1) the dry scalp. The tone stays in vertex colour. */
  readonly strip?: {
    readonly oil?: Field;
    readonly matte?: Field;
    /** The lips: the wet strip. */
    readonly moist?: Field;
    /** The thin skin round the eyes: the fine strip. */
    readonly fine?: Field;
    /** Freckles' cluster (soft, dithered): the freckled strip (D520). */
    readonly freckle?: Field;
    /** Clear skin off the nose and cheeks (soft, dithered): the finest pores' strip (D520). */
    readonly clear?: Field;
  };
  /** Light through thin skin (D522): inside `region` (> 0 there, 0 … 1), skin with its own other
   *  side within 8 mm behind it (an ear's rim and helix) is warmed toward `color`, the glow a
   *  backlit ear shows, painted so it reads in any light and any engine. */
  readonly translucent?: { readonly color: V; readonly region: Field };
  /** A coarse LOD (LOD1 and LOD2): every vertex takes the mean of the paint at the centres of its
   *  faces, so one sample in a crevice or a speckle (a nostril, a lid line) no longer colours a
   *  whole triangle. Point-sampled at LOD1's 1 cm, the millimetre paint noise aliased into
   *  triangle-wide patches (D552). */
  readonly far?: boolean;
}

/** `m` with each vertex coloured by the mean of `paint` over its faces' centres; a vertex inside
 *  a `scalp` line keeps its own colour (the hair's: a mean with the skin past the hairline would
 *  read as bare scalp, D57). */
function faceAveraged(m: Mesh, paint: (p: V) => V, scalp: readonly ScalpPaint[]): Mesh {
  const P = m.positions;
  const sum = new Float64Array(m.colors.length);
  const n = new Float64Array(P.length / 3);
  for (let t = 0; t < m.indices.length; t += 3) {
    const tri = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const c = paint([
      tri.reduce((a, v) => a + (P[v * 3] ?? 0), 0) / 3,
      tri.reduce((a, v) => a + (P[v * 3 + 1] ?? 0), 0) / 3,
      tri.reduce((a, v) => a + (P[v * 3 + 2] ?? 0), 0) / 3,
    ]);
    for (const v of tri) {
      for (let e = 0; e < 3; e++) sum[v * 3 + e] = (sum[v * 3 + e] ?? 0) + c[e as 0 | 1 | 2];
      n[v] = (n[v] ?? 0) + 1;
    }
  }
  const colors = new Float32Array(m.colors.length);
  for (let v = 0; v < n.length; v++) {
    const p: V = [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
    const own = !n[v] || scalp.some((s) => s.line(p) < 0.004);
    for (let e = 0; e < 3; e++)
      colors[v * 3 + e] = own ? (m.colors[v * 3 + e] ?? 0) : (sum[v * 3 + e] ?? 0) / (n[v] ?? 1);
  }
  return { ...m, colors };
}

/** Hair albedo over the scalp: full 3 mm inside the line, a 1 mm soft edge outside it, the
 *  edge jittered and the colour streaked (strand-scale value noise) so it reads as dense roots. */
function scalpPaint(c: V, p: V, scalp: readonly ScalpPaint[], jitter: Field, streak: Field): V {
  let out = c;
  for (const s of scalp) {
    const h = s.line(p) + 0.0015 * jitter(p);
    if (h > 0.001) continue;
    const t = clamp((0.001 - h) / (s.soft ?? 0.004));
    const k = 0.9 + 0.2 * streak(p);
    out = mix(out, [s.color[0] * k, s.color[1] * k, s.color[2] * k], t * t * (3 - 2 * t));
  }
  return out;
}

/** How thin the skin at `p` (outward normal `n`) is: 1 − the depth (of 2 … 8 mm) at which a
 *  probe into it comes out of its other side / 1 cm; 0 for skin thicker than 8 mm. */
function thinAt(field: Field, p: V, n: V): number {
  for (const d of [0.002, 0.0035, 0.005, 0.0065, 0.008])
    if (field([p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d]) > 0) return 1 - d / 0.01;
  return 0;
}

export function skinMesh(edits: readonly SculptEdit[], cell: number, o: SkinOptions): Mesh {
  const sym = o.mirror ?? true;
  const s = sculptField(edits, {
    color: o.color ?? o.tone.skin,
    ...(sym ? { mirror: 'y' as const } : {}),
  });
  const fine = valueNoise(o.rng.fork('pores'), { scale: 0.011, octaves: 2 });
  const mottle = valueNoise(o.rng.fork('mottle'), { scale: 0.045, octaves: 3 });
  const speck = valueNoise(o.rng.fork('speckle'), { scale: 0.006, octaves: 2 });
  const speckle = o.speckle ?? 0;
  const jitter = valueNoise(o.rng.fork('hairline'), { scale: 0.004, octaves: 2 });
  const streak = valueNoise(o.rng.fork('roots'), { scale: 0.0016, octaves: 1 });
  const amp = o.bumps ?? 0;
  const T = o.tone;
  const q: [number, number, number] = [0, 0, 0];
  // Skin irregularity, symmetric (|y|) like the sculpt; the colour mottle is not.
  const clip = o.clip;
  const raw =
    amp > 0
      ? (p: V): number => {
          q[0] = p[0];
          q[1] = Math.abs(p[1]);
          q[2] = p[2];
          return s.field(p) + amp * fine(q);
        }
      : s.field;
  const field = clip ? (p: V): number => Math.max(raw(p), clip(p)) : raw;
  const e = o.stencil ?? 0.004;
  const reach = 0.02;
  const paint = (p: V): V => {
    const base = s.colorAt(p);
    const [x, y, z] = p;
    // Six axis samples give the gradient (normal).
    const xp = raw([x + e, y, z]);
    const xm = raw([x - e, y, z]);
    const yp = raw([x, y + e, z]);
    const ym = raw([x, y - e, z]);
    const zp = raw([x, y, z + e]);
    const zm = raw([x, y, z - e]);
    const gx = xp - xm;
    const gy = yp - ym;
    const gz = zp - zm;
    const gl = dmath.hypot(gx, gy, gz) || 1;
    const n: V = [gx / gl, gy / gl, gz / gl];
    // Mean curvature from the Laplacian of the smooth field (no pores) over a 2.5× wider stencil:
    // a mesh-field sculpt's trilinear grid puts kinks in a narrow Laplacian, painted as streaks.
    // > 0 convex (ridges), < 0 concave (creases).
    const E = e * 2.5;
    const f = s.field;
    const lap =
      (f([x + E, y, z]) + f([x - E, y, z]) + f([x, y + E, z]) + f([x, y - E, z])) / (E * E) +
      (f([x, y, z + E]) + f([x, y, z - E]) - 6 * f(p)) / (E * E);
    const curv = Math.max(-1, Math.min(1, lap * 0.012));
    // Cavity: walk out along the normal; a crevice brings other surface closer than the walk.
    let occ = 0;
    for (let i = 1; i <= 3; i++) {
      const t = (reach * i) / 3;
      occ += Math.max(0, t - raw([x + n[0] * t, y + n[1] * t, z + n[2] * t])) / t / i;
    }
    const cav = clamp(occ * 1.6 + Math.max(0, -curv) * 0.6);
    // Skin-ness: only the skin takes the warm/cool/mottle painting (bone, paint keep theirs).
    const dSkin = Math.abs(base[0] - T.skin[0]) + Math.abs(base[1] - T.skin[1]);
    const isSkin = clamp(1 - dSkin * 12);
    let c = base;
    if (isSkin > 0) {
      const up = n[2];
      const warm = mix(c, T.warm, clamp(up * 0.55 + Math.max(0, curv) * 0.6) * isSkin);
      // (Undersides a step toward `cool`, not into it: at 0.6 a pale face's sockets and the
      // underside of its brow went mauve-grey, a bruise in the hero (D512).)
      c = mix(warm, T.cool, clamp(-up) * 0.3 * isSkin);
      // Mottle along the two axes real skin varies on, blood (rose) and melanin (gold), as a
      // shift of the colour at hand: the old warm/cool mix read as grey camouflage blotches.
      const m = mottle(p);
      const shift: V = m > 0 ? [c[0], c[1] * 0.92, c[2] * 0.92] : [c[0], c[1] * 0.98, c[2] * 0.86];
      c = mix(c, shift, Math.min(1, Math.abs(m) * 1.2) * isSkin);
      if (speckle > 0) {
        const k = speck(p);
        c = mix(c, k > 0 ? T.warm : T.cavity, Math.min(1, Math.abs(k) * 1.4) * speckle * isSkin);
      }
    }
    const tr = o.translucent;
    // (Not gated on `isSkin`: the ears carry the zones' flush, which that test reads as paint.)
    const inEar = tr ? clamp(tr.region(p)) : 0;
    if (tr && inEar > 0) c = mix(c, tr.color, thinAt(raw, p, n) * 0.6 * inEar);
    if (o.scalp) c = scalpPaint(c, p, o.scalp, jitter, streak);
    // Crevices: a shade darker and deeper; ridges catch a little light on everything. (The
    // renderer shades a crease itself: at 0.75 toward the cavity colour, painted on top of that
    // shade, sockets and lid folds read as bruises, D512.)
    c = mix(c, mix(T.cavity, c, 0.45), cav * 0.55);
    const lift = 1 + Math.max(0, curv) * 0.18;
    return [clamp(c[0] * lift), clamp(c[1] * lift), clamp(c[2] * lift)];
  };
  const lipschitz = s.lipschitz + (amp > 0 ? 0.35 : 0);
  const mesh = sdf({
    field,
    bounds: o.within
      ? [
          [
            Math.max(s.bounds[0][0], o.within[0][0]),
            Math.max(s.bounds[0][1], o.within[0][1]),
            Math.max(s.bounds[0][2], o.within[0][2]),
          ],
          [
            Math.min(s.bounds[1][0], o.within[1][0]),
            Math.min(s.bounds[1][1], o.within[1][1]),
            Math.min(s.bounds[1][2], o.within[1][2]),
          ],
        ]
      : s.bounds,
    resolution: cell,
    color: paint,
    ...(sym ? { symmetry: 'y' as const } : {}),
    // The sculpt's own bound (strokes raise it), plus the pores' slope.
    lipschitz,
    ...(o.detail ? { detail: o.detail } : {}),
  });
  const toned = o.far ? faceAveraged(mesh, paint, o.scalp ?? []) : mesh;
  const mapped = o.strip ? onSkin(toned, o.strip) : toned;
  // The field it was meshed from, for the hero bake (ADR 012; bust.ts passes it on when opted in).
  return withBakeSource(mapped, { field, lipschitz, color: paint });
}
