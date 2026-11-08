// Wings (bat anatomy, dragon scale): humerus and forearm from a shoulder root on the back, a wrist
// knuckle with a hooked thumb claw, four long fingers fanning out (each with a mid knuckle bowed
// toward the trailing edge) and a leathery membrane in four panels with scalloped trailing edges:
// three between the fingers and the big inner panel from the last finger back to the flank.
// The humerus leaves its socket on the shoulder (shoulder.ts) at the declared joint; the inner
// membrane's proximal edge runs from the wrist along the arm, then down the flank to the front of
// the thigh, buried a few centimetres in the skin so no seam opens while the wing flaps.
// Each wing is a group pivoted at the shoulder joint (sway = a slow flap) holding `_arm` (bones)
// and `_membrane`; the right wing mirrors the left.

import { type Mesh, merge, place, type SculptEdit, type Vec3 } from '@developerz.ai/ts23d';
import { mixRgb, resample, smoothstep, spline, v3 } from '../_lib/creature/curve.ts';
import { clawHorn, type HornOptions, horn, hornTube } from '../_lib/creature/horn.ts';
import { blob, skinTube } from '../_lib/creature/lowpoly.ts';
import { membrane } from '../_lib/creature/membrane.ts';
import { sculptPart } from '../_lib/creature/sculpt-part.ts';
import { skin, tube } from '../_lib/creature/skin.ts';
import { flankLine } from './body.ts';
import { C, CLAW, HORN } from './palette.ts';
import { JOINT, JOINT_R } from './shoulder.ts';
import { SK } from './skeleton.ts';

const W = SK.wing;

/** Finger k's centre line wrist → tip, bowed backward at the knuckle. */
export function fingerPath(k: number): Vec3[] {
  const tip = W.tips[k] ?? W.wrist;
  const mid = v3.lerp(W.wrist, tip, 0.45);
  const bow: Vec3 = [-0.12 - 0.04 * k, 0, -0.06];
  return spline([W.wrist, v3.add(mid, bow), tip], 6);
}

/** Arm radius along the arm line: the socket's size at the joint, ropey forearm. */
const armRadius = (t: number): number =>
  t < 0.5 ? JOINT_R - (JOINT_R - 0.1) * 2 * t : 0.1 - 0.06 * (t - 0.5);

/** The arm line shoulder joint → elbow → wrist. */
const armPath = (): Vec3[] => spline([JOINT, W.elbow, W.wrist], 6);

function armEdits(lod: number): SculptEdit[] {
  const out: SculptEdit[] = [
    // Humerus + forearm: thick at the shoulder, ropey forearm.
    skin(tube(armPath(), armRadius), { blend: 0.05 }),
    // Elbow and wrist knuckles.
    { shape: 'sphere', at: W.elbow, size: 0.1, blend: 0.05 },
    { shape: 'ellipsoid', at: W.wrist, size: [0.12, 0.1, 0.11], blend: 0.05 },
    // Forearm muscle bulge (the flight muscle) along the first third.
    {
      shape: 'ellipsoid',
      at: v3.lerp(W.elbow, W.wrist, 0.3),
      size: [0.1, 0.16, 0.1],
      rotate: [40, 0, 0],
      blend: 0.06,
    },
  ];
  // Thumb: a short digit and a hooked claw at the wrist's leading edge.
  out.push(
    skin(
      [
        { at: W.wrist, r: 0.05 },
        { at: W.thumb, r: 0.04 },
      ],
      { blend: 0.03 },
    ),
  );
  out.push(horn(thumbClaw(lod)));
  return out;
}

/** The hooked thumb claw at the wrist's leading edge. */
function thumbClaw(lod: number): HornOptions {
  return clawHorn({
    base: v3.lerp(W.wrist, W.thumb, 0.85),
    dir: v3.sub(W.thumb, W.wrist),
    down: [0.6, 0, -0.4],
    length: 0.22,
    radius: 0.04,
    segments: [8, 5, 3][lod] ?? 3,
    colors: CLAW,
    curl: 70,
    tip: [0.006, 0.012, 0.03][lod] ?? 0.03,
  });
}

/** Finger k's bone: tapering tube with a knuckle and an end cap (tubes: thin bones would need
 *  sub-centimetre sculpt cells). The leading finger ends in a horn spur. */
