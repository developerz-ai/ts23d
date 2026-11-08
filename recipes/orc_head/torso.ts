// Orc torso: the forward-leaning neck merging into huge trapezius that rise to the ears, deltoids,
// clavicles, pectorals, the rib cage and upper back, cut as a classical bust (the cut narrows to
// the socle), and the neck/trap veins and sternocleidomastoid cords. Stage 1 = masses,
// 2 = planes (cut, chest plane), 3 = muscle borders, 4 = veins.

import type { Field, SculptEdit } from '@developerz.ai/ts23d';
import {
  ball,
  chain,
  clayOn,
  cone2,
  creaseOn,
  ell,
  type Surface,
  scrape,
  spline,
  taper,
  type V,
} from '../_lib/bust/kit.ts';
import { L } from './landmarks.ts';
import { C } from './palette.ts';

/** The bust cut: a flat base at `cutZ`, flanks narrowing toward it (a socle-ready wedge).
 *  1-Lipschitz (each slanted plane is normalised). */
export const bustCut: Field = (p) => {
  const h = p[2] - L.cutZ;
  const ky = 1.7;
  const kx = 0.75;
  const side = (Math.abs(p[1]) - (0.085 + h * ky)) / Math.hypot(1, ky);
  const front = (Math.abs(p[0] + 0.005) - (0.085 + h * kx)) / Math.hypot(1, kx);
  return Math.max(-h, side, front);
};

export function torsoEdits(stage: number, s?: Surface): SculptEdit[] {
  const body: SculptEdit[] = [];
  // Rib cage: a barrel, deep and wide; the upper back rounds over behind.
  body.push(ell([-0.03, 0, 0.215], [0.1, 0.165, 0.125]));
  // Lats flaring under the armpits: the V of a brute's back and flanks.
  body.push(ell([-0.03, 0.115, 0.215], [0.085, 0.075, 0.1], { blend: 0.05 }));
  body.push(ell([-0.07, 0, 0.27], [0.085, 0.17, 0.11], { blend: 0.05 }));
  // Pectorals: heavy slabs hanging from the clavicles, lower border lifting to the armpit.
  body.push(ell(L.pec, [0.05, 0.095, 0.06], { blend: 0.04, rotate: [-12, 8, -8] }));
  // Deltoids: round caps on the shoulder (mostly under the pauldrons).
  body.push(ball(L.deltoid, 0.072, { blend: 0.04 }));
  // Arm stubs below the deltoid, so the cut reads as a bust, not a barrel.
  body.push(cone2(L.deltoid, [-0.012, 0.268, 0.15], 0.068, 0.06, { blend: 0.03 }));
  if (stage >= 2) {
    // The back: a broad flat plane, the scapulae standing off it either side of the spine.
    body.push(scrape([-0.118, 0, 0.25], [-1, 0, 0.12], 0.4, 0.04));
    body.push(
      ell([-0.1, 0.085, 0.255], [0.025, 0.055, 0.06], { blend: 0.035, rotate: [0, 0, -10] }),
    );
    // The abdomen recedes under the chest shelf (no pot belly).
    body.push(scrape([0.075, 0, 0.16], [1, 0, -0.75], 0.4, 0.03));
    // Chest plane: flatten the sternum front between the pecs.
    body.push(ell([0.09, 0, 0.22], [0.035, 0.05, 0.06], { op: 'subtract', blend: 0.03 }));
  }
  if (stage >= 3 && s) {
    // Pectoral lower border (sweeping up to the armpit) and the furrow between the pecs.
    body.push(
      creaseOn(
        s,
        [
          [0.12, 0.02, 0.165],
          [0.118, 0.07, 0.15],
          [0.09, 0.13, 0.162],
          [0.045, 0.17, 0.19],
        ],
        0.008,
        0.004,
        { blend: 0.012 },
      ),
    );
    body.push(
      creaseOn(
        s,
        [
          [0.12, 0, 0.245],
          [0.125, 0, 0.17],
        ],
        0.007,
        0.003,
        { blend: 0.012, mirror: false },
      ),
    );
    // Spine furrow down the back, between the erectors.
    body.push(
      creaseOn(
        s,
        [
          [-0.12, 0, 0.33],
          [-0.128, 0, 0.25],
          [-0.12, 0, 0.16],
        ],
        0.009,
        0.0045,
        { blend: 0.014, mirror: false },
      ),
    );
    // Deltoid front border against the pec.
    body.push(
      creaseOn(
        s,
        [
          [0.07, 0.17, 0.27],
          [0.07, 0.205, 0.22],
          [0.05, 0.225, 0.17],
        ],
        0.006,
        0.003,
        { blend: 0.01 },
      ),
    );
  }
  // The bust cut trims the body only (head, neck and traps sit above it).
  const out: SculptEdit[] = [
    {
      group: [
        ...body,
        {
          field: bustCut,
          bounds: [
            [-0.5, -0.5, -0.1],
            [0.5, 0.5, 0.6],
          ],
          op: 'intersect',
          blend: 0.01,
        },
      ],
    },
  ];
  // Neck: a thick cylinder leaning forward from the chest to under the skull.
  out.push(cone2(L.neckBase, L.neckTop, 0.102, 0.08, { blend: 0.04 }));
  // Trapezius: from the back of the skull, over the neck, down to the shoulder — the hunch.
  const trap: V[] = [[-0.09, 0.03, 0.43], L.trapPeak, [-0.06, 0.16, 0.34], L.acromion];
  out.push(chain(spline(trap, 7), taper(7, 0.032, 0.045, 0.012), { blend: 0.045, join: 0.02 }));
  // Fill under the trap slope so it reads as one muscle sheet, not a tube.
  out.push(ell([-0.07, 0.1, 0.31], [0.07, 0.09, 0.05], { blend: 0.045, rotate: [-28, 0, 0] }));
  // Sternocleidomastoid: behind the ear to the sternal notch, the neck's front cords.
  out.push(
    chain(
      spline(
        [
          [-0.035, 0.085, 0.405],
          [0.02, 0.075, 0.34],
          [0.075, 0.03, 0.272],
        ],
        6,
      ),
      taper(6, 0.013, 0.01, 0.003),
      { blend: 0.03 },
    ),
  );
  if (stage < 4 || !s) return out;
  // Veins: up the neck side and branching over the trap, standing proud of the skin.
  out.push(
    clayOn(
      s,
      [
        [-0.02, 0.095, 0.37],
        [0.0, 0.1, 0.335],
        [0.012, 0.105, 0.31],
        [0.03, 0.11, 0.29],
      ],
      0.0032,
      0.0018,
      { blend: 0.004, tips: 0.4, color: C.vein },
    ),
  );
  out.push(
    clayOn(
      s,
      [
        [0.0, 0.1, 0.335],
        [-0.015, 0.125, 0.33],
        [-0.03, 0.15, 0.322],
      ],
      0.0026,
      0.0014,
      { blend: 0.003, tips: 0.4, color: C.vein },
    ),
  );
  return out;
}
