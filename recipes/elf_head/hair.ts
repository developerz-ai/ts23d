// Elf hair as sculpted locks: a centre-parted mass over the scalp, then long locks that start at
// the parting, follow the skull over the top and behind the pointed ears, and fall free onto the
// shoulders and back — tapered, overlapping, toned dark at the roots and pale gold at the tips —
// and two flat ribbon locks falling in front of the ears.
// Card hair (`hairBaseEdits` + `elfCardHair`): the parted mass is the base layer; long strand
// cards comb out from the parting over the skull and fall to the shoulders.

import { type Field, type SculptEdit, sculptField, type Vec3 } from '@developerz.ai/ts23d';
import { hairMass, lock, mix, ribbon } from '../_lib/bust/hair.ts';
import { headBlock } from '../_lib/bust/head.ts';
import { type Surface, spline, surface, type V } from '../_lib/bust/kit.ts';
import { torsoEdits } from '../_lib/bust/torso.ts';
import { C, H, L, SPEC, TORSO } from './spec.ts';

export const hairline: Field = (p) => {
  const front = L.gx + 0.0;
  const zFront = L.mz + 0.9 * H;
  const zBack = L.mz + 0.38 * H;
  const t = Math.min(1, Math.max(0, (front - p[0]) / (front - L.back)));
  return zFront + (zBack - zFront) * Math.sqrt(t) - p[2];
};

export function hairEdits(scalp: Field, lod: number): SculptEdit[] {
  const box: [V, V] = [
    [L.back - 0.05, -0.15, L.mz - 0.2],
    [L.gx + 0.06, 0.15, L.crown + 0.05],
  ];
  const mass = hairMass(scalp, 0.007, hairline, box, C.hairRoot, 0.03);
  const out: SculptEdit[] = [mass];
  const hair: Surface = surface(
    sculptField([{ field: scalp, bounds: box }, mass], { color: C.hairRoot }).field,
  );
  const n = lod === 2 ? 3 : 7;
  for (const { ctrl, r } of longLocks(n, hair))
    out.push(
      ...lock(spline(ctrl, lod === 2 ? 6 : 16), r, 0.003, C.hairRoot, C.hairTip, { belly: 0.002 }),
    );
  if (lod < 2)
    // Two flat ribbon locks in front of the ears, down to the collarbones (asymmetric lengths):
    // 14 mm wide at the root, 7 mm at the tip, faces turned outward-forward.
    for (const { ctrl, y } of frontLocks(hair))
      out.push(
        ...ribbon(
          spline(ctrl, 14),
          [0.6, 0.8 * y, 0],
          [0.014, 0.007],
          [0.0042, 0.0026],
          C.hairRoot,
          C.hairTip,
          { mirror: false },
        ),
      );
  return out;
}

/** The long locks (left half, mirrored): from the parting over the skull, behind the ear, then
 *  free down over the trapezius; `on` lays the scalp stretch onto the hair surface. */
export function longLocks(n: number, on: Surface): Array<{ ctrl: V[]; r: number }> {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const part: V = [L.gx - 0.08 * H - t * 0.55 * H, 0.004, L.crown - 0.01 - t * 0.04 * H];
    const side: V = [part[0] - 0.05 * H, 0.06, L.mz + 0.75 * H - t * 0.1 * H];
    const behind: V = [L.back + (0.3 - t * 0.12) * H, 0.075 + t * 0.006, L.mz + 0.42 * H];
    const r = 0.0085 - t * 0.001;
    return {
      r,
      ctrl: [
        on.off(part, r * 0.3),
        on.off(side, r * 0.5),
        on.off(behind, r * 0.7),
        [behind[0] - 0.01, behind[1] + 0.012, L.mz + 0.1 * H],
        [behind[0] - 0.02 - t * 0.01, behind[1] + 0.02 + t * 0.01, L.mz - 0.25 * H - t * 0.08 * H],
      ],
    };
  });
}

