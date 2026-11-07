// Country station: the GWR standard small brick station as at Toddington (1904). One-storey red
// brick building on a 3 ft (0.915 m) brick-faced platform, slate gable roof with two stacks, deep
// canopy on cast-iron columns with a fretted valance, benches, lamps, a running-in name board.
// Track side = +X (the platform edge), ground / rail top z = 0. Dossier: ./README.md.

import {
  beam,
  box,
  cell,
  cylinder,
  defineAsset,
  grime,
  hex,
  type Lod,
  lathe,
  type Mesh,
  mass,
  merge,
  type OpeningSide,
  opening,
  place,
  prism,
  type RoofMeshOptions,
  ridgeHeight,
  roof,
  text,
  tiled,
  type Vec2,
  type Vec3,
} from '@developerz-ai/ts23d';

// ---------------------------------------------------------------- layout (metres)
const PLAT_Z = 0.915; // 3 ft over rail
const PLAT_X0 = -4.6;
const PLAT_EDGE = 7.0; // face of the coping over the track
const PLAT_Y = 15;
const B_X0 = -3.6; // back wall
const B_X1 = 2.8; // platform-side wall
const B_Y = 10;
const WALL_H = 3.9;
const EAVE_Z = PLAT_Z + WALL_H;
const CAN_X1 = 6.25; // canopy front edge
const CAN_Y = 9.2;
const CAN_Z_WALL = 4.3;
const CAN_Z_FRONT = 3.78;
const COL_X = 5.6;
const canZ = (x: number): number =>
  CAN_Z_WALL + ((CAN_Z_FRONT - CAN_Z_WALL) * (x - B_X1)) / (CAN_X1 - B_X1);

const brick = hex('#a24f36');
const blueBrick = hex('#3b3a44');
const slate = hex('#4b5058');
const coping = hex('#d9d3c4');
const paving = hex('#9d988e');
const chocolate = hex('#4a2d22');
const cream = hex('#e7dcc0');
const iron = hex('#2b2522');
const glass = hex('#2c3a42');
const signBlack = hex('#151515');
const white = hex('#f2efe6');

const ROOF: RoofMeshOptions = {
  type: 'gable',
  footprint: [B_X1 - B_X0, 2 * B_Y],
  pitchDeg: 33,
  at: [(B_X0 + B_X1) / 2, 0, EAVE_Z],
  color: slate,
  strip: 'slate',
  overhang: 0.45,
  rake: 0.35,
  ridge: 'y',
  trim: cream,
  wall: { color: brick, strip: 'brick' },
  chimneys: [
    { at: [-0.9, -4.6], size: [0.75, 0.55], height: 1.1, color: brick, strip: 'brick', pots: 2 },
    { at: [-0.9, 5.2], size: [0.75, 0.55], height: 1.1, color: brick, strip: 'brick', pots: 2 },
  ],
};
const RIDGE_Z = ridgeHeight(ROOF); // world z of the ridge

// ---------------------------------------------------------------- furniture (local space)
/** GWR platform bench, 1.8 m: slatted seat and back on two cast-iron ends; faces +X, base z = 0. */
function bench(lod: Lod): Mesh {
  const out: Mesh[] = [];
  const end: Vec2[] = [
    [0.22, 0],
    [0.3, 0],
    [0.12, 0.42],
    [0.2, 0.46],
    [-0.18, 0.46],
    [-0.2, 0.9],
    [-0.26, 0.9],
    [-0.24, 0.42],
    [-0.3, 0],
    [-0.22, 0],
    [-0.14, 0.38],
    [0.08, 0.38],
  ];
  for (const y of [-0.82, 0.82])
    out.push(
      place(prism({ profile: end, depth: 0.05, plane: 'xz', color: iron, strip: 'iron' }), {
        at: [0, y, 0],
      }),
    );
  const slats = lod === 0 ? 4 : 1;
  for (let i = 0; i < slats; i++) {
    const x0 = 0.18 - (i * 0.38) / slats;
    out.push(
      box({
        size: [0.38 / slats - 0.015, 1.8, 0.035],
        at: [x0 - 0.19 / slats, 0, 0.46],
        color: chocolate,
        strip: 'wood',
      }),
    );
  }
  const backs = lod === 0 ? 3 : 1;
  for (let i = 0; i < backs; i++)
    out.push(
      box({
        size: [0.03, 1.8, 0.4 / backs - 0.02],
        at: [-0.22, 0, 0.5 + (i * 0.4) / backs],
        color: chocolate,
        strip: 'wood',
      }),
    );
  return merge(out);
}

