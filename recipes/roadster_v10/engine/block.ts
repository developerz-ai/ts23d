// The V10's bottom end and the parts bolted straight to it: the 90° aluminium block (deck faces,
// valley, skirt, ribbing), finned cast oil pan with its drain plug, front timing cover with the
// water-pump volute, rear bellhousing into the 6-speed gearbox in the tunnel, the propshaft back to
// the differential and the two engine mounts on the front crossmember.

import type { Lod, Mesh, Vec2, Vec3 } from '@developerz.ai/ts23d';
import { lathe, merge, prism } from '@developerz.ai/ts23d';
import { X_CRANK_FRONT, X_FA, X_RA, Z_CRANK, Z_RA } from '../dims.ts';
import { C } from '../lib/colors.ts';
import { bx, rod, shift, tube } from '../lib/geo.ts';
import { BANKS, BLOCK_REAR, bp, H_DECK } from './frame.ts';

const BLOCK_FRONT = X_CRANK_FRONT - 0.02;

/** Block cross-section (y, z): pan rail → skirt → bank walls → deck faces → valley. */
function blockSection(): Vec2[] {
  const [l, r] = BANKS;
  if (!l || !r) return [];
  const yz = (p: Vec3): Vec2 => [p[1], p[2]];
  const halfDeck = 0.105;
  return [
    [-0.215, Z_CRANK - 0.12],
    [0.215, Z_CRANK - 0.12],
    [0.235, Z_CRANK - 0.02],
    yz(bp(l, 0, H_DECK - 0.06, halfDeck)),
    yz(bp(l, 0, H_DECK, halfDeck)),
    yz(bp(l, 0, H_DECK, -halfDeck)),
    [0.06, Z_CRANK + 0.15],
    [-0.06, Z_CRANK + 0.15],
    yz(bp(r, 0, H_DECK, -halfDeck)),
    yz(bp(r, 0, H_DECK, halfDeck)),
    yz(bp(r, 0, H_DECK - 0.06, halfDeck)),
    [-0.235, Z_CRANK - 0.02],
  ];
}

export function block(lod: Lod): Mesh {
  const len = BLOCK_FRONT - BLOCK_REAR;
  const parts: Mesh[] = [
    shift(
      prism({
        profile: blockSection(),
        depth: len,
        plane: 'yz',
        color: C.alloyCast,
        strip: 'iron_cast',
      }),
      [(BLOCK_FRONT + BLOCK_REAR) / 2, 0, 0],
    ),
  ];
  // Oil pan: cast, finned, tapering deeper at the front sump.
  const panTop = Z_CRANK - 0.12;
  parts.push(
    bx(
      [BLOCK_REAR + 0.02, -0.2, panTop - 0.065],
      [BLOCK_FRONT - 0.02, 0.2, panTop],
      C.alloyCast,
      'aluminium',
      lod === 0 ? 0.01 : 0,
    ),
  );
  parts.push(
    bx(
      [BLOCK_REAR + 0.02, -0.215, panTop - 0.012],
      [BLOCK_FRONT - 0.01, 0.215, panTop],
      C.alloyCast,
      'aluminium',
    ),
  );
  if (lod === 0) {
    for (let k = 0; k < 9; k++) {
      const x = BLOCK_REAR + 0.08 + k * 0.06;
      parts.push(
        bx(
          [x - 0.004, -0.17, panTop - 0.072],
          [x + 0.004, 0.17, panTop - 0.062],
          C.alloyCast,
          'aluminium',
        ),
      );
    }
    parts.push(
      rod(
        [BLOCK_FRONT - 0.12, 0, panTop - 0.065],
        [BLOCK_FRONT - 0.12, 0, panTop - 0.078],
        0.02,
        C.ironDark,
        'chrome',
        6,
      ),
    );
    // Block ribs on the skirt and the main-bearing bolt bosses.
    for (const s of [1, -1])
      for (let k = 0; k < 6; k++) {
        const x = BLOCK_REAR + 0.05 + k * 0.115;
        parts.push(
          bx(
            [x - 0.008, s * 0.228, Z_CRANK - 0.11],
            [x + 0.008, s * 0.242, Z_CRANK + 0.03],
            C.alloyCast,
            'iron_cast',
          ),
        );
      }
    // Freeze plugs on the block sides.
    for (const s of [1, -1])
      for (const x of [BLOCK_REAR + 0.15, BLOCK_REAR + 0.38]) {
        const p = bp(
          BANKS[s > 0 ? 0 : 1] ?? { s: 1, up: [0, 0, 1], out: [0, 1, 0] },
          x,
          H_DECK - 0.1,
          0.1,
        );
        parts.push(
          rod(
            [p[0], p[1], p[2]],
            [p[0], p[1] + s * 0.006, p[2] - 0.006],
            0.03,
            C.steelZinc,
            'steel_galvanised',
            10,
          ),
        );
      }
  }
  // Timing cover with the water-pump volute and the crank damper hub.
  const tc: Mesh[] = [
    bx(
      [BLOCK_FRONT, -0.17, Z_CRANK - 0.1],
      [BLOCK_FRONT + 0.045, 0.17, Z_CRANK + 0.2],
      C.alloyCast,
      'aluminium',
      lod === 0 ? 0.008 : 0,
    ),
    shift(
      lathe({
        profile: [
          [0, 0],
          [0.075, 0],
          [0.08, 0.04],
          [0.05, 0.065],
          [0, 0.065],
        ],
        segments: lod === 0 ? 24 : 10,
        axis: 'x',
        color: C.alloyCast,
        strip: 'aluminium',
      }),
      [BLOCK_FRONT + 0.04, 0, Z_CRANK + 0.14],
    ),
  ];
  parts.push(...tc);
  return merge(parts);
}

