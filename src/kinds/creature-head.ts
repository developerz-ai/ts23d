// The head sculpt, head-local (origin at the atlas, +X along the skull, Z up, left = +Y), in stages:
//   blockOut  braincase, occiput, cheekbones, the muzzle as a tapering skin, the lower jaw + chin;
//             with a head preset (`face.preset`): the stop, flews and flaring cheek fur
//   features  nose leather and nostrils (or a beak/snout), the brow ridge, the eye socket with lids
//             that wrap the eyeball (seated by probing the block-out), opening toward the family's
//             orbit angle (Heesy 2004: cat 65°, dog 50°, horse 24° convergence), ears
//             (creature-head-parts.ts),
//             the mouth line as a declared crease
//   teeth     upper canines rooted above the lip, crowns outside the lower lip (`face.fangs`)
// Sizes are ratios of head length/width/height, so one recipe line moves a wolf to a big cat.

import type { Mesh, Vec3 } from '../core/index.ts';
import { type SculptEdit, sculptField } from '../primitives/index.ts';
import type { Bones } from './creature-bones.ts';
import { eyeRadius } from './creature-bones.ts';
import { palette } from './creature-coat.ts';
import { mixRgb, v3 } from './creature-curve.ts';
import { type EyeSpec, lidEdits } from './creature-eye.ts';
import { orbitOf } from './creature-family.ts';
import { earEdits, earHeight, fangs } from './creature-head-parts.ts';
import { blob, skin } from './creature-skin.ts';
import { type CreatureSpec, faceOf } from './creature-spec.ts';

export interface HeadLayout {
  readonly L: number;
  readonly W: number;
  readonly H: number;
  /** Cranial length (head minus muzzle). */
  readonly lc: number;
  /** Muzzle tip radius and centre height. */
  readonly rt: number;
  readonly zt: number;
  /** Lip line height and the mouth corner. */
  readonly zm: number;
  readonly corner: Vec3;
  readonly nose: Vec3;
  readonly eye: EyeSpec;
  readonly ear: Vec3 | null;
  /** Ear height, metres (0 without ears). */
  readonly earHeight: number;
  /** Forehead rise over the bridge ÷ H, cheek fur past the cheekbones ÷ W (head presets). */
  readonly stop: number;
  readonly cheek: number;
}

type Block = Pick<HeadLayout, 'L' | 'W' | 'H' | 'lc' | 'rt' | 'zt' | 'stop' | 'cheek'>;

function blockOut(l: Block, coarse = false): SculptEdit[] {
  const { L, W, H, lc, rt, zt } = l;
  const rs = Math.max(Math.min(0.34 * W, 0.36 * H), rt * 1.25);
  const extra: SculptEdit[] = [];
  if (l.stop > 0 && !coarse)
    // Stop: the frontal bone rising steeply from the bridge between the eyes.
    extra.push(
      blob([0.86 * lc, 0, 0.18 * H + l.stop * H * 0.5], [0.24 * lc, 0.3 * W, 0.2 * H], 0.06 * L),
    );
  if (l.cheek > 0 && !coarse)
    // Cheek fur: flares out behind the eye and down to the jaw angle, widening the furred head.
    extra.push(
      blob(
        [0.32 * lc, (0.3 + l.cheek * 0.4) * W, -0.06 * H],
        [0.4 * lc, (0.16 + l.cheek * 0.3) * W, 0.27 * H],
        0.14 * L,
        [0, 0, -10],
      ),
    );
  if (l.stop > 0 && !coarse)
    // Upper lips (flews) along the muzzle's sides: a squarer, broader canid/ursid snout.
    extra.push(
      skin(
        [
          { at: [lc * 0.95, 0.2 * W, zt - rt * 0.2], r: rt * 0.95 },
          { at: [L - rt * 1.6, rt * 0.55, zt - rt * 0.35], r: rt * 0.7 },
        ],
        { blend: 0.04 * L },
      ),
    );
  return [
    ...extra,
    blob([0.5 * lc, 0, 0.08 * H], [0.55 * lc, 0.46 * W, 0.48 * H], 0),
    blob([0.14 * lc, 0, 0.02 * H], [0.34 * lc, 0.4 * W, 0.4 * H], 0.1 * L),
    blob([0.78 * lc, 0.3 * W, -0.1 * H], [0.28 * lc, 0.2 * W, 0.24 * H], 0.12 * L),
    // Muzzle: from under the stop to the nose, the bridge lifted mid-way.
    skin(
      [
        { at: [0.82 * lc, 0, -0.04 * H], r: rs },
        { at: [lc + 0.45 * (L - lc - rt), 0, zt + 0.25 * (rs - rt)], r: (rs + rt) / 2 },
        { at: [L - rt, 0, zt], r: rt },
      ],
      { blend: 0.08 * L },
    ),
    // Lower jaw: both mandibles to the chin, under the muzzle.
    skin(
      [
        { at: [0.5 * lc, 0.28 * W, -0.26 * H], r: 0.13 * H },
        { at: [lc, 0.18 * W, zt - rt * 0.7], r: 0.1 * H },
        { at: [L - 2.2 * rt, 0.04 * W, zt - rt * 0.85], r: rt * 0.55 },
      ],
      { blend: 0.05 * L },
    ),
  ];
}

