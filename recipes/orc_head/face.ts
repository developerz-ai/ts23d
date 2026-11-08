// Orc mid-face: cheekbones (zygomatic body + arch back to the ear), masseters, the broad flat nose
// (bridge, tip, wings, flared nostrils), the cheek plane and malar pads, the eye sockets sunk
// around the separate eyeballs with lids that follow the ball, and the expression lines (nasolabial
// fold, crow's feet, under-eye bags). Stage 1 = masses, 2 = planes + sockets, 3 = features,
// 4 = secondary/tertiary.

import type { SculptEdit } from '@developerz.ai/ts23d';
import { lidEdits } from '../_lib/bust/eye.ts';
import {
  ball,
  chain,
  clayOn,
  creaseOn,
  ell,
  frameOf,
  k,
  len,
  local,
  type Surface,
  sub,
} from '../_lib/bust/kit.ts';
import { ORC_EYE } from './eyes.ts';
import { L } from './landmarks.ts';
import { C } from './palette.ts';

export function faceEdits(stage: number, s?: Surface): SculptEdit[] {
  const out: SculptEdit[] = [];
  // Zygoma: the cheekbone body under the outer eye and its arch running back to just in front
  // of the ear — a ridge, with the cheek plane falling away below it.
  out.push(ell([0.08, 0.064, 0.424], [0.024, 0.03, 0.018], { blend: 0.03, rotate: [0, -8, 32] }));
  out.push(
    chain([[0.078, 0.07, 0.428], L.zygion, [-0.012, 0.1, 0.43]], [0.013, 0.012, 0.008], {
      blend: 0.03,
      join: 0.01,
    }),
  );
  // Masseter: one broad swelling on the jaw side below the arch — chewing bulk, not a tube.
  out.push(ell([0.022, 0.1, 0.375], [0.03, 0.02, 0.04], { blend: 0.03, rotate: [0, -15, 0] }));
  // Nose: a broad flat bridge from the root under the glabella, a wide fleshy tip, heavy wings.
  const nose = frameOf(L.noseRoot, sub(L.noseTip, L.noseRoot), [1, 0, 0.6]);
  const nl = len(sub(L.noseTip, L.noseRoot));
  out.push(
    local(
      nose,
      k.ellipsoid(nl * 0.45, 0, -0.004, nl * 0.62, 0.017, 0.011),
      [
        [-0.02, -0.03, -0.03],
        [nl + 0.02, 0.03, 0.03],
      ],
      { blend: 0.03 },
    ),
  );
  out.push(
    ell([L.noseTip[0] - 0.006, 0, L.noseTip[2] - 0.002], [0.016, 0.024, 0.016], {
      blend: 0.012,
      mirror: false,
    }),
  );
  out.push(ell(L.ala, [0.016, 0.014, 0.013], { blend: 0.016, rotate: [0, 0, 20] }));
  if (stage < 2) return out;
  // Eye socket: sunk under the brow around the eyeball, deeper at the inner corner.
  out.push(
    ell([L.eye[0] + 0.008, L.eye[1], L.eye[2] + 0.002], [0.019, 0.025, 0.019], {
      op: 'subtract',
      blend: 0.012,
    }),
  );
  out.push(
    ball([L.eye[0] + 0.01, L.eye[1] - 0.016, L.eye[2] + 0.003], 0.0065, {
      op: 'subtract',
      blend: 0.008,
    }),
  );
  if (stage < 3 || !s) return out;
  // Lids wrap the eyeball: a heavy scowling upper lid over 30 % of the iris, a thin lower lid,
  // the wet line and the caruncle (../_lib/bust/eye.ts).
  out.push(...lidEdits(ORC_EYE));
  // Upper lid fold (the crease above the lid) and the under-eye bag.
  out.push(
    creaseOn(
      s,
      [
        [0.09, 0.03, 0.466],
        [0.09, 0.047, 0.47],
        [0.084, 0.064, 0.464],
      ],
      0.0022,
      0.0016,
    ),
  );
  out.push(
    clayOn(
      s,
      [
        [0.09, 0.032, Math.LOG10E],
        [0.092, 0.048, 0.43],
        [0.084, 0.064, 0.437],
      ],
      0.0042,
      0.0022,
    ),
  );
  // Nostrils: flared, open forward-down, dark inside.
  out.push(
    ell([0.136, 0.017, 0.392], [0.009, 0.0075, 0.0055], {
      op: 'subtract',
      blend: 0.004,
      rotate: [0, 30, 15],
      color: C.mouth,
    }),
  );
  // The alar crease round each nose wing.
  out.push(
    creaseOn(
      s,
      [
        [0.128, 0.044, 0.408],
        [0.12, 0.05, 0.397],
        [0.122, 0.042, 0.386],
      ],
      0.0024,
      0.002,
    ),
  );
  if (stage < 4) return out;
  // Nasolabial fold: nose wing round the muzzle to the mouth corner — the deepest face line.
  out.push(
    creaseOn(
      s,
      [
        [0.124, 0.05, 0.404],
        [0.12, 0.064, 0.385],
        [0.112, 0.072, 0.362],
        [0.104, 0.075, 0.345],
      ],
      0.0036,
      0.0026,
    ),
  );
  // Crow's feet fanning from the outer eye corner, and a sag line under the eye bag.
  for (const [dz, dy] of [
    [0.008, 0.005],
    [0.0, 0.007],
    [-0.008, 0.005],
  ] as const)
    out.push(
      creaseOn(
        s,
        [
          [0.075, 0.072, 0.452 + dz * 0.4],
          [0.064, 0.081 + dy * 0.3, 0.452 + dz],
          [0.052, 0.087 + dy * 0.5, 0.452 + dz * 1.6],
        ],
        0.0016,
        0.0012,
        { n: 6 },
      ),
    );
  out.push(
    creaseOn(
      s,
      [
        [0.092, 0.035, 0.425],
        [0.09, 0.052, 0.42],
        [0.08, 0.07, 0.427],
      ],
      0.002,
      0.0015,
    ),
  );
  // Nose bridge: two scowl wrinkles across it.
  for (const dz of [0, 0.008])
    out.push(
      creaseOn(
        s,
        [
          [0.12, 0.012, 0.444 - dz],
          [0.122, 0, 0.442 - dz],
          [0.12, -0.012, 0.444 - dz],
        ],
        0.0017,
        0.0012,
        { mirror: false, n: 6 },
      ),
    );
  return out;
}
