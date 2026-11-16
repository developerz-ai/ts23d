// Orc face features beyond the shared skull stages: forehead furrows under the low vault, heavy
// under-eye bags, flared nose wings, the closed mouth sealed and its line drawn; scars as raised
// pale welts; seeded warts (the tusks are their own swept part, tusks.ts). Skin tone zones beyond
// the shared zones.ts: darker brow band, warm ear cartilage, a grey-green jaw. Left side unless
// `mirror: false` (scars, warts: the battle-worn asymmetry).

import type { Rng, SculptEdit } from '@developerz.ai/ts23d';
import { ball, clayOn, creaseOn, ell, type Surface, type V } from '../_lib/bust/kit.ts';
import { C } from './palette.ts';
import { H, SK } from './spec.ts';

const at = (a: V, x: number, y: number, z: number): V => [a[0] + x * H, a[1] + y * H, a[2] + z * H];

export function featureEdits(stage: number, s: Surface, lod: number, rng: Rng): SculptEdit[] {
  const out: SculptEdit[] = [];
  // The closed mouth sealed behind the lips (the base's slit is thinner than the head cell and
  // meshed as a row of pits), its line then drawn as a crease a cell wide.
  const cy = Math.abs(SK.cheilion[1]);
  out.push(
    ell(at(SK.stomion, -0.03, 0, 0), [0.035 * H, cy * 0.92, 0.014 * H], {
      blend: 0.012 * H,
      color: C.lips,
    }),
  );
  // Nose wings flared: heavy alae either side of the flat tip.
  out.push(
    ell(at(SK.alare, -0.006, 0.004, 0.002), [0.03 * H, 0.026 * H, 0.026 * H], {
      blend: 0.03 * H,
      color: C.flush,
    }),
  );
  if (stage < 4) return out;
  out.push(creaseOn(s, lipLine(), 0.02 * H, 0.006 * H, { color: C.mouth, tips: 0.4 }));
  // Forehead furrows across the low brow.
  for (const l of foreheadLines()) out.push(creaseOn(s, l, 0.014 * H, 0.004 * H, { tips: 0.5 }));
  // Under-eye bags.
  out.push(
    ell(at(SK.eye, 0.026, 0.004, -0.05), [0.02 * H, 0.05 * H, 0.016 * H], { blend: 0.03 * H }),
  );
  if (lod === 2) return out;
  // Scars: a pale raised welt (not mirrored).
  for (const l of SCARS)
    out.push(clayOn(s, l, 0.02 * H, 0.006 * H, { color: C.scar, mirror: false, tips: 0.25 }));
  // Warts, seeded sizes (not mirrored).
  for (const [p, r] of WARTS) {
    const j = 0.75 + rng.next() * 0.5;
    out.push(ball(s.off(p, 0), r * H * j, { blend: r * H * 0.4, color: C.wart, mirror: false }));
  }
  return out;
}

/** Skin zones beyond ../_lib/face/zones.ts: the brow band darker, warm cartilage on the ears. */
export function toneEdits(): SculptEdit[] {
  const paint = (p: V, r: V, color: V, blend: number): SculptEdit => ({
    shape: 'ellipsoid',
    at: p,
    size: r,
    op: 'paint',
    color,
    blend,
  });
  return [
    paint(SK.earTip, [0.05 * H, 0.03 * H, 0.08 * H], C.earGlow, 0.04 * H),
    paint(at(SK.glabella, -0.01, 0.06, 0.004), [0.03 * H, 0.08 * H, 0.025 * H], C.brow, 0.02 * H),
    paint(at(SK.gonion, 0.06, -0.01, -0.02), [0.1 * H, 0.05 * H, 0.06 * H], C.skinCool, 0.05 * H),
  ];
}

/** Forehead furrows: short and broken (left; mirrored). */
export function foreheadLines(): V[][] {
  const g = SK.glabella;
  return [0, 1].map((i) => {
    const z = 0.1 + i * 0.06;
    return [at(g, -0.04 - i * 0.02, 0.03, z), at(g, -0.05 - i * 0.025, 0.12, z + 0.012)];
  });
}

/** The closed mouth's line, centre to corner (left; mirrored). */
export function lipLine(): V[] {
  const st = SK.stomion;
  const c = SK.cheilion;
  return [
    at(st, 0.004, 0, 0),
    [(st[0] + c[0]) / 2 + 0.006 * H, c[1] * 0.55, (st[2] + c[2]) / 2],
    c,
  ];
}

/** Scars (not mirrored): crown → left brow, across the nose bridge, down the right cheek. */
export const SCARS: readonly V[][] = [
  [
    at(SK.glabella, -0.06, 0.06, 0.24),
    at(SK.glabella, -0.01, 0.1, 0.1),
    at(SK.brow, 0.004, 0.02, -0.004),
  ],
  [
    at(SK.nasion, 0.01, 0.07, 0.02),
    at(SK.nasion, 0.02, 0, -0.03),
    at(SK.nasion, 0.006, -0.07, -0.07),
  ],
  [
    at([SK.cheek[0], -SK.cheek[1], SK.cheek[2]], -0.02, 0.01, 0.06),
    at([SK.cheek[0], -SK.cheek[1], SK.cheek[2]], -0.01, -0.01, -0.03),
    at([SK.cheilion[0], -SK.cheilion[1], SK.cheilion[2]], -0.03, -0.05, -0.08),
  ],
];

/** Wart spots (not mirrored) and their radius × H before the seeded jitter. */
export const WARTS: ReadonlyArray<readonly [V, number]> = [
  [at(SK.cheek, -0.04, 0.03, -0.02), 0.024],
  [at([SK.zygion[0], -SK.zygion[1], SK.zygion[2]], 0.03, 0.02, 0.05), 0.02],
  [at(SK.crown, 0.1, -0.12, -0.08), 0.026],
];
