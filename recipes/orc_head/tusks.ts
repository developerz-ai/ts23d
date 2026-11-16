// Orc tusks: lower canines grown into tusks, rooted in the mandible behind the lower lip (the root
// buried ≈ 3 cm in the jaw), leaving the lip at its top and rising in front of the upper lip with
// an outward flare and a back curl at the tip. Ivory toned along the length: stained brown-yellow at the
// gum line, cleaner toward the tip. The right tusk is broken off short (a flat fracture). One
// part, swept tapered tubes, placed from the skull's landmarks.

import { type Mesh, merge, sweep } from '@developerz.ai/ts23d';
import type { V } from '../_lib/bust/kit.ts';
import { C } from './palette.ts';
import { H, SK } from './spec.ts';

const at = (a: V, x: number, y: number, z: number): V => [a[0] + x * H, a[1] + y * H, a[2] + z * H];

/** The left tusk's control points: root in the mandible behind the lower lip, out through the
 *  lip's top, rising in front of the upper lip with an outward flare, the tip curling back. */
function tuskCtrl(): [V, V, V, V] {
  const li = SK.labraleInf;
  return [
    at(li, -0.12, 0.1, -0.08),
    at(li, -0.06, 0.107, -0.005),
    at(li, 0.003, 0.135, 0.11),
    at(li, -0.03, 0.175, 0.19),
  ];
}

/** Height where the tusk leaves the lower lip (the gum line its stain fades up from). */
export function gumLine(): number {
  return tuskCtrl()[1][2];
}

/** The left tusk's centre line, root → tip (`keep` < 1 snaps it off). */
export function tuskPath(keep = 1, n = 12): V[] {
  const [p0, p1, p2, p3] = tuskCtrl();
  return Array.from({ length: n + 1 }, (_, i): V => {
    const t = (i / n) * keep;
    const u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
    const mix = (a: 0 | 1 | 2): number => w[0] * p0[a] + w[1] * p1[a] + w[2] * p2[a] + w[3] * p3[a];
    return [mix(0), mix(1), mix(2)];
  });
}

/** Both tusks as one mesh: the left whole, the right broken at 60 %. */
export function tusks(lod: number): Mesh {
  const seg = [14, 9, 6][lod] ?? 6;
  const n = [14, 8, 4][lod] ?? 4;
  const make = (side: 1 | -1, keep: number): Mesh => {
    const path = tuskPath(keep, n).map((p): V => [p[0], p[1] * side, p[2]]);
    const scale = path.map((_, i) => Math.max(0.12, 1 - ((i / n) * keep) ** 1.5));
    const m = sweep({
      section: { radius: 0.037 * H, segments: seg },
      path,
      scale,
      color: C.bone,
      strip: 'plain',
      caps: true,
    });
    stain(m, gumLine());
    return m;
  };
  return merge([make(1, 1), make(-1, 0.6)]);
}

/** Root staining: brown-yellow at and below the gum line, fading to clean ivory 3.5 cm up. */
function stain(m: Mesh, gum: number): void {
  const { colors, positions } = m;
  for (let v = 0; v < positions.length; v += 3) {
    const t = Math.min(1, Math.max(0, ((positions[v + 2] ?? 0) - gum + 0.006) / 0.035));
    const k = t * t * (3 - 2 * t);
    for (let a = 0; a < 3; a++)
      colors[v + a] = (C.tuskRoot[a] ?? 0) + ((C.bone[a] ?? 0) - (C.tuskRoot[a] ?? 0)) * k;
  }
}
