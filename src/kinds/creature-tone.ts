// Hand-painted tone for sculpted creatures (ported from recipes/_lib/creature/tone.ts), measured
// from the distance field at each surface vertex (passes/bake-field's probes): cavity = occlusion
// probe plus concave mean curvature (folds, sockets, gaps between locks go darker and more
// saturated), thin-part translucency (where the inward trace exits within `thin` metres — ears,
// lips, web — the skin glows warm red as it does against light), dirt pooling (low on the legs
// and in the folds near the ground, matted under the belly), a warm key from above, a cool bounce
// from below, highlights on thin up-facing crests, shadows cool red-violet rather than black, and
// strand breakup: seeded noise line-integral-convolved along the way hair lies (back and down the
// surface), so a coat reads as combed strands rather than velvet mottling. ~30 field and noise
// samples per vertex, deterministic.

import { createRng, dmath, type Vec3 } from '../core/index.ts';
import { fieldProbe, tangentOf } from '../passes/index.ts';
import { type Field, valueNoise } from '../primitives/index.ts';

export interface ToneOptions {
  /** Cavity probe distance, metres (about one fold). */
  readonly reach: number;
  /** Overall strength 0..1. */
  readonly strength?: number;
  /** Cavity darkening 0..1 (default 0.55). */
  readonly cavity?: number;
  /** Top lift / bottom drop (default 0.22 / 0.3). */
  readonly top?: number;
  readonly under?: number;
  /** Edge highlight on thin up-facing crests (default 0.35). */
  readonly edge?: number;
  /** Height over which the ground darkens the surface, metres (0 = off). */
  readonly ground?: number;
  /** Concave-curvature darkening 0..1 on top of the occlusion cavity (default 0.6). */
  readonly fold?: number;
  /** Thickness, metres, below which a part glows warm: light crosses ~1.5 cm of skin and cartilage (default 0.014; 0 = off). */
  readonly thin?: number;
  /** Translucent glow strength 0..1 (default 0.55). */
  readonly glow?: number;
  /** Dirt pooled in the band `ground` metres high and under the belly, 0..1 (default 0.5). */
  readonly dirt?: number;
  /** Strand breakup ± brightness along the hair's lie (default 0.12; 0 = off, e.g. scales). */
  readonly strands?: number;
  /** The way hair lies at a point (the coat's flow; default tailward and down). D60: a fixed lie
   *  crosses a muzzle or a leg, and the streaks become rings round it. */
  readonly lie?: (p: Vec3) => Vec3;
}

/** Hair lies tailward (−X) and down: the comb a strand follows when nothing else is known. */
const LIE: Vec3 = [-0.55, 0, -0.85];
/** Strand width across the lie and half-length along it, metres: guard-hair locks. */
const STRAND_GRAIN = 0.012;
const STRAND_LENGTH = 0.06;
const strandNoise = valueNoise(createRng(7151), { scale: STRAND_GRAIN, octaves: 1 });

/** −1..1: noise averaged along unit `dir` under a Hann window (line-integral convolution). */
export function streak(p: Vec3, dir: Vec3): number {
  let sum = 0;
  let wsum = 0;
  for (let i = -4; i <= 4; i++) {
    const w = 0.5 + 0.5 * dmath.cos((Math.PI * i) / 5);
    const t = (i / 4) * STRAND_LENGTH;
    sum += w * strandNoise([p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t]);
    wsum += w;
  }
  // A mean of ~2·length/grain independent samples shrinks by its square root: restore it.
  const gain = Math.sqrt((2 * STRAND_LENGTH) / STRAND_GRAIN) * 0.5;
  return Math.max(-1, Math.min(1, (sum / wsum) * gain));
}

/** Warm sub-surface red seen through thin skin and fur against light (linear). */
const BLOOD: Vec3 = [0.62, 0.2, 0.12];
/** Dried mud and dust (linear). */
const DIRT: Vec3 = [0.16, 0.12, 0.085];

