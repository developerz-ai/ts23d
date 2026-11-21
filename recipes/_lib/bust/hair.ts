// Stylised hair as sculpted LOCKS, shared by the busts: a hair mass (the skull pushed out by a
// thickness inside a hairline), then clumps that taper, overlap and follow the skull along flow
// lines, with grooves between them and finer strands at the hairline. Each lock is toned root →
// tip (dark roots and undersides, lighter tips) by colour segments that blend along it.
// The far LODs' hair is measured here too (D585–D589): how far the cards stand off everything
// under them (`cardStandoff`), and what a look from outside meets over the hairline (`hairLook`:
// the share of it on the cards, its mean colour), so LOD1/LOD2 hair can be held to LOD0's.

import { dmath, type Field, type Part, type SculptEdit } from '@developerz.ai/ts23d';
import { distTo } from '../face/mesh-distance.ts';
import { chain, clayOn, cross, norm, type Surface, sub, taper, type V } from './kit.ts';

export const mix = (a: V, b: V, t: number): V => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** One free lock: a tapered chain along `pts`, coloured root → tip in `seg` blended segments. */
export function lock(
  pts: readonly V[],
  r0: number,
  r1: number,
  root: V,
  tip: V,
  o: { readonly belly?: number; readonly seg?: number; readonly mirror?: boolean } = {},
): SculptEdit[] {
  const n = pts.length;
  const seg = o.seg ?? 3;
  const radii = taper(n, r0, r1, o.belly ?? 0);
  const out: SculptEdit[] = [];
  const per = Math.ceil((n - 1) / seg);
  for (let s = 0; s < seg; s++) {
    const a = s * per;
    const b = Math.min(n - 1, a + per);
    if (b <= a) break;
    const t = (s + 0.5) / seg;
    out.push(
      chain(pts.slice(a, b + 1), radii.slice(a, b + 1), {
        color: mix(root, tip, t * t),
        blend: r0 * 0.5,
        join: r0 * 0.2,
        ...(o.mirror === undefined ? {} : { mirror: o.mirror }),
      }),
    );
  }
  return out;
}

/**
 * A flat ribbon lock (a front strand falling past the face): `strands` parallel locks side by side
 * across `width`, their faces turned to `facing`, merged into one band that reads as a lock with
 * strand grooves — volume and a flat face, not a wire. Width and thickness taper root → tip.
 */
export function ribbon(
  pts: readonly V[],
  facing: V,
  width: readonly [number, number],
  thick: readonly [number, number],
  root: V,
  tip: V,
  o: { readonly strands?: number; readonly mirror?: boolean } = {},
): SculptEdit[] {
  const n = pts.length;
  const k = o.strands ?? 3;
  const out: SculptEdit[] = [];
  for (let j = 0; j < k; j++) {
    const off = k === 1 ? 0 : j / (k - 1) - 0.5;
    const line = pts.map((p, i): V => {
      const a = pts[Math.max(0, i - 1)] ?? p;
      const b = pts[Math.min(n - 1, i + 1)] ?? p;
      const side = norm(cross(sub(b, a), facing));
      const t = i / Math.max(1, n - 1);
      const w = width[0] + (width[1] - width[0]) * t;
      return [p[0] + side[0] * w * off, p[1] + side[1] * w * off, p[2] + side[2] * w * off];
    });
    // Outer strands a touch thinner, so the band's section is a flat lens.
    const edge = 1 - 0.35 * Math.abs(off) * 2;
    out.push(
      ...lock(line, thick[0] * edge, thick[1] * edge, root, tip, {
        belly: thick[0] * 0.15,
        ...(o.mirror === undefined ? {} : { mirror: o.mirror }),
      }),
    );
  }
  return out;
}

/** The hair mass: the scalp pushed out by `thick` (metres, or a field of it: a far LOD's hair
 *  shell is thicker where the near LODs' locks stand higher), inside the hairline `region` (≤ 0),
 *  the thickness easing to zero over `fade` metres at the hairline so the hair grows out of the
 *  skin instead of sitting on it like a cap. Added into the skin sculpt (one surface, no seam). */
