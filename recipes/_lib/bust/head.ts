// A parametric sculpted head, shared by the human, elf and goblin busts (the orc has its own
// hand-built modules in recipes/orc_head). Every landmark comes from RATIOS of the head height H
// (chin → crown), anchored on the human measured from the Lee Perry-Smith scan (see
// docs/research/head-analysis.md); a race declares its exaggerations as ratio overrides and shape
// knobs. This file: the ratios, the landmarks and stages 1–2 — the block-out (cranium egg,
// occiput, skull base, mid-face block, boat-sail jaw, muzzle, buccal fill, lateral orbital rims,
// chin) and the planes scraped in (side, jaw fading out under the cheekbones, under-jaw, forehead,
// cheek, back of skull) with the brow folded in. Sockets, features and lines: face.ts.

import { type SculptEdit, Ts23dError } from '@developerz.ai/ts23d';
import { ball, ell, flipY, frameOf, k, local, rbox, scrape, type V } from './kit.ts';

/** Landmarks as shares of H: heights from the menton (chin bottom) up; widths full (both sides);
 *  projections forward of the glabella. */
export interface Ratios {
  readonly eye: number;
  readonly brow: number;
  readonly noseTip: number;
  readonly subnasale: number;
  readonly mouth: number;
  readonly pogonion: number;
  readonly earTop: number;
  readonly earBottom: number;
  readonly ipd: number;
  readonly craniumWidth: number;
  readonly bigonial: number;
  readonly depth: number;
  readonly noseProj: number;
  readonly chinProj: number;
}

/** The human anchor: measured on the Lee Perry-Smith head scan (CC BY 3.0), docs/research. */
export const HUMAN: Ratios = {
  eye: 0.54,
  brow: 0.625,
  noseTip: 0.392,
  subnasale: 0.339,
  mouth: 0.248,
  pogonion: 0.127,
  earTop: 0.555,
  earBottom: 0.292,
  ipd: 0.265,
  craniumWidth: 0.683,
  bigonial: 0.449,
  depth: 0.888,
  noseProj: 0.072,
  chinProj: 0.013,
};

export interface HeadSpec {
  /** Chin (menton) to crown, metres. */
  readonly H: number;
  /** The glabella (brow centre, the face's most forward bone) — the head's anchor point. */
  readonly glabella: V;
  readonly r: Ratios;
  /** Shape knobs, 1 = human. */
  readonly knobs?: {
    readonly cheekbone?: number;
    readonly jaw?: number;
    readonly chin?: number;
    readonly brow?: number;
    readonly noseWidth?: number;
    /** Nose tip droop (+ hooks down), × H. */
    readonly noseHook?: number;
    /** Expression lines (nasolabial, lid fold, under-eye bag): 0 smooth (elf) … 1 human. */
    readonly lines?: number;
    /** Half mouth width, × H (human 0.1). */
    readonly mouth?: number;
    readonly lips?: number;
    /** Cranium height above the brow, × human. */
    readonly vault?: number;
    /** Gaunt cheeks: 0 full (default) … 1 hollow under the cheekbones. */
    readonly hollow?: number;
    /** How softly the brow and cheek roll into the orbit (× the human blend). */
    readonly socket?: number;
    /** Cheekbone ridge raised by this share of H (high elven cheekbones). */
    readonly cheekLift?: number;
    /** Mouth (muzzle, teeth arc, lips) moved forward (+) or back (−) by this share of H. */
    readonly prognathism?: number;
  };
  /** Eyeball radius ÷ H (human 12 / 232 = 0.052). */
  readonly eyeR: number;
  readonly skin: V;
  readonly lips: V;
}

/** A shape knob's value, or its default (1; 0 for the offsets; human mouth half-width 0.1). */
export const kn = (s: HeadSpec, key: keyof NonNullable<HeadSpec['knobs']>): number =>
  s.knobs?.[key] ??
  (key === 'noseHook' || key === 'hollow' || key === 'cheekLift' || key === 'prognathism'
    ? 0
    : key === 'mouth'
      ? 0.1
      : 1);

/**
 * Throws T3D_RECIPE_INVALID when a race's ratios cannot make a face: features out of order
 * (brow ≥ eye > nose tip ≥ subnasale > mouth > chin) or a stylisation beyond 3× the human anchor.
 */
