// Hair and fur cards: alpha-cutout strand strips rooted on a mesh and laid along its flow field.
// Roots are Poisson-disk samples per zone (dart throwing in shuffled order with `rng`, radius from
// the local density), each card a bent strip of `segments` quads: it leaves the skin at `lift`,
// lies down toward the tip (`bend`), droops with gravity, rolls about its own axis so the outline
// shows width, and starts `sink` below the surface so the root is buried. With a `field` (the
// body's SDF) each step follows the surface while on it (`hug` presses it down where the skin
// holds hair up), hangs free once 1 cm clear, and never dips under it; a `collide` field (the
// whole head or body) keeps free-hanging lengths out of faces and ears. `clump` cards share a tip;
// every line is then settled (hair-strand.ts) so no push-out leaves a kink. A card's width is
// carried along it (no twist), optionally folded into a V section (`fold`), coloured from the
// skin under the root (root → tip tone, `tint` hue shift), UVs from the zone's strand-atlas cells
// (material/strands.ts). Vertices 0 and 1 of every card straddle its buried root (QA `cardRoots`).

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
import { grown } from './hair-length.ts';
import {
  bury,
  clear,
  clumpOf,
  gradient,
  mad,
  overCap,
  poissonRoots,
  type Root,
  sample,
} from './hair-roots.ts';
import { gather, lie, settle } from './hair-strand.ts';

