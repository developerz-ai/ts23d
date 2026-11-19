// The coconut hands. A bearing coconut palm carries several bunches at once just under the frond
// bases, each a short stalk from the stem with 5–8 nuts (husked, ~0.3 m across; green, yellowing
// to ochre as they ripen, the oldest brown). The kind's fruit hugs the stem inside the frond boots
// where nobody sees it; these hang out from the stem on their stalks, in warm husk colours that
// separate from the green crown at hero distance. Crown frame (they sway with the crown).

import { lathe, type Mesh, merge, sweep, type Vec3 } from '@developerz.ai/ts23d';

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
    return [Math.max(0.0001, Math.cos(a) * r * k), Math.sin(a) * r * 1.12];
  });
  return lathe({ profile, segments: lod === 0 ? 8 : 5, caps: false, at, color });
}

/**
 * `bunches` hands round the stem, the stalks leaving the stem at `top` (stem axis point under the
 * frond bases, crown frame) `r` from the axis, each nut `nutR` in radius.
 */
export function coconuts(top: Vec3, r: number, bunches: number, nutR: number, lod: number): Mesh {
  const out: Mesh[] = [];
  for (let b = 0; b < bunches; b++) {
    const a = (b / bunches) * Math.PI * 2 + 0.4;
    const dir: Vec3 = [Math.cos(a), Math.sin(a), 0];
    const z = top[2] - 0.15 * (b % 2);
    const from: Vec3 = [top[0] + dir[0] * r * 0.5, top[1] + dir[1] * r * 0.5, z];
    const out1 = r + nutR * 2.6;
    const hand: Vec3 = [top[0] + dir[0] * out1, top[1] + dir[1] * out1, z - 0.45];
    out.push(
      sweep({
        section: { radius: 1, segments: 4 },
        path: [from, [(from[0] + hand[0]) / 2, (from[1] + hand[1]) / 2, z + 0.05], hand],
        scale: [0.05, 0.04, 0.03],
        color: STALK,
        caps: true,
      }),
    );
    const count = lod === 0 ? 6 : 3;
    for (let k = 0; k < count; k++) {
      // Packed round the hand's end: a ring of nuts touching the stalk tip and each other.
      const t = (k / count) * Math.PI * 2 + b;
      // Each centre within one radius of the stalk tip, so every nut touches it.
      const ring = nutR * 0.7;
      const side: Vec3 = [-dir[1], dir[0], 0];
      const p: Vec3 = [
        hand[0] + (side[0] * Math.cos(t) + dir[0] * Math.sin(t)) * ring,
        hand[1] + (side[1] * Math.cos(t) + dir[1] * Math.sin(t)) * ring,
        hand[2] - nutR * 0.6,
      ];
      out.push(nut(p, nutR * (0.92 + 0.08 * (k % 3)), HUSK[(b + k) % HUSK.length] ?? STALK, lod));
    }
  }
  return merge(out);
}
