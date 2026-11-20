// Stage 5 of a skull-stage head, the skin: tone zones as paint edits on the warped base, placed
// from its landmarks — the lips' vermilion; blood-warm redness on the nose, the cheeks and the
// ears; a blue-grey beard shadow over the jaw, chin and upper lip (shaven adult male skin); the
// eyebrows as a darker streak along the ridge; cool, darker eye sockets. The bust's skin painter
// (../bust/skin.ts) adds cavity darkening, warm tops and the mottle on top of these colours.

import type { SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import type { SkullLandmarks } from './skull.ts';

export interface Zones {
  readonly lips: Vec3;
  /** Blood-warm redness (nose tip, cheeks, ears). */
  readonly flush: Vec3;
  /** Eye socket shade. */
  readonly socket: Vec3;
  /** Beard shadow colour, or omit for none (women, elves, beardless races). */
  readonly shadow?: Vec3;
  /** Eyebrow colour, or omit for none. */
  readonly brows?: Vec3;
  /** The forehead's yellower, paler zone (thin skin over bone), or omit. */
  readonly forehead?: Vec3;
  /** Lash line: a dark margin along the upper lid where the lashes root, or omit. */
  readonly lashes?: Vec3;
}

const paint = (at: Vec3, size: Vec3, color: Vec3, blend: number): SculptEdit => ({
  shape: 'ellipsoid',
  at,
  size,
  op: 'paint',
  color,
  blend,
});

/** Paint edits for the tone zones (left side; the sculpt mirrors). `H` = head height, metres. */
export function zoneEdits(k: SkullLandmarks, H: number, z: Zones): SculptEdit[] {
  const out: SculptEdit[] = [];
  const s = k.stomion;
  const cy = Math.abs(k.cheilion[1]);
  // Shaven beard shadow first: the redness and the lips paint over its edges.
  if (z.shadow) {
    out.push(
      paint(
        [s[0] - 0.03 * H, cy * 0.9, s[2] - 0.05 * H],
        [0.06 * H, cy * 1.5, 0.07 * H],
        z.shadow,
        0.03 * H,
      ),
      paint(
        [k.gonion[0] + 0.06 * H, k.gonion[1] * 0.85, k.gonion[2] - 0.005 * H],
        [0.09 * H, 0.04 * H, 0.05 * H],
        z.shadow,
        0.03 * H,
      ),
      paint(
        [s[0] - 0.004 * H, 0, s[2] + 0.03 * H],
        [0.02 * H, cy * 1.05, 0.016 * H],
        z.shadow,
        0.012 * H,
      ),
    );
  }
  if (z.forehead)
    out.push(
      paint(
        add(k.glabella, -0.012 * H, 0, 0.11 * H),
        [0.05 * H, 0.22 * H, 0.08 * H],
        z.forehead,
        0.05 * H,
      ),
    );
  out.push(
    // Eye socket: cooler and darker round the lids.
    paint(
      add(k.eye, k.eyeR * 0.8, 0, -k.eyeR * 0.2),
      [k.eyeR * 1.3, k.eyeR * 1.9, k.eyeR * 1.6],
      z.socket,
      0.02 * H,
    ),
    // Redness: nose tip and wings, the cheek apples, the ears.
    paint(
      add(k.pronasale, -0.012 * H, 0, -0.004 * H),
      [0.03 * H, 0.032 * H, 0.03 * H],
      z.flush,
      0.025 * H,
    ),
    paint(
      add(k.cheek, 0.004 * H, 0.004 * H, 0),
      [0.05 * H, 0.045 * H, 0.04 * H],
      z.flush,
      0.04 * H,
    ),
    paint(
      add(k.tragion, -0.03 * H, 0.03 * H, 0.03 * H),
      [0.06 * H, 0.06 * H, 0.1 * H],
      z.flush,
      0.02 * H,
    ),
    // Lips: the upper vermilion between the white roll and the stomion, the fuller lower lip.
    paint(
      [s[0] - 0.006 * H, 0, s[2] + 0.009 * H],
      [0.03 * H, cy * 0.98, 0.011 * H],
      z.lips,
      0.006 * H,
    ),
    paint(
      [s[0] - 0.008 * H, 0, s[2] - 0.011 * H],
      [0.03 * H, cy * 0.88, 0.014 * H],
      z.lips,
      0.007 * H,
    ),
  );
  if (z.lashes) {
    // Lash line: small dabs on an arc over the front of the ball, inner → outer corner.
    const R = k.eyeR * 1.1;
    for (let i = 0; i <= 6; i++) {
      const a = (-0.55 + (1.1 * i) / 6) * 1.2;
      const at: Vec3 = add(
        k.eye,
        R * dmath.cos(a) * 0.86,
        R * dmath.sin(a),
        R * 0.48 * dmath.cos(a),
      );
      out.push(paint(at, [k.eyeR * 0.12, k.eyeR * 0.22, k.eyeR * 0.08], z.lashes, k.eyeR * 0.06));
    }
  }
  if (z.brows) {
    // Eyebrow: a band along the ridge, thick at the head, tapering to the tail.
    const head = add(k.brow, 0.006 * H, -0.05 * H, -0.004 * H);
    const tail = add(k.browOuter, -0.006 * H, 0.008 * H, -0.004 * H);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const at: Vec3 = [
        head[0] + (tail[0] - head[0]) * t,
        head[1] + (tail[1] - head[1]) * t,
        head[2] + (tail[2] - head[2]) * t + dmath.sin(t * Math.PI * 0.8) * 0.012 * H,
      ];
      out.push(paint(at, [0.05 * H, 0.016 * H, (0.014 - 0.007 * t) * H], z.brows, 0.01 * H));
    }
  }
  return out;
}

const add = (a: Vec3, x: number, y: number, z: number): Vec3 => [a[0] + x, a[1] + y, a[2] + z];
