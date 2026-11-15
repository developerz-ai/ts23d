// Hair and fur cards: alpha-cutout strand strips rooted on a mesh and laid along its flow field.
// Roots are Poisson-disk samples per zone (dart throwing in shuffled order with `rng`, radius from
// the local density), each card a bent strip of `segments` quads: it leaves the skin at `lift`,
// lies down toward the tip (`bend`), droops with gravity, rolls about its own axis so the outline
// shows width, and starts `sink` below the surface so the root is buried. With a `field` (the
// body's SDF) each step follows the surface curvature and never dips under it; a `collide` field
// (the whole head or body) keeps free-hanging lengths out of faces and ears. `clump` cards share
// a tip: each card bends toward its clump leader's tip (Poisson roots: hair-roots.ts). Colour from
// the skin under the root (root → tip tone), UVs from the zone's strand-atlas cells
// (material/strands.ts).
// Vertices 0 and 1 of every card straddle its buried root (QA `cardRoots` reads it back).

import {
  cross,
  dot,
  type Mesh,
  MeshBuilder,
  type Rng,
  sub,
  Ts23dError,
  normalize as unit,
  type Vec3,
} from '../core/index.ts';
import type { UvRect } from '../material/index.ts';
import { flowAt, tangentOf } from './hair-flow.ts';
import { clumpOf, mad, poissonRoots, type Root, sample } from './hair-roots.ts';

export interface CardZone {
  readonly name: string;
  /** Cards per m² of surface at p (≤ 0 = none). */
  readonly density: (p: Vec3, n: Vec3) => number;
  /** Card length, metres (root to tip, above the skin). */
  readonly length: number | ((p: Vec3, n: Vec3) => number);
  /** Card width at the root, metres. */
  readonly width: number;
  /** Radians off the skin at the root (default 0.35) · share of it lost by the tip (default 0.7). */
  readonly lift?: number;
  readonly bend?: number;
  /** Downward pull by the tip, 0..1 (default 0.15). */
  readonly droop?: number;
  /** Max roll about the strand axis, radians (default 0.6). */
  readonly roll?: number;
  /** Root depth below the surface, metres (default 0.003). */
  readonly sink?: number;
  /** ± share of length variation (default 0.25). */
  readonly jitter?: number;
  /** Strand-atlas cells to pick from (`strandCells`). */
  readonly cells: readonly UvRect[];
  /** Tone multiplier at root and tip (default [0.75, 1.05]). */
  readonly tone?: readonly [number, number];
  /** Recolour a card from its root point and the skin colour there. */
  readonly color?: (p: Vec3, skin: Vec3) => Vec3;
  /** Cards per clump sharing one tip (3–7 for guard hair and locks; default 1 = none). */
  readonly clump?: number;
}

export interface HairCardOptions {
  /** Mesh the roots grow from (its normals and colours are read). */
  readonly surface: Mesh;
  /** Per-vertex flow of `surface` (`hairFlow`). */
  readonly flow: Float32Array;
  readonly zones: readonly CardZone[];
  readonly rng: Rng;
  /** Quads along each card (default 3). */
  readonly segments?: number;
  /** Signed distance of the surface (negative inside): cards follow it and stay out of it. */
  readonly field?: (p: Vec3) => number;
  /** Refuse more cards than this (default 20000). */
  readonly maxCards?: number;
  /** A solid the cards must stay out of beyond the root (negative inside): face, ears, torso. */
  readonly collide?: (p: Vec3) => number;
}

export interface HairCards {
  readonly mesh: Mesh;
  /** Buried root of every card, in emission order. */
  readonly roots: readonly Vec3[];
  readonly counts: Readonly<Record<string, number>>;
}

const gradient = (f: (p: Vec3) => number, p: Vec3, h: number): Vec3 =>
  unit([
    f([p[0] + h, p[1], p[2]]) - f([p[0] - h, p[1], p[2]]),
    f([p[0], p[1] + h, p[2]]) - f([p[0], p[1] - h, p[2]]),
    f([p[0], p[1], p[2] + h]) - f([p[0], p[1], p[2] - h]),
  ]);

