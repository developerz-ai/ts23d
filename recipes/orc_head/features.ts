// Orc face features beyond the shared skull stages: forehead furrows under the low vault, heavy
// under-eye bags, flared nose wings, the closed mouth sealed and its line drawn; scars, warts and
// pores as placed VDM stamps (plan 19: `scarWelt` welts with puckered sides, lobed `wart` domes,
// `poreField` pits over the nose and cheeks), the scars also painted pale (the tusks are their own
// swept part, tusks.ts). Stamps at LOD0, the welts and warts at reduced depth at LOD1, colour only
// at LOD2. Skin tone zones beyond the shared zones.ts: darker brow band, warm ear cartilage, a
// grey-green jaw. Left side unless `mirror: false` (scars, warts: the battle-worn asymmetry).

import {
  dmath,
  poreField,
  type Rng,
  type SculptEdit,
  type SculptVdm,
  scarWelt,
  type VdmPlace,
  wart,
} from '@developerz.ai/ts23d';
import { cone2, creaseOn, ell, type Surface, spline, type V } from '../_lib/bust/kit.ts';
import { craniumEdits } from './cranium.ts';
import { C } from './palette.ts';
import { H, SK } from './spec.ts';
import { TUSK_R, tuskExit, tuskPath } from './tusks.ts';

const at = (a: V, x: number, y: number, z: number): V => [a[0] + x * H, a[1] + y * H, a[2] + z * H];

export function featureEdits(stage: number, s: Surface, lod: number, rng: Rng): SculptEdit[] {
  // The skull's own structure first (planes and breaks), then the features on it.
  const out: SculptEdit[] = craniumEdits(s);
  // The closed mouth sealed behind the lips (the base's slit is thinner than the head cell and
  // meshed as a row of pits), its line then drawn as a crease a cell wide.
  const cy = Math.abs(SK.cheilion[1]);
  out.push(
    ell(at(SK.stomion, -0.03, 0, 0), [0.035 * H, cy * 0.92, 0.014 * H], {
      blend: 0.012 * H,
      color: C.lips,
    }),
  );
  out.push(tuskLips());
  // Nose wings flared: heavy alae either side of the flat tip.
  out.push(
    ell(at(SK.alare, -0.006, 0.004, 0.002), [0.03 * H, 0.026 * H, 0.026 * H], {
      blend: 0.03 * H,
      color: C.flush,
    }),
  );
  if (stage < 4) return out;
  // (In the crevice olive, not the mouth's near-black: that read as a ragged seam, D526.)
  out.push(creaseOn(s, lipLine(), 0.02 * H, 0.006 * H, { color: C.cavity, tips: 0.4 }));
  // Forehead furrows across the low brow.
  for (const l of foreheadLines()) out.push(creaseOn(s, l, 0.014 * H, 0.004 * H, { tips: 0.5 }));
  // Under-eye bags.
  out.push(
    ell(at(SK.eye, 0.026, 0.004, -0.05), [0.02 * H, 0.05 * H, 0.016 * H], { blend: 0.03 * H }),
  );
  // Scars: pale (every LOD), then raised welts; warts; pores (LOD0) — not mirrored.
  out.push(...SCARS.flatMap((l) => scarPaint(s, l)));
  for (const [p, r] of WARTS)
    out.push({
      shape: 'sphere',
      at: s.on(p),
      size: r * H * 0.9,
      op: 'paint',
      color: C.wart,
      blend: r * H * 0.5,
      mirror: false,
    });
  if (lod === 2) return out;
  const k = lod === 0 ? 1 : 0.6;
  out.push(...scarStamps(s, k));
  out.push({
    vdm: WART,
    places: WARTS.map(([p, r]) => wartPlace(s, p, r * (0.75 + rng.next() * 0.5), k)),
    mirror: false,
  });
  if (lod === 0) out.push(pores(s));
  return out;
}

const SCAR = [1, 2, 3].map((seed) => scarWelt({ seed }));
const WART = wart({ seed: 5, lobes: 0.18 });
const PORES = poreField({ seed: 9, count: 60 });

/** One welt stamp per scar segment, its length along the segment. */
function scarStamps(s: Surface, k: number): SculptVdm[] {
  return SCARS.map((l, i) => {
    const places: VdmPlace[] = [];
    for (let j = 0; j + 1 < l.length; j++) {
      const a = l[j] as V;
      const b = l[j + 1] as V;
      const mid = s.on([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
      const len = dmath.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const up: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      places.push({ at: mid, normal: s.normal(mid), up, scale: len * 1.15, depth: 0.0022 * k });
    }
    return { vdm: SCAR[i % SCAR.length] as SculptVdm['vdm'], places, mirror: false };
  });
}

/** The scar's pale tissue: a thin paint stripe along it. */
function scarPaint(s: Surface, l: readonly V[]): SculptEdit[] {
  return spline(l, 40).map((p) => ({
    shape: 'sphere' as const,
    at: s.on(p),
    size: 0.003,
    op: 'paint' as const,
    color: C.scar,
    blend: 0.003,
    mirror: false,
  }));
}

function wartPlace(s: Surface, p: V, r: number, k: number): VdmPlace {
  const at = s.on(p);
  return { at, normal: s.normal(at), scale: r * H * 2.4, depth: r * H * 0.55 * k };
}

/** Pore pits over the nose, the cheeks and the forehead (mirrored). */
function pores(s: Surface): SculptVdm {
  const spots: V[] = [
    at(SK.pronasale, -0.02, 0.02, 0),
    at(SK.cheek, 0.01, 0, 0),
    at(SK.cheek, -0.04, 0.02, -0.06),
    at(SK.glabella, -0.02, 0.06, 0.08),
    at(SK.glabella, -0.03, 0.0, 0.14),
  ];
  return {
    vdm: PORES,
    places: spots.map((p) => {
      const q = s.on(p);
      return { at: q, normal: s.normal(q), scale: 0.045, depth: 0.0005 };
    }),
    mirror: true,
  };
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

/** The lower lip rolled round each tusk's base: a lip-coloured sleeve along the tusk's last
 *  1.6 cm in the jaw up to just below where it leaves the lip, 1.2 × its radius, so the lip swells round the
 *  base and the tusk's flank never shows below the mouth line (mirrored to the right tusk). */
export function tuskLips(): SculptEdit {
  const exit = tuskExit();
  const path = tuskPath(1, 48);
  const i = path.findIndex((p) => p[2] >= exit[2] - 0.016);
  const from = path[Math.max(0, i)] ?? exit;
  const end: V = [exit[0], exit[1], exit[2] - 0.3 * TUSK_R];
  return cone2(from, end, TUSK_R * 1.05, TUSK_R * 1.18, { blend: 0.3 * TUSK_R, color: C.lips });
}