export function hairMass(
  scalp: Field,
  thick: number | Field,
  region: Field,
  bounds: readonly [V, V],
  color: V,
  fade = 0.012,
): SculptEdit {
  const h: Field = typeof thick === 'number' ? () => thick : thick;
  return {
    field: (p) => {
      const r = region(p);
      if (r > 0) return Math.max(scalp(p), r);
      const t = Math.min(1, -r / fade);
      const w = t * t * (3 - 2 * t);
      return scalp(p) - h(p) * w - 0.0004;
    },
    bounds,
    color,
    blend: 0.002,
  };
}

/** Locks lying ON a hair mass along flow lines (equal point counts): a raised clump per line
 *  (spaced about a clump apart, so the mass reads as separate overlapping locks). */
export function flowLocks(
  hair: Surface,
  lines: readonly (readonly V[])[],
  r: number,
  o: { readonly root: V; readonly tip: V; readonly mirror?: boolean },
): SculptEdit[] {
  const out: SculptEdit[] = [];
  const m = o.mirror === undefined ? {} : { mirror: o.mirror };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? [];
    const n = Math.max(6, line.length * 4);
    out.push(
      clayOn(hair, line, r, r * 0.9, { n, blend: r * 0.35, color: mix(o.root, o.tip, 0.6), ...m }),
    );
    // The valley between neighbours is left to the clumps' own fillets and the cavity tone: a
    // carved groove cut holes where the mass is thin.
  }
  return out;
}

/** What the hair measures read of a compiled asset (a test may hand-build it). */
export interface PartsOf {
  readonly parts: readonly Pick<Part, 'name' | 'mesh' | 'at'>[];
}

/** World positions, colours and triangles of the parts `keep` names, one flat soup. */
function soup(asset: PartsOf, keep: (name: string) => boolean): Mesh3 {
  const P: number[] = [];
  const T: number[] = [];
  const C: number[] = [];
  const owner: string[] = [];
  for (const part of asset.parts) {
    const m = part.mesh;
    if (!m || !keep(part.name)) continue;
    const base = P.length / 3;
    for (let i = 0; i < m.positions.length; i++)
      P.push((m.positions[i] ?? 0) + (part.at[i % 3] ?? 0));
    for (let i = 0; i < m.positions.length; i++) C.push(m.colors[i] ?? 0);
    for (let i = 0; i < m.indices.length; i += 3) {
      T.push(
        base + (m.indices[i] ?? 0),
        base + (m.indices[i + 1] ?? 0),
        base + (m.indices[i + 2] ?? 0),
      );
      owner.push(part.name);
    }
  }
  return { P: Float32Array.from(P), T: Uint32Array.from(T), C: Float32Array.from(C), owner };
}

interface Mesh3 {
  readonly P: Float32Array;
  readonly T: Uint32Array;
  readonly C: Float32Array;
  /** The part each triangle came from. */
  readonly owner: readonly string[];
}

/** Each card vertex's distance (m, ascending) from every other part but the eyes: skin, hair
 *  shell, clothes. A card lying on the hair is a few mm off it; a shard standing off is cm. */
export function cardStandoff(asset: PartsOf, part = 'hair'): number[] {
  const hair = soup(asset, (n) => n === part);
  const under = soup(asset, (n) => n !== part && !n.startsWith('eye'));
  const { P, T } = under;
  const out: number[] = [];
  for (let i = 0; i < hair.P.length; i += 3) {
    const x = hair.P[i] ?? 0;
    const y = hair.P[i + 1] ?? 0;
    const z = hair.P[i + 2] ?? 0;
    let best = Number.POSITIVE_INFINITY;
    for (let t = 0; t < T.length; t += 3) {
      const a = (T[t] ?? 0) * 3;
      const b = (T[t + 1] ?? 0) * 3;
      const c = (T[t + 2] ?? 0) * 3;
      // Skip a triangle whose box is farther than the best so far on any axis.
      let far = false;
      for (let k = 0; k < 3 && !far; k++) {
        const q = k === 0 ? x : k === 1 ? y : z;
        const lo = Math.min(P[a + k] ?? 0, P[b + k] ?? 0, P[c + k] ?? 0);
        const hi = Math.max(P[a + k] ?? 0, P[b + k] ?? 0, P[c + k] ?? 0);
        far = q < lo - best || q > hi + best;
      }
      if (!far) best = Math.min(best, distTo(P, T, t, x, y, z));
    }
    out.push(best);
  }
  return out.sort((a, b) => a - b);
}

