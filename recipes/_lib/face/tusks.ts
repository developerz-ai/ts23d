// Orc tusks on the warped faces (bust.ts): the LOWER canines grown long (boar/warthog lower
// tusks, the orc convention in game art): rooted in the jaw behind the lower lip, leaving the
// mouth at the lower lip's top (`wrapTusks` swells the lip round the base), rising in front of the
// upper lip, a little outward, the tip curling back at about nose-wing height; old ivory
// (`ivoryTusk`, shared with orc_head): a narrow grime line at the gum graded into a darker yellowed
// root, paling to a chipped tip (breaks: ./tusk-breaks.ts).

import { dmath, type Mesh, sweep, type Vec3 } from '@developerz.ai/ts23d';
import { spline } from '../bust/kit.ts';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';
import { mix, stainAlong } from './teeth.ts';
import { chipTip, snapEnd } from './tusk-breaks.ts';

/** Tusk ivory: yellowed along the shaft, paler at the worn tip, brown-black at the gum line. */
export const TUSK: { readonly ivory: Vec3; readonly tip: Vec3; readonly stain: Vec3 } = {
  ivory: [0.66, 0.55, 0.3],
  tip: [0.72, 0.65, 0.46],
  stain: [0.2, 0.12, 0.05],
};

/** The left tusk's centre line on the warped face, root → tip: rooted behind the lower lip at
 *  the canine (0.62 of the corner's half-width), out through the lower lip's top at the mouth
 *  line, rising in front of the upper lip and a little outward, the tip curling back toward the
 *  face at about nose-wing height. `length` is the race's tusk knob (ΔH). */
export function tuskPath(head: FaceHead, length: number, n = 12): Vec3[] {
  const st = head.map(MIDLINE.stomionInf);
  const inf = head.map(MIDLINE.labraleInf);
  const sup = head.map(MIDLINE.labraleSup);
  const cl = head.map(LEFT.cheilion);
  const al = head.map(LEFT.alare);
  const s = head.scale;
  const yc = Math.abs(cl[1]) * 0.62;
  // The upper lip's front at the canine: the midline front pulled back toward the corner.
  const lipX = sup[0] + (cl[0] - sup[0]) * 0.55;
  // Tip height: the nose wing for the default 0.16 knob, higher or lower with it.
  const rise = Math.max(0.6, length / 0.16) * (al[2] - st[2]);
  const ctrl: Vec3[] = [
    [inf[0] - 0.028 * s, yc * 0.94, inf[2] - 0.026 * s],
    [inf[0] - 0.018 * s, yc, st[2]],
    [lipX + 0.014 * s, yc + 0.004 * s, st[2] + rise * 0.55],
    [lipX + 0.002 * s, yc + 0.009 * s, st[2] + rise],
  ];
  return spline(ctrl, n + 1);
}

export interface TuskLook {
  /** Root radius, metres. */
  readonly radius: number;
  /** Share of the path where the tusk leaves the gum (the stain band sits there). */
  readonly gum: number;
  /** Metres past `gum` where the lip lets go of the tusk (the grime line sits there; default 0). */
  readonly exit?: number;
  readonly seg: number;
  /** Cut the tip off obliquely (an old chip). */
  readonly chip?: boolean;
  /** Share of the whole tusk `path` covers (< 1: snapped off there, a jagged fracture). */
  readonly keep?: number;
  readonly ivory?: Vec3;
  readonly tip?: Vec3;
  readonly stain?: Vec3;
}

/** A tusk swept along `path`: thick at the root, tapering to a blunt point; a narrow grime line
 *  at the gum grading into darker, yellowed ivory at the root, paling to the worn tip, the tip
 *  chipped. */
