// Where a face's skin zones are, as masks for the pore strips (./skin-strip.ts `onSkin`): the
// lips (wet), the thin skin round the eyes (fine), the scalp (matte), the T-zone (oily), and the
// two that follow how skin really varies across a face (D520): freckles gathered in a butterfly
// over the nose's bridge and the upper cheekbones, fading out toward forehead and jaw, and the
// clear skin (finest, near-invisible pores) everywhere off the nose and the cheeks' centres. All
// in the mesh's own space, left side given (the masks fold |y|).

import { dmath, type Vec3 } from '@developerz.ai/ts23d';

const clamp = (v: number): number => Math.min(1, Math.max(0, v));

/** Distance in the front view (y, z) from `p` (|y|) to the segment a → b. */
function frontDist(p: Vec3, a: Vec3, b: Vec3): number {
  const y = Math.abs(p[1]);
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const L2 = dy * dy + dz * dz || 1;
  const t = clamp(((y - a[1]) * dy + (p[2] - a[2]) * dz) / L2);
  return dmath.hypot(y - (a[1] + dy * t), p[2] - (a[2] + dz * t));
}

/** The lips' vermilion as a wet mask (1 on it): an ellipse about the mouth line between the
 *  corners, from the upper lip's top to the lower lip's bottom, in front of the teeth. */
export function lipZone(k: {
  readonly sup: Vec3;
  readonly inf: Vec3;
  readonly corner: Vec3;
}): (p: Vec3) => number {
  const cz = (k.sup[2] + k.inf[2]) / 2;
  const hz = Math.abs(k.sup[2] - k.inf[2]) * 0.56 + 0.0015;
  const hy = Math.abs(k.corner[1]) * 0.98;
  const back = Math.min(k.sup[0], k.inf[0]) - 0.014;
  return (p) => {
    const e = dmath.pow(p[1] / hy, 2) + dmath.pow((p[2] - cz) / hz, 2);
    return e < 1 && p[0] > back ? 1 : 0;
  };
}

/** The thin skin round the eyes as a mask (1 on it): an ellipse about each eye (`eye`, its ball's
 *  centre, either side; `r`, the ball's radius) from the brow's underside to the cheek's top,
 *  reaching past the outer corner over the crow's-feet, in front of the ball's centre. */
export function eyeZone(k: { readonly eye: Vec3; readonly r: number }): (p: Vec3) => number {
  const [ex, ey, ez] = k.eye;
  const R = k.r;
  const ay = Math.abs(ey) + 0.3 * R;
  return (p) => {
    const dy = (Math.abs(p[1]) - ay) / (1.85 * R);
    const dz = (p[2] - ez + 0.15 * R) / (1.3 * R);
    return dy * dy + dz * dz < 1 && p[0] > ex - 0.4 * R ? 1 : 0;
  };
}

/** The scalp as a matte mask (1 on it): the dome above the forehead's middle (`forehead`, the
 *  T-zone's top), and the back and sides of the head behind the ear's front (`tragion`) above
 *  its height. The face keeps its own strips; a bald crown loses the hot spots. */
export function scalpZone(k: {
  readonly forehead: Vec3;
  readonly tragion: Vec3;
}): (p: Vec3) => number {
  return (p) =>
    p[2] > k.forehead[2] || (p[0] < k.tragion[0] - 0.01 && p[2] > k.tragion[2]) ? 1 : 0;
}

/** The T-zone as an oil mask (1 on it, 0 a `soft` away): the forehead's centre band down the
 *  nose to the chin, from four midline points and the nose's half-width. */
