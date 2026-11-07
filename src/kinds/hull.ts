// Vessel hulls from the lines plan (hull-lines.ts): a smooth-shaded shell skinned over stations
// (denser toward bow and stern), split at the waterline and boot-top so the paint bands are crisp,
// optional bulwarks with a cap rail, a cambered plank deck laid in true-scale bands fore and aft,
// and a flat transom. Waterline at `at` z, bow +X. LOD = stations × section points, nothing else.

import {
  type BuildContext,
  type Lod,
  type Mesh,
  MeshBuilder,
  merge,
  translate,
  type Vec3,
} from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { sweep, triangulate } from '../primitives/index.ts';
import { dedupe, stripScale } from './faces.ts';
import { type HullLines, type HullOptions, hullLines, thetaAt } from './hull-lines.ts';
import { emitBand, type Grid, normalsOf } from './hull-skin.ts';

export type { HullColors, HullLines, HullOptions } from './hull-lines.ts';

/** Width of one deck band (one V of the wood strip); LOD2 squeezes the whole beam into one. */
const deckBand = (o: HullOptions, lod: Lod): number => (lod === 2 ? o.beam : stripScale('wood'));

/** Plank deck between the bulwarks: bands `wood` scale wide, planks running fore and aft. */
function deckMesh(o: HullOptions, ln: HullLines, xs: readonly number[], inset: number, lod: Lod) {
  const b = new MeshBuilder();
  const rect = stripRect('wood');
  const w = deckBand(o, lod);
  const camber = o.camber ?? o.beam / 50;
  const yd = (x: number): number => Math.max(0, ln.halfBreadth(x) - inset);
  for (let y0 = -Math.ceil(o.beam / 2 / w) * w; y0 < o.beam / 2; y0 += w) {
    const at = (x: number, y: number): Vec3 => {
      const h = yd(x);
      const c = Math.max(-h, Math.min(h, y));
      return [x, c, ln.deck(x) + (h > 0 ? camber * (1 - (c / h) ** 2) : 0)];
    };
    for (let i = 0; i + 1 < xs.length; i++) {
      const x0 = xs[i] ?? 0;
      const x1 = xs[i + 1] ?? 0;
      const q = [at(x0, y0), at(x0, y0 + w), at(x1, y0 + w), at(x1, y0)];
      if (
        Math.abs((q[1]?.[1] ?? 0) - (q[0]?.[1] ?? 0)) +
          Math.abs((q[2]?.[1] ?? 0) - (q[3]?.[1] ?? 0)) <
        1e-6
      )
        continue;
      const ids = q.map((p) =>
        b.vertex({
          p,
          n: [0, 0, 1],
          uv: [rect.u0 + p[0] / rect.metres, rect.v0 + ((p[1] - y0) / w) * (rect.v1 - rect.v0)],
          color: o.colors.deck,
        }),
      );
      b.quad(ids[0] ?? 0, ids[3] ?? 0, ids[2] ?? 0, ids[1] ?? 0);
    }
  }
  return b.build();
}

export interface HullMesh {
  /** Shell (+ bulwarks + transom). */
  readonly shell: Mesh;
  readonly deck: Mesh;
  readonly lines: HullLines;
}