export function ivoryTusk(path: readonly Vec3[], look: TuskLook): Mesh {
  const N = path.length - 1;
  const keep = look.keep ?? 1;
  // Rings: the path's own points, plus, for a tusk that says where the lip lets go (`exit`), extra
  // ones every 0.15 radius across the gum's grime line so it grades over millimetres (between rings
  // 6 mm apart it read as a hard band, D526). A small fang without `exit` keeps its own rings: the
  // extra ones cost a goblin its LOD1 budget and moved a fang's buried root (D529).
  const len = arcLengths(path);
  const gumAt = at(len, (look.gum / keep) * N) + (look.exit ?? 0);
  const fine = 0.15 * look.radius;
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    idx.push(i);
    const a = len[i] ?? 0;
    const b = len[i + 1] ?? a;
    const lo = Math.max(a, gumAt - GRIME.below);
    const hi = Math.min(b, gumAt + GRIME.line + GRIME.fade + fine);
    for (let s = lo; look.exit !== undefined && i < N && s < hi; s += fine)
      if (s > a + 0.3 * fine && s < b - 0.3 * fine) idx.push(i + (s - a) / (b - a));
  }
  const rings = idx.map((f) => lerpPath(path, f));
  const arc = idx.map((f) => at(len, f));
  // Thickest where it leaves the gum; the root narrows into the jaw (a tusk's socket end) so the
  // buried part never shows through the lip.
  const scale = idx.map((f) => {
    const t = (f / N) * keep;
    if (t < look.gum) {
      const u = t / look.gum;
      return 0.55 + 0.45 * u * u * (3 - 2 * u);
    }
    return Math.max(0.1, 1 - dmath.pow((t - look.gum) / (1 - look.gum), 1.6));
  });
  const m = sweep({
    section: { radius: look.radius, segments: look.seg },
    path: rings,
    scale,
    color: look.ivory ?? TUSK.ivory,
    strip: 'plain',
    caps: true,
  });
  const ivory = look.ivory ?? TUSK.ivory;
  const tip = look.tip ?? TUSK.tip;
  const stain = look.stain ?? TUSK.stain;
  // Old ivory's own value: darker and more yellow at the root, paler toward the worn tip.
  const root: Vec3 = [ivory[0] * 0.86, ivory[1] * 0.8, ivory[2] * 0.66];
  // Share of the whole tusk where the lip lets go.
  const lip = look.gum + (look.exit ?? 0) / ((len[N] ?? 1) / keep);
  const colors = idx.map((f, i) => {
    const t = (f / N) * keep;
    const past = (arc[i] ?? 0) - gumAt;
    // The grime: dark for a hair past where the lip lets go, then graded into the root's
    // yellow over a few millimetres.
    const u = Math.min(1, Math.max(0, (past - GRIME.line) / GRIME.fade));
    const k = u * u * (3 - 2 * u);
    const shaft = mix(
      mix(root, ivory, Math.min(1, Math.max(0, (t - lip) / 0.3))),
      tip,
      Math.max(0, (t - 0.6) / 0.4),
    );
    return mix(stain, shaft, k);
  });
  const coloured = stainAlong(m, rings, (share) => {
    const c = colors[Math.round(share * (rings.length - 1))];
    return c ?? ivory;
  });
  const last = scale[scale.length - 1] ?? 1;
  const end = keep < 1 ? snapEnd(coloured, rings, look.radius * last) : coloured;
  return look.chip ? chipTip(end, rings) : end;
}

/** The gum's grime, metres along the tusk from where it leaves the gum: fully dark for `line`
 *  past it, then graded into the ivory over `fade`; finer rings from `below` under it. */
const GRIME = { line: 0.002, fade: 0.006, below: 0.002 } as const;

