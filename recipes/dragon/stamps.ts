// VDM detail (the creature sculptor's stamp brushes): the scales on the body and tail and the
// ringed collars at every horn root are placed VDM stamps, not noise. Anchors are Poisson-disk
// darts on the block-out field (vdm-scatter), framed by its gradient, tips turned tailward by a
// flow (down the neck, back along the torso, down the legs, out along the tail), thinned off the
// belly plates (those stay relief, scales.ts) and graded big on the back and shoulders → small
// in the belly band. LOD policy: full stamps at LOD0, the big dorsal ones and horn collars at
// reduced depth at LOD1, none at LOD2 (the scale paint carries them). Seeded with fixed createRng
// streams: the body modules have no ctx, and the same seed is the same stamp set.
// Imports the VDM API by path until the library barrel exports it (coordinator: switch to
// '@developerz.ai/ts23d' then).

import {
  compileVdm,
  createRng,
  type Field,
  hornBase,
  type SculptEdit,
  type SculptVdm,
  scalePatch,
  scatterStamps,
  type VdmPlace,
  type Vec3,
} from '@developerz.ai/ts23d';
import { smoothstep, v3 } from '../_lib/creature/curve.ts';
import { hit } from '../_lib/creature/probe.ts';
import { hornRoots } from './horns.ts';
import { neckPath, tailPath, tailRadius } from './lines.ts';
import { armourOf, bellyOf, dorsalOf, nearest, tailBelly } from './scales.ts';
import { socketsRegion } from './shoulder.ts';

const NECK = neckPath();
const TAIL = tailPath();

/** Scale stamps: one keeled scale each (two seeded variants); neighbours overlap into shingles. */
const PATCH = [
  scalePatch({ rows: 1, cols: 1, seed: 11 }),
  scalePatch({ rows: 1, cols: 1, seed: 12, keel: 0.4 }),
];
/** Body scale footprint (metres) before the size grade: chunky stylised scales, ~5 cells across. */
const BODY = 0.26;

/** Tailward flow on the body: down the neck, back along the torso, down the legs. */
function bodyFlow(p: Vec3): Vec3 {
  const n = nearest(NECK, p);
  const k = Math.min(NECK.length - 2, Math.floor(n.t * (NECK.length - 1)));
  const a = NECK[k] ?? p;
  const b = NECK[k + 1] ?? p;
  const neck = v3.norm(v3.sub(a, b));
  const wNeck = smoothstep(0.55, 0.3, n.d) * smoothstep(0.05, 0.25, n.t);
  const wLeg = smoothstep(1.2, 0.75, p[2]);
  const torso: Vec3 = [-1, 0, -0.12];
  const leg: Vec3 = [0, 0, -1];
  const t = v3.add(v3.mul(torso, Math.max(0, 1 - wNeck - wLeg)), v3.mul(leg, wLeg));
  return v3.add(t, v3.mul(neck, wNeck));
}

/** Scale size grade: big plates on the back and shoulders, small in the belly band and low legs. */
function bodySize(p: Vec3): number {
  const big = Math.max(dorsalOf(p), armourOf(p));
  const b = bellyOf(p).w;
  const band = smoothstep(0, 0.25, b);
  const low = smoothstep(0.9, 0.4, p[2]);
  return (1 + 0.45 * big) * (1 - 0.35 * band) * (1 - 0.35 * low);
}

/** Stamp edits plus the paint key they leave: crown 1 … seam 0 (`h`), and its weight `k`. */
export interface Stamped {
  readonly edits: SculptEdit[];
  readonly shade: (p: Vec3) => { readonly h: number; readonly k: number };
}

/** The stamps' own height at p (no field needed: their displacement of a zero field). */
function shadeOf(
  list: readonly SculptVdm[],
  depth: (p: Vec3) => number,
  zone: (p: Vec3) => number,
  fold: boolean,
): Stamped['shade'] {
  const fs = list.map((e) => compileVdm(e, 'shade', false).apply);
  return (p0) => {
    // The body sculpt folds |y| (stamps authored on the left); the tail does not.
    const p: Vec3 = fold ? [p0[0], Math.abs(p0[1]), p0[2]] : p0;
    const k = zone(p);
    if (k <= 0) return { h: 0, k: 0 };
    let h = 0;
    for (const f of fs) h = Math.max(h, -f(p, 0));
    return { h: Math.min(1, h / depth(p)), k };
  };
}

