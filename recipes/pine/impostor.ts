// LOD2 crown for the pine: needle pads, not one blob. The LOD0 needle tufts are clustered
// (clumps.ts) into K clumps; each becomes a pad — a low lens (two rings of `sides`, a domed top
// and a flatter underside) sized and turned by its clump's own spread (2×2 PCA in plan, std in Z)
// and coloured by its tufts' mean. fit.ts then scales each pad against LOD0's silhouette, so LOD2
// keeps the open crown's layered outline and value instead of popping to a solid lathe.

import { type Mesh, MeshBuilder, stripRect, type Vec2, type Vec3 } from '@developerz.ai/ts23d';
import { cluster, d2, samples } from './clumps.ts';

/** One texel mid-strip of the matte greyscale `concrete` strip (roughness 0.9, tinted by vertex
 * colour): the pads are flat colour and the strip only sets their sheen. On LOD0's shiny `plain`
 * strip a convex solid's sky-facing facets read ~50% brighter than the self-shadowed card crown;
 * matte pads at 0.7 × the tufts' mean colour match LOD0's rendered crown colour (README). */
const UV: Vec2 = (() => {
  const r = stripRect('concrete');
  return [r.u0 + 0.5, (r.v0 + r.v1) / 2];
})();

export interface PadOptions {
  /** Number of pads; triangles = pads · 2 · sides · rings. */
  readonly pads: number;
  /** Share (0–1, by area) of a clump's tufts its pad must enclose before fitting. */
  readonly cover: number;
  readonly sides: number;
  /** 1 = bipyramid, 2 = lens (fuller from the side). */
  readonly rings: 1 | 2;
  /** Multiplier on the clumps' mean tuft colour (lit solids read lighter than crossed cards). */
  readonly value?: number;
  /** The trunk's apex: the nearest pad is centred under it and peaks exactly there (the leader
   * shoot), so the crown shares a point with the trunk and provably holds on. */
  readonly anchor?: Vec3;
}

export interface Pad {
  readonly centre: Vec3;
  /** Plan major axis direction (unit, z = 0). */
  readonly axis: Vec3;
  /** Half-extents: plan major, plan minor, vertical. */
  readonly a: number;
  readonly b: number;
  readonly h: number;
  readonly color: Vec3;
  /** Leader pad: its top vertex is pinned here. */
  readonly peak?: Vec3;
}

/** One pad per clump of `leaves` (LOD0 needle tufts, crown frame). */
export function padsOf(leaves: Mesh, o: PadOptions): Pad[] {
  const clumps = cluster(samples(leaves), o.pads, 12);
  const an = o.anchor;
  let held = -1;
  let bd = Infinity;
  if (an)
    for (const [i, cl] of clumps.entries()) {
      const d = d2(cl.centre, an);
      if (d < bd) {
        bd = d;
        held = i;
      }
    }
  return clumps.map((cl, ci): Pad => {
    const [cx, cy, cz] = cl.centre;
    let [sxx, syy, sxy, szz] = [0, 0, 0, 0];
    const col: [number, number, number] = [0, 0, 0];
    for (const q of cl.members) {
      const [dx, dy, dz] = [q.p[0] - cx, q.p[1] - cy, q.p[2] - cz];
      sxx += q.w * dx * dx;
      syy += q.w * dy * dy;
      sxy += q.w * dx * dy;
      szz += q.w * dz * dz;
      for (let k = 0; k < 3; k++) col[k] = (col[k] ?? 0) + q.w * (q.c[k] ?? 0);
    }
    const w = cl.w;
    [sxx, syy, sxy, szz] = [sxx / w, syy / w, sxy / w, szz / w];
    const tr = (sxx + syy) / 2;
    const det = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ax: Vec3 = [Math.cos(ang), Math.sin(ang), 0];
    // Shape from the spread (std per principal axis), size from a quantile of the double-cone
    // norm (plan ellipse + vertical), so the pad encloses `cover` of the clump.
    const a0 = Math.sqrt(tr + det) || 0.1;
    const b0 = Math.sqrt(Math.max(0, tr - det)) || 0.1;
    const h0 = Math.sqrt(szz) || 0.1;
    const norms = cl.members
      .map((q) => {
        const [dx, dy] = [q.p[0] - cx, q.p[1] - cy];
        const u = (dx * ax[0] + dy * ax[1]) / a0;
        const v = (-dx * ax[1] + dy * ax[0]) / b0;
        return { k: Math.hypot(u, v) + Math.abs(q.p[2] - cz) / h0, w: q.w };
      })
      .sort((x, y) => x.k - y.k);
    let acc = 0;
    let fit = norms[norms.length - 1]?.k ?? 1;
    for (const q of norms) {
      acc += q.w;
      if (acc >= o.cover * w) {
        fit = q.k;
        break;
      }
    }
    const peak = ci === held ? an : undefined;
    return {
      centre: peak ? [peak[0], peak[1], cz] : [cx, cy, cz],
      axis: ax,
      a: a0 * fit,
      b: b0 * fit,
      h: h0 * fit,
      color: [
        (col[0] / w) * (o.value ?? 1),
        (col[1] / w) * (o.value ?? 1),
        (col[2] / w) * (o.value ?? 1),
      ],
      ...(peak ? { peak } : {}),
    };
  });
}

