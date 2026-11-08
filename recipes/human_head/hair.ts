// Human hair and beard as sculpted locks: a swept-back hair mass inside a rounded hairline with
// clumps flowing front → crown → nape and grooves between them, a lifted front lock; a clipped
// beard mass along the jaw with downward locks and a drooping moustache of two locks.

import { type Field, type SculptEdit, sculptField } from '@developerz.ai/ts23d';
import { flowLocks, hairMass, lock } from '../_lib/bust/hair.ts';
import { C, H, L, TORSO } from '../_lib/bust/human/spec.ts';
import { type Surface, spline, surface, type V } from '../_lib/bust/kit.ts';
import { torsoEdits } from '../_lib/bust/torso.ts';

/** The torso (neck, trapezius) the hair and beard must stop short of. */
const neck: Field = sculptField(torsoEdits(L, TORSO), { color: C.skin, mirror: 'y' }).field;

/** Hairline: keep hair above a plane rising from the nape to the forehead, above the ears. */
export const hairline: Field = (p) => {
  const front = L.gx + 0.02 * H;
  const zFront = L.mz + 0.86 * H;
  const zBack = L.mz + 0.42 * H;
  const t = Math.min(1, Math.max(0, (front - p[0]) / (front - L.back)));
  const above = zFront + (zBack - zFront) * t;
  // Above the ears at the sides.
  const ears = L.mz + 0.62 * H - Math.abs(p[1]) * 0.0;
  // …and 12 mm short of the neck and trapezius, so the nape edge never folds into them.
  return Math.max(
    above - p[2],
    Math.abs(p[1]) > L.ear[1] * 0.9 ? ears - p[2] : -1,
    0.012 - neck(p),
  );
};

export const beardline: Field = (p) => {
  // The beard: below the cheek line, in front of the ears, outside a mouth hole.
  const cheek = L.mz + 0.3 * H - (p[0] - L.gx) * 0.3;
  const mouth = Math.hypot((p[0] - L.mouth[0]) * 1.2, p[1], (p[2] - L.mouth[2]) * 2.2) - 0.11 * H;
  // Under the jaw the beard thins out 12 mm short of the neck, so it never folds into the throat.
  // The sideburn stops 1.5 cm in front of the ear root, so the beard never runs into the ear.
  return Math.max(p[2] - cheek, L.back + 0.54 * H - p[0], -mouth, 0.012 - neck(p));
};

export function hairEdits(scalp: Field, lod: number): SculptEdit[] {
  const box: [V, V] = [
    [L.back - 0.05, -0.12, L.mz - 0.06 * H],
    [L.gx + 0.06, 0.12, L.crown + 0.04],
  ];
  const mass = hairMass(scalp, 0.008, hairline, box, C.hairRoot, 0.045);
  const beard = hairMass(scalp, 0.006, beardline, box, C.hairRoot, 0.015);
  const out: SculptEdit[] = [mass, beard];
  if (lod === 2) return out;
  const hair: Surface = surface(
    sculptField([mass, beard, { field: scalp, bounds: box }], { color: C.hairRoot }).field,
  );
  out.push(...flowLocks(hair, hairLines(), 0.0068, { root: C.hairRoot, tip: C.hairTip }));
  // Beard locks down the jaw, and the moustache.
  out.push(...flowLocks(hair, beardLines(), 0.0045, { root: C.hairRoot, tip: C.hairTip }));
  out.push(...lock(moustache(), 0.0075, 0.0025, C.hairRoot, C.hairTip));
  return out;
}

/** Swept-back lock lines from the hairline over the crown to the nape (left half, mirrored). */
export function hairLines(): V[][] {
  const lines: V[][] = [];
  for (let i = 0; i < 5; i++) {
    const y = 0.007 + i * 0.0135;
    lines.push(
      spline(
        [
          [L.gx + 0.0, y * 0.9, L.mz + 0.88 * H],
          [L.gx - 0.25 * H, y * 1.1, L.crown + 0.01],
          [L.back + 0.12 * H, y * 1.25, L.mz + 0.8 * H],
          [L.back + 0.04 * H, y * 1.3, L.mz + 0.5 * H],
        ],
        8,
      ),
    );
  }
  return lines;
}

/** Beard lock lines down the jaw (left half, mirrored). */
export function beardLines(): V[][] {
  const lines: V[][] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 4) * 70;
    const t = (a * Math.PI) / 180;
    const c: V = [
      L.mouth[0] - 0.12 * H * (1 - Math.cos(t)),
      0.12 * H * Math.sin(t) + 0.004,
      L.mouth[2] - 0.06 * H,
    ];
    lines.push(
      spline(
        [c, [c[0] - 0.01, c[1] * 1.05, L.mz + 0.08 * H], [c[0] - 0.03, c[1] * 1.05, L.mz - 0.01]],
        6,
      ),
    );
  }
  return lines;
}

/** The drooping moustache lock (left half, mirrored). */
export function moustache(): V[] {
  return spline(
    [
      [L.subnasale[0] - 0.005, 0.004, L.subnasale[2] - 0.006],
      [L.mouth[0] + 0.004, 0.022, L.mouth[2] + 0.004],
      [L.mouth[0] - 0.01, 0.034, L.mouth[2] - 0.016],
    ],
    8,
  );
}
