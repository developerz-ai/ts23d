// Orc skull: the head block (cranium egg + occiput, mid-face block, boat-sail jaw, muzzle, chin)
// fused into one volume and scraped into planes, the brow-ridge shelf with its scowl, temple
// hollows, and (stage 3+) the forehead furrows, scowl lines and crown scar stroked onto the skin.
// Stage 1 = primary masses, 2 = planes, 3 = features, 4 = secondary/tertiary.

import type { SculptEdit } from '@developerz.ai/ts23d';
import {
  ball,
  clayOn,
  creaseOn,
  ell,
  flipY,
  frameOf,
  k,
  local,
  rbox,
  type Surface,
  scrape,
  type V,
} from '../_lib/bust/kit.ts';
import { L } from './landmarks.ts';
import { C } from './palette.ts';

/** A scrape and its mirror (the head group itself is not mirrored, its planes come in pairs). */
function pair(at: V, n: V, blend: number): SculptEdit[] {
  return [scrape(at, n, 0.5, blend), scrape(flipY(at), flipY(n), 0.5, blend)];
}

/** The left brow slab's frame: u along the brow (inner → outer, sweeping back), w out of it. */
const BROW = frameOf([0.093, 0.042, 0.474], [-0.38, 1, 0.12], [1, 0.35, 0.25]);

/**
 * The head block: cranium egg + occiput, the mid-face block under the brow, the boat-sail jaw,
 * the muzzle and the chin, fused with generous fillets into ONE volume, then cut into planes
 * (stage 2) the way a sculptor scrapes: side planes (narrow at the crown, widening to the jaw),
 * jaw-side planes tapering to the chin, the under-jaw plane rising to the throat, the sloped
 * forehead, the cheek corners, the flat front of the muzzle and a flatter back of the skull.
 */
export function headBlock(stage: number): SculptEdit {
  const g: SculptEdit[] = [
    ell(L.cranium.at, L.cranium.r),
    ball(L.occiput.at, L.occiput.r, { blend: 0.04 }),
    ell([0.03, 0, 0.415], [0.078, 0.088, 0.07], { blend: 0.05 }),
    ell([0.055, 0, 0.338], [0.085, 0.112, 0.05], { blend: 0.04, rotate: [0, 16, 0] }),
    ell([0.078, 0, 0.36], [0.064, 0.074, 0.046], { blend: 0.035 }),
    rbox([L.chin[0] - 0.014, 0, 0.307], [0.054, 0.104, 0.052], 0.022, { blend: 0.03 }),
  ];
  if (stage >= 2) {
    g.push(...pair([0, 0.088, 0.47], [0, 1, 0.35], 0.03));
    g.push(...pair([0, 0.118, 0.33], [0.3, 1, -0.2], 0.022));
    g.push(...pair([0.075, 0.094, 0.4], [0.7, 1, 0.05], 0.03));
    g.push(scrape([0.112, 0, 0.286], [0.37, 0, -1], 0.5, 0.022));
    g.push(scrape([0.09, 0, 0.5], [1, 0, 0.52], 0.5, 0.04));
    g.push(scrape([L.cranium.at[0], 0, L.crown], [0.15, 0, 1], 0.5, 0.06));
    g.push(scrape([0.15, 0, 0.36], [1, 0, -0.1], 0.5, 0.025));
    g.push(scrape([-0.108, 0, 0.48], [-1, 0, 0.25], 0.5, 0.05));
  }
  // The brow is the forehead plane's lower edge rolling forward into the supraorbital ridge:
  // folded into the SAME group after the planes, with a wide fillet, so forehead → brow → glabella
  // is one surface. The glabella is the most forward point and flows down into the nose bridge.
  for (const side of [1, -1])
    g.push(
      local(
        {
          ...BROW,
          o: [BROW.o[0], BROW.o[1] * side, BROW.o[2]],
          u: [BROW.u[0], BROW.u[1] * side, BROW.u[2]],
          v: [BROW.v[0], BROW.v[1] * side, BROW.v[2]],
          w: [BROW.w[0], BROW.w[1] * side, BROW.w[2]],
        },
        k.ellipsoid(0, 0, 0, 0.05, 0.02, 0.016),
        [
          [-0.06, -0.03, -0.03],
          [0.06, 0.03, 0.03],
        ],
        { blend: 0.035 },
      ),
    );
  g.push(ell(L.glabella, [0.016, 0.022, 0.017], { blend: 0.035 }));
  return { group: g, mirror: false };
}

export function skullEdits(stage: number, s?: Surface): SculptEdit[] {
  const out: SculptEdit[] = [headBlock(stage)];
  if (stage >= 2) {
    // Temple hollow behind the brow's outer end, above the zygomatic arch.
    out.push(ell([0.045, 0.09, 0.458], [0.03, 0.02, 0.022], { op: 'subtract', blend: 0.03 }));
  }
  if (stage < 3 || !s) return out;
  // Corrugator furrows: two vertical scowl lines between the brows.
  out.push(
    creaseOn(
      s,
      [
        [0.13, 0.011, 0.458],
        [0.13, 0.013, 0.472],
        [0.125, 0.016, 0.486],
      ],
      0.0028,
      0.0022,
    ),
  );
  if (stage < 4) return out;
  // Forehead furrows: two long horizontal lines, dipping at the centre.
  for (const [z, w] of [
    [0.507, 0.058],
    [0.525, 0.05],
  ] as const) {
    const half: V[] = [
      [0.1, w, z + 0.002],
      [0.11, w * 0.5, z - 0.003],
      [0.112, 0, z - 0.004],
    ];
    out.push(
      creaseOn(s, [...half, ...half.slice(0, 2).reverse().map(flipY)], 0.0024, 0.0016, {
        n: 16,
        mirror: false,
      }),
    );
  }
  // An old scar over the crown and down the left brow (asymmetric, healed paler and raised).
  out.push(
    clayOn(
      s,
      [
        [0.02, 0.03, 0.58],
        [0.06, 0.045, 0.555],
        [0.09, 0.055, 0.515],
        [0.105, 0.06, 0.49],
      ],
      0.0028,
      0.0014,
      { mirror: false, color: C.scar, n: 14 },
    ),
  );
  return out;
}