const clamp = (v: number): number => Math.min(1, Math.max(0, v));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function painted(
  field: Field,
  colorAt: (q: Vec3) => Vec3,
  o: ToneOptions,
): (q: Vec3) => Vec3 {
  const k = o.strength ?? 1;
  const d = o.reach;
  const e = d * 0.25;
  const cavK = o.cavity ?? 0.55;
  const topK = o.top ?? 0.22;
  const underK = o.under ?? 0.3;
  const g = o.ground ?? 0;
  const foldK = o.fold ?? 0.6;
  const thin = o.thin ?? 0.014;
  const glowK = o.glow ?? 0.55;
  const dirtK = o.dirt ?? 0.5;
  const strandK = o.strands ?? 0.12;
  // One meshing cell (reach is five): curvature at the scale the mesh can show.
  const probe = fieldProbe(field, d / 5);
  const f = d / 40;
  const fine = ([x, y, z]: Vec3): Vec3 => {
    const v: Vec3 = [
      field([x + f, y, z]) - field([x - f, y, z]),
      field([x, y + f, z]) - field([x, y - f, z]),
      field([x, y, z + f]) - field([x, y, z - f]),
    ];
    const l = dmath.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  return (q) => {
    const c0 = colorAt(q);
    const [x, y, z] = q;
    const gx = field([x + e, y, z]) - field([x - e, y, z]);
    const gy = field([x, y + e, z]) - field([x, y - e, z]);
    const gz = field([x, y, z + e]) - field([x, y, z - e]);
    const gl = dmath.hypot(gx, gy, gz) || 1;
    const n: Vec3 = [gx / gl, gy / gl, gz / gl];
    let occ = 0;
    for (let i = 1; i <= 3; i++) {
      const t = (d * i) / 3;
      occ += Math.max(0, t - field([x + n[0] * t, y + n[1] * t, z + n[2] * t])) / t / i;
    }
    // Mean curvature H (1/m): −H·reach ≈ 1 in a fold one reach across.
    const fold = clamp(-probe.curvature(q) * d * 0.5) * foldK;
    const cav = Math.min(1, occ * 2.5 + fold) * k;
    // Translucency: distance through the solid along −n; full glow at 40 % of `thin`.
    // A fine normal: the cavity gradient (¼ reach) straddles a thin ear and points along it.
    const depth = thin > 0 ? probe.depth(q, fine(q), thin) : thin;
    // Melanin absorbs what crosses: a black nose leather or lid rim barely glows, pale skin does.
    const pigment = 0.1 + 0.9 * clamp(((c0[0] + c0[1] + c0[2]) / 3 - 0.003) / 0.037);
    const glow = thin > 0 ? clamp((thin - depth) / (thin * 0.6)) * glowK * pigment * k : 0;
    // Dirt: pooled low near the ground (more in folds), matted under the belly.
    const low = g > 0 ? dmath.pow(clamp(1 - z / (g * 0.45)), 2) * (0.6 + 0.8 * cav) : 0;
    const belly = g > 0 ? clamp(-n[2] - 0.3) * clamp(1 - z / (g * 2.2)) * 0.5 : 0;
    const c = mix(mix(c0, mixLum(c0, DIRT), clamp(low + belly) * dirtK * k), BLOOD, glow * 0.5);
    const up = n[2] * k;
    const lift = up > 0 ? 1 + up * topK : 1 + up * underK;
    const warm: Vec3 =
      up > 0 ? [1 + up * 0.1, 1 + up * 0.04, 1 - up * 0.12] : [1 + up * 0.08, 1, 1 - up * 0.1];
    // Edge highlight: thin up-facing crests (wing bones, horn ridges, spine edges) catch the key.
    const ti = d * 0.6;
    const crest = clamp((field([x - n[0] * ti, y - n[1] * ti, z - n[2] * ti]) + ti) / ti);
    const edge = 1 + (o.edge ?? 0.35) * crest * Math.max(0, n[2]) * k;
    const ground = g > 0 ? 0.62 + 0.38 * clamp(z / g) : 1;
    // Shadow = 1 − light, cast cool red-violet (blue falls off least), never toward black.
    // The ground band stays neutral (warm bounce off the ground, not sky-blue), else the paws
    // read lavender.
    const s = cav * cavK;
    const shade: Vec3 = [(1 - s) * ground, (1 - s * 1.05) * ground, (1 - s * 0.7) * ground * 0.97];
    const lum = (c[0] + c[1] + c[2]) / 3;
    const sat = 1 + cav * 0.35 + glow * 0.6;
    const hair = strandK > 0 ? 1 + strandK * k * streak(q, tangentOf(o.lie?.(q) ?? LIE, n)) : 1;
    const lit = lift * edge * hair;
    return [
      clamp((lum + (c[0] - lum) * sat) * shade[0] * lit * warm[0]),
      clamp((lum + (c[1] - lum) * sat) * shade[1] * lit * warm[1]),
      clamp((lum + (c[2] - lum) * sat) * shade[2] * lit * warm[2]),
    ];
  };
}

/** The dirt colour at the coat's own brightness (dirt mats the hair, it does not paint it). */
function mixLum(c: Vec3, dirt: Vec3): Vec3 {
  const l = (c[0] + c[1] + c[2]) / 3;
  const dl = (dirt[0] + dirt[1] + dirt[2]) / 3;
  const k = Math.min(1.6, (l * 0.7) / dl);
  return [dirt[0] * k, dirt[1] * k, dirt[2] * k];
}
