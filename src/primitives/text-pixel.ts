// Pixel lettering → Mesh for `text` with the built-in 5 × 7 font ('5x7', 'block'): each glyph's
// merged pixel rectangles (text-layout.ts) become flush decals lifted 2 mm (depth 0, 2 triangles
// each) or raised boxes (face + 4 sides, 10 each). Flat normals. With `surface`, rectangles split
// into column groups wherever the offset under them changes and each sits on the highest surface
// under it. Output is byte-identical to text() before vector fonts existed.

import { type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { stripU, stripV } from './strip-uv.ts';
import { layout, type PixelFont, type PixelRect } from './text-layout.ts';

export interface PixelTextInput {
  readonly origin: Vec3;
  readonly along: Vec3;
  readonly up: Vec3;
  /** Facing normal, along × up. */
  readonly n: Vec3;
  readonly height: number;
  readonly depth: number;
  readonly color: Vec3;
  readonly font: PixelFont;
  readonly tracking: number;
  readonly align?: 'left' | 'centre' | 'right' | undefined;
  readonly surface?: ((u: number, v: number) => number) | undefined;
  readonly strip?: Parameters<typeof stripRect>[0] | undefined;
}

const LIFT = 0.002;

export function pixelText(str: string, o: PixelTextInput): Mesh {
  const { height, depth, font, tracking, along, up, n } = o;
  const px = height / 7;
  const { rects, width } = layout(str, font, tracking);
  const start = o.align === 'centre' ? (-width * px) / 2 : o.align === 'right' ? -width * px : 0;
  const rect = stripRect(o.strip ?? 'plain');
  const b = new MeshBuilder();
  const at = (u: number, v: number, w: number): Vec3 => [
    o.origin[0] + along[0] * u + up[0] * v + n[0] * w,
    o.origin[1] + along[1] * u + up[1] * v + n[1] * w,
    o.origin[2] + along[2] * u + up[2] * v + n[2] * w,
  ];
  /** Quad u0..u1 × v0..v1 at offsets w (per corner), facing `nrm`, CCW from that side. */
  const quad = (
    c: readonly Vec3[],
    nrm: Vec3,
    us: readonly number[],
    vs: readonly number[],
  ): void => {
    const ids = c.map((p, i) =>
      b.vertex({
        p,
        n: nrm,
        uv: [
          stripU(rect, us[i] ?? 0),
          stripV(rect, Math.min(1, Math.max(0, (vs[i] ?? 0) / height))),
        ],
        color: o.color,
      }),
    );
    const [a = n, e = n, f = n] = c;
    const g = [0, 1, 2].map((j) => {
      const [x, y] = [(j + 1) % 3, (j + 2) % 3];
      return (
        ((e[x] ?? 0) - (a[x] ?? 0)) * ((f[y] ?? 0) - (a[y] ?? 0)) -
        ((e[y] ?? 0) - (a[y] ?? 0)) * ((f[x] ?? 0) - (a[x] ?? 0))
      );
    });
    const [i0 = 0, i1 = 0, i2 = 0, i3 = 0] = ids;
    if ((g[0] ?? 0) * nrm[0] + (g[1] ?? 0) * nrm[1] + (g[2] ?? 0) * nrm[2] >= 0)
      b.quad(i0, i1, i2, i3);
    else b.quad(i0, i3, i2, i1);
  };
  const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
  for (const piece of pieces(rects, px, start, o.surface)) {
    const { u0, u1, v0, v1, s } = piece;
    const lo = depth > 0 ? s : s + LIFT;
    const hi = depth > 0 ? s + depth : lo;
    quad(
      [at(u0, v0, hi), at(u1, v0, hi), at(u1, v1, hi), at(u0, v1, hi)],
      n,
      [u0, u1, u1, u0],
      [v0, v0, v1, v1],
    );
    if (depth <= 0) continue;
    // Sides: bottom, right, top, left.
    quad(
      [at(u0, v0, lo), at(u1, v0, lo), at(u1, v0, hi), at(u0, v0, hi)],
      neg(up),
      [u0, u1, u1, u0],
      [0, 0, depth, depth],
    );
    quad(
      [at(u1, v0, lo), at(u1, v1, lo), at(u1, v1, hi), at(u1, v0, hi)],
      along,
      [v0, v1, v1, v0],
      [0, 0, depth, depth],
    );
    quad(
      [at(u1, v1, lo), at(u0, v1, lo), at(u0, v1, hi), at(u1, v1, hi)],
      up,
      [u1, u0, u0, u1],
      [0, 0, depth, depth],
    );
    quad(
      [at(u0, v1, lo), at(u0, v0, lo), at(u0, v0, hi), at(u0, v1, hi)],
      neg(along),
      [v1, v0, v0, v1],
      [0, 0, depth, depth],
    );
  }
  return b.build();
}

interface Piece {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
  /** Surface offset under this piece. */
  readonly s: number;
}

/** Rects in metres, split into column groups wherever the surface offset changes. */
function pieces(
  rects: readonly PixelRect[],
  px: number,
  start: number,
  surface?: (u: number, v: number) => number,
): Piece[] {
  const out: Piece[] = [];
  for (const r of rects) {
    const v0 = (7 - r.r1) * px;
    const v1 = (7 - r.r0) * px;
    if (!surface) {
      out.push({ u0: start + r.c0 * px, u1: start + r.c1 * px, v0, v1, s: 0 });
      continue;
    }
    // Each column sits on the highest surface anywhere under it (edges and centre, both ways),
    // so a pixel half over a post is lifted onto the post, not buried in it.
    const lift = (c: number): number => {
      let top = Number.NEGATIVE_INFINITY;
      for (const fu of [0.02, 0.5, 0.98])
        for (const v of [v0 + 0.02 * px, (v0 + v1) / 2, v1 - 0.02 * px])
          top = Math.max(top, surface(start + (c + fu) * px, v));
      return top;
    };
    let c = r.c0;
    while (c < r.c1) {
      const s = lift(c);
      let e = c + 1;
      while (e < r.c1 && Math.abs(lift(e) - s) < 1e-6) e++;
      out.push({ u0: start + c * px, u1: start + e * px, v0, v1, s });
      c = e;
    }
  }
  return out;
}
