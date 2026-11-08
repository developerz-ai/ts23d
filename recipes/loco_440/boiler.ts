// Jupiter boiler: Russia-iron wagon-top barrel with brass bands, graphite smokebox (riveted, door
// with dogs and the blue "60" plate), the big balloon stack sooted at the lip, brass steam dome
// with whistle and safety valve, Caledonian-blue sand dome lettered "60", bell in its yoke.

import {
  type BuildContext,
  beam,
  grime,
  hex,
  type Mesh,
  merge,
  place,
  text,
} from '@developerz.ai/ts23d';
import {
  BOILER_R,
  BOILER_Z,
  bx,
  F,
  type Finish,
  type Layout,
  lath,
  pipe,
  SMOKEBOX_R,
} from './shared.ts';

const TOP = BOILER_Z + BOILER_R * 0.95;

/** Rivet heads in a ring round the X axis at station x, radius r. */
function rivetRing(x: number, r: number, n: number, f = F.smokebox): Mesh[] {
  const head = lath({
    profile: [
      [0.014, 0],
      [0.011, 0.008],
      [0, 0.011],
    ],
    segments: 5,
    ...f,
  });
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    // Local +Z of the head turns to the radial direction (0, cos a, sin a).
    return place(head, {
      at: [x, Math.cos(a) * r, BOILER_Z + Math.sin(a) * r],
      roll: -(Math.PI / 2 - a),
    });
  });
}