function fingerMesh(k: number, lod: 0 | 1 | 2): Mesh {
  const path = resample(fingerPath(k), [20, 10, 4][lod] ?? 4);
  const r0 = 0.062 - k * 0.006;
  const knuckle = 0.45;
  const r = (t: number): number =>
    r0 * (1 - 0.62 * t) + 0.012 + (lod < 2 ? 0.018 * Math.exp(-(((t - knuckle) / 0.05) ** 2)) : 0);
  const sides = [14, 8, 3][lod] ?? 3;
  const out: Mesh[] = [skinTube(tube(path, r), { sides, color: C.back })];
  if (k === 0 && lod < 2) {
    const n = path.length;
    const tip = path[n - 1] ?? W.wrist;
    const dir = v3.sub(tip, path[n - 2] ?? W.wrist);
    out.push(
      sculptPart({
        edits: [
          horn({
            base: v3.sub(tip, v3.mul(v3.norm(dir), 0.04)),
            dir,
            length: 0.3,
            radius: 0.03,
            tip: [0.005, 0.012, 0.03][lod] ?? 0.03,
            axis: v3.cross(v3.norm(dir), [0, 0, -1]),
            bend: 25,
            segments: [8, 5, 3][lod] ?? 3,
            colors: HORN,
            // Blend the segments: unblended cones kinked into a 2 cm notch near the tip (QA seam).
            blend: 0.008,
          }),
        ],
        res: [0.006, 0.012][lod] ?? 0.012,
        color: C.horn,
      }).mesh,
    );
  }
  return merge(out);
}

/** Membrane colour: hot orange where it is thin (mid-panel), darker at bones and rim, veins. */
function skinColour(u: number, v: number, veins: boolean): Vec3 {
  const centre = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v));
  let c = mixRgb(C.membraneEdge, C.membrane, smoothstep(0.05, 0.6, centre));
  c = mixRgb(c, C.membraneEdge, smoothstep(0.9, 1, v) * 0.8);
  if (veins) {
    const vein = Math.abs(((u * 3 + v * 0.6) % 1) - 0.5) < 0.04 && v > 0.15 && v < 0.85;
    if (vein) c = mixRgb(c, C.vein, 0.7);
  }
  return c;
}

function membranes(lod: 0 | 1 | 2): Mesh[] {
  const across = [10, 4, 2][lod] ?? 2;
  const along = [14, 6, 3][lod] ?? 3;
  const thick = 0.012;
  const sagDir: Vec3 = [-0.25, -0.15, -1];
  const veins = lod === 0;
  const out: Mesh[] = [];
  for (let k = 0; k < 3; k++)
    out.push(
      membrane({
        a: fingerPath(k),
        b: fingerPath(k + 1),
        across,
        along,
        scallop: 0.32 + 0.04 * k,
        sag: 0.14,
        sagDir,
        thick,
        start: 0.04,
        ...(lod === 0 ? { ripples: 3, rippleDepth: 0.012 } : {}),
        color: (u, v) => skinColour(u, v, veins),
        strip: 'plain',
      }),
    );
  // Inner panel: arm + flank on one side, the last finger on the other.
  const inner = [W.wrist, W.elbow, JOINT, ...flankLine(0.015)];
  out.push(
    membrane({
      a: inner,
      b: fingerPath(3),
      across: across + (lod === 2 ? 0 : 2),
      along: along + (lod === 2 ? 0 : 2),
      scallop: 0.45,
      sag: 0.18,
      sagDir,
      thick,
      start: 0.02,
      ...(lod === 0 ? { ripples: 4, rippleDepth: 0.015 } : {}),
      color: (u, v) => skinColour(u, v, veins),
      strip: 'plain',
    }),
  );
  return out;
}

export const WING_RES = [0.03] as const;

/** The arm: sculpted near (muscle, knuckles, thumb claw), a tube + knuckle blobs far. */
function armMesh(lod: 0 | 1 | 2): Mesh {
  if (lod > 0) {
    const far = lod === 2;
    const ring = { rings: far ? 3 : 5, sides: far ? 5 : 8, color: C.back };
    return merge([
      skinTube(tube(resample(armPath(), far ? 5 : 12), armRadius), {
        sides: far ? 5 : 10,
        color: C.back,
      }),
      blob(W.wrist, [0.11, 0.1, 0.1], ring),
      blob(W.elbow, [0.1, 0.1, 0.1], ring),
      skinTube(
        [
          { at: W.wrist, r: 0.05 },
          { at: W.thumb, r: 0.04 },
        ],
        { sides: far ? 4 : 6, color: C.back },
      ),
      hornTube(thumbClaw(lod), far ? 3 : 5),
    ]);
  }
  return sculptPart({
    edits: armEdits(lod),
    res: WING_RES[0],
    color: C.back,
    tone: { reach: 0.05 },
  }).mesh;
}

export interface WingMeshes {
  /** Bones: humerus, forearm, thumb, fingers, spur. */
  readonly arm: Mesh;
  readonly membrane: Mesh;
}

/** Left wing in its pivot's frame (pivot = JOINT, the shoulder joint). */
export function wingMeshes(lod: 0 | 1 | 2): WingMeshes {
  const [x, y, z] = JOINT;
  const local = (m: Mesh): Mesh => place(m, { at: [-x, -y, -z] });
  return {
    arm: local(merge([armMesh(lod), ...[0, 1, 2, 3].map((k) => fingerMesh(k, lod))])),
    membrane: local(merge(membranes(lod))),
  };
}

/** Mirror a left-wing mesh to the right side. */
export const mirrorWing = (m: Mesh): Mesh => place(m, { scale: [1, -1, 1] });
