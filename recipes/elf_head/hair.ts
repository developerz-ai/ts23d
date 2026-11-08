// Elf hair as sculpted locks: a centre-parted mass over the scalp, then long locks that start at
// the parting, follow the skull over the top and behind the pointed ears, and fall free onto the
// shoulders and back — tapered, overlapping, toned dark at the roots and pale gold at the tips —
// and two flat ribbon locks falling in front of the ears.

import { type Field, type SculptEdit, sculptField } from '@developerz.ai/ts23d';
import { hairMass, lock, ribbon } from '../_lib/bust/hair.ts';
import { type Surface, spline, surface, type V } from '../_lib/bust/kit.ts';
import { C, H, L } from './spec.ts';

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