export interface CardZone {
  readonly name: string;
  /** Cards per m² of surface at p (≤ 0 = none). */
  readonly density: (p: Vec3, n: Vec3) => number;
  /** Card length, metres (root to tip, above the skin), finite and ≥ 0. A root where it is under
   *  a tenth of `width` grows no card. */
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
  /** V/C section: the card's centre line raised `fold` × its half-width off the side edges, so
   *  the card reads as a curved lock, not a flat ribbon (0 = flat, 2 tris per segment; > 0 = 4). */
  readonly fold?: number;
  /** Hue shift by the tip: the colour is multiplied by this at the tip (root × 1), e.g. sun-lightened. */
  readonly tint?: Vec3;
  /** 0..1: how hard the card lies on the `field` where the skin holds it up (faces up or sideways):
   *  combed hair stays on the head instead of shooting off its curve; where the skin turns under
   *  (below the occiput, under a belly) it hangs free. Default 0. */
  readonly hug?: number;
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

interface Path {
  readonly pts: Vec3[];
  readonly nrm: Vec3[];
  readonly dirs: Vec3[];
  readonly roll: number;
  readonly cell: UvRect | undefined;
  readonly colour: Vec3;
}

/** One card's centre line: root buried, then `segments` steps along the combed, lifted flow. */
function path(o: HairCardOptions, z: CardZone, r: Root, L0: number, rng: Rng): Path {
  const segs = o.segments ?? 3;
  const s0 = sample(o.surface, r.t, r.b1, r.b2);
  const n0 = s0.n;
  const sink = z.sink ?? 0.003;
  const len = L0 * (1 + (z.jitter ?? 0.25) * (rng.next() * 2 - 1));
  const lift = (z.lift ?? 0.35) * (0.7 + 0.6 * rng.next());
  const bend = z.bend ?? 0.7;
  const droop = z.droop ?? 0.15;
  const hug = z.hug ?? 0;
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
    // The surface holding the strand: the skin, or the collision solid where that is closer
    // (long hair over the shoulders). On it the strand follows it (projected onto its tangent
    // plane, lifted off it); 1 cm clear of both it hangs free: projecting it onto a distant
    // plane would kink it.
    const fd = f ? f(p) : 0;
    const cd = o.collide && k > 1 ? o.collide(p) : Infinity;
    const on = o.collide && cd < fd ? o.collide : f;
    const n = on ? gradient(on, p, h) : n0;
    const near = f && k > 1 ? Math.min(1, Math.max(0, 1 - Math.min(fd, cd) / 0.01)) : 1;
    const a = lift * (1 - bend * s) * near;
    const t = unit(mad(mad([0, 0, 0], d, 1 - near), tangentOf(d, n), near));
    d = unit([
      t[0] * Math.cos(a) + n[0] * Math.sin(a),
      t[1] * Math.cos(a) + n[1] * Math.sin(a),
      t[2] * Math.cos(a) + n[2] * Math.sin(a) - droop * s,
    ]);
    const step = len / segs + (k === 1 ? sink : 0);
    let q = mad(p, d, step);
    // Never under the skin past the root: lift a dipping step back out along the normal.
    const floor = z.width * 0.15 * (k / segs);
    if (f && hug > 0 && k > 1) q = lie(f, p, q, step, floor, hug, h);
    const dist = f ? f(q) : floor;
    if (dist < floor) q = mad(q, f ? gradient(f, q, h) : n, floor - dist);
    q = clear(o.collide, q, floor, h);
    // Steer on from where the step actually went: a strand pushed out of a solid slides along
    // it instead of aiming back in and being pushed out again (a sawtooth).
    if (k > 1) d = unit(sub(q, p));
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

function emit(b: MeshBuilder, z: CardZone, c: Path): Vec3 {
  const segs = c.pts.length - 1;
  const tone = z.tone ?? [0.75, 1.05];
  const mid = (tone[0] + tone[1]) / 2;
  const fold = z.fold ?? 0;
  const tint = z.tint ?? [1, 1, 1];
  const cols = fold > 0 ? 3 : 2;
  let flip = false;
  let base = -1;
  let carry: Vec3 = [0, 1, 0];
  for (let k = 0; k <= segs; k++) {
    const s = k / segs;
    const p = c.pts[k] ?? [0, 0, 0];
    const dk = unit(sub(c.pts[Math.min(segs, k + 1)] ?? p, c.pts[Math.max(0, k - 1)] ?? p));
    const n = c.nrm[k] ?? [0, 0, 1];
    // The ribbon's width is carried along the strand (parallel transport), not re-derived from
    // the skin normal at each row: off the head that normal swings and the card would twist.
    const side0 = k === 0 ? unit(cross(n, dk)) : unit(mad(carry, dk, -dot(carry, dk)));
    carry = side0;
    const side = unit(
      mad(mad([0, 0, 0], side0, Math.cos(c.roll)), cross(dk, side0), Math.sin(c.roll)),
    );
    let nc = unit(cross(side, dk));
    if (k === 0) flip = dot(nc, n) < 0;
    if (flip) nc = [-nc[0], -nc[1], -nc[2]];
    // Shade mostly with the skin's normal (cards read as one mass), but never past the card's own
    // side: off the head the skin normal can face away from the card.
    const skinward = unit(mad(mad([0, 0, 0], n, 0.7), nc, 0.3));
    const agree = dot(skinward, nc);
    const vn = agree < 0.5 ? unit(mad(skinward, nc, 0.5 - agree)) : skinward;
    const w = (z.width * (1 - 0.5 * s)) / 2;
    const g = (tone[0] + (tone[1] - tone[0]) * s) / mid;
    // Clamped: a pale coat × a tip tone > 1 would leave linear [0, 1] (QA vertex-colors).
    const hue = (i: 0 | 1 | 2): number =>
      Math.min(1, Math.max(0, c.colour[i] * g * (1 + (tint[i] - 1) * s)));
    const col: Vec3 = [hue(0), hue(1), hue(2)];
    const u = (c.cell?.u0 ?? 0) + s * ((c.cell?.u1 ?? 0) - (c.cell?.u0 ?? 0));
    const v0 = c.cell?.v0 ?? 0;
    const v1 = c.cell?.v1 ?? 0;
    // The side edges sit `fold` × w below the centre line (toward the skin): a V section. Their
    // normals lean outward, so light rolls across the lock instead of flashing off a flat strip.
    const drop = fold * w;
    const edge = (sg: number): Vec3 => mad(mad(p, side, sg * w), nc, -drop);
    const en = (sg: number): Vec3 => unit(mad(vn, side, sg * Math.min(0.6, fold * 0.6)));
    // Row order left, right, centre: vertices 0 and 1 still straddle the root (`cardRoots`).
    const l = b.vertex({ p: edge(-1), n: en(-1), uv: [u, v0], color: col });
    if (base < 0) base = l;
    b.vertex({ p: edge(1), n: en(1), uv: [u, v1], color: col });
    if (cols === 3) b.vertex({ p, n: vn, uv: [u, (v0 + v1) / 2], color: col });
  }
  const quad = (l0: number, r0: number, l1: number, r1: number): void => {
    if (flip) b.quad(l0, l1, r1, r0);
    else b.quad(l0, r0, r1, l1);
  };
  for (let k = 0; k < segs; k++) {
    const a = base + cols * k;
    const c = a + cols;
    if (cols === 2) quad(a, a + 1, c, c + 1);
    else {
      quad(a, a + 2, c, c + 2);
      quad(a + 2, a + 1, c + 2, c + 1);
    }
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
  const cap = o.maxCards ?? 20000;
  const picked = o.zones.map((z) => {
    if (z.cells.length === 0 || !(z.width > 0))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `hairCards: zone '${z.name}' has ${z.cells.length} atlas cells, width ${z.width}`,
        fix: 'give each zone strandCells(strip, kind) and a card width > 0 (metres)',
      });
    const roots = poissonRoots(o.surface, z.density, o.rng.fork(`roots:${z.name}`), cap);
    return { z, ...grown(o.surface, z, roots) };
  });
  const total = picked.reduce((s, x) => s + x.list.length, 0);
  if (total > cap) throw overCap(total, cap);
  const b = new MeshBuilder();
  const out: Vec3[] = [];
  const counts: Record<string, number> = {};
  for (const { z, list, lengths } of picked) {
    const rng = o.rng.fork(`cards:${z.name}`);
    const paths = list.map((r, i) => path(o, z, r, lengths[i] ?? 0, rng));
    const lead = clumpOf(list, z.clump ?? 1, z.width * 3);
    paths.forEach((c, i) => {
      const l = lead[i] ?? i;
      const pts = l === i ? c.pts : gather(c.pts, paths[l]?.pts ?? c.pts, 0.75);
      const h = Math.max(1e-4, z.width * 0.25);
      out.push(emit(b, z, { ...c, pts: settle(pts, o.field, o.collide, z.width * 0.15, h) }));
    });
    counts[z.name] = (counts[z.name] ?? 0) + list.length;
  }
  return { mesh: b.build(), roots: out, counts };
}