/** Platform lamp: cast-iron post, square lantern (glass separate for glow), ladder bar. */
function lampPost(lod: Lod): { post: Mesh; glass: Mesh } {
  const glassM = box({
    size: [0.32, 0.32, 0.4],
    at: [0, 0, 2.74],
    color: hex('#f3d79a'),
    strip: 'glass',
  });
  if (lod === 2)
    return {
      post: merge([
        box({ size: [0.12, 0.12, 2.7], color: chocolate }),
        box({ size: [0.4, 0.4, 0.2], at: [0, 0, 3.14], color: chocolate }),
      ]),
      glass: glassM,
    };
  const segs = [10, 8, 6][lod] ?? 6;
  const post: Mesh[] = [
    lathe({
      profile: [
        [0, 0],
        [0.13, 0],
        [0.13, 0.25],
        [0.07, 0.4],
        [0.055, 0.5],
        [0.045, 2.55],
        [0.07, 2.65],
        [0.07, 2.7],
        [0, 2.7],
      ],
      segments: segs,
      color: chocolate,
    }),
    // Lantern frame and pyramid cap.
    box({ size: [0.36, 0.36, 0.04], at: [0, 0, 2.7], color: chocolate }),
    lathe({
      profile: [
        [0.27, 3.18],
        [0.05, 3.36],
        [0.05, 3.42],
        [0, 3.45],
      ],
      segments: 4,
      color: chocolate,
    }),
    box({ size: [0.4, 0.4, 0.04], at: [0, 0, 3.14], color: chocolate }),
  ];
  if (lod < 2)
    post.push(beam({ from: [0, -0.32, 2.45], to: [0, 0.32, 2.45], width: 0.03, color: chocolate })); // ladder bar
  return { post: merge(post), glass: glassM };
}

/** Running-in board: two posts and a black board lettered in white, facing +X. */
function nameBoard(name: string, lod: Lod): Mesh {
  const out: Mesh[] = [];
  for (const y of [-2.0, 2.0])
    out.push(box({ size: [0.12, 0.12, 2.35], at: [0, y, 0], color: cream, strip: 'wood' }));
  out.push(box({ size: [0.08, 5.0, 0.95], at: [0.1, 0, 1.35], color: signBlack, strip: 'wood' }));
  if (lod < 2) {
    out.push(box({ size: [0.1, 5.1, 0.06], at: [0.1, 0, 2.3], color: cream, strip: 'wood' })); // capping
    out.push(
      text(name, {
        origin: [0.14, 0, 1.54],
        height: 0.56,
        color: white,
        align: 'centre',
        font: 'block',
        maxWidth: 4.7,
      }),
    );
  }
  return merge(out);
}