/** Bellhousing, gearbox (T-56 class 6-speed), shifter tower, propshaft. */
export function driveline(lod: Lod): Mesh {
  const segs = lod === 0 ? 24 : 10;
  const x0 = BLOCK_REAR;
  const parts: Mesh[] = [
    shift(
      lathe({
        profile: [
          [0, 0],
          [0.23, 0],
          [0.22, -0.06],
          [0.16, -0.17],
          [0.13, -0.2],
          [0, -0.2],
        ],
        segments: segs,
        axis: 'x',
        color: C.alloyCast,
        strip: 'iron_cast',
      }),
      [x0, 0, Z_CRANK],
    ),
    // Gearbox case: tapering cylinder back to the tail housing.
    shift(
      lathe({
        profile: [
          [0, 0],
          [0.13, 0],
          [0.12, -0.32],
          [0.07, -0.42],
          [0.05, -0.62],
          [0, -0.62],
        ],
        segments: segs,
        axis: 'x',
        color: C.alloyCast,
        strip: 'iron_cast',
      }),
      [x0 - 0.2, 0, Z_CRANK],
    ),
  ];
  // Propshaft to the pinion, with U-joint yokes.
  const a: Vec3 = [x0 - 0.82, 0, Z_CRANK];
  const b: Vec3 = [X_RA + 0.3, 0, Z_RA + 0.03];
  parts.push(rod(a, b, 0.075, C.ironDark, 'iron_cast', segs));
  if (lod === 0)
    for (const p of [a, b])
      parts.push(
        rod([p[0] - 0.03, 0, p[2]], [p[0] + 0.03, 0, p[2]], 0.09, C.ironDark, 'iron_cast', 8),
      );
  return merge(parts);
}

/** Engine mounts: rubber blocks on brackets between the block skirt and the front crossmember. */
export function mounts(lod: Lod): Mesh {
  const parts: Mesh[] = [];
  for (const s of [1, -1]) {
    const x = X_FA - 0.02;
    parts.push(
      bx(
        [x - 0.05, s * 0.22, 0.24],
        [x + 0.05, s * 0.3, 0.3],
        C.black,
        'rubber',
        lod === 0 ? 0.006 : 0,
      ),
    );
    parts.push(bx([x - 0.06, s * 0.23, 0.2], [x + 0.06, s * 0.29, 0.24], C.frame, 'steel_painted'));
    parts.push(
      tube(
        [
          [x, s * 0.235, 0.3],
          [x, s * 0.235, Z_CRANK - 0.02],
        ],
        0.04,
        C.frame,
        'steel_painted',
        6,
        1,
      ),
    );
  }
  return merge(parts);
}