/** Cumulative arc length at each point of a polyline. */
function arcLengths(path: readonly Vec3[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] ?? [0, 0, 0];
    const b = path[i] ?? a;
    out.push((out[i - 1] ?? 0) + dmath.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return out;
}

/** Linear value at fractional index `f` of `v`. */
function at(v: readonly number[], f: number): number {
  const i = Math.min(v.length - 2, Math.max(0, Math.floor(f)));
  const a = v[i] ?? 0;
  return a + ((v[i + 1] ?? a) - a) * (f - i);
}

/** The point at fractional index `f` along a polyline. */
function lerpPath(path: readonly Vec3[], f: number): Vec3 {
  const i = Math.min(path.length - 2, Math.max(0, Math.floor(f)));
  const a = path[i] ?? [0, 0, 0];
  const b = path[i + 1] ?? a;
  const u = f - i;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/** Root radius of a face's tusks for the race's `length` knob. */
const tuskRadius = (head: FaceHead, length: number): number =>
  0.0058 * head.scale * Math.max(1, length / 0.12);

/** Orc tusks on the warped face (`tuskPath`), the right one a mirror (its tip unchipped). */
export function tusks(head: FaceHead, length: number, lod: number): { l: Mesh; r: Mesh } {
  const n = lod === 0 ? 12 : 6;
  const path = tuskPath(head, length, n);
  const look: TuskLook = {
    radius: tuskRadius(head, length),
    gum: 1 / 3,
    // (The lip wrapped round the base, `wrapTusks`, lets go about 6 mm past the gum share.)
    exit: -0.003 * head.scale,
    seg: lod === 0 ? 12 : 6,
    chip: lod === 0,
  };
  const r = path.map((p): Vec3 => [p[0], -p[1], p[2]]);
  return { l: ivoryTusk(path, look), r: ivoryTusk(r, { ...look, chip: false }) };
}

/** The lower lip wrapping the tusks' bases: skin within reach of each tusk's buried stretch
 *  (root → where it leaves the gum) is pushed out round it to a sleeve 1.3 × its radius, fading
 *  over another radius, so the lip swells round the base instead of the tusk's flank showing
 *  below the mouth line. The rest of the face is untouched. */
export function wrapTusks(head: FaceHead, length: number): FaceHead {
  const base = tuskPath(head, length, 12).slice(0, 5);
  const R = tuskRadius(head, length) * 1.3;
  const fade = R;
  const p = new Float64Array(head.mesh.p);
  for (const side of [1, -1] as const) {
    const axis = base.map((q): Vec3 => [q[0], q[1] * side, q[2]]);
    for (let v = 0; v < p.length; v += 3) {
      const q: Vec3 = [p[v] ?? 0, p[v + 1] ?? 0, p[v + 2] ?? 0];
      const c = closestOn(axis, q);
      if (!c) continue;
      const d = dmath.hypot(q[0] - c.at[0], q[1] - c.at[1], q[2] - c.at[2]);
      if (d >= R + fade || d < 1e-6) continue;
      // Past the gum end the push fades over half a radius (the lip's top rolls over the base).
      const end = c.past > 0 ? Math.max(0, 1 - c.past / (0.5 * R)) : 1;
      const u = Math.min(1, (R + fade - d) / fade);
      const push = (d < R ? R - d : 0) * end + 0.15 * R * u * u * end;
      for (let k = 0; k < 3; k++)
        p[v + k] = (q[k] ?? 0) + ((q[k] ?? 0) - (c.at[k] ?? 0)) * (push / d);
    }
  }
  return { ...head, mesh: { ...head.mesh, p } };
}

/** Closest point on a polyline to `q`, and how far past its last point `q` lies (0 if beside it). */
function closestOn(line: readonly Vec3[], q: Vec3): { at: Vec3; past: number } | null {
  let best: { at: Vec3; past: number } | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] ?? q;
    const b = line[i + 1] ?? a;
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
    const raw = ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1] + (q[2] - a[2]) * ab[2]) / L2;
    const t = Math.min(1, Math.max(0, raw));
    const at: Vec3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
    const e: Vec3 = [q[0] - at[0], q[1] - at[1], q[2] - at[2]];
    const d = e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
    if (d < bd) {
      bd = d;
      const last = i + 2 === line.length;
      best = { at, past: last && raw > 1 ? (raw - 1) * Math.sqrt(L2) : 0 };
    }
  }
  return best;
}