export function checkRatios(r: Ratios, name = 'head'): Ratios {
  const order: Array<[keyof Ratios, keyof Ratios]> = [
    ['brow', 'eye'],
    ['eye', 'noseTip'],
    ['noseTip', 'subnasale'],
    ['subnasale', 'mouth'],
    ['mouth', 'pogonion'],
  ];
  for (const [hi, lo] of order)
    if (!(r[hi] > r[lo]))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `${name}: ratio ${hi} ${r[hi]} is not above ${lo} ${r[lo]} (heights from the chin, × H)`,
        fix: `keep brow > eye > noseTip > subnasale > mouth > pogonion; human: ${hi} ${HUMAN[hi]}, ${lo} ${HUMAN[lo]}`,
      });
  for (const k of Object.keys(HUMAN) as Array<keyof Ratios>) {
    const h = Math.abs(HUMAN[k]);
    if (h > 0.03 && !(Math.abs(r[k]) <= h * 3 && Math.abs(r[k]) >= h / 3))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `${name}: ratio ${k} ${r[k]} is beyond 3× the human ${HUMAN[k]}`,
        fix: `declare a stylisation within ×1/3 … ×3 of the human anchor (docs/research/head-analysis.md)`,
      });
  }
  return r;
}

/** Every derived landmark (left side; mirror for the right). */
export function landmarks(s: HeadSpec) {
  const { H } = s;
  const r = checkRatios(s.r);
  const [gx, , gz] = s.glabella;
  const mz = gz - r.brow * H;
  const z = (f: number): number => mz + f * H;
  const vault = kn(s, 'vault');
  const crown = mz + H;
  const back = gx - r.depth * H;
  const jut = kn(s, 'prognathism') * H;
  return {
    H,
    mz,
    crown,
    back,
    gx,
    eye: [gx - 0.088 * H, (r.ipd * H) / 2, z(r.eye)] as V,
    eyeR: s.eyeR * H,
    nasion: [gx - 0.03 * H, 0, z((r.eye + r.brow) / 2)] as V,
    noseTip: [gx + r.noseProj * H, 0, z(r.noseTip)] as V,
    subnasale: [gx + 0.016 * H, 0, z(r.subnasale)] as V,
    mouth: [gx + 0.02 * H + jut, 0, z(r.mouth)] as V,
    pogonion: [gx + r.chinProj * H, 0, z(r.pogonion)] as V,
    menton: [gx - 0.06 * H, 0, mz] as V,
    gonion: [back + 0.4 * H, (r.bigonial * H) / 2, z(0.2)] as V,
    zygoma: [gx - 0.09 * H, r.craniumWidth * H * 0.34, z(r.eye - 0.12)] as V,
    ear: [back + r.depth * H * 0.53, r.craniumWidth * H * 0.44, z(r.earBottom + 0.02)] as V,
    earLength: (r.earTop - r.earBottom) * H,
    cranium: {
      at: [gx - (r.depth * H) / 2 + 0.01 * H, 0, crown - 0.3 * H * vault] as V,
      r: [(r.depth * H) / 2, (r.craniumWidth * H) / 2, 0.3 * H * vault] as V,
    },
    // Teeth arc: the lips on it put the labrale ≈ 1 % H in front of the stomion.
    teeth: { x: gx - 0.21 * H + jut, r: 0.215 * H },
  };
}

export type Landmarks = ReturnType<typeof landmarks>;

function pair(at: V, n: V, blend: number): SculptEdit[] {
  return [scrape(at, n, 1, blend), scrape(flipY(at), flipY(n), 1, blend)];
}