/** The value at share `q` (0 … 1) of an ascending list. */
export const quantile = (xs: readonly number[], q: number): number =>
  xs[Math.min(xs.length - 1, Math.max(0, Math.floor(q * (xs.length - 1))))] ?? 0;

export interface HairLook {
  /** Rays whose first hit lies inside the hairline. */
  readonly rays: number;
  /** Share of those that hit a card (the rest meet the painted shell or bare skin). */
  readonly cards: number;
  /** Mean linear vertex colour they meet (cards and shell alike). */
  readonly color: V;
}

/**
 * Look at the hair from outside: `rays` directions spread evenly over the sphere round `centre`
 * (none from under the chin: z > −0.3), each cast from 0.6 m out back toward it; the first hit
 * on any part but the eyes counts when it lies inside `line` (≤ −2 mm). Cut-out texels count as
 * card (the measure is coverage by geometry; the cards' alpha is the sheet's business).
 */
export function hairLook(
  asset: PartsOf,
  o: { readonly centre: V; readonly line: Field; readonly part?: string; readonly rays?: number },
): HairLook {
  const s = soup(asset, (n) => !n.startsWith('eye'));
  const part = o.part ?? 'hair';
  const n = o.rays ?? 600;
  let rays = 0;
  let cards = 0;
  const sum = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    // Fibonacci sphere: an even spread with no RNG.
    const z = 1 - (2 * (i + 0.5)) / n;
    if (z < -0.3) continue;
    const r = Math.sqrt(1 - z * z);
    const a = i * 2.399963229728653;
    const d: V = [r * dmath.cos(a), r * dmath.sin(a), z];
    const hit = firstHit(
      s,
      [o.centre[0] + d[0] * 0.6, o.centre[1] + d[1] * 0.6, o.centre[2] + d[2] * 0.6],
      [-d[0], -d[1], -d[2]],
    );
    if (!hit || o.line(hit.p) > -0.002) continue;
    rays++;
    if (s.owner[hit.t / 3] === part) cards++;
    for (let k = 0; k < 3; k++) sum[k] = (sum[k] ?? 0) + (hit.c[k] ?? 0);
  }
  const m = Math.max(1, rays);
  return {
    rays,
    cards: cards / m,
    color: [(sum[0] ?? 0) / m, (sum[1] ?? 0) / m, (sum[2] ?? 0) / m],
  };
}

/** Nearest triangle along the ray o + t·d (Möller–Trumbore): its index, point and colour. */
function firstHit(s: Mesh3, o: V, d: V): { t: number; p: V; c: V } | null {
  const { P, T, C } = s;
  let best = Number.POSITIVE_INFINITY;
  let hit: { t: number; p: V; c: V } | null = null;
  for (let t = 0; t < T.length; t += 3) {
    const ia = (T[t] ?? 0) * 3;
    const ib = (T[t + 1] ?? 0) * 3;
    const ic = (T[t + 2] ?? 0) * 3;
    const A: V = [P[ia] ?? 0, P[ia + 1] ?? 0, P[ia + 2] ?? 0];
    const e1 = sub([P[ib] ?? 0, P[ib + 1] ?? 0, P[ib + 2] ?? 0], A);
    const e2 = sub([P[ic] ?? 0, P[ic + 1] ?? 0, P[ic + 2] ?? 0], A);
    const h = cross(d, e2);
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det;
    const sv = sub(o, A);
    const u = f * (sv[0] * h[0] + sv[1] * h[1] + sv[2] * h[2]);
    if (u < 0 || u > 1) continue;
    const q = cross(sv, e1);
    const v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]);
    if (v < 0 || u + v > 1) continue;
    const dist = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
    if (dist <= 0 || dist >= best) continue;
    best = dist;
    const w = 1 - u - v;
    const col = (k: number): number =>
      w * (C[ia + k] ?? 0) + u * (C[ib + k] ?? 0) + v * (C[ic + k] ?? 0);
    hit = {
      t,
      p: [o[0] + d[0] * dist, o[1] + d[1] * dist, o[2] + d[2] * dist],
      c: [col(0), col(1), col(2)],
    };
  }
  return hit;
}
