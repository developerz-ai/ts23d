// Dashboard and driver controls (left-hand drive): a padded leather-topped dash lofted across
// the cockpit under the windscreen, the driver's binnacle with five gauges (tach, speedo, oil,
// water, fuel; glowing faces, chrome rings, needles), the centre stack with three round vents and
// three small gauges and a switch row, the glovebox seam, a 3-spoke leather steering wheel with
// stitched grips and the emblem hub on its column, three pedals, the 6-speed shifter in a leather
// boot and the handbrake.

import type { Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { lathe, loft, merge, sweep } from '@developerz.ai/ts23d';
import { emblem } from '../body/details.ts';
import { X_COWL } from '../dims.ts';
import { C } from '../lib/colors.ts';
import {
  add,
  along,
  beamBetween,
  bx,
  circle,
  mul,
  rod,
  rotateAbout,
  shift,
  sub,
  tube,
  unit,
} from '../lib/geo.ts';

export const DRIVER_Y = 0.39;
/** Steering wheel centre and its axis (toward the driver, tilted up). */
export const WHEEL_C: Vec3 = [-0.02, DRIVER_Y, 0.74];
export const WHEEL_AXIS: Vec3 = unit([-1, 0, 0.42]);

/** Dash section (x, z) at lateral y: top under the glass, rear face, knee roll. */
function dashSection(y: number): Vec3[] {
  const binnacle = Math.max(0, 1 - Math.abs(y - DRIVER_Y) / 0.2);
  const hood = 0.04 * Math.sqrt(binnacle);
  const pts: [number, number][] = [
    [X_COWL + 0.02, 0.865],
    [X_COWL - 0.1, 0.875 + hood * 0.6],
    [0.16 - hood, 0.86 + hood],
    [0.12 - hood * 0.8, 0.835 + hood * 0.7],
    [0.12, 0.76],
    [0.15, 0.62],
    [0.13, 0.55],
    [0.2, 0.5],
    [0.32, 0.5],
    [X_COWL + 0.02, 0.6],
  ];
  return pts.map(([x, z]): Vec3 => [x, y, z]);
}

/** x of the dash's rear face (between the top lip and the knee roll) at height z. */
function dashFaceX(z: number): number {
  const f = Math.min(1, Math.max(0, (0.76 - z) / (0.76 - 0.62)));
  return 0.12 + 0.03 * f;
}

function dashBody(lod: Lod): Mesh {
  const n = lod === 0 ? 36 : 12;
  const rings: Vec3[][] = [];
  for (let i = 0; i <= n; i++) {
    const y = -0.66 + (1.32 * i) / n;
    rings.push(dashSection(y));
  }
  const parts: Mesh[] = [
    loft({ rings, color: C.dash, strip: 'leather', capStart: true, capEnd: true, uv: 'row' }),
  ];
  if (lod === 0) {
    // Stitch line along the top edge of the dash, red.
    const st: Vec3[] = [];
    for (let i = 0; i <= 24; i++) {
      const y = -0.68 + (1.36 * i) / 24;
      const p = dashSection(y)[3] ?? [0, y, 0.8];
      st.push(add(p, [-0.004, 0, 0.004]));
    }
    parts.push(tube(st, 0.003, C.stitch, 'plastic', 4, 1, false));
    // Glovebox seam and latch on the passenger side, sunk 2 mm into the dash's rear face (which
    // leans: QA connections found the lower seam 2.5 cm clear of it at a fixed x).
    const fx = (z: number): number => dashFaceX(z);
    parts.push(bx([fx(0.622) - 0.004, -0.62, 0.62], [fx(0.622) + 0.002, -0.22, 0.624], C.black));
    parts.push(bx([fx(0.742) - 0.004, -0.62, 0.74], [fx(0.742) + 0.002, -0.22, 0.744], C.black));
    parts.push(
      bx([fx(0.69) - 0.008, -0.44, 0.69], [fx(0.705) + 0.002, -0.38, 0.705], C.natural, 'chrome'),
    );
  }
  return merge(parts);
}

/** A round gauge: chrome bezel, recessed glowing face (separate), needle, glass. */
function gauge(lod: Lod, r: number): { body: Mesh; face: Mesh } {
  const segs = lod === 0 ? 28 : 10;
  const body = merge([
    lathe({
      profile: [
        [r * 0.95, -0.03],
        [r * 0.95, 0],
        [r * 1.12, 0.004],
        [r * 1.12, 0.008],
        [r * 0.96, 0.01],
      ],
      segments: segs,
      axis: 'x',
      color: C.natural,
      strip: 'chrome',
      caps: false,
    }),
    ...(lod === 0
      ? [
          beamBetween(
            [0.004, 0, 0],
            [0.004, r * 0.75 * Math.cos(2.2), r * 0.75 * Math.sin(2.2)],
            0.003,
            0.002,
            C.lensRed,
          ),
        ]
      : []),
  ]);
  const face = lathe({
    profile: [
      [0, 0],
      [r * 0.95, 0],
    ],
    segments: segs,
    axis: 'x',
    color: C.gaugeFace,
    strip: 'plastic',
    caps: false,
  });
  return { body, face };
}

export interface DashMeshes {
  readonly dash: Mesh;
  readonly gauges: Mesh;
  readonly gaugeFaces: Mesh;
  readonly wheel: Mesh;
  readonly controls: Mesh;
}

export function dashboard(lod: Lod): DashMeshes {
  const g: Mesh[] = [];
  const faces: Mesh[] = [];
  // Binnacle: tach (centre), speedo (right), three small left/right.
  const face: Vec3 = [-1, 0, 0.25];
  const put = (y: number, z: number, r: number): void => {
    const p: Vec3 = [0.135, y, z];
    const m = gauge(lod, r);
    g.push(along(m.body, p, face));
    faces.push(along(m.face, add(p, [-0.004, 0, 0.001]), face));
  };
  put(DRIVER_Y, 0.8, 0.052);
  put(DRIVER_Y - 0.12, 0.79, 0.044);
  put(DRIVER_Y + 0.11, 0.79, 0.032);
  if (lod < 2) {
    put(DRIVER_Y + 0.18, 0.775, 0.024);
    // Centre stack: three small gauges and three vents.
    for (const y of [-0.07, 0, 0.07]) put(y, 0.66, 0.022);
    for (const y of [-0.09, 0.09]) {
      const v = lathe({
        profile: [
          [0.034, -0.03],
          [0.034, 0],
          [0.042, 0.005],
          [0.03, 0.006],
        ],
        segments: lod === 0 ? 20 : 8,
        axis: 'x',
        color: C.natural,
        strip: 'chrome',
        caps: false,
      });
      g.push(along(v, [0.13, y, 0.73], face));
      g.push(
        along(
          lathe({
            profile: [
              [0, -0.01],
              [0.032, -0.01],
            ],
            segments: 16,
            axis: 'x',
            color: C.black,
            strip: 'plastic',
            caps: false,
          }),
          [0.13, y, 0.73],
          face,
        ),
      );
    }
    const pv = lathe({
      profile: [
        [0.034, -0.03],
        [0.034, 0],
        [0.042, 0.005],
        [0.03, 0.006],
      ],
      segments: lod === 0 ? 20 : 8,
      axis: 'x',
      color: C.natural,
      strip: 'chrome',
      caps: false,
    });
    g.push(along(pv, [0.13, -0.5, 0.79], face));
    // Switch row and hazard button.
    if (lod === 0)
      for (let k = 0; k < 6; k++)
        g.push(
          bx(
            [0.12, -0.075 + k * 0.03, 0.585],
            [0.135, -0.065 + k * 0.03, 0.605],
            C.ironDark,
            'plastic',
            0.002,
          ),
        );
  }
  // Steering wheel: leather rim (swept circle round the axis), three spokes, hub + emblem, column.
  const wheel: Mesh[] = [];
  const r = 0.185;
  const e1: Vec3 = [0, 1, 0];
  const e2 = unit(sub([0, 0, 1], mul(WHEEL_AXIS, WHEEL_AXIS[2])));
  const segs = lod === 0 ? 48 : 16;
  const path = circle(WHEEL_C, e1, e2, r, segs);
  wheel.push(
    sweep({
      section: { radius: lod === 0 ? 0.017 : 0.02, segments: lod === 0 ? 10 : 6 },
      path: [...path, path[0] ?? WHEEL_C],
      color: C.leather,
      strip: 'leather',
    }),
  );
  const spoke = (a: number): void => {
    const end = add(WHEEL_C, add(mul(e1, r * Math.cos(a)), mul(e2, r * Math.sin(a))));
    wheel.push(
      beamBetween(add(WHEEL_C, mul(WHEEL_AXIS, -0.02)), end, 0.04, 0.012, C.natural, 'aluminium'),
    );
  };
  for (const a of [0, Math.PI, -Math.PI / 2]) spoke(a);
  wheel.push(
    along(
      lathe({
        profile: [
          [0, 0.03],
          [0.045, 0.025],
          [0.05, 0],
          [0.04, -0.04],
          [0, -0.04],
        ],
        segments: lod === 0 ? 24 : 10,
        axis: 'x',
        color: C.leather,
        strip: 'leather',
      }),
      WHEEL_C,
      WHEEL_AXIS,
    ),
  );
  if (lod === 0) {
    wheel.push(emblem(add(WHEEL_C, mul(WHEEL_AXIS, 0.031)), WHEEL_AXIS, 0.022));
    // Red 12-o'clock marker.
    const top = add(WHEEL_C, mul(e2, r));
    wheel.push(
      sweep({
        section: { radius: 0.0185, segments: 10 },
        path: [add(top, mul(e1, -0.012)), add(top, mul(e1, 0.012))],
        color: C.leatherAccent,
        strip: 'leather',
      }),
    );
  }
  wheel.push(
    rod(
      add(WHEEL_C, mul(WHEEL_AXIS, -0.04)),
      add(WHEEL_C, mul(WHEEL_AXIS, -0.3)),
      0.05,
      C.black,
      'plastic',
      12,
    ),
  );
  if (lod < 2) {
    // Column stalks.
    for (const s of [1, -1])
      wheel.push(
        beamBetween(
          add(WHEEL_C, mul(WHEEL_AXIS, -0.1)),
          add(WHEEL_C, add(mul(WHEEL_AXIS, -0.1), [-0.02, s * 0.12, -0.02])),
          0.012,
          0.01,
          C.black,
        ),
      );
  }
  // Controls: pedals, shifter, handbrake.
  const ctl: Mesh[] = [];
  for (const [k, y] of [DRIVER_Y + 0.12, DRIVER_Y, DRIVER_Y - 0.11].entries()) {
    const pad: Vec3 = [0.32, y, 0.28 - (k === 2 ? 0.04 : 0)];
    ctl.push(beamBetween(pad, add(pad, [0.08, 0, 0.32]), 0.016, 0.01, C.natural, 'aluminium'));
    ctl.push(
      rotateAbout(
        bx(
          add(pad, [-0.01, -0.04, -0.035]),
          add(pad, [0.008, 0.04, 0.045 + (k === 2 ? 0.04 : 0)]),
          C.natural,
          'aluminium',
          0.003,
        ),
        pad,
        [0, 1, 0],
        -0.4,
      ),
    );
  }
  const sh: Vec3 = [-0.06, 0, 0.43];
  ctl.push(
    shift(
      lathe({
        profile: [
          [0.0, 0.0],
          [0.07, 0.0],
          [0.05, 0.03],
          [0.055, 0.045],
          [0.035, 0.07],
          [0.04, 0.08],
          [0.012, 0.11],
          [0, 0.11],
        ],
        segments: lod === 0 ? 16 : 8,
        axis: 'z',
        color: C.leather,
        strip: 'leather',
      }),
      sh,
    ),
  );
  ctl.push(rod(add(sh, [0, 0, 0.1]), add(sh, [-0.03, 0, 0.21]), 0.012, C.natural, 'chrome', 8));
  ctl.push(
    shift(
      lathe({
        profile: [
          [0, -0.024],
          [0.016, -0.02],
          [0.024, 0],
          [0.016, 0.02],
          [0, 0.024],
        ],
        segments: lod === 0 ? 16 : 8,
        axis: 'z',
        color: C.natural,
        strip: 'chrome',
      }),
      add(sh, [-0.032, 0, 0.23]),
    ),
  );
  if (lod < 2) {
    ctl.push(bx([-0.4, -0.02, 0.43], [-0.18, 0.02, 0.46], C.leather, 'leather', 0.006));
    ctl.push(rod([-0.2, 0, 0.45], [-0.36, 0, 0.5], 0.022, C.leather, 'leather', 8));
    // Console lid / armrest between the seats.
    ctl.push(
      bx([-0.78, -0.1, 0.43], [-0.45, 0.1, 0.52], C.leather, 'leather', lod === 0 ? 0.02 : 0),
    );
  }
  return {
    dash: dashBody(lod),
    gauges: merge(g),
    gaugeFaces: merge(faces),
    wheel: merge(wheel),
    controls: merge(ctl),
  };
}
