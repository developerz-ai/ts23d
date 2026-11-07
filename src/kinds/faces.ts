// Convex-polygon toolkit for the building kinds: half-plane clipping in plan, and emitting a flat
// convex 3D polygon onto a trim strip AT TRUE SCALE. A strip tiles along U only, so the polygon is
// cut into bands `scaleMetres` tall along its V direction (courses start on `vOrigin`); each band
// maps V 0→1 across the strip. That is how slates run down a slope and bricks up a gable.

import {
  cross,
  dot,
  type MeshBuilder,
  normalize,
  sub,
  type Vec2,
  type Vec3,
} from '../core/index.ts';
import { DEFAULT_SHEET, type StripId, stripRect } from '../material/index.ts';

const EPS = 1e-9;

/** Keep the part of a convex polygon where the linear function `f` is ≤ 0. */
export function clipPoly<P extends Vec2 | Vec3>(poly: readonly P[], f: (p: P) => number): P[] {
  const out: P[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    const fa = f(a);
    const fb = f(b);
    if (fa <= EPS) out.push(a);
    if (fa <= EPS !== fb <= EPS) {
      const t = fa / (fa - fb);
      out.push(a.map((v, k) => v + ((b[k] ?? v) - v) * t) as unknown as P);
    }
  }
  return dedupe(out);
}

/** Drop consecutive duplicate points (clipping through a vertex emits it twice). */
export function dedupe<P extends Vec2 | Vec3>(poly: readonly P[]): P[] {
  const out: P[] = [];
  for (const p of poly) {
    const q = out.at(-1);
    if (!q || p.some((v, k) => Math.abs(v - (q[k] ?? 0)) > 1e-7)) out.push(p);
  }
  const first = out[0];
  const last = out.at(-1);
  if (out.length > 1 && first && last && first.every((v, k) => Math.abs(v - (last[k] ?? 0)) < 1e-7))
    out.pop();
  return out;
}

/** Signed area of a 2D polygon (CCW positive). */
export const area2 = (poly: readonly Vec2[]): number =>
  poly.reduce((s, a, i) => {
    const b = poly[(i + 1) % poly.length] ?? a;
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;

/** Vertical extent of one band (one full V of the strip) in metres, from the house sheet. */
export const stripScale = (strip: StripId): number => DEFAULT_SHEET.strips[strip]?.scaleMetres ?? 1;

export interface FaceOptions {
  /** Convex and planar; either winding (it is turned to face `normal`). */
  readonly points: readonly Vec3[];
  readonly normal: Vec3;
  /** Direction V grows along (up a slope, up a wall); projected into the face plane. */
  readonly up: Vec3;
  /** A point on the line where courses start (eave, wall foot). */
  readonly vOrigin: Vec3;
  readonly color: Vec3 | ((p: Vec3) => Vec3);
  readonly strip: StripId;
  /** false: one polygon, V squeezed over the whole face (far LODs). Default true. */
  readonly banded?: boolean;
}

/** Emit a convex face into `b`, banded at the strip's true scale. Returns triangles added. */
export function emitFace(b: MeshBuilder, o: FaceOptions): number {
  if (o.points.length < 3) return 0;
  const n = normalize(o.normal);
  const points = dot(newell(o.points), n) < 0 ? [...o.points].reverse() : o.points;
  const vDir = normalize(sub(o.up, scaleV(n, dot(o.up, n))));
  const uDir = cross(vDir, n);
  const rect = stripRect(o.strip);
  const scale = stripScale(o.strip);
  const vOf = (p: Vec3): number => dot(sub(p, o.vOrigin), vDir);
  const vs = points.map(vOf);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  if (hi - lo < 1e-6) return 0;
  const colour = (p: Vec3): Vec3 => (typeof o.color === 'function' ? o.color(p) : o.color);
  const bands: [number, number][] = [];
  if (o.banded === false) bands.push([lo, hi]);
  else {
    for (let k = Math.floor(lo / scale + 1e-9); k * scale < hi - 1e-9; k++) {
      bands.push([k * scale, (k + 1) * scale]);
    }
  }
  let tris = 0;
  for (const [v0, v1] of bands) {
    const span = v1 - v0;
    const poly = clipPoly(
      clipPoly(points, (p) => v0 - vOf(p)),
      (p) => vOf(p) - v1,
    );
    if (poly.length < 3) continue;
    const ids = poly.map((p) => {
      const f = Math.min(1, Math.max(0, (vOf(p) - v0) / span));
      return b.vertex({
        p,
        n,
        uv: [
          rect.u0 + (dot(p, uDir) / rect.metres) * (rect.u1 - rect.u0),
          rect.v0 + f * (rect.v1 - rect.v0),
        ],
        color: colour(p),
      });
    });
    const first = ids[0] ?? 0;
    for (let i = 1; i + 1 < ids.length; i++) b.tri(first, ids[i] ?? 0, ids[i + 1] ?? 0);
    tris += ids.length - 2;
  }
  return tris;
}

/** Newell's polygon normal (unnormalised): robust for any planar polygon. */
export function newell(poly: readonly Vec3[]): Vec3 {
  const n: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] ?? [0, 0, 0];
    const b = poly[(i + 1) % poly.length] ?? a;
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

const scaleV = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