/** The two front ribbon locks (right one shorter), not mirrored. */
export function frontLocks(on: Surface): Array<{ ctrl: V[]; y: number }> {
  return (
    [
      [1, 0.36],
      [-1, 0.3],
    ] as const
  ).map(([y, len]) => ({
    y,
    ctrl: [
      on.off([L.gx - 0.06 * H, 0.03 * y, L.mz + 0.9 * H], 0.003),
      on.off([L.gx - 0.16 * H, 0.072 * y, L.mz + 0.68 * H], 0.005),
      // Falling in front of the ear, clear of the cheek (no stripe of shadow down the face).
      [L.gx - 0.24 * H, 0.094 * y, L.mz + 0.3 * H],
      [L.gx - 0.28 * H, 0.1 * y, L.mz - len * H],
    ],
  }));
}

/** The base layer under card hair: the parted mass alone. */
export const hairBaseEdits = (scalp: Field, _lod: number): SculptEdit[] => {
  const box: [V, V] = [
    [L.back - 0.05, -0.15, L.mz - 0.2],
    [L.gx + 0.06, 0.15, L.crown + 0.05],
  ];
  return [hairMass(scalp, 0.007, hairline, box, C.hairRoot, 0.03)];
};

/** Away from the centre parting, then back and down: the hair falls past the ears. */
const comb = (p: Vec3, n: Vec3): Vec3 => {
  const out = Math.sign(p[1] || 1);
  const top = Math.max(0, n[2]);
  // 0 at the forehead, 1 at the back of the skull: the front is swept back off the face.
  const t = Math.min(1, Math.max(0, (L.gx - p[0]) / (L.gx - L.back)));
  return [-(1.3 - t), out * (0.15 + 0.5 * top) * t, -0.3 - 0.9 * (1 - top)];
};

/** Card hairstyle for `cardHair` (recipes/_lib/face/hair-cards.ts): long, centre-parted. */
export function elfCardHair() {
  const scalp = sculptField([headBlock(SPEC, 2)], { color: SPEC.skin, mirror: 'y' }).field;
  const bounds: [V, V] = [
    [L.back - 0.05, -0.15, L.mz - 0.05],
    [L.gx + 0.06, 0.15, L.crown + 0.05],
  ];
  const base = hairBaseEdits(scalp, 0);
  const field = sculptField([...base, { field: scalp, bounds }], {
    color: C.hairRoot,
    mirror: 'y',
  }).field;
  // Long at the back and sides behind the ears, short where it would fall over the face.
  const long = (p: Vec3): number =>
    (L.gx - p[0]) / (L.gx - L.back) > 0.45 ? (p[2] > L.mz + 0.55 * H ? 0.24 : 0.18) : 0.09;
  return {
    field,
    bounds,
    cell: 0.004,
    comb,
    // Long hair falls around the head block and the shoulders, never through them.
    collide: sculptField([headBlock(SPEC, 2), ...torsoEdits(L, TORSO)], {
      color: SPEC.skin,
      mirror: 'y',
    }).field,
    color: mix(C.hairRoot, C.hairTip, 0.45),
    layers: [
      {
        name: 'hair_base',
        kind: 'hair',
        region: hairline,
        density: 8000,
        length: 0.06,
        width: 0.018,
        lift: 0.06,
        bend: 0.9,
        droop: 0.15,
      },
      {
        name: 'hair_long',
        kind: 'hair',
        region: hairline,
        density: 5000,
        length: long,
        width: 0.016,
        lift: 0.1,
        bend: 0.9,
        droop: 0.55,
        roll: 0.3,
        clump: 5,
      },
      {
        name: 'hair_fly',
        kind: 'hair',
        region: hairline,
        density: 400,
        length: 0.12,
        width: 0.007,
        lift: 0.25,
        bend: 0.5,
        droop: 0.4,
        roll: 1.2,
      },
    ] as const,
  };
}