// ---------------------------------------------------------------- the station
export const station_halt = defineAsset({
  name: 'station_halt',
  kind: 'building',
  description:
    'GWR standard country station (Toddington, 1904): red brick building with slate roof and stacks, chocolate-and-cream canopy with fretted valance on cast-iron columns, brick-faced platform, benches, lamps, running-in board.',
  tags: ['railroad', 'station', 'gwr', 'edwardian', 'uk', 'brick'],
  license: 'CC0-1.0',
  sources: [
    'https://commons.wikimedia.org/wiki/File:Toddington_Railway_Station_GWSR_001.jpg',
    'https://commons.wikimedia.org/wiki/File:Toddington_railway_station_1.jpg',
    'https://commons.wikimedia.org/wiki/File:Toddington_railway_station9.4.05.jpg',
    'https://en.wikipedia.org/wiki/Toddington_railway_station',
    'https://en.wikipedia.org/wiki/Railway_platform_height',
    'https://www.bachmann.co.uk/product/gwr-standard-station---chocolate-and-cream/44-1019',
  ],
  real: {
    length: PLAT_EDGE + 0.25 - PLAT_X0,
    width: 2 * PLAT_Y,
    height: RIDGE_Z + 1.45,
    measures: [
      {
        label: 'platform height over rail (3 ft)',
        value: PLAT_Z,
        axis: 'z',
        parts: ['platform'],
        source: 'Railway platform height (UK 915 mm)',
      },
      {
        label: 'building length (photo-scaled)',
        value: 2 * B_Y,
        axis: 'y',
        parts: ['building'],
        tolerance: 0.05,
        source: 'Toddington photos',
      },
      {
        label: 'building depth (photo-scaled)',
        value: B_X1 - B_X0,
        axis: 'x',
        parts: ['building'],
        tolerance: 0.05,
        source: 'Toddington photos',
      },
    ],
  },
  budget: { triangles: [10500, 5800, 550] },
  glow: [{ parts: ['lamp_*_glass'], color: [1, 0.82, 0.55], strength: 3 }],
  build(ctx) {
    const lod = ctx.lod;
    const bevel = ctx.pick([0.015, 0.008, 0]);
    const dirt = (m: Mesh): Mesh => grime(m, { ground: PLAT_Z + 0.7, groundStrength: 0.3 });

    // ---- platform: blue-brick faced fill, paving, pale stone coping over the track.
    const pf: Mesh[] = [
      mass(
        {
          size: [PLAT_EDGE - 0.25 - PLAT_X0, 2 * PLAT_Y, PLAT_Z - 0.08],
          at: [(PLAT_EDGE - 0.25 + PLAT_X0) / 2, 0, 0],
          color: blueBrick,
          strip: 'brick',
          omit: ['bottom', 'top'],
        },
        lod,
      ),
      // Flagstone paving at true scale (courses run across the platform), on an 8 cm slab edge.
      box({
        size: [PLAT_EDGE - 0.25 - PLAT_X0, 2 * PLAT_Y, 0.08],
        at: [(PLAT_EDGE - 0.25 + PLAT_X0) / 2, 0, PLAT_Z - 0.08],
        color: paving,
        omit: ['bottom', 'top'],
      }),
      tiled({
        origin: [PLAT_X0, -PLAT_Y, PLAT_Z],
        u: [PLAT_EDGE - 0.25 - PLAT_X0, 0, 0],
        v: [0, 2 * PLAT_Y, 0],
        color: paving,
        strip: lod === 2 ? 'plain' : 'stone',
        ...(lod === 2 ? { vMetres: 2 * PLAT_Y } : {}),
      }),
      box({
        size: [0.5, 2 * PLAT_Y, 0.1],
        at: [PLAT_EDGE - 0.25, 0, PLAT_Z - 0.1],
        color: coping,
        strip: 'stone',
        omit: ['bottom'],
        ...(bevel ? { bevel } : {}),
      }),
    ];
    if (lod < 2)
      pf.push(
        box({ size: [0.12, 2 * PLAT_Y, 0.004], at: [PLAT_EDGE - 0.12, 0, PLAT_Z], color: white }),
      ); // white edge line
    ctx.part('platform', grime(merge(pf), { ground: 0.5, groundStrength: 0.35 }));

    // ---- building: brick walls in true-scale courses, blue plinth, eaves band.
    const bw: Mesh[] = [
      mass(
        {
          size: [B_X1 - B_X0, 2 * B_Y, WALL_H],
          at: [(B_X0 + B_X1) / 2, 0, PLAT_Z],
          color: brick,
          strip: 'brick',
          omit: ['bottom', 'top'],
          courseOrigin: PLAT_Z,
        },
        lod,
      ),
    ];
    if (lod < 2) {
      bw.push(
        mass(
          {
            size: [B_X1 - B_X0 + 0.08, 2 * B_Y + 0.08, 0.45],
            at: [(B_X0 + B_X1) / 2, 0, PLAT_Z],
            color: blueBrick,
            strip: 'brick',
            omit: ['bottom', 'top'],
            courseOrigin: PLAT_Z,
          },
          lod,
        ),
      );
      bw.push(
        mass(
          {
            size: [B_X1 - B_X0 + 0.06, 2 * B_Y + 0.06, 0.15],
            at: [(B_X0 + B_X1) / 2, 0, EAVE_Z - 0.32],
            color: blueBrick,
            strip: 'brick',
            omit: ['bottom', 'top'],
            courseOrigin: PLAT_Z,
          },
          lod,
        ),
      );
    }
    ctx.part('building', dirt(merge(bw)));

    // ---- openings: sashes and panelled doors (chocolate doors, cream frames, stone sills/heads).
    type Op = { kind: 'window' | 'door'; side: OpeningSide; at: Vec3 };
    const front = ['W', 'D', 'W', 'W', 'D', 'W', 'W', 'D', 'W', 'W'];
    const ops: Op[] = front.map((k, i) => ({
      kind: k === 'D' ? 'door' : 'window',
      side: 'front',
      at: [B_X1, -8.4 + i * 1.87, k === 'D' ? PLAT_Z : PLAT_Z + 0.85],
    }));
    for (const y of [-6.5, -2.2, 2.2, 6.5])
      ops.push({ kind: 'window', side: 'back', at: [B_X0, y, PLAT_Z + 0.85] });
    ops.push({ kind: 'door', side: 'back', at: [B_X0, 0, PLAT_Z] });
    for (const [side, y] of [
      ['left', B_Y],
      ['right', -B_Y],
    ] as const)
      ops.push({ kind: 'window', side, at: [-0.4, y, PLAT_Z + 0.85] });
    ops.forEach((o, i) => {
      const isDoor = o.kind === 'door';
      ctx.part(
        `${isDoor ? 'door' : 'window'}_${o.side}_${i}`,
        opening(
          {
            kind: o.kind,
            width: isDoor ? 1.0 : 1.05,
            height: isDoor ? 2.35 : 1.85,
            at: o.at,
            facing: o.side,
            glass,
            frame: isDoor ? chocolate : cream,
            wall: brick,
            wallStrip: 'brick',
            trim: coping,
            panes: [2, 3],
          },
          lod,
        ),
      );
      if (isDoor && o.side === 'front')
        ctx.socket(`door_${i}_use`, {
          kind: 'interact',
          at: [o.at[0] + 0.4, o.at[1], PLAT_Z + 1.0],
          dir: [-1, 0, 0],
        });
    });

    // ---- roof with stacks; smoke from both pots.
    const info = roof(ctx, { ...ROOF, name: 'roof' });
    (ROOF.chimneys ?? []).forEach((c, i) => {
      const x = (ROOF.at[0] ?? 0) + c.at[0];
      const y = c.at[1];
      const top =
        Math.max(info.heightAt(x - 0.4, y), info.heightAt(x + 0.4, y)) + (c.height ?? 0.9) + 0.4;
      ctx.emitter(`chimney_${i}`, {
        kind: 'smoke',
        at: [x, y, top],
        rate: 3,
        life: 5,
        size: [0.3, 1.6],
        color: [0.5, 0.5, 0.52],
        speed: 0.6,
        when: 'always',
      });
    });

    // ---- canopy: sloped deck (slate-grey sheet over a boarded cream soffit), valance, columns.
    const cn: Mesh[] = [
      prism({
        profile: [
          [B_X1, CAN_Z_WALL + 0.1],
          [CAN_X1, CAN_Z_FRONT + 0.06],
          [CAN_X1, CAN_Z_FRONT - 0.04],
          [B_X1, CAN_Z_WALL - 0.02],
        ],
        depth: 2 * CAN_Y,
        plane: 'xz',
        color: slate,
        strip: 'iron',
      }),
      // Eaves girder on the column heads.
      box({
        size: [0.16, 2 * CAN_Y, 0.2],
        at: [COL_X, 0, canZ(COL_X) - 0.24],
        color: chocolate,
        strip: 'iron',
      }),
    ];
    // Fretted valance along the front and both ends: boards with a sawtooth bottom (LOD0).
    const valance = (len: number): Mesh => {
      const top = 0.5;
      if (lod > 0)
        return prism({
          profile: [
            [-len / 2, 0.08],
            [len / 2, 0.08],
            [len / 2, top],
            [-len / 2, top],
          ],
          depth: 0.03,
          plane: 'yz',
          color: cream,
          strip: 'wood',
        });
      const teeth = Math.round(len / 0.16);
      const pts: Vec2[] = [
        [-len / 2, top],
        [-len / 2, 0.1],
      ];
      for (let i = 0; i < teeth; i++) {
        const y0 = -len / 2 + (i * len) / teeth;
        pts.push([y0 + len / teeth / 2, 0]);
        pts.push([y0 + len / teeth, 0.1]);
      }
      pts.push([len / 2, top]);
      return prism({ profile: pts, depth: 0.03, plane: 'yz', color: cream, strip: 'wood' });
    };
    cn.push(place(valance(2 * CAN_Y + 0.04), { at: [CAN_X1 + 0.02, 0, CAN_Z_FRONT - 0.5 + 0.06] }));
    for (const s of [-1, 1]) {
      const len = CAN_X1 - B_X1;
      cn.push(
        place(valance(len), {
          at: [(CAN_X1 + B_X1) / 2, s * (CAN_Y + 0.02), CAN_Z_FRONT - 0.44],
          yaw: Math.PI / 2,
        }),
      );
      // Canopy ends stay open: only the valance returns along them, as at Toddington.
    }
    // Wall brackets (cast iron, cantilever look) between the columns.
    if (lod < 2)
      for (let y = -CAN_Y + 0.6; y <= CAN_Y - 0.5; y += lod === 0 ? 2.3 : 4.6)
        cn.push(
          beam({
            from: [B_X1, y, CAN_Z_WALL - 0.75],
            to: [B_X1 + 1.1, y, canZ(B_X1 + 1.1) - 0.03],
            width: 0.06,
            height: 0.12,
            color: chocolate,
            strip: 'iron',
            up: [0, 1, 0],
          }),
        );
    ctx.part('canopy', merge(cn));

    const colTop = canZ(COL_X) - 0.24;
    const colSegs = ctx.pick([12, 8, 5]);
    const column =
      lod === 2
        ? box({ size: [0.18, 0.18, colTop - PLAT_Z], color: chocolate })
        : lathe({
            profile: [
              [0, 0],
              [0.17, 0],
              [0.17, 0.28],
              [0.1, 0.36],
              [0.08, 0.45],
              [0.07, colTop - PLAT_Z - 0.4],
              [0.1, colTop - PLAT_Z - 0.22],
              [0.17, colTop - PLAT_Z - 0.06],
              [0.17, colTop - PLAT_Z],
              [0, colTop - PLAT_Z],
            ],
            segments: colSegs,
            color: chocolate,
          });
    const cols: Mesh[] = [];
    const colYs = [-8.4, -4.2, 0, 4.2, 8.4];
    for (const y of colYs) {
      cols.push(place(column, { at: [COL_X, y, PLAT_Z] }));
      if (lod === 0)
        // Spandrel brace from the shaft up to the girder.
        for (const s of [-1, 1])
          cols.push(
            beam({
              from: [COL_X, y + s * 0.07, colTop - 0.7],
              to: [COL_X, y + s * 0.75, colTop],
              width: 0.05,
              height: 0.05,
              color: chocolate,
              strip: 'iron',
            }),
          );
    }
    ctx.part('canopy_columns', dirt(merge(cols)));

    // ---- furniture: benches against the wall, lamps beyond the canopy, the name board, clock.
    const benchM = bench(lod);
    const benchYs = [-5.9, -0.5, 3.1];
    if (lod < 2)
      ctx.part(
        'benches',
        merge(benchYs.map((y) => place(benchM, { at: [B_X1 + 0.38, y, PLAT_Z] }))),
      );
    benchYs.forEach((y, i) => {
      ctx.socket(`bench_${i}`, {
        kind: 'seat',
        at: [B_X1 + 0.4, y, PLAT_Z + 0.47],
        dir: [1, 0, 0],
      });
    });

    const lamp = lampPost(lod);
    [-12.2, 9.8].forEach((y, i) => {
      ctx.part(`lamp_${i}`, place(lamp.post, { at: [6.1, y, PLAT_Z] }));
      ctx.part(`lamp_${i}_glass`, place(lamp.glass, { at: [6.1, y, PLAT_Z] }), {
        surface: 'glass',
      });
      ctx.socket(`lamp_${i}_light`, { kind: 'light', at: [6.1, y, PLAT_Z + 2.94] });
    });

    ctx.part('name_board', place(nameBoard('TODDINGTON', lod), { at: [5.6, 12.55, PLAT_Z] }));

    // ---- rainwater goods: half-round gutters on both eaves, downpipes clear of the canopy.
    if (lod < 2) {
      const rw: Mesh[] = [];
      const gz = info.eave - 0.06;
      const pipeSegs = lod === 0 ? 8 : 4;
      for (const [xe, xw] of [
        [B_X1 + 0.45, B_X1 + 0.07],
        [B_X0 - 0.45, B_X0 - 0.07],
      ] as const) {
        rw.push(
          beam({
            from: [xe, -B_Y - 0.35, gz],
            to: [xe, B_Y + 0.35, gz],
            width: 0.12,
            segments: pipeSegs,
            color: chocolate,
          }),
        );
        for (const y of [-B_Y + 0.25, B_Y - 0.25]) {
          rw.push(
            beam({
              from: [xe, y, gz],
              to: [xw, y, gz - 0.35],
              width: 0.08,
              segments: pipeSegs,
              color: chocolate,
            }),
          );
          rw.push(
            beam({
              from: [xw, y, gz - 0.35],
              to: [xw, y, PLAT_Z],
              width: 0.08,
              segments: pipeSegs,
              color: chocolate,
            }),
          );
          if (lod === 0)
            for (const z of [PLAT_Z + 1.0, PLAT_Z + 2.4])
              rw.push(
                box({
                  size: [0.04, 0.12, 0.04],
                  at: [xw + (xw > 0 ? -0.05 : 0.05), y, z],
                  color: chocolate,
                }),
              ); // holdfasts
        }
      }
      ctx.part('rainwater', rw.length ? merge(rw) : null);
    }
    // Gable finials (LOD0/1): turned timber spikes on the bargeboard apex.
    if (lod < 2) {
      const fin = lathe({
        profile: [
          [0, -0.15],
          [0.06, -0.15],
          [0.06, 0.05],
          [0.09, 0.15],
          [0.04, 0.35],
          [0, 0.55],
        ],
        segments: 6,
        color: cream,
      });
      ctx.part(
        'finials',
        merge(
          [-1, 1].map((sy) => place(fin, { at: [(B_X0 + B_X1) / 2, sy * (B_Y + 0.33), RIDGE_Z] })),
        ),
      );
    }

    if (lod === 0) {
      // Milk churns and a GWR platform barrow by the gable (the halt's goods traffic).
      const churn = lathe({
        profile: [
          [0, 0],
          [0.17, 0],
          [0.18, 0.05],
          [0.18, 0.55],
          [0.11, 0.72],
          [0.1, 0.82],
          [0.12, 0.86],
          [0, 0.88],
        ],
        segments: 12,
        color: hex('#b9bab6'),
        strip: 'iron',
      });
      ctx.part(
        'churns',
        merge(
          [
            [3.4, -11.0],
            [3.8, -11.2],
            [3.55, -11.55],
          ].map(([x = 0, y = 0]) => place(churn, { at: [x, y, PLAT_Z] })),
        ),
      );
      const barrow: Mesh[] = [
        box({ size: [1.3, 0.62, 0.05], at: [0, 0, 0.32], color: chocolate, strip: 'wood' }),
        box({ size: [0.05, 0.62, 0.45], at: [0.62, 0, 0.37], color: chocolate, strip: 'wood' }),
        cylinder({
          radius: 0.15,
          length: 0.04,
          segments: 10,
          axis: 'y',
          at: [0.3, 0.33, 0.15],
          color: iron,
        }),
        cylinder({
          radius: 0.15,
          length: 0.04,
          segments: 10,
          axis: 'y',
          at: [0.3, -0.33, 0.15],
          color: iron,
        }),
        cylinder({
          radius: 0.02,
          length: 0.7,
          segments: 6,
          axis: 'y',
          at: [0.3, 0, 0.15],
          color: iron,
        }),
        box({ size: [0.05, 0.05, 0.32], at: [-0.6, 0.27, 0], color: iron }),
        box({ size: [0.05, 0.05, 0.32], at: [-0.6, -0.27, 0], color: iron }),
        beam({ from: [-0.65, 0.27, 0.34], to: [-1.0, 0.27, 0.5], width: 0.04, color: chocolate }),
        beam({ from: [-0.65, -0.27, 0.34], to: [-1.0, -0.27, 0.5], width: 0.04, color: chocolate }),
      ];
      ctx.part('barrow', place(merge(barrow), { at: [4.4, -13.0, PLAT_Z], yaw: 0.5 }));
      // Platform clock on a wall bracket, both faces along the platform.
      const ck: Mesh[] = [
        box({ size: [0.6, 0.1, 0.6], at: [B_X1 + 0.9, 1.2, 3.0], color: chocolate }),
        cell({
          origin: [B_X1 + 0.6, 1.2 + 0.051, 3.0],
          u: [0.6, 0, 0],
          v: [0, 0, 0.6],
          color: white,
          cell: 'clock',
        }),
        cell({
          origin: [B_X1 + 1.2, 1.2 - 0.051, 3.0],
          u: [-0.6, 0, 0],
          v: [0, 0, 0.6],
          color: white,
          cell: 'clock',
        }),
        beam({ from: [B_X1, 1.2, 3.3], to: [B_X1 + 0.6, 1.2, 3.3], width: 0.05, color: iron }),
      ];
      ctx.part('clock', merge(ck));
      // Room boards over the front doors.
      const boards: Mesh[] = [];
      for (const o of ops)
        if (o.kind === 'door' && o.side === 'front')
          boards.push(
            cell({
              origin: [B_X1 + 0.002, o.at[1] - 0.55, PLAT_Z + 2.75],
              u: [0, 1.1, 0],
              v: [0, 0, 0.3],
              color: white,
              cell: 'sign',
              inset: -0.03,
            }),
          );
      ctx.part('room_boards', merge(boards));
    }
  },
});