export function tZone(
  k: {
    readonly forehead: Vec3;
    readonly glabella: Vec3;
    readonly noseTip: Vec3;
    readonly chin: Vec3;
  },
  halfNose: number,
): (p: Vec3) => number {
  const soft = halfNose * 0.6;
  return (p) => {
    const y = Math.abs(p[1]);
    // Above the brow: a band three nose-widths across; below it: the nose and the chin's centre.
    const brow = p[2] > k.glabella[2] ? y - halfNose * 3 : Number.POSITIVE_INFINITY;
    const nose = p[2] <= k.glabella[2] && p[2] > k.noseTip[2] - halfNose ? y - halfNose : Infinity;
    const chin = dmath.hypot(y, p[2] - k.chin[2]) - halfNose * 1.2;
    const front = k.chin[0] - 0.04 - p[0];
    const d = Math.max(Math.min(brow, nose, chin), front, p[2] - k.forehead[2]);
    return Math.min(1, Math.max(0, 0.5 - d / soft));
  };
}

/** Freckles' cluster as a soft mask (1 on its spine, `amount` at most; `onSkin` dithers it into
 *  a density): a butterfly from the nose's bridge (`bridge`) out over the upper cheekbone
 *  (`cheek`, left side), fading over `r` in the front view toward forehead, temples and jaw, on
 *  the face's front only (ahead of `back` along X). */
export function freckleZone(
  k: { readonly bridge: Vec3; readonly cheek: Vec3; readonly back: number },
  r: number,
  amount: number,
): (p: Vec3) => number {
  const bridge: Vec3 = [k.bridge[0], 0, k.bridge[2]];
  return (p) => {
    if (p[0] < k.back) return 0;
    const t = clamp(1 - frontDist(p, bridge, k.cheek) / r);
    return amount * t * t * (3 - 2 * t);
  };
}

/** Clear skin as a soft mask (1 on it; `onSkin` dithers it): the finest pores off the nose and
 *  each cheek's centre (`cheek`, the pore field's centre, left side; `r` its radius in the front
 *  view, then a `soft` ramp), so the forehead's sides, the temples, the jaw and the neck read
 *  smooth and the coarse pores gather where a face really has them. The T-zone's strip claims
 *  the nose and the chin first; behind `back` along X it is all clear. */
export function clearZone(
  k: { readonly cheek: Vec3; readonly back: number },
  r: number,
  soft: number,
): (p: Vec3) => number {
  return (p) => {
    // Behind the face (the head's sides and back, the neck's back): clear.
    if (p[0] < k.back) return 1;
    const d = dmath.hypot(Math.abs(p[1]) - k.cheek[1], p[2] - k.cheek[2]);
    return clamp((d - r) / soft);
  };
}

/** A face's complexion (D520): how strongly freckles gather over the nose's bridge and the
 *  cheekbones (0 none … 1), and whether the skin is fine (an elf's: coarse pores only on the
 *  nose and a small centre of each cheek, the freckled butterfly narrower). */
export interface Complexion {
  readonly freckles?: number;
  readonly fine?: boolean;
}

/** The freckle and clear-skin masks of a face from its landmarks (left side, the mesh's space;
 *  `s` its scale, 1 for the measured human head). */
export function complexionZones(
  k: {
    readonly nasion: Vec3;
    readonly pronasale: Vec3;
    readonly cheek: Vec3;
    readonly zygion: Vec3;
    readonly eye: Vec3;
    readonly tragion: Vec3;
  },
  s: number,
  c: Complexion = {},
): { freckle?: (p: Vec3) => number; clear: (p: Vec3) => number } {
  const mixed = (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  // The cheekbone's top: between the cheek's apple and the zygion, raised toward the eye.
  const bone = mixed(k.cheek, k.zygion, 0.3);
  const upper: Vec3 = [bone[0], bone[1], bone[2] + 0.35 * (k.eye[2] - bone[2])];
  const back = k.tragion[0] + 0.01 * s;
  const clear = clearZone(
    { cheek: mixed(k.cheek, upper, 0.3), back },
    (c.fine ? 0.016 : 0.026) * s,
    0.022 * s,
  );
  const amount = c.freckles ?? 0;
  if (amount <= 0) return { clear };
  return {
    clear,
    freckle: freckleZone(
      { bridge: mixed(k.nasion, k.pronasale, 0.45), cheek: upper, back: k.zygion[0] - 0.005 * s },
      (c.fine ? 0.024 : 0.03) * s,
      amount,
    ),
  };
}
