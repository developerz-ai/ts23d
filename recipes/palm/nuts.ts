// The coconut hands. A bearing coconut palm carries several bunches at once just under the frond
// bases, each a short stalk from the stem with 5–8 nuts (husked, ~0.3 m across; green, yellowing
// to ochre as they ripen, the oldest brown). The kind's fruit hugs the stem inside the frond boots
// where nobody sees it; these hang out from the stem on their stalks, in warm husk colours that
// separate from the green crown at hero distance. Crown frame (they sway with the crown).

import { dmath, lathe, type Mesh, merge, sweep, type Vec3 } from '@developerz.ai/ts23d';

/** Husk colours, ripening: green-yellow, ochre, brown. */
const HUSK: readonly Vec3[] = [
  [0.62, 0.6, 0.16],
  [0.78, 0.56, 0.16],
  [0.46, 0.3, 0.14],
];
const STALK: Vec3 = [0.55, 0.45, 0.25];

function nut(at: Vec3, r: number, color: Vec3, lod: number): Mesh {
  const n = lod === 0 ? 6 : 4;
  // A husked coconut: a slightly egg-shaped ball, pointed at its free end.
  const profile = Array.from({ length: n + 1 }, (_, i): [number, number] => {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    const k = i < n / 2 ? 1 : 0.88;
    return [Math.max(0.0001, dmath.cos(a) * r * k), dmath.sin(a) * r * 1.12];
  });
  return lathe({ profile, segments: lod === 0 ? 8 : 5, caps: false, at, color });
}

/** One hand: its stalk (stem → tip) and its nuts, centre and radius each. */
export interface Hand {
  readonly from: Vec3;
  readonly bend: Vec3;
  readonly tip: Vec3;
  readonly nuts: readonly { readonly at: Vec3; readonly r: number; readonly color: Vec3 }[];
}

/**
 * Where `bunches` hands hang round the stem: the stalks leave the stem at `top` (stem axis point
 * under the frond bases, crown frame) `r` from the axis and reach out past the frond boots; each
 * nut (`nutR` ± 8 %) packed round its stalk's tip, its centre within its own radius of the tip.
 */
export function hands(top: Vec3, r: number, bunches: number, nutR: number, lod: number): Hand[] {
  const out: Hand[] = [];
  for (let b = 0; b < bunches; b++) {
    const a = (b / bunches) * Math.PI * 2 + 0.4;
    const dir: Vec3 = [dmath.cos(a), dmath.sin(a), 0];
    const z = top[2] - 0.15 * (b % 2);
    const from: Vec3 = [top[0] + dir[0] * r * 0.5, top[1] + dir[1] * r * 0.5, z];
    const out1 = r + nutR * 2.6;
    const tip: Vec3 = [top[0] + dir[0] * out1, top[1] + dir[1] * out1, z - 0.45];
    const bend: Vec3 = [(from[0] + tip[0]) / 2, (from[1] + tip[1]) / 2, z + 0.05];
    const count = lod === 0 ? 6 : 3;
    const side: Vec3 = [-dir[1], dir[0], 0];
    const nuts = Array.from({ length: count }, (_, k) => {
      // Packed round the tip: a ring 0.7 radii out and 0.55 down, 0.89 radii from the tip, inside
      // the smallest nut's 0.92 radius, so every nut touches its stalk.
      const t = (k / count) * Math.PI * 2 + b;
      const ring = nutR * 0.7;
      const at: Vec3 = [
        tip[0] + (side[0] * dmath.cos(t) + dir[0] * dmath.sin(t)) * ring,
        tip[1] + (side[1] * dmath.cos(t) + dir[1] * dmath.sin(t)) * ring,
        tip[2] - nutR * 0.55,
      ];
      return { at, r: nutR * (0.92 + 0.08 * (k % 3)), color: HUSK[(b + k) % HUSK.length] ?? STALK };
    });
    out.push({ from, bend, tip, nuts });
  }
  return out;
}

/** The hands as geometry: a stalk sweep and husked nuts each. */
export function coconuts(top: Vec3, r: number, bunches: number, nutR: number, lod: number): Mesh {
  return merge(
    hands(top, r, bunches, nutR, lod).flatMap((h) => [
      sweep({
        section: { radius: 1, segments: 4 },
        path: [h.from, h.bend, h.tip],
        scale: [0.05, 0.04, 0.03],
        color: STALK,
        caps: true,
      }),
      ...h.nuts.map((n) => nut(n.at, n.r, n.color, lod)),
    ]),
  );
}