/** Newton steps onto the field's zero set, then `sink` under it (fields need not be exact SDFs). */
function bury(f: (p: Vec3) => number, p: Vec3, sink: number, h: number): Vec3 {
  let q = p;
  for (let i = 0; i < 4; i++) q = mad(q, gradient(f, q, h), -(f(q) + (i < 2 ? 0 : sink)));
  // Thin features (toes, ear rims) can throw Newton far: then trust the mesh normal instead.
  const moved = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  return moved > 3 * sink + 2 * h ? mad(p, gradient(f, p, h), -sink) : q;
}

interface Path {
  readonly pts: Vec3[];
  readonly nrm: Vec3[];
  readonly dirs: Vec3[];
  readonly roll: number;
  readonly cell: UvRect | undefined;
  readonly colour: Vec3;
}

/** One card's centre line: root buried, then `segments` steps along the combed, lifted flow. */
function path(o: HairCardOptions, z: CardZone, r: Root, rng: Rng): Path {
  const segs = o.segments ?? 3;
  const s0 = sample(o.surface, r.t, r.b1, r.b2);
  const n0 = s0.n;
  const sink = z.sink ?? 0.003;
  const L0 = typeof z.length === 'number' ? z.length : z.length(s0.p, n0);
  const len = L0 * (1 + (z.jitter ?? 0.25) * (rng.next() * 2 - 1));
  const lift = (z.lift ?? 0.35) * (0.7 + 0.6 * rng.next());
  const bend = z.bend ?? 0.7;
  const droop = z.droop ?? 0.15;
  const roll = (z.roll ?? 0.6) * (rng.next() * 2 - 1);
  const cell = z.cells[Math.floor(rng.next() * z.cells.length)] ?? z.cells[0];
  const f = o.field;
  const h = Math.max(1e-4, z.width * 0.25);
  let d: Vec3 = tangentOf(flowAt(o.surface, o.flow, r.t, r.b1, r.b2), n0);
  // With a field the root is buried below the true surface, not the (faceted) mesh.
  const pts: Vec3[] = [f ? bury(f, s0.p, sink, h) : mad(s0.p, n0, -sink)];
  const nrm: Vec3[] = [n0];
  const dirs: Vec3[] = [];
  for (let k = 1; k <= segs; k++) {
    const s = (k - 1) / segs;
    const p = pts[k - 1] ?? s0.p;
    const n = f ? gradient(f, p, h) : n0;
    const a = lift * (1 - bend * s);
    const t = tangentOf(d, n);
    d = unit([
      t[0] * Math.cos(a) + n[0] * Math.sin(a),
      t[1] * Math.cos(a) + n[1] * Math.sin(a),
      t[2] * Math.cos(a) + n[2] * Math.sin(a) - droop * s,
    ]);
    let q = mad(p, d, len / segs + (k === 1 ? sink : 0));
    // Never under the skin past the root: lift a dipping step back out along the normal.
    const floor = z.width * 0.15 * (k / segs);
    const dist = f ? f(q) : floor;
    if (dist < floor) q = mad(q, f ? gradient(f, q, h) : n, floor - dist);
    q = clear(o.collide, q, floor, h);
    dirs.push(d);
    pts.push(q);
    nrm.push(f ? gradient(f, q, h) : n0);
  }
  const tone = z.tone ?? [0.75, 1.05];
  // Per-card value jitter (±12 %): neighbouring clumps never share one flat colour.
  const vary = 1 + 0.12 * (rng.next() * 2 - 1);
  const skin = z.color ? z.color(s0.p, s0.c) : s0.c;
  const g = ((tone[0] + tone[1]) / 2) * vary;
  return { pts, nrm, dirs, roll, cell, colour: [skin[0] * g, skin[1] * g, skin[2] * g] };
}

/** Push p out of a collision solid to `gap` beyond its surface. */
function clear(c: ((p: Vec3) => number) | undefined, p: Vec3, gap: number, h: number): Vec3 {
  if (!c) return p;
  const d = c(p);
  return d < gap ? mad(p, gradient(c, p, h), gap - d) : p;
}

/** Bend a clump member's free length toward its leader's tip (s² falloff from the root). */
function gather(m: Path, lead: Path, pull: number, o: HairCardOptions, h: number): Path {
  const n = m.pts.length - 1;
  const a = m.pts[n] ?? [0, 0, 0];
  const b = lead.pts[n] ?? a;
  const pts = m.pts.map((p, k) => {
    const w = pull * (k / n) ** 2;
    return k === 0 ? p : clear(o.collide, mad(p, sub(b, a), w), 0, h);
  });
  return { ...m, pts };
}

