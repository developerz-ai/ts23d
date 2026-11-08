// Engine-bay ancillaries: brake booster and tandem master cylinder with its fluid reservoir on
// the driver's (left) firewall, the battery in its tray with terminals and hold-down, washer and
// power-steering reservoirs with coloured caps, fuse/relay box and ECU on the aprons, the U-shaped
// strut-tower brace clearing the throttle body, main wiring looms and the hard brake lines.

import type { Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { lathe, merge, text } from '@developerz.ai/ts23d';
import { corner } from '../chassis/points.ts';
import { X_FIREWALL } from '../dims.ts';
import { C } from '../lib/colors.ts';
import { bx, rod, shift, tube } from '../lib/geo.ts';

function booster(lod: Lod): Mesh {
  const segs = lod === 0 ? 32 : 12;
  const c: Vec3 = [X_FIREWALL + 0.02, 0.42, 0.6];
  const parts: Mesh[] = [
    shift(
      lathe({
        profile: [
          [0, 0],
          [0.1, 0],
          [0.112, 0.03],
          [0.112, 0.1],
          [0.1, 0.13],
          [0.03, 0.14],
          [0, 0.14],
        ],
        segments: segs,
        axis: 'x',
        color: C.ironDark,
        strip: 'steel_painted',
      }),
      c,
    ),
    // Master cylinder forward, reservoir on top with its yellow cap.
    rod(
      [c[0] + 0.14, c[1], c[2]],
      [c[0] + 0.3, c[1], c[2]],
      0.05,
      C.alloyCast,
      'aluminium',
      segs / 2,
    ),
    bx(
      [c[0] + 0.17, c[1] - 0.035, c[2] + 0.025],
      [c[0] + 0.27, c[1] + 0.035, c[2] + 0.085],
      C.reservoir,
      'plastic',
      lod === 0 ? 0.008 : 0,
    ),
    rod(
      [c[0] + 0.22, c[1], c[2] + 0.085],
      [c[0] + 0.22, c[1], c[2] + 0.1],
      0.04,
      C.capYellow,
      'plastic',
      12,
    ),
  ];
  if (lod === 0) {
    // Hard brake lines down the firewall and off to each corner.
    for (const [dy, dz] of [
      [0.02, -0.02],
      [-0.02, -0.02],
    ] as const) {
      const p: Vec3 = [c[0] + 0.24, c[1] + dy, c[2] + dz];
      parts.push(
        tube(
          [
            p,
            [p[0], p[1] + dy * 2, p[2] - 0.08],
            [X_FIREWALL + 0.04, p[1] + dy * 3, 0.42],
            [X_FIREWALL + 0.04, p[1] - 0.25, 0.32],
          ],
          0.006,
          C.steelZinc,
          'steel_galvanised',
          5,
          3,
        ),
      );
    }
    // Booster check valve + vacuum hose to the plenum.
    parts.push(
      tube(
        [
          [c[0] + 0.07, c[1] - 0.08, c[2] + 0.08],
          [c[0] + 0.15, c[1] - 0.18, c[2] + 0.12],
          [0.66, 0.06, 0.74],
        ],
        0.016,
        C.hoseBlack,
        'rubber',
        6,
        3,
      ),
    );
  }
  return merge(parts);
}

function battery(lod: Lod): Mesh {
  const b0: Vec3 = [1.44, -0.47, 0.38];
  const b1: Vec3 = [1.7, -0.3, 0.56];
  const parts: Mesh[] = [
    bx(
      [b0[0] - 0.01, b0[1] - 0.01, b0[2] - 0.02],
      [b1[0] + 0.01, b1[1] + 0.01, b0[2]],
      C.ironDark,
      'steel_painted',
    ),
    bx(b0, b1, C.battery, 'plastic', lod === 0 ? 0.006 : 0),
  ];
  if (lod < 2) {
    // Terminals (+ red cover, − bare), hold-down bar.
    parts.push(
      rod(
        [b1[0] - 0.04, b0[1] + 0.04, b1[2]],
        [b1[0] - 0.04, b0[1] + 0.04, b1[2] + 0.025],
        0.03,
        C.lensRed,
        'plastic',
        10,
      ),
    );
    parts.push(
      rod(
        [b1[0] - 0.04, b1[1] - 0.04, b1[2]],
        [b1[0] - 0.04, b1[1] - 0.04, b1[2] + 0.02],
        0.02,
        C.natural,
        'brass',
        10,
      ),
    );
    parts.push(
      bx(
        [b0[0] + 0.1, b0[1] - 0.012, b1[2]],
        [b0[0] + 0.13, b1[1] + 0.012, b1[2] + 0.012],
        C.ironDark,
        'steel_painted',
      ),
    );
  }
  if (lod === 0) {
    // Cables: positive to the starter / fuse box, negative to the body.
    parts.push(
      tube(
        [
          [b1[0] - 0.04, b0[1] + 0.04, b1[2] + 0.025],
          [b1[0] - 0.12, b0[1] + 0.02, b1[2] + 0.05],
          [1.2, -0.42, 0.5],
          [0.95, -0.44, 0.62],
        ],
        0.016,
        C.lensRed,
        'rubber',
        6,
        3,
      ),
    );
    parts.push(
      tube(
        [
          [b1[0] - 0.04, b1[1] - 0.04, b1[2] + 0.02],
          [b1[0] - 0.02, b1[1] + 0.03, b1[2] + 0.04],
          [b1[0] + 0.05, b1[1] + 0.06, 0.62],
        ],
        0.014,
        C.wireBlack,
        'rubber',
        6,
        3,
      ),
    );
    // Moulded lid ribs and the label.
    for (let k = 0; k < 4; k++)
      parts.push(
        bx(
          [b0[0] + 0.02 + k * 0.05, b0[1] + 0.02, b1[2]],
          [b0[0] + 0.04 + k * 0.05, b1[1] - 0.02, b1[2] + 0.004],
          C.battery,
          'plastic',
        ),
      );
    parts.push(
      text('12V', {
        origin: [b0[0] + 0.18, (b0[1] + b1[1]) / 2, b1[2] + 0.0045],
        along: [0, -1, 0],
        up: [1, 0, 0],
        height: 0.025,
        color: [0.85, 0.85, 0.85],
        align: 'centre',
        strip: 'plastic',
      }),
    );
  }
  return merge(parts);
}

function reservoirs(lod: Lod): Mesh {
  const parts: Mesh[] = [];
  // Washer bottle (left front, low) and power-steering reservoir (right, by the pump).
  const wb: Vec3 = [1.66, 0.3, 0.3];
  parts.push(
    bx(wb, [wb[0] + 0.1, wb[1] + 0.14, wb[2] + 0.2], C.reservoir, 'plastic', lod === 0 ? 0.012 : 0),
  );
  parts.push(
    rod(
      [wb[0] + 0.05, wb[1] + 0.07, wb[2] + 0.2],
      [wb[0] + 0.05, wb[1] + 0.07, wb[2] + 0.23],
      0.04,
      C.capBlue,
      'plastic',
      12,
    ),
  );
  const ps: Vec3 = [1.32, -0.33, 0.6];
  parts.push(
    rod(ps, [ps[0], ps[1], ps[2] + 0.07], 0.06, C.reservoir, 'plastic', lod === 0 ? 16 : 8),
  );
  parts.push(
    rod(
      [ps[0], ps[1], ps[2] + 0.07],
      [ps[0], ps[1], ps[2] + 0.085],
      0.064,
      C.black,
      'plastic',
      lod === 0 ? 16 : 8,
    ),
  );
  if (lod === 0) {
    parts.push(
      tube(
        [
          [ps[0], ps[1], ps[2]],
          [ps[0] + 0.03, ps[1] + 0.04, ps[2] - 0.08],
          [1.38, -0.21, 0.6],
        ],
        0.014,
        C.hoseBlack,
        'rubber',
        6,
        3,
      ),
    );
    // Fill-level lines moulded on the bottles.
    for (const z of [wb[2] + 0.06, wb[2] + 0.15])
      parts.push(
        bx(
          [wb[0] - 0.001, wb[1] + 0.03, z],
          [wb[0] + 0.0005, wb[1] + 0.11, z + 0.003],
          C.ironDark,
          'plastic',
        ),
      );
  }
  return merge(parts);
}

function electrics(lod: Lod): Mesh {
  const parts: Mesh[] = [
    bx([0.75, 0.42, 0.6], [0.95, 0.495, 0.7], C.black, 'plastic', lod === 0 ? 0.008 : 0),
    bx([0.75, -0.495, 0.55], [0.95, -0.44, 0.7], C.ironDark, 'aluminium', lod === 0 ? 0.004 : 0),
  ];
  if (lod === 0) {
    // ECU fins and connectors, fuse-box lid latch, main loom along both aprons.
    for (let k = 0; k < 8; k++)
      parts.push(
        bx(
          [0.77 + k * 0.022, -0.44, 0.57],
          [0.78 + k * 0.022, -0.43, 0.68],
          C.ironDark,
          'aluminium',
        ),
      );
    parts.push(bx([0.8, -0.44, 0.58], [0.9, -0.425, 0.6], C.black, 'plastic'));
    parts.push(bx([0.84, 0.41, 0.66], [0.86, 0.42, 0.69], C.ironDark, 'plastic'));
    parts.push(
      tube(
        [
          [0.95, 0.46, 0.66],
          [1.1, 0.47, 0.64],
          [1.3, 0.45, 0.6],
          [1.45, 0.3, 0.52],
          [1.4, 0.22, 0.48],
        ],
        0.022,
        C.wireBlack,
        'rubber',
        6,
        3,
      ),
    );
    parts.push(
      tube(
        [
          [0.75, 0.46, 0.66],
          [0.6, 0.4, 0.7],
          [0.55, 0.2, 0.74],
          [0.6, 0.0, 0.76],
          [0.6, -0.2, 0.74],
          [0.75, -0.45, 0.66],
        ],
        0.024,
        C.wireBlack,
        'rubber',
        6,
        3,
      ),
    );
    parts.push(
      tube(
        [
          [0.95, -0.47, 0.62],
          [1.2, -0.46, 0.56],
          [1.35, -0.25, 0.5],
        ],
        0.02,
        C.wireBlack,
        'rubber',
        6,
        3,
      ),
    );
    // Orange high-current lead (starter) down the right side.
    parts.push(
      tube(
        [
          [0.95, -0.44, 0.6],
          [0.8, -0.32, 0.42],
          [0.65, -0.26, 0.3],
        ],
        0.016,
        C.wireOrange,
        'rubber',
        6,
        3,
      ),
    );
  }
  return merge(parts);
}

/** U-shaped strut brace tower-to-tower, looping in front of the throttle body. */
function strutBrace(lod: Lod): Mesh {
  const l = corner('fl').damperTop;
  const r = corner('fr').damperTop;
  const z = l[2] + 0.035;
  const segs = lod === 0 ? 12 : 6;
  const pts: Vec3[] = [
    [l[0], l[1], z],
    [l[0] + 0.07, l[1] - 0.1, z + 0.005],
    [1.43, 0.18, z + 0.01],
    [1.43, -0.18, z + 0.01],
    [r[0] + 0.07, r[1] + 0.1, z + 0.005],
    [r[0], r[1], z],
  ];
  const parts: Mesh[] = [tube(pts, 0.032, C.natural, 'aluminium', segs, 4)];
  for (const p of [l, r]) {
    parts.push(
      rod([p[0], p[1], z - 0.012], [p[0], p[1], z + 0.006], 0.13, C.natural, 'aluminium', segs * 2),
    );
    if (lod === 0)
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5;
        parts.push(
          rod(
            [p[0] + 0.045 * Math.cos(a), p[1] + 0.045 * Math.sin(a), z + 0.006],
            [p[0] + 0.045 * Math.cos(a), p[1] + 0.045 * Math.sin(a), z + 0.016],
            0.016,
            C.natural,
            'chrome',
            6,
          ),
        );
      }
  }
  return merge(parts);
}

export function ancillaries(lod: Lod): Mesh {
  const parts = [booster(lod), battery(lod), strutBrace(lod)];
  if (lod < 2) parts.push(reservoirs(lod), electrics(lod));
  return merge(parts);
}
