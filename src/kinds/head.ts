// Head kind: `head(ctx, …)` sculpts a stylised fantasy head + bust from a race preset (orc, goblin,
// human, dwarf, elf) or a full `HeadParams`, and emits the engine contract: `bust` (on z = 0),
// `head`, `jaw` (pivot at the hinge, opens about Y), `eye_l` / `eye_r` (pivots at the eyeball
// centres, gaze +X so an engine can aim them). Head units are scaled by `height` metres.
// LOD policy: sculpt cell 2 % / 4.5 % / 14 % of the head height (HEAD_RES); LOD2 drops warts, wiry
// tufts and the AO bake and floors ear/tusk thickness at about a cell so they survive. Vertex AO is
// baked across all parts at LOD0/1 (creases, under the jaw, eye sockets).

import {
  type BuildContext,
  type Mesh,
  merge,
  place,
  type Rng,
  Ts23dError,
  type Vec3,
} from '../core/index.ts';
import { bakeAo } from '../passes/index.ts';
import { sculptField } from '../primitives/index.ts';
import { beardEdits, browEdits } from './head-beard.ts';
import { bustEdits } from './head-bust.ts';
import { earEdits, paintEdits, tuskEdits, wartEdits } from './head-extras.ts';
import { primaryEdits, skullEdits } from './head-face.ts';
import { hairEdits } from './head-hair.ts';
import { type HeadLayout, headLayout } from './head-layout.ts';
import { bustMesh, eyeMesh, type HeadEditSet, headAndJaw } from './head-mesh.ts';
import { checkHead, type HeadParams } from './head-params.ts';
import { HEADS, type HeadPreset } from './head-presets.ts';

/** Overrides: top-level keys replace, nested objects merge one level (`{ jaw: { underbite: 0.1 } }`). */
export type HeadOverrides = { readonly [K in keyof HeadParams]?: Partial<HeadParams[K]> };

export interface HeadOptions {
  readonly race?: HeadPreset | HeadParams;
  readonly params?: HeadOverrides;
  /** Part-name prefix: `orc` → `orc_head`, `orc_jaw`, `orc_eye_l` … Default none. */
  readonly prefix?: string;
  /** Where the bust base sits, metres. */
  readonly at?: Vec3;
  /** Baked jaw motion (degrees either side of rest, 0 = static pivot). Default 0. */
  readonly jawSway?: number;
}

export interface HeadInfo {
  readonly parts: { bust: string; head: string; jaw: string; eyeL: string; eyeR: string };
  /** Overall height of bust + head, metres. */
  readonly height: number;
  readonly params: HeadParams;
}

export function headParams(o: Pick<HeadOptions, 'race' | 'params'> = {}): HeadParams {
  const r = o.race ?? 'human';
  const base = typeof r === 'string' ? HEADS[r] : r;
  if (!base)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `unknown head race '${String(r)}'`,
      fix: `use one of ${Object.keys(HEADS).join(', ')} or pass a HeadParams object`,
    });
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(o.params ?? {})) {
    const was = out[k];
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && was && typeof was === 'object'
        ? { ...was, ...v }
        : v;
  }
  return checkHead(out as unknown as HeadParams);
}

/** Moves the eyes forward/back so they sit in the face surface: probe the brain case + face
 *  plate along −X at the eye, then sink the eyeball by `brow.overhang`. */
function seatEyes(p: HeadParams, l: HeadLayout): HeadLayout {
  const f = sculptField(primaryEdits(l), { color: p.colors.skin }).field;
  const [, ey, ez] = l.eye;
  let x = l.faceX + 0.4;
  for (let i = 0; i < 400 && f([x, ey, ez]) > 0; i++) x -= 0.002;
  const r = l.eyeR;
  return { ...l, eye: [x - r * 0.7 - p.brow.overhang * 0.3, ey, ez] };
}

/** Sculpt cell edge per LOD, in head units (× height = metres). */
export const HEAD_RES = [0.02, 0.045, 0.14] as const;