/** A pad's triangles (outward winding) with a shade factor per face: top light, underside dark. */
export function padFaces(
  p: Pad,
  o: Pick<PadOptions, 'sides' | 'rings'>,
): [Vec3, Vec3, Vec3, number][] {
  const [ox, oy, cz] = p.centre;
  const ax = p.axis;
  const ay: Vec3 = [-ax[1], ax[0], 0];
  const n = o.sides;
  // The lower ring is the widest: flat-ish underside, domed top, like a pine's needle pad.
  const levels: readonly (readonly [number, number])[] =
    o.rings === 1
      ? [[cz - 0.25 * p.h, 1]]
      : [
          [cz - 0.3 * p.h, 1],
          [cz + 0.35 * p.h, 0.8],
        ];
  const rings = levels.map(([z, k]) =>
    Array.from({ length: n }, (_, j): Vec3 => {
      const t = (j / n) * Math.PI * 2;
      const u = Math.cos(t) * p.a * k;
      const v = Math.sin(t) * p.b * k;
      return [ox + ax[0] * u + ay[0] * v, oy + ax[1] * u + ay[1] * v, z];
    }),
  );
  const top: Vec3 = p.peak ?? [ox, oy, cz + p.h];
  const bot: Vec3 = [ox, oy, cz - 0.5 * p.h];
  const low = rings[0] ?? [];
  const high = rings[rings.length - 1] ?? [];
  const at = (r: readonly Vec3[], i: number): Vec3 => r[i] ?? top;
  const out: [Vec3, Vec3, Vec3, number][] = [];
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    out.push([at(high, k), at(high, k1), top, 1.08]);
    out.push([at(low, k1), at(low, k), bot, 0.82]);
    if (rings.length > 1) {
      out.push([at(low, k), at(low, k1), at(high, k1), 0.96]);
      out.push([at(low, k), at(high, k1), at(high, k), 0.96]);
    }
  }
  return out;
}

/** Flat-shaded pads (three vertices per face, so each keeps its own normal), one mesh. */
export function padMesh(pads: readonly Pad[], o: Pick<PadOptions, 'sides' | 'rings'>): Mesh {
  const mb = new MeshBuilder();
  for (const p of pads)
    for (const [a, b, c, k] of padFaces(p, o)) {
      const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const nz = e1[0] * e2[1] - e1[1] * e2[0];
      const l = Math.hypot(nx, ny, nz) || 1;
      const color: Vec3 = [p.color[0] * k, p.color[1] * k, p.color[2] * k];
      const ids = [a, b, c].map((q) =>
        mb.vertex({ p: q, n: [nx / l, ny / l, nz / l], uv: UV, color }),
      );
      mb.tri(ids[0] ?? 0, ids[1] ?? 0, ids[2] ?? 0);
    }
  return mb.build();
}
