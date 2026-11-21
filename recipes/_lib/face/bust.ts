// The face bust assembly: one character's warped base (head + neck + shoulders, one skin part:
// the imported CC0 base painted at a Catmull–Clark level at LOD0 and at base topology below, then
// brought to its LOD's triangle count by base-lod.ts, so the ears, the face's colour zones and
// the clean bust edge survive at every distance), sawn off at the chest and arms with flat caps,
// vertex-painted (zones, sun, freckles, stubble, scars, grime) and AO-baked on the shared skin
// strip; code eyeballs from the bust library in the warped sockets; teeth (and an orc's tusks);
// hair and beard as a sculpted mass (`hair`) under strand cards (`hair_strands`: dense at LOD0,
// fewer and wider at LOD1, a handful of wide ones at LOD2 so the far head keeps a broken hair
// outline); a turned, weathered stone plinth.
// Finishes the asset may declare: `skin` (sheen), `cornea`. Draws: skin, cards, cornea, the rest.

import {
  type BuildContext,
  bakeAo,
  type Mesh,
  merge,
  translate,
  type Vec3,
  weather,
} from '@developerz.ai/ts23d';
import { WOOL } from '../bust/cloth-strips.ts';
import { type EyeSpec, eyes } from '../bust/eye.ts';
import { plinth } from '../bust/plinth.ts';
import { baseLod } from './base-lod.ts';
import { clipCap } from './clip.ts';
import { clothMask, collarOf, type Garment, garmentPaint } from './garment.ts';
import { beardlineOf, type HairStyle, hairlineOf, hairSculpt } from './hair.ts';
import { cardHair } from './hair-cards.ts';
import { faceCardStyle } from './hair-strands.ts';
import { CUT_Z, type FaceHead, faceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';
import { meshField } from './mesh-field.ts';
import { paintSkin, type SkinWear } from './paint.ts';
import { quadToMesh, stripUv, subdivide } from './quad.ts';
import { characterStrokes, molesOf, relieve, wartsOf } from './relief.ts';
import { eyeZone, lipZone, onFineStrip, onSkin, scalpZone, tZone } from './skin-strip.ts';
import { complexionZones } from './skin-zones.ts';
import type { Character } from './spec.ts';
import { teethRows } from './teeth.ts';
import { tusks, wrapTusks } from './tusks.ts';

export interface FaceBust {
  readonly character: Character;
  readonly hair: HairStyle;
  readonly plinth: Vec3;
  /** The tunic below a neckline, with a collar band (./garment.ts); omit for bare shoulders. */
  readonly garment?: Garment;
}

/** Height of the plinth top (the chest cut sits on it). */
export const PLINTH_TOP = 0.09;

/** The character's wear in bust space: scars pushed through the warp, stubble on the beardline. */
function wearOf(head: FaceHead, c: Character, hair: HairStyle): SkinWear | undefined {
  const w = c.wear ?? (hair.beard === 'full' ? { sun: 0, freckles: 0, grime: 0 } : undefined);
  if (!w) return undefined;
  const s = head.scale;
  const scars = (w.scars ?? []).flatMap((line) =>
    line.slice(1).map((q, i) => ({
      a: head.map(line[i] ?? q),
      b: head.map(q),
      width: 0.0032 * s,
    })),
  );
  return {
    sun: w.sun,
    freckles: w.freckles,
    grime: w.grime,
    ...(w.wind ? { wind: w.wind } : {}),
    scars,
    // Under a full beard the skin is hair-dark from the cheek line down (a soft, gritty edge):
    // the cards grow out of it, with no slab of sculpted mass between them.
    ...(hair.beard === 'full'
      ? { stubble: { region: beardlineOf(head), colour: hair.root, amount: 0.82 } }
      : w.stubble
        ? {
            stubble: {
              region: beardlineOf(head),
              colour: w.stubble.colour,
              amount: w.stubble.amount,
              // The hairs are the stubble strip's dots: a faint shade under them, feathered
              // over 2 cm (D523).
              wash: 0.22,
              feather: 0.02,
            },
          }
        : {}),
  };
}

/** The skin, cut and capped, in bust space (chest cut at z = CUT_Z). */
function skin(ctx: BuildContext, head: FaceHead, c: Character, hair: HairStyle, g?: Garment): Mesh {
  // Folds, brow shelf, warts: every stroke at LOD0, those the base's own quads can hold below.
  const strokes = characterStrokes(head, c, ctx.rng.fork('warts'));
  const s = head.scale;
  const qm =
    ctx.lod === 0 ? relieve(subdivide(head.mesh), strokes) : relieve(head.mesh, strokes, 0.008 * s);
  const wear = wearOf(head, c, hair);
  const marks = [
    ...molesOf(head, 3 + Math.round(2 * (c.wear?.freckles ?? 0)), ctx.rng.fork('moles')).map(
      (m) => ({ ...m, tone: 0.5 }),
    ),
    ...wartsOf(head, c.warts ?? 0, ctx.rng.fork('warts')).map((m) => ({ ...m, tone: 0.74 })),
  ];
  const paint = paintSkin(qm, head, {
    tone: c.tone,
    // A hairless head has no dark brows: the ridge keeps a shadow of the skin's own crevice tone.
    brows:
      hair.cut === 'none'
        ? [
            (c.tone.base[0] + c.tone.cavity[0]) / 2,
            (c.tone.base[1] + c.tone.cavity[1]) / 2,
            (c.tone.base[2] + c.tone.cavity[2]) / 2,
          ]
        : hair.root,
    hair: hair.root,
    age: c.age,
    ...(wear ? { wear } : {}),
    ...(hair.cut === 'none' ? {} : { hairline: hairlineOf(head, hair.cut) }),
    ...(ctx.lod < 2 ? { marks } : { far: true }),
    rng: ctx.rng.fork('paint'),
  });
  const dress = g ? garmentPaint(head, g, ctx.rng.fork('garment')) : undefined;
  const raw = quadToMesh(
    qm,
    (v, p, n) => (dress ? dress(p, n, paint(v)) : paint(v)),
    stripUv('plain'),
  );
  const y = 0.168 * head.scale * c.race.body.shoulders;
  return clipCap(
    raw,
    [
      { at: [0, 0, CUT_Z], normal: [0, 0, -1] },
      { at: [0, y, 0], normal: [0, 1, -0.12] },
      { at: [0, -y, 0], normal: [0, -1, -0.12] },
    ],
    g ? [g.cloth[0] * 0.35, g.cloth[1] * 0.35, g.cloth[2] * 0.35] : c.tone.cavity,
  );
}

export function buildFaceBust(ctx: BuildContext, b: FaceBust): void {
  const c = b.character;
  // (An orc's lower lip swells round its tusks' bases: tusks.ts `wrapTusks`.)
  const raw = faceHead(c, ctx.rng.fork('face'));
  const head = c.tusks ? wrapTusks(raw, c.tusks) : raw;
  const s = head.scale;
  const lift: Vec3 = [0, 0, PLINTH_TOP - CUT_Z];
  const up = (m: Mesh): Mesh => translate(m, lift);
  const body = skin(ctx, head, c, b.hair, b.garment);
  const parts: Record<string, Mesh> = { skin: body };
  // The collar as geometry along the tunic's neckline: a clean hem line the paint can't draw.
  const collar = b.garment ? collarOf(head, b.garment, body, ctx.lod) : undefined;
  if (collar) parts['collar'] = collar;

  // Teeth only where the lips part enough to show them (a closed mouth hides them).
  const shows = (c.mouth ?? 1) > 0.2 || (c.tusks ?? 0) > 0;
  if (ctx.lod < 2 && shows) parts['teeth'] = teethRows(head, ctx.lod, c.teeth);
  if (c.tusks) {
    const t = tusks(head, c.tusks, ctx.lod);
    parts['tusk_l'] = t.l;
    parts['tusk_r'] = t.r;
  }
  const hair = hairSculpt(head, b.hair, ctx.lod);
  if (hair) parts['hair'] = hair.mesh;
  const all = merge(Object.values(parts));
  // (The far skin is 1 000 flat-toned triangles: six AO rays a vertex is noise at that size, so
  // it takes more rays and a lighter hand.)
  const ao = (m: Mesh): Mesh =>
    bakeAo(
      m,
      { samples: ctx.pick([12, 8, 24]), radius: 0.06 * s, strength: ctx.pick([0.5, 0.5, 0.3]) },
      all,
    );
  // Roughness zones on the one skin draw: the oily T-zone, the wet lips.
  // The T-zone's forehead band stops halfway up the forehead; the scalp above is matte (the
  // band up to the forehead's top lit a bald dome with a wet hot spot).
  const fh = head.map(MIDLINE.forehead);
  const gl = head.map(MIDLINE.glabella);
  const brow: Vec3 = [(fh[0] + gl[0]) / 2, 0, (fh[2] + gl[2]) / 2];
  const oil = tZone(
    {
      forehead: brow,
      glabella: gl,
      noseTip: head.map(MIDLINE.pronasale),
      chin: head.map(MIDLINE.pogonion),
    },
    Math.abs(head.map(LEFT.alare)[1]),
  );
  const moist = lipZone({
    sup: head.map(MIDLINE.labraleSup),
    inf: head.map(MIDLINE.labraleInf),
    corner: head.map(LEFT.cheilion),
  });
  const beard = wearOf(head, c, b.hair)?.stubble;
  // Freckles gathered over the bridge and cheekbones, clear skin off the nose and cheeks (D520).
  const complexion = complexionZones(
    {
      nasion: head.map(MIDLINE.nasion),
      pronasale: head.map(MIDLINE.pronasale),
      cheek: head.map(LEFT.cheek),
      zygion: head.map(LEFT.zygion),
      eye: head.map(LEFT.eye),
      tragion: head.map(LEFT.tragion),
    },
    s,
    c.complexion,
  );
  for (const [name, m] of Object.entries(parts)) {
    let mesh = ao(m);
    // The painted, shaded base at its LOD's triangle count, then onto the pore strip.
    if (name === 'skin')
      mesh = onSkin(baseLod(mesh, ctx.lod), {
        oil,
        ...(ctx.lod < 2 ? { moist } : {}),
        ...(b.garment
          ? { cloth: { mask: clothMask(head, b.garment), strip: WOOL, metres: 1 } }
          : {}),
        // The scalp matte (a bald or shaven dome caught wet hot spots on the face's strip).
        matte: scalpZone({ forehead: brow, tragion: head.map(LEFT.tragion) }),
        // The thin skin round the eyes (fine pores and lines) and a shaven beard's cut hairs
        // as the strips' own detail (D511, D514).
        fine: eyeZone({ eye: head.map(LEFT.eye), r: 0.0128 * head.sizeAt(LEFT.eye) }),
        // (Soft near: full 6 mm inside the beard line, none 6 mm outside, dithered; the hard
        // line drew a top edge across the cheek, D523. The far LOD's 2 cm triangles keep it.
        // The dots' density is the stubble's amount: 0 draws none, D531.)
        ...(beard ? { stubble: stubbleMask(beard, s, ctx.lod === 2) } : {}),
        ...(ctx.lod < 2 ? complexion : {}),
      });
    if (name === 'collar') mesh = onFineStrip(mesh, WOOL, 1);
    ctx.part(name, up(mesh), {
      ...(name === 'teeth' ? { connect: { as: 'rest' as const, to: 'skin' } } : {}),
      ...(name === 'skin' ? { finish: name } : {}),
    });
  }
  if (hair) {
    // Long hair drapes over the shoulders: it needs the whole bust to fall round.
    const solid = b.hair.cut === 'long' ? meshField(body, 0.006 * s, 3).field : hair.field;
    const style = faceCardStyle(head, b.hair, hair, (p) => Math.min(hair.field(p), solid(p)));
    if (style) cardHair(ctx, style, 'hair_strands', { move: up });
  }
  // The plinth: turned stone that has stood about (chipped arrises, dust on its ledges, damp
  // creeping up from the floor).
  const stone = plinth(ctx, { radius: 0.11 * s, top: PLINTH_TOP, color: b.plinth });
  const aged = weather(
    ctx,
    { plinth: stone },
    {
      name: 'plinth',
      seed: 5,
      age: 0.6,
      resolution: [0.03, 0.06, 0],
      groundBand: 0.03,
      under: [b.plinth[0] * 1.5, b.plinth[1] * 1.5, b.plinth[2] * 1.45],
      effects: {
        chips: { where: 'convex-edges', amount: 0.35 },
        dust: { where: 'up-facing', amount: 0.5, strength: 0.3 },
        mud: { where: 'ground-near & side-facing', amount: 0.4 },
      },
    },
  );
  ctx.part('plinth', aged.plinth);
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
  eyes(ctx, eye, {
    cell: ctx.pick([0.0017, 0.0034, 0.009]),
    finish: 'cornea',
    host: 'skin',
    lidShadow: 0.55,
  });
}

/** A beard (region ≤ 0 inside, amount) as the stubble strip's mask: `amount` from 6 mm inside its
 *  line to 0 at 6 mm outside it, or a hard line at `far` (1 inside its line × `amount`). */
const stubbleMask =
  (beard: { region: (p: Vec3) => number; amount: number }, s: number, far: boolean) =>
  (p: Vec3): number => {
    const d = beard.region(p);
    return (
      beard.amount *
      (far ? (d < 0 ? 1 : 0) : Math.min(1, Math.max(0, (0.006 * s - d) / (0.012 * s))))
    );
  };
