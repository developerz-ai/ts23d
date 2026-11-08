// Cabin trim: moulded carpet over the floor, toe boards and tunnel; leather-wrapped rear bulkhead
// and cockpit side walls; door cards (riding on the doors) with a stitched armrest, pull handle,
// speaker grille and lock knob, joined to the door skin by a rolled top cap; and the twin roll
// hoops rising out of the head fairings with their rear braces.

import type { Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { lathe, merge } from '@developerz.ai/ts23d';
import { cockpitU, GAP, uPlus } from '../body/regions.ts';
import { U } from '../body/shape.ts';
import { BULKHEAD_X, FLOOR_Z, TUNNEL_TOP, TUNNEL_W } from '../chassis/structure.ts';
import { X_DOOR_FRONT, X_DOOR_REAR, X_FIREWALL } from '../dims.ts';
import { C } from '../lib/colors.ts';
import { add, along, beamBetween, bx, mul, rod, sub, tube } from '../lib/geo.ts';
import { normalAt, type Surface, skin } from '../lib/grid.ts';

export function carpet(lod: Lod): Mesh {
  const b = lod === 0 ? 0.01 : 0;
  const parts: Mesh[] = [
    bx(
      [BULKHEAD_X + 0.01, 0.0, FLOOR_Z],
      [X_FIREWALL - 0.01, 0.715, FLOOR_Z + 0.015],
      C.carpet,
      'canvas',
    ),
    bx(
      [BULKHEAD_X + 0.01, -0.715, FLOOR_Z],
      [X_FIREWALL - 0.01, 0.0, FLOOR_Z + 0.015],
      C.carpet,
      'canvas',
    ),
    // Tunnel cover.
    bx(
      [BULKHEAD_X + 0.01, -TUNNEL_W - 0.012, FLOOR_Z],
      [X_FIREWALL - 0.01, TUNNEL_W + 0.012, TUNNEL_TOP + 0.012],
      C.carpet,
      'canvas',
      b * 3,
    ),
  ];
  // Toe boards sloping up the firewall.
  for (const s of [1, -1])
    parts.push(
      beamBetween(
        [X_FIREWALL - 0.18, s * 0.43, FLOOR_Z + 0.03],
        [X_FIREWALL - 0.02, s * 0.43, FLOOR_Z + 0.22],
        0.012,
        0.52,
        C.carpet,
        'canvas',
      ),
    );
  // Side walls (cockpit sides below the door line) and the rear bulkhead in leather.
  for (const s of [1, -1])
    parts.push(
      bx(
        [BULKHEAD_X, s * 0.7, FLOOR_Z],
        [X_DOOR_REAR - 0.02, s * 0.715, 0.82],
        C.leather,
        'leather',
      ),
    );
  parts.push(
    bx(
      [BULKHEAD_X + 0.005, -0.715, FLOOR_Z],
      [BULKHEAD_X + 0.02, 0.715, 0.9],
      C.leather,
      'leather',
    ),
  );
  if (lod === 0) {
    // Floor mats with heel pads.
    for (const s of [1, -1]) {
      parts.push(
        bx(
          [-0.05, s * 0.2, FLOOR_Z + 0.015],
          [X_FIREWALL - 0.2, s * 0.55, FLOOR_Z + 0.022],
          C.black,
          'rubber',
          0.003,
        ),
      );
      parts.push(
        bx(
          [0.12, s * 0.28, FLOOR_Z + 0.022],
          [0.2, s * 0.38, FLOOR_Z + 0.026],
          C.ironDark,
          'rubber',
          0.002,
        ),
      );
    }
    // Stitch lines on the bulkhead.
    for (const y of [-0.5, -0.2, 0.2, 0.5])
      parts.push(
        beamBetween(
          [BULKHEAD_X + 0.021, y, FLOOR_Z + 0.25],
          [BULKHEAD_X + 0.021, y, 0.88],
          0.002,
          0.003,
          C.stitch,
        ),
      );
  }
  return merge(parts);
}

/** The door card's face (y) at station s and height z: the profile `doorCard` meshes. */
function cardFaceY(S: Surface, s: number, z: number): number {
  const e = S.row(s)(cockpitU(S, s, s));
  const zTop = e[2] - 0.035;
  const f = Math.min(1, Math.max(0, (z - 0.34) / (zTop - 0.34)));
  return e[1] - 0.014 - 0.018 * Math.sin(f * Math.PI) - 0.01 * (1 - f);
}

/** Door card on the left door's inner side (car frame), with its top roll back to the skin. */
export function doorCard(S: Surface, lod: Lod): Mesh {
  const s0 = X_DOOR_REAR + GAP;
  // The card stops short of the door's front edge so its inner corner clears the dash end.
  const s1 = X_DOOR_FRONT - 0.05;
  const ns = [24, 8, 3][lod] ?? 3;
  const nu = [12, 4, 2][lod] ?? 2;
  const P: Vec3[][] = [];
  const N: Vec3[][] = [];
  const cap: Vec3[][] = [];
  const capN: Vec3[][] = [];
  const skinLines: Vec3[][] = [];
  for (let i = 0; i <= ns; i++) {
    const s = s0 + ((s1 - s0) * i) / ns;
    const uE = cockpitU(S, s, s);
    const e = S.row(s)(uE);
    const ne = normalAt(S, s, uE);
    // A vertical card just inboard of the cockpit edge, bulging a little at armrest height.
    const yC = e[1] - 0.014;
    const zTop = e[2] - 0.035;
    const zBot = 0.34;
    const row: Vec3[] = [];
    const nrow: Vec3[] = [];
    for (let j = 0; j <= nu; j++) {
      const f = j / nu;
      row.push([
        e[0],
        yC - 0.018 * Math.sin(f * Math.PI) - 0.01 * (1 - f),
        zBot + (zTop - zBot) * f,
      ]);
      nrow.push([0, -1, 0]);
    }
    P.push(row);
    N.push(nrow);
    // Top roll: card top → crown → the skin's inner edge.
    const inner = sub(e, mul(ne, 0.011));
    const crown: Vec3 = [e[0], (yC + inner[1]) / 2, Math.max(zTop, inner[2]) + 0.012];
    cap.push([row[nu] ?? e, crown, inner]);
    capN.push([
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
    ]);
    // The skin's inner face, top → bottom, for the shut faces at both ends.
    const line: Vec3[] = [];
    const uB = uPlus(S, s, U.lower, -GAP / 2);
    for (let j = 0; j <= nu; j++) {
      const u = uE + ((uB - uE) * j) / nu;
      line.push(sub(S.row(s)(u), mul(normalAt(S, s, u), 0.011)));
    }
    skinLines.push(line);
  }
  const card = skin(P, N, { color: C.leather, strip: 'leather', thickness: 0.012 });
  const top = skin(cap, capN, { color: C.leather, strip: 'leather', thickness: 0.006 });
  // Shut faces: the door's front and rear ends, skin to card.
  const ends: Mesh[] = [];
  for (const [i, sign] of [
    [0, -1],
    [ns, 1],
  ] as const) {
    const cardDown = [...(P[i] ?? [])].reverse();
    const sk = skinLines[i] ?? [];
    const rowsE = sign > 0 ? [sk, cardDown] : [cardDown, sk];
    const nE = rowsE.map((r) => r.map((): Vec3 => [sign, 0, 0]));
    ends.push(skin(rowsE, nE, { color: C.liner, strip: 'plastic', thickness: 0 }));
  }
  const parts: Mesh[] = [card, top, ...ends];
  if (lod < 2) {
    // Armrest and pull handle.
    const mid = (X_DOOR_REAR + X_DOOR_FRONT) / 2;
    // Armrest line on the card face, 0.58 m up.
    const a = (s: number): Vec3 => [s, S.row(s)(cockpitU(S, s, s))[1] - 0.05, 0.58];
    parts.push(beamBetween(a(mid - 0.3), a(mid + 0.2), 0.05, 0.04, C.leather, 'leather'));
    if (lod === 0) {
      // Pull handle: a grab bar 3 cm proud of the card on two posts that run into it (QA
      // connections: a bar placed off the armrest line hung 2 cm clear of the card).
      const z = 0.65;
      const grip = (s: number): Vec3 => [s, cardFaceY(S, s, z) - 0.03, z];
      const h0 = mid - 0.15;
      const h1 = mid + 0.05;
      parts.push(beamBetween(grip(h0), grip(h1), 0.012, 0.012, C.natural, 'chrome'));
      for (const s of [h0 + 0.01, h1 - 0.01])
        parts.push(
          beamBetween(
            grip(s),
            [s, cardFaceY(S, s, z) + 0.004, z],
            0.014,
            0.012,
            C.natural,
            'chrome',
          ),
        );
      // Speaker grille low on the card, lock knob, stitch line.
      const sp = add(a(mid + 0.28), [0, 0.005, -0.16]);
      parts.push(
        along(
          lathe({
            profile: [
              [0, 0.004],
              [0.06, 0.004],
              [0.065, 0],
            ],
            segments: 24,
            axis: 'x',
            color: C.ironDark,
            strip: 'plastic',
            caps: false,
          }),
          sp,
          [0, -1, 0],
        ),
      );
      parts.push(
        rod(
          add(a(X_DOOR_REAR + 0.15), [0, 0.0, 0.17]),
          add(a(X_DOOR_REAR + 0.15), [0, 0.0, 0.2]),
          0.012,
          C.natural,
          'chrome',
          8,
        ),
      );
      // Stitch line along the card face (it bows with the door, so short runs follow it).
      const zs = 0.67;
      const n = 10;
      const sAt = (k: number): number =>
        X_DOOR_REAR + 0.05 + ((X_DOOR_FRONT - 0.1 - X_DOOR_REAR) * k) / n;
      const st = (s: number): Vec3 => [s, cardFaceY(S, s, zs) - 0.0005, zs];
      for (let k = 0; k < n; k++)
        parts.push(beamBetween(st(sAt(k)), st(sAt(k + 1)), 0.002, 0.003, C.stitch));
    }
  }
  return merge(parts);
}

/** Two roll hoops behind the seats, each with a rear brace into the deck. */
export function rollHoops(lod: Lod, seatsY: number): Mesh {
  const segs = [14, 7, 4][lod] ?? 4;
  const x = BULKHEAD_X - 0.05;
  const parts: Mesh[] = [];
  for (const s of [1, -1]) {
    const yc = s * seatsY;
    const w = 0.2;
    const top = 1.17;
    const pts: Vec3[] = [
      [x, yc - w, 0.88],
      [x, yc - w, top - 0.1],
      [x - 0.01, yc - w * 0.7, top - 0.02],
      [x - 0.01, yc, top],
      [x - 0.01, yc + w * 0.7, top - 0.02],
      [x, yc + w, top - 0.1],
      [x, yc + w, 0.88],
    ];
    parts.push(tube(pts, 0.045, C.natural, 'aluminium', segs, lod === 0 ? 6 : 2));
    parts.push(
      tube(
        [
          [x - 0.01, yc, top - 0.01],
          [x - 0.18, yc, 1.04],
          [x - 0.36, yc, 0.97],
        ],
        0.034,
        C.natural,
        'aluminium',
        segs,
        2,
      ),
    );
    if (lod === 0) {
      // Padded cap where a head would hit, and the weld bosses.
      parts.push(
        tube(
          [
            [x - 0.01, yc - w * 0.5, top - 0.008],
            [x - 0.01, yc, top + 0.006],
            [x - 0.01, yc + w * 0.5, top - 0.008],
          ],
          0.07,
          C.leather,
          'leather',
          12,
          3,
        ),
      );
      for (const p of [
        [x, yc - w, 0.95],
        [x, yc + w, 0.95],
      ] as Vec3[])
        parts.push(
          rod(add(p, [0, 0, -0.01]), add(p, [0, 0, 0.012]), 0.07, C.natural, 'aluminium', 12),
        );
    }
  }
  return merge(parts);
}