/** Seats the eye on the block-out: probe along −X at the eye's (y, z) to the skin, then along
 *  the aperture normal `n` back onto it, and sink 0.62 r behind the surface along `n`. */
function seatEye(l: Block, guess: Vec3, r: number, n: Vec3): Vec3 {
  const f = sculptField(blockOut(l), { color: [1, 1, 1] }).field;
  let x = l.L + 0.1;
  for (let i = 0; i < 2000 && f([x, guess[1], guess[2]]) > 0; i++) x -= l.L / 1000;
  let p = v3.add([x, guess[1], guess[2]], v3.mul(n, r * 3));
  for (let i = 0; i < 2000 && f(p) > 0; i++) p = v3.sub(p, v3.mul(n, l.L / 1000));
  return v3.sub(p, v3.mul(n, r * 0.62));
}

/** Unit normal of the left lid opening: (90° − orbit convergence) off +X toward +Y (Heesy 2004). */
export function apertureNormal(s: CreatureSpec): Vec3 {
  const a = ((90 - orbitOf(s)) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a), 0];
}

export function headLayout(b: Bones, s: CreatureSpec): HeadLayout {
  const { length: L, width: W, height: H } = b.head;
  const face = faceOf(s);
  const m = face.muzzle;
  const lc = (1 - m) * L;
  const rt = b.head.beak
    ? H * 0.1
    : face.tip !== null
      ? face.tip * L
      : H * Math.max(0.08, 0.32 - 0.38 * m);
  const zt = -0.1 * H;
  const zm = zt - rt * 0.55;
  const conv = orbitOf(s);
  const n = apertureNormal(s);
  const fwd = s.face?.forward ?? conv / 90;
  const r = Math.min(eyeRadius(s.mass), 0.16 * W);
  const c = palette(s.colours);
  const base = {
    L,
    W,
    H,
    lc,
    rt,
    zt,
    zm,
    stop: face.stop,
    cheek: face.cheek,
    corner: [0.88 * lc, 0.26 * W, zm + 0.04 * H] as Vec3,
    nose: [L - rt * 0.2, 0, zt + rt * 0.3] as Vec3,
    ear: faceOf(s).ears === 'none' ? null : ([0.32 * lc, 0.3 * W, 0.34 * H] as Vec3),
    earHeight: earHeight(s) * L,
  };
  const centre = seatEye(base, [0, W * (0.4 - 0.14 * fwd), 0.14 * H], r, n);
  const eye: EyeSpec = {
    centre,
    r,
    iris: r * 0.82,
    upper: 0.2,
    lower: 0.1,
    lid: Math.max(0.0015, r * 0.16),
    tilt: 10,
    scowl: 4,
    // Rest gaze along the orbit: the iris centred in the lid opening.
    gaze: v3.add(centre, v3.mul(n, 2)),
    aperture: 90 - conv,
    pupil: s.face?.pupil ?? 'round',
    colours: {
      sclera: mixRgb(c.iris, [0.08, 0.06, 0.05], 0.75),
      iris: c.iris,
      pupil: [0.01, 0.01, 0.01],
      wet: c.nose,
      caruncle: c.nose,
    },
  };
  return { ...base, eye };
}