/** Stage 1–2: the head block (one group, planes scraped in, brow folded in). */
export function headBlock(s: HeadSpec, stage: number): SculptEdit {
  const l = landmarks(s);
  const { H } = l;
  const g: SculptEdit[] = [
    ell(l.cranium.at, l.cranium.r),
    ball([l.back + 0.24 * H, 0, l.cranium.at[2] - 0.05 * H], 0.22 * H, { blend: 0.1 * H }),
    // Skull base: the cranium's lower half (temporal bones, ear canals, the occiput's underside)
    // that the egg leaves out — without it the head is hollow above the neck, an inner shell
    // folding round the neck's top.
    ell(
      [l.cranium.at[0] + 0.02 * H, 0, l.mz + 0.36 * H],
      [0.36 * H, l.cranium.r[1] * 0.8, 0.22 * H],
      { blend: 0.1 * H },
    ),
    // Mid-face block under the brow.
    ell([l.gx - 0.17 * H, 0, l.mz + 0.42 * H], [0.19 * H, 0.29 * H, 0.22 * H], { blend: 0.14 * H }),
    // Boat-sail jaw, its width the bigonial breadth.
    ell(
      [l.gx - 0.2 * H, 0, l.mz + 0.15 * H],
      [0.24 * H, l.gonion[1] * 1.02 * kn(s, 'jaw'), 0.13 * H],
      {
        blend: 0.12 * H,
        rotate: [0, 14, 0],
      },
    ),
    // Muzzle (orbicularis) round the teeth: its front at the measured mouth projection, so the
    // profile runs forehead → nose → lips → chin without the mouth thrusting forward.
    ell([l.mouth[0] - 0.125 * H, 0, l.mouth[2]], [0.12 * H, 0.17 * H, 0.1 * H], { blend: 0.1 * H }),
    // Buccal fill under the cheekbones (no gauntness unless a race declares `hollow`).
    ...[1, -1].map((side) =>
      ell(
        [l.gx - 0.15 * H, side * 0.18 * H, l.subnasale[2] - 0.03 * H],
        [0.1 * H, 0.055 * H * (1 - 0.4 * kn(s, 'hollow')), 0.1 * H],
        { blend: 0.12 * H },
      ),
    ),
    // Lateral orbital rim: the frontal/zygomatic bone wrapping the outer side of each eye, so the
    // ball sits IN the face (the orbit closes round it) instead of on the egg's narrowing front.
    ...[1, -1].map((side) =>
      ell(
        [l.eye[0] - l.eyeR * 0.6, side * (l.eye[1] + l.eyeR * 1.25), l.eye[2]],
        [l.eyeR * 0.9, l.eyeR * 0.75, l.eyeR * 1.7],
        { blend: 0.08 * H },
      ),
    ),
    // Chin.
    rbox(
      [l.pogonion[0] - 0.05 * H, 0, l.mz + 0.08 * H],
      [0.12 * H, 0.2 * H * kn(s, 'chin'), 0.13 * H],
      0.05 * H,
      { blend: 0.08 * H },
    ),
  ];
  if (stage >= 2) {
    const cw = (s.r.craniumWidth * H) / 2;
    g.push(...pair([0, cw * 0.93, l.eye[2]], [0, 1, 0.22], 0.09 * H));
    // Jaw side planes, fading out above the cheekbone line: unbounded, the plane sliced the face
    // up to the temples (a narrow, gaunt mid-face with the eyes left outside the orbit).
    // The fade is a smooth ramp (quadratic, then linear): a hard min() left a crease across the
    // cheek where it switched.
    const z0 = l.subnasale[2] - 0.02 * H;
    const w = 0.08 * H;
    const fade = (z: number): number => {
      const t = Math.max(0, z - z0);
      return t < w ? (t * t) / (2 * w) : t - w / 2;
    };
    for (const side of [1, -1]) {
      const n: V = [0.25, side, -0.15];
      const k = Math.hypot(...n);
      const at: V = [0, side * l.gonion[1], l.gonion[2]];
      g.push({
        field: (p) =>
          ((p[0] - at[0]) * n[0] + (p[1] - at[1]) * n[1] + (p[2] - at[2]) * n[2]) / k - fade(p[2]),
        bounds: [
          [at[0] - 1, at[1] - 1, at[2] - 1],
          [at[0] + 1, at[1] + 1, at[2] + 1],
        ],
        op: 'intersect',
        blend: 0.07 * H,
      });
    }
    // The cheek's side plane: turned 30° toward the front, wide blend — a plane, not a hollow.
    g.push(...pair([l.gx - 0.1 * H, cw * 0.9, l.eye[2] - 0.15 * H], [0.55, 1, -0.05], 0.15 * H));
    g.push(scrape(l.menton, [0.5, 0, -1], 1, 0.06 * H));
    g.push(scrape([l.gx - 0.03 * H, 0, l.mz + s.r.brow * H + 0.05 * H], [1, 0, 0.32], 1, 0.12 * H));
    g.push(scrape([l.back + 0.02 * H, 0, l.cranium.at[2]], [-1, 0, 0.2], 1, 0.15 * H));
  }
  // Brow: the forehead plane's lower edge rolling forward into the supraorbital ridge.
  const b = kn(s, 'brow');
  for (const side of [1, -1]) {
    const f = frameOf(
      [l.gx - 0.04 * H, side * 0.13 * H, l.mz + s.r.brow * H],
      [-0.4, side, 0.1],
      [1, side * 0.3, 0.2],
    );
    g.push(
      local(
        f,
        k.ellipsoid(0, 0, 0, 0.13 * H, 0.05 * H * b, 0.035 * H * b),
        [
          [-0.25 * H, -0.12 * H, -0.12 * H],
          [0.25 * H, 0.12 * H, 0.12 * H],
        ],
        { blend: 0.12 * H },
      ),
    );
  }
  g.push(ell(s.glabella, [0.04 * H * b, 0.07 * H * b, 0.04 * H * b], { blend: 0.1 * H }));
  // Blended onto the neck and trapezius (sculpted before it): a hard union left a fold round the
  // skull base from ear to ear.
  return { group: g, mirror: false, blend: 0.1 * H };
}