function emit(b: MeshBuilder, z: CardZone, c: Path): Vec3 {
  const segs = c.pts.length - 1;
  const tone = z.tone ?? [0.75, 1.05];
  const mid = (tone[0] + tone[1]) / 2;
  let flip = false;
  let base = -1;
  for (let k = 0; k <= segs; k++) {
    const s = k / segs;
    const p = c.pts[k] ?? [0, 0, 0];
    const dk = unit(sub(c.pts[Math.min(segs, k + 1)] ?? p, c.pts[Math.max(0, k - 1)] ?? p));
    const n = c.nrm[k] ?? [0, 0, 1];
    const side0 = unit(cross(n, dk));
    const side = unit(
      mad(mad([0, 0, 0], side0, Math.cos(c.roll)), cross(dk, side0), Math.sin(c.roll)),
    );
    let nc = unit(cross(side, dk));
    if (k === 0) flip = dot(nc, n) < 0;
    if (flip) nc = [-nc[0], -nc[1], -nc[2]];
    const vn = unit(mad(mad([0, 0, 0], n, 0.7), nc, 0.3));
    const w = (z.width * (1 - 0.5 * s)) / 2;
    const g = (tone[0] + (tone[1] - tone[0]) * s) / mid;
    const col: Vec3 = [c.colour[0] * g, c.colour[1] * g, c.colour[2] * g];
    const u = (c.cell?.u0 ?? 0) + s * ((c.cell?.u1 ?? 0) - (c.cell?.u0 ?? 0));
    const l = b.vertex({ p: mad(p, side, -w), n: vn, uv: [u, c.cell?.v0 ?? 0], color: col });
    if (base < 0) base = l;
    b.vertex({ p: mad(p, side, w), n: vn, uv: [u, c.cell?.v1 ?? 0], color: col });
  }
  for (let k = 0; k < segs; k++) {
    const [l0, r0, l1, r1] = [base + 2 * k, base + 2 * k + 1, base + 2 * k + 2, base + 2 * k + 3];
    if (flip) b.quad(l0, l1, r1, r0);
    else b.quad(l0, r0, r1, l1);
  }
  return c.pts[0] ?? [0, 0, 0];
}

/** Cards for every zone over `surface`; throws when a zone has no cells or too many cards. */
export function hairCards(o: HairCardOptions): HairCards {
  const segs = o.segments ?? 3;
  if (!(Number.isInteger(segs) && segs >= 1 && segs <= 12))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `hairCards: segments ${segs}`,
      fix: 'segments is a whole number 1..12 (LOD0 3–4, LOD1 2)',
    });
  if (o.flow.length !== o.surface.positions.length)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `hairCards: flow has ${o.flow.length / 3} directions for ${o.surface.positions.length / 3} vertices`,
      fix: 'compute the flow on the same mesh: hairFlow(surface, seed)',
    });
  const picked = o.zones.map((z) => {
    if (z.cells.length === 0 || !(z.width > 0))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `hairCards: zone '${z.name}' has ${z.cells.length} atlas cells, width ${z.width}`,
        fix: 'give each zone strandCells(strip, kind) and a card width > 0 (metres)',
      });
    return { z, list: poissonRoots(o.surface, z.density, o.rng.fork(`roots:${z.name}`)) };
  });
  const total = picked.reduce((s, x) => s + x.list.length, 0);
  const cap = o.maxCards ?? 20000;
  if (total > cap)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `hairCards: ${total} cards, cap ${cap}`,
      fix: 'lower the zone densities (cards per m²) or raise maxCards with a measured reason',
    });
  const b = new MeshBuilder();
  const out: Vec3[] = [];
  const counts: Record<string, number> = {};
  for (const { z, list } of picked) {
    const rng = o.rng.fork(`cards:${z.name}`);
    const paths = list.map((r) => path(o, z, r, rng));
    const lead = clumpOf(list, z.clump ?? 1, z.width * 3);
    paths.forEach((c, i) => {
      const l = lead[i] ?? i;
      const g = l === i ? c : gather(c, paths[l] ?? c, 0.75, o, Math.max(1e-4, z.width * 0.25));
      out.push(emit(b, z, g));
    });
    counts[z.name] = (counts[z.name] ?? 0) + list.length;
  }
  return { mesh: b.build(), roots: out, counts };
}