export function buildBoiler(ctx: BuildContext, L: Layout, number: string): void {
  const { lod, segs, barrelFront, barrelRear, smokeFront, stackX, stackBase } = L;

  ctx.part(
    'boiler_barrel',
    lath({
      profile: [
        [BOILER_R, barrelRear],
        [BOILER_R, barrelRear + 1.0],
        [BOILER_R * 0.95, barrelRear + 1.4],
        [BOILER_R * 0.95, barrelFront],
      ],
      segments: segs,
      axis: 'x',
      at: [0, 0, BOILER_Z],
      caps: true,
      ...F.russia,
    }),
    { parent: 'locomotive' },
  );
  ctx.part(
    'boiler_saddle',
    grime(bx(smokeFront - 1.0, smokeFront - 0.1, -0.55, 0.55, 1.04, BOILER_Z, F.black), {
      ground: 1.5,
      groundStrength: 0.3,
    }),
    { parent: 'locomotive' },
  );

  // Smokebox: graphite iron, a front ring, the door with hinge straps, dogs and number plate.
  const sm: Mesh[] = [
    lath({
      profile: [
        [SMOKEBOX_R, barrelFront - 0.02],
        [SMOKEBOX_R, smokeFront - 0.06],
        [SMOKEBOX_R - 0.04, smokeFront],
        [0.5, smokeFront + 0.01],
        [0.48, smokeFront + 0.04],
        [0.36, smokeFront + 0.06],
        [0, smokeFront + 0.07],
      ],
      segments: segs,
      axis: 'x',
      at: [0, 0, BOILER_Z],
      caps: true,
      ...F.smokebox,
    }),
  ];
  if (lod < 2) {
    const plateX = smokeFront + 0.07;
    sm.push(
      // Number plate: brass ring round a blue enamel disc, brass numerals.
      lath({
        profile: [
          [0.16, plateX],
          [0.16, plateX + 0.02],
          [0.13, plateX + 0.025],
          [0.13, plateX + 0.015],
        ],
        segments: 24,
        axis: 'x',
        at: [0, 0, BOILER_Z],
        ...F.brass,
      }),
      lath({
        profile: [
          [0.131, plateX + 0.015],
          [0, plateX + 0.015],
        ],
        segments: 24,
        axis: 'x',
        at: [0, 0, BOILER_Z],
        ...F.blueSteel,
      }),
      // Hinge straps across the door, latch handle.
      bx(plateX - 0.03, plateX + 0.005, -0.42, -0.05, BOILER_Z + 0.2, BOILER_Z + 0.25, F.smokebox),
      bx(plateX - 0.03, plateX + 0.005, -0.42, -0.05, BOILER_Z - 0.25, BOILER_Z - 0.2, F.smokebox),
      bx(plateX - 0.04, plateX + 0.01, -0.46, -0.4, BOILER_Z - 0.28, BOILER_Z + 0.28, F.smokebox),
    );
    if (lod === 0) {
      sm.push(
        text(number, {
          origin: [plateX + 0.016, 0, BOILER_Z - 0.06],
          along: [0, 1, 0],
          height: 0.12,
          align: 'centre',
          ...F.brass,
        }),
        ...rivetRing(barrelFront + 0.04, SMOKEBOX_R, 40),
        ...rivetRing(smokeFront - 0.1, SMOKEBOX_R, 40),
      );
      // Door dogs round the rim.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        sm.push(
          bx(
            smokeFront,
            smokeFront + 0.05,
            Math.cos(a) * 0.52 - 0.02,
            Math.cos(a) * 0.52 + 0.02,
            BOILER_Z + Math.sin(a) * 0.52 - 0.02,
            BOILER_Z + Math.sin(a) * 0.52 + 0.02,
            F.smokebox,
          ),
        );
      }
    }
    // Brass boiler bands: jacket seams.
    const bands = lod === 0 ? 7 : 3;
    for (let i = 0; i <= bands; i++) {
      const x = barrelRear + 0.1 + ((barrelFront - barrelRear - 0.2) * i) / bands;
      const r = x < barrelRear + 1.2 ? BOILER_R : BOILER_R * 0.95;
      sm.push(
        lath({
          profile: [
            [r, x - 0.03],
            [r + 0.008, x - 0.025],
            [r + 0.008, x + 0.025],
            [r, x + 0.03],
          ],
          segments: segs,
          axis: 'x',
          at: [0, 0, BOILER_Z],
          ...F.brass,
        }),
      );
    }
  }
  ctx.part(
    'boiler_front',
    grime(merge(sm), { zones: [{ at: [stackX, 0, stackBase], radius: 0.9, strength: 0.35 }] }),
    { parent: 'locomotive' },
  );

  // Stack: the balloon spark-arrester stack, its cone cap, rim band; sooted toward the top.
  ctx.part(
    'stack',
    grime(
      lath({
        profile:
          lod < 2
            ? [
                [0.3, 0],
                [0.24, 0.06],
                [0.2, 0.14],
                [0.19, 0.55],
                [0.22, 0.6],
                [0.3, 0.75],
                [0.52, 1.33],
                [0.565, 1.38],
                [0.565, 1.44],
                [0.54, 1.47],
                [0.46, 1.52],
                [0.25, 1.58],
                [0.06, 1.6],
              ]
            : [
                [0.22, 0],
                [0.19, 0.55],
                [0.56, 1.42],
                [0.3, 1.6],
              ],
        segments: segs,
        at: [stackX, 0, stackBase],
        caps: true,
        ...F.smokebox,
      }),
      { zones: [{ at: [stackX, 0, stackBase + 1.6], radius: 1.0, strength: 0.55 }] },
    ),
    { parent: 'locomotive' },
  );
  ctx.emitter('stack_smoke', {
    kind: 'smoke',
    parent: 'locomotive',
    at: [stackX, 0, stackBase + 1.62],
    rate: 18,
    life: 4,
    size: [0.5, 3],
    color: hex('#4a4a4a'),
    speed: 2.5,
    spreadDeg: 12,
    when: 'always',
  });

  // Domes: brass steam dome on a blue skirt (whistle + safety valve), blue sand dome, bell.
  const dome = (x: number, h: number, r: number, f: Finish): Mesh =>
    lath({
      profile:
        lod < 2
          ? [
              [r + 0.12, -0.08],
              [r + 0.02, 0.0],
              [r, 0.05],
              [r, h * 0.6],
              [r * 0.95, h * 0.72],
              [r * 0.7, h * 0.9],
              [r * 0.3, h],
              [0, h],
            ]
          : [
              [r + 0.1, -0.08],
              [r, h * 0.6],
              [0, h],
            ],
      segments: segs,
      at: [x, 0, TOP - 0.06],
      ...f,
    });
  const steamX = barrelRear + 0.55;
  const sandX = barrelRear + 2.25;
  const bellX = (sandX + stackX) / 2 + 0.05;
  const d: Mesh[] = [dome(steamX, 0.78, 0.33, F.brass), dome(sandX, 0.62, 0.3, F.blueSteel)];
  if (lod < 2) {
    const ring = (x: number, r: number, z0: number, z1: number, f: Finish): Mesh =>
      lath({
        profile: [
          [r, z0],
          [r, z1],
        ],
        segments: segs,
        at: [x, 0, TOP - 0.06],
        ...f,
      });
    d.push(
      // Steam-dome skirt in blue with a brass beading.
      ring(steamX, 0.345, 0.0, 0.14, F.blueSteel),
      ring(steamX, 0.352, 0.13, 0.16, F.brass),
      // Sand dome: brass bands, crowned cap with a finial.
      ring(sandX, 0.315, 0.02, 0.06, F.brass),
      ring(sandX, 0.315, 0.34, 0.38, F.brass),
      lath({
        profile: [
          [0.32, 0],
          [0.3, 0.04],
          [0.2, 0.12],
          [0.06, 0.16],
          [0.05, 0.22],
          [0.07, 0.26],
          [0, 0.3],
        ],
        segments: segs,
        at: [sandX, 0, TOP - 0.06 + 0.5],
        caps: true,
        ...F.blueSteel,
      }),
      // Whistle on the steam dome, safety-valve column beside it.
      lath({
        profile: [
          [0.035, 0],
          [0.035, 0.1],
          [0.065, 0.12],
          [0.065, 0.32],
          [0.03, 0.36],
          [0.01, 0.4],
        ],
        segments: 12,
        at: [steamX, 0, TOP + 0.7],
        caps: true,
        ...F.brass,
      }),
      lath({
        profile: [
          [0.05, 0],
          [0.05, 0.12],
          [0.07, 0.14],
          [0.04, 0.2],
        ],
        segments: 10,
        at: [steamX - 0.15, 0, TOP + 0.62],
        caps: true,
        ...F.brass,
      }),
    );
    if (lod === 0)
      for (const s of [1, -1])
        d.push(
          text(number, {
            origin: [sandX, s * 0.302, TOP + 0.2],
            along: [-s, 0, 0],
            height: 0.13,
            align: 'centre',
            ...F.brass,
            surface: (u) => -(0.3 - Math.sqrt(Math.max(0, 0.09 - u * u))),
          }),
        );
    // Bell in its yoke on a pedestal.
    const bellZ = TOP + 0.32;
    d.push(
      lath({
        profile: [
          [0.2, 0],
          [0.185, 0.03],
          [0.13, 0.18],
          [0.11, 0.3],
          [0.05, 0.34],
          [0.03, 0.4],
          // Crown stem up into the yoke's cross-bar (QA connections: the bell hung 3.5 cm under it).
          [0.03, 0.47],
        ],
        segments: segs,
        at: [bellX, 0, bellZ - 0.16],
        caps: true,
        ...F.brass,
      }),
      bx(bellX - 0.12, bellX + 0.12, -0.28, 0.28, TOP - 0.08, TOP + 0.0, F.brass),
      ...[0.25, -0.25].flatMap((y) =>
        pipe(
          [
            [bellX, y, TOP - 0.04],
            [bellX, y, bellZ + 0.12],
            [bellX, y * 0.6, bellZ + 0.3],
          ],
          0.045,
          F.brass,
          8,
        ),
      ),
      beam({
        from: [bellX, 0.17, bellZ + 0.3],
        to: [bellX, -0.17, bellZ + 0.3],
        width: 0.05,
        segments: 8,
        ...F.brass,
      }),
    );
  }
  ctx.part('boiler_domes', merge(d), { parent: 'locomotive' });
}
