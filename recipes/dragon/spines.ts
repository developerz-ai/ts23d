// Dorsal spines: a row of flattened, back-swept horn blades along the neck crest, the back and the
// tail, tallest over the shoulders and hips and shrinking toward head and tail tip (the line of
// action made visible). Each is a banded horn trimmed to a slab, so it reads as a plate edge-on and
// a spike from the side. Meshed finer than the body and merged into `body` / `tail`.

import { type Mesh, merge, type SculptEdit, type Vec3 } from '@developerz.ai/ts23d';
import { pointAt, spline, tangentAt, v3 } from '../_lib/creature/curve.ts';
import { horn, hornNodes } from '../_lib/creature/horn.ts';
import { skinTube } from '../_lib/creature/lowpoly.ts';
import { sculptPart } from '../_lib/creature/sculpt-part.ts';
import { neckPath, neckRadius, tailPath, tailRadius } from './lines.ts';
import { C, SPINE } from './palette.ts';
import { SK, TAIL_PIVOT } from './skeleton.ts';

interface Spine {
  readonly base: Vec3;
  readonly up: Vec3;
  readonly back: Vec3;
  readonly h: number;
  readonly r: number;
}

/** A spine at arc fraction t of a path whose top surface sits `lift` above the centre line. */
function along(path: readonly Vec3[], t: number, lift: number, h: number, r: number): Spine {
  const p = pointAt(path, t);
  const tg = tangentAt(path, t);
  // "Up" = the path normal in the vertical plane through the tangent, pointing to +Z.
  let up = v3.norm(v3.sub([0, 0, 1], v3.mul(tg, tg[2])));
  if (up[2] < 0) up = v3.mul(up, -1);
  return { base: v3.add(p, v3.mul(up, lift)), up, back: v3.mul(tg, -1), h, r };
}

function spine(s: Spine, segs: number, thick: number): SculptEdit {
  const side = v3.norm(v3.cross(s.up, s.back));
  const centre = v3.add(s.base, v3.mul(s.up, s.h * 0.5));
  // Slab about the spine's plane: a thin box aligned with the world when the spine is upright.
  const yaw = (Math.atan2(side[1], side[0]) * 180) / Math.PI - 90;
  return {
    group: [
      horn({
        base: s.base,
        dir: v3.add(s.up, v3.mul(s.back, 0.35)),
        length: s.h,
        radius: s.r,
        tip: Math.max(0.006, s.r * 0.06),
        axis: v3.cross(s.up, s.back),
        bend: 28,
        segments: segs,
        taper: 0.9,
        colors: SPINE,
      }),
      {
        shape: 'roundBox',
        at: centre,
        size: [s.h * 3, thick * 2, s.h * 3],
        rotate: [0, 0, yaw],
        op: 'intersect',
        round: thick * 0.9,
      },
    ],
  };
}

function bodySpines(): Spine[] {
  const out: Spine[] = [];
  const neck = neckPath();
  // Neck: small spines from the back of the skull down to the withers.
  for (let i = 0; i < 4; i++) {
    const t = 0.92 - i * 0.13;
    out.push(along(neck, t, neckRadius(t) * 0.8, 0.15 + 0.025 * i, 0.055 + 0.01 * i));
  }
  // Back: tall over the shoulders, dip at the waist, rise again over the hips.
  const back = spline(SK.spine.slice(3), 4);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = 0.04 + (i / (n - 1)) * 0.92;
    // Rhythm: tallest over the shoulders, a dip at the waist, a second peak over the hips.
    const hump =
      0.55 +
      0.45 *
        Math.max(Math.exp(-(((t - 0.12) / 0.2) ** 2)), 0.8 * Math.exp(-(((t - 0.78) / 0.16) ** 2)));
    out.push(along(back, t, 0.06, 0.5 * hump, 0.14 * (0.7 + 0.3 * hump)));
  }
  // The tail row's first spines stand on the stump, which is body (see tailSpines).
  return [...out, ...tailRow(STUMP_LIFT).slice(0, STUMP_SPINES)];
}

/** Tail-row spines that root on the body's tail stump (it sheathes the tail's first span). */
const STUMP_SPINES = 2;
/** Their roots sit higher: the stump's skin stands proud of the tail's. */
const STUMP_LIFT = 0.92;

/** The tail spine row in world space: the first STUMP_SPINES sit on the stump. */
function tailRow(lift = 0.78): Spine[] {
  const path = tailPath();
  const out: Spine[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = 0.02 + (i / n) * 0.8;
    out.push(along(path, t, tailRadius(t) * lift, 0.26 * (1 - t * 0.85), 0.085 * (1 - t * 0.7)));
  }
  return out;
}

/** Tail spines in the tail part's LOCAL frame (pivot at the origin). The ones over the stump grow
 *  from the body (QA connections: rooted in the tail they poked out through the stump's skin). */
function tailSpines(): Spine[] {
  return tailRow()
    .slice(STUMP_SPINES)
    .map((s) => ({ ...s, base: v3.sub(s.base, TAIL_PIVOT) }));
}

export function spineEdits(lod: number, which: 'body' | 'tail'): SculptEdit[] {
  const segs = [8, 5, 3][lod] ?? 3;
  const list = which === 'body' ? bodySpines() : tailSpines();
  return list.map((s) => spine(s, segs, Math.max(s.r * 0.42, [0.012, 0.02, 0.05][lod] ?? 0.05)));
}

/** The spine row as a mesh: sculpted blades near, three-sided spikes (every other one) far. */
export function spineMesh(lod: 0 | 1 | 2, which: 'body' | 'tail'): Mesh {
  if (lod === 2) {
    const list = (which === 'body' ? bodySpines() : tailSpines()).filter((_, i) => i % 2 === 0);
    return merge(
      list.map((s) =>
        skinTube(
          hornNodes({
            base: s.base,
            dir: v3.add(s.up, v3.mul(s.back, 0.35)),
            length: s.h,
            radius: s.r * 0.8,
            tip: 0.01,
            axis: v3.cross(s.up, s.back),
            bend: 28,
            segments: 2,
            colors: SPINE,
          }),
          { sides: 3, color: C.horn },
        ),
      ),
    );
  }
  return sculptPart({
    edits: spineEdits(lod, which),
    res: [0.02, 0.04][lod] ?? 0.04,
    color: C.horn,
    tone: { reach: 0.05 },
  }).mesh;
}