function features(
  l: HeadLayout,
  s: CreatureSpec,
  b: Bones,
  res: number,
  lod: number,
): SculptEdit[] {
  const fine = lod === 0;
  const c = palette(s.colours);
  const { L, H, rt, zt } = l;
  const e = l.eye.centre;
  const groove = Math.max(0.012 * H, res * 0.6);
  const out: SculptEdit[] = [];
  if (b.skeleton === 'bird')
    // Beak: a keratin cone over the muzzle, hooked a little at the tip.
    out.push(
      skin(
        [
          { at: [l.lc, 0, zt], r: rt * 1.6 },
          { at: [L - rt * 0.4, 0, zt - rt * 0.4], r: rt * 0.35 },
        ],
        { blend: rt * 0.3, color: c.keratin },
      ),
    );
  else if (!b.head.beak)
    out.push(
      blob(l.nose, [rt * 0.5, rt * 0.75, rt * 0.55], rt * 0.3),
      {
        shape: 'ellipsoid',
        at: l.nose,
        size: [rt * 0.5, rt * 0.75, rt * 0.55],
        op: 'paint',
        blend: rt * 0.15,
        color: c.nose,
      },
      {
        shape: 'sphere',
        at: [L + rt * 0.1, rt * 0.3, zt + rt * 0.15],
        size: rt * 0.17,
        op: 'subtract',
        blend: rt * 0.06,
        color: c.nose,
      },
    );
  out.push(
    // Mouth line: the lip groove from the front to the mouth corner (a declared crease).
    {
      shape: 'capsule',
      at: [L - rt * 0.5, 0, l.zm],
      to: l.corner,
      size: groove,
      op: fine ? 'subtract' : 'paint',
      blend: groove,
      color: c.nose,
    },
    // Brow ridge: the supraorbital shelf shading the eye.
    skin(
      [
        {
          at: [e[0] + l.eye.r * 0.8, e[1] - l.eye.r * 1.3, e[2] + l.eye.r * 1.6],
          r: l.eye.r * 0.7,
        },
        {
          at: [e[0] - l.eye.r * 0.6, e[1] + l.eye.r * 0.2, e[2] + l.eye.r * 1.5],
          r: l.eye.r * 0.85,
        },
      ],
      { blend: l.eye.r * 1.2 },
    ),
    {
      shape: 'sphere',
      at: v3.add(e, v3.mul(apertureNormal(s), l.eye.r * 0.25)),
      size: l.eye.r * 1.15,
      op: 'subtract',
      blend: l.eye.r * 0.35,
      color: c.nose,
    },
    ...lidEdits(l.eye),
    ...earEdits(l, s, res, fine),
  );
  return out;
}

/** Every head edit at this cell size, and the teeth mesh (head-local). */
export function headEdits(
  b: Bones,
  s: CreatureSpec,
  lod: number,
  res: number,
): { layout: HeadLayout; edits: SculptEdit[]; teeth: Mesh | null } {
  const l = headLayout(b, s);
  return {
    layout: l,
    edits: [...blockOut(l, lod === 2), ...features(l, s, b, res, lod)],
    teeth: lod < 2 ? fangs(l, s, lod) : null,
  };
}
