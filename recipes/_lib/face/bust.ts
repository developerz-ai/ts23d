// The face bust assembly: one character's warped base (head + neck + shoulders, one skin part
// with base topology at LOD1, a Catmull–Clark level more at LOD0, a coarse SDF re-mesh at LOD2),
// sawn off at the chest and arms with flat caps, vertex-painted and AO-baked; code eyeballs from
// the bust library in the warped sockets; teeth (and an orc's tusks); hair and beard from the
// style; a turned plinth. Parts: skin, eye_l, eye_r, teeth, tusk_l/r, hair, plinth.

import {
  type BuildContext,
  bakeAo,
  type Mesh,
  merge,
  translate,
  type Vec3,
} from '@developerz.ai/ts23d';
import { type EyeSpec, eyes } from '../bust/eye.ts';
import { plinth } from '../bust/plinth.ts';
import { clipCap } from './clip.ts';
import { type HairStyle, hairlineOf, hairMesh } from './hair.ts';
import { CUT_Z, type FaceHead, faceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';
import { coarseSkin, type Fill } from './lod2.ts';
import { paintSkin } from './paint.ts';
import { quadToMesh, stripUv, subdivide } from './quad.ts';
import type { Character } from './spec.ts';
import { teethRows, tusks } from './teeth.ts';

export interface FaceBust {
  readonly character: Character;
  readonly hair: HairStyle;
  readonly plinth: Vec3;
}

/** Height of the plinth top (the chest cut sits on it). */
export const PLINTH_TOP = 0.09;

/** The skin, cut and capped, in bust space (chest cut at z = CUT_Z). */
function skin(ctx: BuildContext, head: FaceHead, c: Character, hair: HairStyle): Mesh {
  const qm = ctx.lod === 0 ? subdivide(head.mesh) : head.mesh;
  const paint = paintSkin(qm, head, {
    tone: c.tone,
    brows: hair.root,
    hair: hair.root,
    ...(hair.cut === 'none' ? {} : { hairline: hairlineOf(head, hair.cut) }),
    rng: ctx.rng.fork('paint'),
  });
  const raw = quadToMesh(qm, (v) => paint(v), stripUv('plain'));
  const y = 0.168 * head.scale * c.race.body.shoulders;
  return clipCap(
    raw,
    [
      { at: [0, 0, CUT_Z], normal: [0, 0, -1] },
      { at: [0, y, 0], normal: [0, 1, -0.12] },
      { at: [0, -y, 0], normal: [0, -1, -0.12] },
    ],
    c.tone.cavity,
  );
}

/** What LOD2 fills before its coarse re-mesh: both eye sockets and the mouth. */
function fills(head: FaceHead): Fill[] {
  const s = head.scale;
  // Sockets filled to 75 % of the eyeball: the coarse lids close in, the ball still shows.
  const r = 0.0096 * head.sizeAt(LEFT.eye);
  const eye = head.map(LEFT.eye);
  const sup = head.map(MIDLINE.stomionSup);
  const inf = head.map(MIDLINE.stomionInf);
  const half = Math.abs(head.map(LEFT.cheilion)[1]);
  return [
    { at: eye, r: [r, r, r] },
    { at: [eye[0], -eye[1], eye[2]], r: [r, r, r] },
    {
      at: [(sup[0] + inf[0]) / 2 - 0.008 * s, 0, (sup[2] + inf[2]) / 2],
      r: [0.011 * s, half * 0.85, 0.007 * s],
    },
  ];
}

export function buildFaceBust(ctx: BuildContext, b: FaceBust): void {
  const c = b.character;
  const head = faceHead(c, ctx.rng.fork('face'));
  const lift: Vec3 = [0, 0, PLINTH_TOP - CUT_Z];
  const up = (m: Mesh): Mesh => translate(m, lift);
  let body = skin(ctx, head, c, b.hair);
  if (ctx.lod === 2) body = coarseSkin(body, 0.014 * head.scale, fills(head), c.tone.base, CUT_Z);
  const parts: Record<string, Mesh> = { skin: up(body) };
  // Teeth only where the lips part enough to show them (a closed mouth hides them).
  const shows = (c.mouth ?? 1) > 0.2 || (c.tusks ?? 0) > 0;
  if (ctx.lod < 2 && shows) parts['teeth'] = up(teethRows(head, ctx.lod));
  if (c.tusks) {
    const t = tusks(head, c.tusks, ctx.lod);
    parts['tusk_l'] = up(t.l);
    parts['tusk_r'] = up(t.r);
  }
  const hair = hairMesh(head, b.hair, ctx.lod);
  if (hair) parts['hair'] = up(hair);
  parts['plinth'] = plinth(ctx, { radius: 0.11 * head.scale, top: PLINTH_TOP, color: b.plinth });
  const all = merge(Object.values(parts));
  for (const [name, m] of Object.entries(parts))
    ctx.part(
      name,
      ctx.lod < 2 && name !== 'plinth'
        ? bakeAo(
            m,
            { samples: ctx.pick([12, 8, 6]), radius: 0.06 * head.scale, strength: 0.5 },
            all,
          )
        : m,
      name === 'teeth' ? { connect: { as: 'rest' as const, to: 'skin' } } : {},
    );
  const centre = head.map(LEFT.eye);
  const eye: EyeSpec = {
    centre: [centre[0], centre[1], centre[2] + lift[2]],
    r: 0.0128 * head.sizeAt(LEFT.eye),
    iris: 0.0058 * head.sizeAt(LEFT.eye),
    upper: 0.25,
    lower: 0.12,
    lid: 0.002,
    colours: {
      sclera: c.eyes.sclera ?? [0.86, 0.84, 0.8],
      iris: c.eyes.iris,
      pupil: [0.03, 0.02, 0.02],
      wet: [0.8, 0.5, 0.5],
      caruncle: [0.8, 0.5, 0.5],
    },
    ...(c.eyes.pupil ? { pupil: c.eyes.pupil } : {}),
  };
  eyes(ctx, eye, { cell: ctx.pick([0.0012, 0.0024, 0.006]), finish: 'cornea' });
}