export function hullMesh(o: HullOptions, lod: Lod = 0): HullMesh {
  const ln = hullLines(o);
  const half = o.length / 2;
  const stations = [36, 18, 8][lod] ?? 8;
  const na = [6, 3, 2][lod] ?? 2;
  const nc = [4, 2, 1][lod] ?? 1;
  // Cosine spacing: stations crowd the bow and stern where the shape turns.
  const xs = Array.from(
    { length: stations + 1 },
    (_, i) => -half + (o.length * (1 - Math.cos((Math.PI * i) / stations))) / 2,
  );
  const boot = o.bootTop ?? 0.3;
  const hb = o.bulwark ?? 0;
  const tb = 0.12;
  const grid: Grid = xs.map((x) => {
    const tw = thetaAt(ln, x, 0);
    const tbt = thetaAt(ln, x, boot);
    const row: Vec3[] = [];
    const seg = (t0: number, t1: number, k: number, first: boolean) => {
      for (let i = first ? 0 : 1; i <= k; i++) {
        const [y, z] = ln.section(x, t0 + ((t1 - t0) * i) / k);
        row.push([x, y, z]);
      }
    };
    seg(0, tw, na, true);
    seg(tw, tbt, 1, false);
    seg(tbt, Math.PI / 2, nc, false);
    return row;
  });
  const nrm = normalsOf(grid);
  for (const row of nrm) {
    const n = row[0];
    if (n) {
      const l = Math.hypot(n[0], n[2]) || 1;
      row[0] = [n[0] / l, 0, n[2] / l];
    }
  }
  const b = new MeshBuilder();
  const c = o.colors;
  emitBand(b, grid, nrm, 0, na, c.bottom, true);
  emitBand(b, grid, nrm, na, na + 1, c.boot ?? [0.06, 0.06, 0.06], true);
  emitBand(b, grid, nrm, na + 1, na + 1 + nc, c.topsides, true);
  const parts = [b.build()];
  if (hb > 0) parts.push(bulwarks(o, ln, xs, hb, tb));
  if (o.fender && lod < 2) parts.push(...fenders(o.fender, ln, xs, lod));
  if ((o.stern ?? 'round') === 'transom') {
    const x = xs[0] ?? -half;
    const star = (grid[0] ?? []).map((p) => p);
    if (hb > 0) star.push([x, ln.halfBreadth(x), ln.deck(x) + hb]);
    const port = [...star].reverse().map((p): Vec3 => [p[0], -p[1], p[2]]);
    // Without bulwarks the transom's top follows the deck camber through the deck's band seams.
    const yd = ln.halfBreadth(x);
    const arc: Vec3[] = [];
    const w = deckBand(o, lod);
    for (let y = Math.ceil(o.beam / 2 / w) * w; y > -o.beam / 2; y -= w) {
      if (hb === 0 && Math.abs(y) < yd - 1e-9)
        arc.push([x, y, ln.deck(x) + (o.camber ?? o.beam / 50) * (1 - (y / yd) ** 2)]);
    }
    parts.push(transom(dedupe([...port.slice(0, -1), ...star, ...arc]), c.topsides));
  }
  const at = o.at ?? [0, 0, 0];
  return {
    shell: translate(merge(parts), at),
    deck: translate(deckMesh(o, ln, xs, hb > 0 ? tb : 0, lod), at),
    lines: ln,
  };
}

/** Bulwark: outer plate up from the deck edge, cap rail, inner face down to the deck. */
function bulwarks(
  o: HullOptions,
  ln: HullLines,
  xs: readonly number[],
  hb: number,
  tb: number,
): Mesh {
  const g: Grid = xs.map((x) => {
    const y = ln.halfBreadth(x);
    const z = ln.deck(x);
    const yi = Math.max(0, y - tb);
    return [
      [x, y, z],
      [x, y, z + hb],
      [x, yi, z + hb],
      [x, yi, z],
    ];
  });
  const b = new MeshBuilder();
  const top = o.colors.bulwark ?? o.colors.topsides;
  // Each face its own band so the corners stay crisp.
  for (const [j0, color] of [
    [0, o.colors.topsides],
    [1, top],
    [2, top],
  ] as const) {
    const sliced = g.map((row) => row.slice(j0, j0 + 2));
    emitBand(b, sliced, normalsOf(sliced), 0, 1, color, true);
  }
  return b.build();
}

/** Rubbing strake / tyre fender along each side just below the sheer. */
function fenders(
  f: NonNullable<HullOptions['fender']>,
  ln: HullLines,
  xs: readonly number[],
  lod: Lod,
) {
  const r = f.radius ?? 0.15;
  return [1, -1].map((side) =>
    sweep({
      section: { radius: r, segments: lod === 0 ? 8 : 5 },
      path: xs.map((x): Vec3 => [x, side * (ln.halfBreadth(x) + r * 0.4), ln.deck(x) - r * 1.2]),
      color: f.color,
      caps: true,
    }),
  );
}

/** Flat stern plate facing −X (ear-clipped: the bulwark notch makes it non-convex). */
function transom(points: readonly Vec3[], color: Vec3): Mesh {
  const b = new MeshBuilder();
  const rect = stripRect('plain');
  const ids = points.map((p) =>
    b.vertex({ p, n: [-1, 0, 0], uv: [rect.u0 + p[1] / rect.metres, rect.v0], color }),
  );
  // CCW in (y, z) faces +X, so each triangle is reversed to face aft.
  for (const [i, j, k] of triangulate(points.map((p) => [p[1], p[2]])))
    b.tri(ids[i] ?? 0, ids[k] ?? 0, ids[j] ?? 0);
  return b.build();
}

/** Add `name` (shell) and `name_deck` parts; returns the lines for placing deckhouses and fittings. */
export function hull(ctx: BuildContext, o: HullOptions & { readonly name?: string }): HullLines {
  const name = o.name ?? 'hull';
  const m = hullMesh(o, ctx.lod);
  ctx.part(name, m.shell);
  ctx.part(`${name}_deck`, m.deck);
  return m.lines;
}