const NONE: Stamped = { edits: [], shade: () => ({ h: 0, k: 0 }) };

const edits = (places: VdmPlace[], depthK: number): SculptVdm[] =>
  PATCH.map((vdm, i) => ({
    vdm,
    places: places
      .filter((_, k) => k % PATCH.length === i)
      .map((q) => ({ ...q, ...(q.depth ? { depth: q.depth * depthK } : {}) })),
  })).filter((e) => e.places.length > 0);

/** Body scale stamps (left side; the body sculpt folds |y|). */
export function bodyStamps(lod: number, field: Field): Stamped {
  if (lod === 2) return NONE;
  const socket = socketsRegion(0);
  // Off the belly plates (relief), the paws and the wing sockets (their own fitted parts).
  const zone = (p: Vec3): number =>
    socket(p) > BODY * bodySize(p) * 0.75
      ? (1 - smoothstep(0.35, 0.7, bellyOf(p).w)) * smoothstep(0.3, 0.45, p[2])
      : 0;
  const places = scatterStamps({
    field,
    bounds: [
      [-1.75, 0, 0.3],
      [2.35, 1.25, 3.2],
    ],
    rng: createRng(19).fork('body-scales'),
    scale: BODY,
    spacing: BODY * 0.66,
    depth: 0.016,
    flow: bodyFlow,
    zone,
    size: bodySize,
    attempts: 9000,
  });
  // The sculpt folds |y|: a footprint across the midline would fold into a crease, so none do.
  const off = places.filter((q) => q.at[1] > q.scale * Math.SQRT1_2);
  // LOD1: only the big dorsal/shoulder scales, at half depth (its 8.5 cm cells hold nothing finer).
  const kept = lod === 0 ? off : off.filter((q) => q.scale > BODY * 1.25);
  const list = edits(kept, lod === 0 ? 1 : 0.5);
  return { edits: list, shade: shadeOf(list, (p) => 0.016 * bodySize(p), zone, true) };
}

/** Tail scale stamps in world space (the tail sculpt is authored in world, then moved). */
export function tailStamps(lod: number, field: Field): Stamped {
  if (lod !== 0) return NONE;
  const along = (p: Vec3): number => nearest(TAIL, p).t;
  const zone = (p: Vec3): number =>
    (1 - smoothstep(0.3, 0.6, tailBelly(p).w)) * smoothstep(0.92, 0.8, along(p));
  const size = (p: Vec3): number => Math.max(0.35, tailRadius(along(p)) / tailRadius(0));
  const places = scatterStamps({
    field,
    bounds: [
      [-4.6, -2.2, 0],
      [-1.2, 2.2, 2.3],
    ],
    rng: createRng(19).fork('tail-scales'),
    scale: 0.2,
    spacing: 0.13,
    depth: 0.012,
    flow: (p) => {
      const n = nearest(TAIL, p);
      const k = Math.min(TAIL.length - 2, Math.floor(n.t * (TAIL.length - 1)));
      return v3.sub(TAIL[k + 1] ?? p, TAIL[k] ?? p);
    },
    zone,
    size,
    attempts: 9000,
  });
  const list = edits(places, 1);
  return { edits: list, shade: shadeOf(list, (p) => 0.012 * size(p), zone, false) };
}

/** Ringed collars where every horn leaves the skull (left; the head mirrors). */
export function hornCollars(lod: number, field: Field): SculptEdit[] {
  if (lod === 2) return [];
  const places: VdmPlace[] = [];
  for (const h of hornRoots()) {
    // A collar must not cross the folded midline (it would crease): the nose horn gets none and
    // the main pair's collars stop short of it.
    const scale = Math.min(h.radius * 4.2, h.boss[1] * 1.9);
    if (scale < h.radius * 2.5) continue;
    // Where the horn's axis leaves the skin: march in from outside along −axis.
    const from = v3.add(h.boss, v3.mul(h.axis, 0.4));
    const at = hit(field, from, v3.mul(h.axis, -1), 0.6);
    if (!at) continue;
    places.push({
      at,
      normal: h.axis,
      scale,
      depth: h.radius * (lod === 0 ? 0.34 : 0.18),
    });
  }
  return places.length ? [{ vdm: hornBase({ seed: 3, rings: 3 }), places }] : [];
}