/** Every edit list of a head, in head units (pure: same params + rng state → same edits). */
export function headEdits(
  p: HeadParams,
  rng: Rng,
  lod: 0 | 1 | 2 = 0,
): HeadEditSet & { layout: HeadLayout } {
  const l = seatEyes(p, headLayout(p));
  const res = HEAD_RES[lod];
  const warts = lod < 2 ? wartEdits(p, l, rng) : [];
  const hair = lod < 2 || p.hair !== 'tufts' ? hairEdits(p, l) : [];
  return {
    layout: l,
    skull: [
      ...skullEdits(p, l),
      ...hair,
      ...browEdits(p, l),
      ...beardEdits(p, l),
      ...warts,
      ...paintEdits(p, l),
    ],
    ears: earEdits(p, l, res * 0.7),
    tusks: tuskEdits(p, l, res * 0.45),
    bust: bustEdits(p, l),
  };
}

export function head(ctx: BuildContext, o: HeadOptions = {}): HeadInfo {
  const p = headParams(o);
  const set = headEdits(p, ctx.rng.fork('head'), ctx.lod);
  const l = set.layout;
  const H = p.height;
  const res = HEAD_RES[ctx.lod];
  const { head: hm, jaw: jm } = headAndJaw(p, l, set, res);
  const bm = bustMesh(p, set, res * 1.6);
  const eye = eyeMesh(p, l.eyeR, l.eyeR / ctx.pick([7, 3.5, 2.2]));
  const [ox, oy, oz] = o.at ?? [0, 0, 0];
  const toWorld = (m: Mesh, at: Vec3 = [0, 0, 0]): Mesh =>
    place(m, { scale: H, at: [ox + at[0] * H, oy + at[1] * H, oz + (at[2] - l.base) * H] });
  // Coarse LODs: the coarse socket would swallow the eyeball, so it sits a little proud.
  const ex = l.eye[0] + (ctx.lod > 0 ? res * 0.4 : 0);
  const [, ey, ez] = l.eye;
  const world = {
    bust: toWorld(bm),
    head: toWorld(hm),
    jaw: toWorld(jm),
    eye_l: toWorld(eye, [ex, ey, ez]),
    eye_r: toWorld(eye, [ex, -ey, ez]),
  };
  // AO occluders leave out the other half of the jaw split: its cut face lies flush against ours
  // and would draw a dark line along the seam.
  const occ = (skip: Mesh): Mesh => merge(Object.values(world).filter((m) => m !== skip));
  const occHead = occ(world.jaw);
  const occJaw = occ(world.head);
  const ao = (m: Mesh, by: Mesh = occHead): Mesh =>
    ctx.lod < 2
      ? bakeAo(m, { samples: ctx.pick([16, 10, 8]), radius: (0.12 * H) / 0.23, strength: 0.55 }, by)
      : m;
  const pre = o.prefix ? `${o.prefix}_` : '';
  const pivot = (x: number, y: number, z: number): Vec3 => [
    ox + x * H,
    oy + y * H,
    oz + (z - l.base) * H,
  ];
  const local = (m: Mesh, at: Vec3, by?: Mesh): Mesh =>
    place(ao(m, by), { at: [-at[0], -at[1], -at[2]] });
  const hinge = pivot(l.hinge[0], 0, l.hinge[1]);
  const eyeL = pivot(ex, ey, ez);
  const eyeR = pivot(ex, -ey, ez);
  const names = {
    bust: `${pre}bust`,
    head: `${pre}head`,
    jaw: `${pre}jaw`,
    eyeL: `${pre}eye_l`,
    eyeR: `${pre}eye_r`,
  };
  ctx.part(names.bust, ao(world.bust));
  ctx.part(names.head, ao(world.head));
  const sway = o.jawSway ?? 0;
  ctx.part(names.jaw, local(world.jaw, hinge, occJaw), {
    at: hinge,
    ...(sway > 0
      ? { motion: { kind: 'sway', axis: [0, 1, 0], degrees: sway, hz: 0.5 }, clearOf: [names.head] }
      : {}),
  });
  ctx.part(names.eyeL, local(world.eye_l, eyeL), { at: eyeL });
  ctx.part(names.eyeR, local(world.eye_r, eyeR), { at: eyeR });
  return { parts: names, height: (l.crown - l.base) * H, params: p };
}
