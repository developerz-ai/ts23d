// USRA 50-ton single-sheathed boxcar (1918, spec 1001-B): 40 ft 6 in inside, 41 ft 3 in body,
// 13 ft 3 in over the running board, on cast side-frame trucks with 33 in wheels. Rail top z = 0,
// +X = the A end, car centred on x = 0. A family: the livery (road name, marks, number, colour) is
// the variant; the steel-framed body, trucks and gear are one build. Dossier: ./README.md.

import {
  beam,
  box,
  clear,
  cylinder,
  defineFamily,
  grime,
  hex,
  type Lod,
  lathe,
  type Mesh,
  merge,
  noOverlap,
  place,
  prism,
  symmetric,
  text,
  tiled,
  type Vec3,
} from '@developerz-ai/ts23d';

// ---------------------------------------------------------------- dimensions (metres)
const GAUGE = 1.435;
const WHEEL_R = 0.419; // 33 in
const FLANGE = 0.025;
const TREAD_W = 0.14;
const WHEEL_Y = GAUGE / 2 + 0.036; // tread centre over the rail head
const WB = 1.676; // 5 ft 6 in
const TC = 9.37; // truck centres (photo-scaled)
const BODY_L = 12.573; // 41 ft 3 in
const XB = BODY_L / 2;
const SHEATH_Y = 1.33; // outer face of the boards
const FRAME_Y = 1.4; // outer face of the steel posts / braces
const FLOOR_Z = 1.16;
const EAVE_Z = 3.8;
const RIDGE_Z = 3.92;
const WALK_TOP = 4.039; // 13 ft 3 in
const COUPLER_Z = 0.876; // 34½ in
const DOOR_W = 1.83;
const DOOR_Z0 = 1.15;
const DOOR_Z1 = 3.64;
const JOURNAL_Y = 0.925; // axle end = journal box inner face

const steel = hex('#34302b');
const iron = hex('#1d1c1b');
const wheelC = hex('#2a2826');
const walk = hex('#5d4c3b');

interface Params {
  /** Large road name left of the door. */
  readonly road: string;
  /** Reporting marks under it. */
  readonly marks: string;
  readonly number: string;
  readonly paint: Vec3;
  readonly letter: Vec3;
}

// ---------------------------------------------------------------- helpers
/** Axis-aligned box from two corners (any order). */
function bx(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color: Vec3,
  strip: 'plain' | 'iron' | 'wood' = 'iron',
  bevel = 0,
): Mesh {
  const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [c, d] = [Math.min(y0, y1), Math.max(y0, y1)];
  const [e, f] = [Math.min(z0, z1), Math.max(z0, z1)];
  const small = Math.min(b - a, d - c, f - e);
  return box({
    size: [b - a, d - c, f - e],
    at: [(a + b) / 2, (c + d) / 2, e],
    color,
    strip,
    ...(bevel > 0 && bevel < small / 2 ? { bevel } : {}),
  });
}

const rod = (from: Vec3, to: Vec3, w: number, color: Vec3 = iron, segments = 0): Mesh =>
  beam({ from, to, width: w, color, strip: 'iron', ...(segments ? { segments } : {}) });

// ---------------------------------------------------------------- running gear
/** One wheel's tread disc (exactly 33 in) at lateral y, outer face toward ±y. */
function tread(lod: Lod, y: number): Mesh {
  if (lod === 2)
    return cylinder({
      radius: WHEEL_R,
      length: TREAD_W,
      segments: 6,
      axis: 'y',
      at: [0, y, 0],
      color: wheelC,
    });
  const s = Math.sign(y);
  const segs = [24, 14, 8][lod] ?? 8;
  return lathe({
    profile: [
      [0, y - s * (TREAD_W / 2)],
      [WHEEL_R, y - s * (TREAD_W / 2)],
      [WHEEL_R, y + s * (TREAD_W / 2)],
      [0, y + s * (TREAD_W / 2)],
    ],
    segments: segs,
    axis: 'y',
    color: wheelC,
    strip: 'iron',
  });
}

/** Axle, flanges and hubs (spins with the treads). */
function wheelset(lod: Lod): Mesh {
  if (lod === 2) {
    // Axle + a hub boss sharing each tread's outer face, so the set touches its wheels.
    const hub = (s: number): Mesh =>
      cylinder({
        radius: 0.12,
        length: 0.05,
        segments: 6,
        axis: 'y',
        at: [0, s * (WHEEL_Y + TREAD_W / 2 + 0.025), 0],
        color: wheelC,
      });
    const shaft = cylinder({
      radius: 0.075,
      length: JOURNAL_Y * 2,
      segments: 4,
      axis: 'y',
      color: wheelC,
    });
    return merge([shaft, hub(1), hub(-1)]);
  }
  const segs = [24, 14, 8][lod] ?? 8;
  const parts: Mesh[] = [
    cylinder({
      radius: 0.075,
      length: JOURNAL_Y * 2,
      segments: Math.max(6, segs / 2),
      axis: 'y',
      color: wheelC,
    }),
  ];
  for (const s of [1, -1]) {
    const yi = s * (WHEEL_Y - TREAD_W / 2);
    parts.push(
      lathe({
        profile: [
          [WHEEL_R - 0.02, yi - s * 0.03],
          [WHEEL_R + FLANGE, yi - s * 0.025],
          [WHEEL_R + FLANGE, yi - s * 0.002],
          [WHEEL_R - 0.02, yi - s * 0.002],
        ],
        segments: segs,
        axis: 'y',
        color: wheelC,
        caps: false,
      }),
    );
    if (lod === 0) {
      // Ribbed back: radial ribs on the inner face, and the outer hub boss.
      const yo = s * (WHEEL_Y + TREAD_W / 2);
      parts.push(
        cylinder({
          radius: 0.12,
          length: 0.05,
          segments: 12,
          axis: 'y',
          at: [0, yo + s * 0.02, 0],
          color: wheelC,
        }),
      );
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        parts.push(
          rod(
            [Math.cos(a) * 0.13, yi - s * 0.015, Math.sin(a) * 0.13],
            [Math.cos(a) * (WHEEL_R - 0.05), yi - s * 0.015, Math.sin(a) * (WHEEL_R - 0.05)],
            0.03,
            wheelC,
          ),
        );
      }
    }
  }
  return merge(parts);
}

/** Cast side-frame truck around x = 0 (local): frames, journal boxes, springs, bolster, brakes. */
function truckFrame(lod: Lod, bevel: number): Mesh {
  if (lod === 2) {
    // Far: one side-frame block per side over the journal boxes, the bolster and centre plate.
    const far: Mesh[] = [bx(-0.15, 0.15, -(JOURNAL_Y + 0.12), JOURNAL_Y + 0.12, 0.33, 0.6, steel)];
    for (const s of [-1, 1])
      far.push(
        bx(
          -WB / 2 - 0.16,
          WB / 2 + 0.16,
          s * JOURNAL_Y,
          s * (JOURNAL_Y + 0.16),
          WHEEL_R - 0.09,
          WHEEL_R + 0.2,
          steel,
        ),
      );
    far.push(cylinder({ radius: 0.2, length: 0.04, segments: 6, at: [0, 0, 0.62], color: steel }));
    return merge(far);
  }
  const r = WHEEL_R;
  const ax = [-WB / 2, WB / 2] as const;
  const zt = r + 0.14;
  const zb = r - 0.26;
  const out: Mesh[] = [];
  for (const s of [-1, 1]) {
    const y = s * (JOURNAL_Y + 0.08);
    for (const a of ax) {
      out.push(
        bx(
          a - 0.13,
          a + 0.13,
          s * JOURNAL_Y,
          s * (JOURNAL_Y + 0.17),
          r - 0.09,
          r + 0.12,
          steel,
          'iron',
          bevel,
        ),
      );
      if (lod === 0)
        out.push(
          bx(
            a - 0.1,
            a + 0.1,
            s * (JOURNAL_Y + 0.17),
            s * (JOURNAL_Y + 0.18),
            r - 0.06,
            r + 0.09,
            steel,
          ),
        ); // lid
    }
    out.push(
      bx(ax[0] - 0.16, ax[1] + 0.16, y - 0.06, y + 0.06, r + 0.12, zt + 0.07, steel, 'iron', bevel),
    ); // top member
    if (lod < 2) {
      const p: [number, number][] = [
        [ax[0] + 0.1, r - 0.08],
        [-0.34, zb],
        [0.34, zb],
        [ax[1] - 0.1, r - 0.08],
      ];
      for (let k = 0; k < 3; k++) {
        const pa: [number, number] = p[k] ?? [0, 0];
        const pb: [number, number] = p[k + 1] ?? [0, 0];
        out.push(rod([pa[0], y, pa[1]], [pb[0], y, pb[1]], 0.08, steel));
      }
      for (const d of [-1, 1])
        out.push(rod([d * 0.34, y, zb], [d * 0.62, y, zt + 0.02], 0.06, steel)); // cast window struts
      const coilSegs = lod === 0 ? 10 : 6;
      for (const d of [-0.11, 0, 0.11]) {
        out.push(
          cylinder({
            radius: 0.05,
            length: 0.17,
            segments: coilSegs,
            at: [d, y, zb + 0.125],
            color: iron,
          }),
        );
        if (lod === 0)
          for (let k = 0; k < 4; k++)
            out.push(
              cylinder({
                radius: 0.056,
                length: 0.012,
                segments: coilSegs,
                at: [d, y, zb + 0.06 + k * 0.042],
                color: iron,
              }),
            );
      }
    } else out.push(bx(-0.4, 0.4, y - 0.05, y + 0.05, zb, zt, steel));
    for (const d of [-1, 1])
      out.push(
        bx(d * 0.27 - 0.035, d * 0.27 + 0.035, y - 0.06, y + 0.06, zb - 0.02, zt + 0.02, steel),
      );
    out.push(bx(-0.2, 0.2, y - 0.06, y + 0.06, zb - 0.04, zb + 0.04, steel)); // spring seat
  }
  // Bolster on the spring nests, centre plate up to the car's body bolster.
  out.push(
    bx(-0.15, 0.15, -(JOURNAL_Y + 0.12), JOURNAL_Y + 0.12, zb + 0.21, 0.6, steel, 'iron', bevel),
  );
  out.push(
    cylinder({
      radius: 0.2,
      length: 0.04,
      segments: [12, 8, 6][lod] ?? 6,
      at: [0, 0, 0.62],
      color: steel,
    }),
  );
  if (lod < 2)
    out.push(bx(-0.12, 0.12, -(JOURNAL_Y + 0.08), JOURNAL_Y + 0.08, zb - 0.06, zb - 0.03, steel)); // spring plank
  if (lod === 0) {
    // Brake heads and shoes inboard of each axle, just outside the flange circle, on a beam.
    for (const a of ax) {
      const d = -Math.sign(a);
      const xs = a + d * (r + FLANGE + 0.015);
      for (const s of [-1, 1])
        out.push(
          bx(
            xs,
            xs + d * 0.07,
            s * (WHEEL_Y - 0.06),
            s * (WHEEL_Y + 0.06),
            r - 0.16,
            r + 0.12,
            iron,
          ),
        );
      out.push(
        bx(
          xs + d * 0.02,
          xs + d * 0.06,
          -(WHEEL_Y - 0.06),
          WHEEL_Y - 0.06,
          r - 0.04,
          r + 0.02,
          iron,
        ),
      );
      for (const s of [-1, 1])
        out.push(
          bx(
            xs + d * 0.03,
            xs + d * 0.05,
            s * (JOURNAL_Y + 0.02),
            s * (WHEEL_Y + 0.06),
            r - 0.02,
            r + 0.0,
            iron,
          ),
        ); // hanger to the frame
    }
  }
  return merge(out);
}

// ---------------------------------------------------------------- the car
const usra = defineFamily({
  kind: 'vehicle',
  tags: ['railroad', 'freight', 'usra', '1918', 'rolling-stock'],
  license: 'CC0-1.0',
  sources: [
    'https://bostonmaine.squarespace.com/box_71000_series',
    'https://commons.wikimedia.org/wiki/File:Military_Administration_-_Transportation_-_Rail_-_Construction_-_50_TON_SINGLE_SHEATHED_BOX_CAR_being_constructed_for_U.S._Railroad_Administration_by_the_Bettendorff_Co.,_Bettendorff,_Iowa_-_NARA_-_45502055.jpg',
    'https://en.wikipedia.org/wiki/USRA_standard',
    'https://www.nasg.org/Gallery/reports/scale/cars/modeltype/StrucksAndrews.php',
    'https://kadee.com/553-ho-scale-andrews-1898-self-centering-trucks-with-33-ribbed-back-wheels-metal-fully-sprung',
    'https://rapidotrains.com/ho-scale/freight-car/usra-ss-boxcar.html',
  ],
  real: {
    length: 13.4,
    width: 2.896,
    height: 4.039,
    measures: [
      {
        label: 'body length (41 ft 3 in)',
        value: BODY_L,
        axis: 'x',
        parts: ['body'],
        source: 'B&M ORER table',
      },
      {
        label: 'wheel diameter (33 in)',
        value: 0.838,
        axis: 'z',
        parts: ['axle_a_0_wheel_l'],
        source: 'Kadee Andrews 33 in',
      },
      {
        label: 'truck wheelbase (5 ft 6 in)',
        value: WB,
        axis: 'x',
        between: ['axle_a_0', 'axle_a_1'],
        source: 'NASG Andrews',
      },
      {
        label: 'door width (≈ 6 ft)',
        value: 1.83,
        axis: 'x',
        parts: ['door_l'],
        tolerance: 0.05,
        source: 'NARA photo, scaled',
      },
      {
        label: 'gauge-side wheel spacing',
        value: WHEEL_Y * 2,
        axis: 'y',
        between: ['axle_a_0_wheel_l', 'axle_a_0_wheel_r'],
        source: 'standard gauge 1.435 m + rail head',
      },
    ],
  },
  budget: { triangles: [17400, 7100, 1150] },
  checks: [
    noOverlap('axle_*_wheel_*'),
    clear('axle_*', 'underframe', 0.01),
    symmetric('_wheel_l', '_wheel_r', 'y'),
  ],
  defaults: {
    road: 'CLINCHFIELD',
    marks: 'C.C.& O.',
    number: '8024',
    paint: hex('#84402d'),
    letter: hex('#e8e2d2'),
  } as Params,
  build(ctx, p) {
    const lod = ctx.lod;
    const bevel = ctx.pick([0.012, 0.006, 0]);
    const paint = p.paint;
    const paintDark: Vec3 = [paint[0] * 0.78, paint[1] * 0.78, paint[2] * 0.78];
    const dirt = (m: Mesh): Mesh => grime(m, { ground: 1.3, groundStrength: 0.35 });

    // Trucks and spinning axles.
    for (const [t, x] of [
      ['a', TC / 2],
      ['b', -TC / 2],
    ] as const) {
      ctx.group(`truck_${t}`, { at: [x, 0, 0] });
      ctx.part(`truck_${t}_frame`, dirt(truckFrame(lod, bevel)), { parent: `truck_${t}` });
      [-WB / 2, WB / 2].forEach((ax, i) => {
        const name = `axle_${t}_${i}`;
        ctx.group(name, {
          parent: `truck_${t}`,
          at: [ax, 0, WHEEL_R],
          motion: { kind: 'spin', axis: [0, 1, 0], rps: 1.5 },
        });
        ctx.part(`${name}_set`, wheelset(lod), { parent: name });
        ctx.part(`${name}_wheel_l`, tread(lod, WHEEL_Y), { parent: name });
        ctx.part(`${name}_wheel_r`, tread(lod, -WHEEL_Y), { parent: name });
      });
    }

    // Underframe: straight centre sill, side sills, end sills, body bolsters, crossbearers, floor.
    const uf: Mesh[] = [
      bx(-XB - 0.04, XB + 0.04, -0.2, 0.2, 0.72, 1.1, steel, 'iron', bevel),
      bx(-XB, XB, -SHEATH_Y + 0.02, SHEATH_Y - 0.02, 1.1, FLOOR_Z, walk, 'wood'),
    ];
    for (const s of [-1, 1])
      uf.push(bx(-XB, XB, s * SHEATH_Y, s * (FRAME_Y - 0.01), 0.95, 1.18, steel, 'iron', bevel));
    for (const d of [-1, 1]) {
      uf.push(bx(d * XB, d * (XB + 0.05), -FRAME_Y, FRAME_Y, 0.74, 1.18, steel, 'iron', bevel)); // end sill / striker
      uf.push(
        bx(d * (TC / 2) - 0.2, d * (TC / 2) + 0.2, -1.25, 1.25, 0.64, 1.1, steel, 'iron', bevel),
      ); // body bolster
      if (lod < 2)
        for (const x of [1.6, 3.0])
          uf.push(bx(d * x - 0.08, d * x + 0.08, -1.3, 1.3, 0.8, 1.1, steel)); // crossbearers
    }
    ctx.part('underframe', dirt(merge(uf)));

    // Body: vertical boards between steel frame members; steel ends.
    const bodyM: Mesh[] = [];
    const boardsZ0 = 1.18;
    for (const s of [-1, 1]) {
      // Boards face out: u = up, v = along (planks run along U → vertical boards).
      const v: Vec3 = [s < 0 ? BODY_L : -BODY_L, 0, 0];
      bodyM.push(
        tiled({
          origin: [s < 0 ? -XB : XB, s * SHEATH_Y, boardsZ0],
          u: [0, 0, EAVE_Z - boardsZ0],
          v,
          color: paint,
          strip: lod === 2 ? 'plain' : 'wood',
          vMetres: lod === 2 ? BODY_L : 0.6,
        }),
      );
      // Inner sheathing face (the boards have thickness at the door and ends).
      bodyM.push(
        bx(
          -XB,
          XB,
          s * (SHEATH_Y - 0.045),
          s * (SHEATH_Y - 0.002),
          boardsZ0,
          EAVE_Z,
          paintDark,
          'plain',
        ),
      );
    }
    for (const d of [-1, 1])
      bodyM.push(bx(d * (XB - 0.05), d * XB, -SHEATH_Y, SHEATH_Y, 1.0, EAVE_Z, paint, 'iron'));
    ctx.part('body', merge(bodyM));

    // Outside steel framing: posts, diagonal braces leaning toward the door, top plate, end ribs.
    const fr: Mesh[] = [];
    const panel = (XB - DOOR_W / 2 - 0.08) / 4;
    const posts = [0, 1, 2, 3, 4].map((i) => XB - i * panel);
    const postW = 0.09;
    for (const s of [-1, 1]) {
      const y0 = s * SHEATH_Y;
      const y1 = s * FRAME_Y;
      for (const d of [-1, 1]) {
        for (const px of lod === 2 ? [] : posts) {
          const x = d * px;
          fr.push(bx(x - postW / 2, x + postW / 2, y0, y1, 1.0, EAVE_Z, paint, 'iron'));
        }
        // Door posts.
        fr.push(
          bx(d * (DOOR_W / 2 + 0.01), d * (DOOR_W / 2 + 0.1), y0, y1, 1.0, EAVE_Z, paint, 'iron'),
        );
        if (lod < 2)
          for (let i = 0; i < 4; i++) {
            const xa = d * ((posts[i] ?? 0) - postW / 2);
            const xb = d * ((posts[i + 1] ?? DOOR_W / 2) + postW / 2);
            const ym = s * (SHEATH_Y + 0.035);
            fr.push(
              beam({
                from: [xa, ym, 1.22],
                to: [xb, ym, EAVE_Z - 0.12],
                width: 0.075,
                height: 0.06,
                color: paint,
                strip: 'iron',
                up: [0, s, 0],
              }),
            );
          }
      }
      fr.push(bx(-XB, XB, y0, s * (FRAME_Y + 0.01), EAVE_Z - 0.16, EAVE_Z, paint, 'iron', bevel)); // side plate
      if (lod === 0) {
        // Rivet heads where braces meet posts and sills.
        const rivet = cylinder({
          radius: 0.014,
          length: 0.012,
          segments: 6,
          axis: 'y',
          color: paint,
        });
        const pts: Vec3[] = [];
        for (const d of [-1, 1])
          for (const px of posts)
            for (const z of [1.08, 1.26, EAVE_Z - 0.2, EAVE_Z - 0.08])
              pts.push([d * px, s * (FRAME_Y + 0.003), z]);
        fr.push(merge(pts.map((at) => place(rivet, { at }))));
      }
    }
    // Ends: corner angles, pressed ribs (LOD0/1).
    for (const d of [-1, 1]) {
      for (const s of [-1, 1])
        fr.push(
          bx(
            d * (XB - 0.06),
            d * (XB + 0.03),
            s * (SHEATH_Y - 0.05),
            s * FRAME_Y,
            1.0,
            EAVE_Z,
            paint,
            'iron',
          ),
        );
      if (lod < 2)
        for (let k = 0; k < (lod === 0 ? 8 : 4); k++) {
          const z = 1.35 + ((EAVE_Z - 1.55) * (k + 0.5)) / (lod === 0 ? 8 : 4);
          fr.push(
            bx(
              d * XB,
              d * (XB + 0.035),
              -(SHEATH_Y - 0.12),
              SHEATH_Y - 0.12,
              z - 0.05,
              z + 0.05,
              paint,
              'iron',
            ),
          );
        }
    }
    ctx.part('body_framing', dirt(merge(fr)));

    // Roof: low steel gable with seam caps; running board on saddles; laterals at the corners.
    const roofOv = 0.04;
    const roofProfile: [number, number][] = [
      [-(FRAME_Y + roofOv), EAVE_Z - 0.03],
      [FRAME_Y + roofOv, EAVE_Z - 0.03],
      [FRAME_Y + roofOv, EAVE_Z],
      [0, RIDGE_Z],
      [-(FRAME_Y + roofOv), EAVE_Z],
    ];
    const roofM: Mesh[] = [
      prism({
        profile: roofProfile,
        depth: BODY_L + 0.1,
        plane: 'yz',
        color: paintDark,
        strip: 'iron',
      }),
    ];
    if (lod === 0) {
      const seams = 20;
      for (let i = 1; i < seams; i++) {
        const x = -XB + (BODY_L * i) / seams;
        for (const s of [-1, 1])
          roofM.push(
            rod(
              [x, s * (FRAME_Y + roofOv), EAVE_Z + 0.012],
              [x, 0, RIDGE_Z + 0.012],
              0.035,
              paintDark,
            ),
          );
      }
    }
    ctx.part('roof', merge(roofM));

    const walkM: Mesh[] = [
      bx(-XB - 0.12, XB + 0.12, -0.255, 0.255, WALK_TOP - 0.045, WALK_TOP, walk, 'wood'),
    ];
    const saddles = lod === 2 ? 3 : 11;
    for (let i = 0; i < saddles; i++) {
      const x = -XB + 0.3 + ((BODY_L - 0.6) * i) / (saddles - 1);
      walkM.push(bx(x - 0.05, x + 0.05, -0.2, 0.2, RIDGE_Z - 0.03, WALK_TOP - 0.045, walk, 'wood'));
    }
    if (lod < 2)
      for (const d of [-1, 1]) {
        // Lateral board toward the ladder corner (A end on −Y, B end on +Y).
        const s = -d;
        walkM.push(
          bx(
            d * (XB - 0.62),
            d * (XB - 0.12),
            s * 0.255,
            s * (FRAME_Y - 0.05),
            WALK_TOP - 0.045,
            WALK_TOP,
            walk,
            'wood',
          ),
        );
        walkM.push(
          bx(
            d * (XB - 0.42),
            d * (XB - 0.32),
            s * 0.4,
            s * (FRAME_Y - 0.15),
            EAVE_Z,
            WALK_TOP - 0.045,
            walk,
            'wood',
          ),
        );
      }
    ctx.part('running_board', merge(walkM));

    // Sliding doors, hung on a bottom track and held by a top guide; slide along X.
    const doorTrack: Mesh[] = [];
    for (const [side, s] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      const y0 = s * (FRAME_Y + 0.005);
      const y1 = s * (FRAME_Y + 0.05);
      const dm: Mesh[] = [
        tiled({
          origin: [s > 0 ? DOOR_W / 2 : -DOOR_W / 2, y1, DOOR_Z0],
          u: [0, 0, DOOR_Z1 - DOOR_Z0],
          v: [s > 0 ? -DOOR_W : DOOR_W, 0, 0],
          color: paint,
          strip: lod === 2 ? 'plain' : 'wood',
        }),
        bx(-DOOR_W / 2, DOOR_W / 2, y0, y1 - s * 0.003, DOOR_Z0, DOOR_Z1, paintDark, 'plain'),
      ];
      if (lod < 2) {
        for (const z of [DOOR_Z0, (DOOR_Z0 + DOOR_Z1) / 2 - 0.05, DOOR_Z1 - 0.1])
          dm.push(bx(-DOOR_W / 2, DOOR_W / 2, y1, y1 + s * 0.015, z, z + 0.1, paint, 'iron')); // steel straps
        for (const x of [-DOOR_W / 2, DOOR_W / 2 - 0.08])
          dm.push(bx(x, x + 0.08, y1, y1 + s * 0.015, DOOR_Z0, DOOR_Z1, paint, 'iron'));
      }
      if (lod === 0) dm.push(bx(-0.75, -0.65, y1 + s * 0.015, y1 + s * 0.06, 2.0, 2.2, iron)); // handle / latch
      ctx.part(`door_${side}`, dirt(merge(dm)), {
        motion: { kind: 'slide', offset: [-(DOOR_W + 0.05), 0, 0], hz: 0.25, oneWay: true },
      });
      // Track below the door, guide above, long enough for its one-way travel toward −X.
      doorTrack.push(
        bx(
          -(DOOR_W * 1.5 + 0.1), // the door opens toward −X
          DOOR_W / 2 + 0.1,
          s * FRAME_Y,
          s * (FRAME_Y + 0.07),
          1.08,
          DOOR_Z0 - 0.025,
          iron,
        ),
      );
      doorTrack.push(
        bx(
          -(DOOR_W * 1.5 + 0.1),
          DOOR_W / 2 + 0.1,
          s * (FRAME_Y + 0.01),
          s * (FRAME_Y + 0.08),
          DOOR_Z1 + 0.025,
          DOOR_Z1 + 0.09,
          iron,
        ),
      );
    }
    if (lod < 2) ctx.part('door_track', merge(doorTrack));

    // Knuckle couplers on the centre sill, MCB height.
    for (const [c, d] of [
      ['a', 1],
      ['b', -1],
    ] as const) {
      const cm: Mesh[] = [
        bx(
          d * (XB + 0.05),
          d * 6.56,
          -0.08,
          0.08,
          COUPLER_Z - 0.07,
          COUPLER_Z + 0.07,
          iron,
          'iron',
          bevel,
        ),
        bx(d * 6.5, d * 6.7, -0.17, 0.12, COUPLER_Z - 0.13, COUPLER_Z + 0.13, iron, 'iron', bevel),
      ];
      if (lod < 2) cm.push(bx(d * 6.6, d * 6.7, 0.12, 0.2, COUPLER_Z - 0.1, COUPLER_Z + 0.1, iron)); // knuckle
      if (lod === 0) {
        // Uncoupling lever across the end sill, and the air hose hanging below.
        cm.push(
          rod(
            [d * (XB + 0.08), -0.08, COUPLER_Z + 0.12],
            [d * (XB + 0.08), -1.3, COUPLER_Z + 0.2],
            0.025,
          ),
        );
        cm.push(rod([d * (XB + 0.1), 0.3, 0.8], [d * (XB + 0.22), 0.3, 0.55], 0.05, iron, 6));
      }
      ctx.part(`coupler_${c}`, merge(cm));
    }

    // Safety appliances: grab-iron ladders at diagonally opposite corners, end ladders, steps.
    if (lod < 2) {
      const lad: Mesh[] = [];
      const grab = (a: Vec3, b: Vec3, n: Vec3): void => {
        const off = 0.07;
        const pa: Vec3 = [a[0] + n[0] * off, a[1] + n[1] * off, a[2]];
        const pb: Vec3 = [b[0] + n[0] * off, b[1] + n[1] * off, b[2]];
        lad.push(rod(pa, pb, 0.022, iron, lod === 0 ? 6 : 0));
        if (lod === 0) {
          lad.push(rod(a, pa, 0.02, iron));
          lad.push(rod(b, pb, 0.02, iron));
        }
      };
      for (const d of [-1, 1]) {
        const s = -d; // A end ladder on −Y, B end on +Y
        const xe = d * (XB - 0.05);
        for (let k = 0; k < 7; k++) {
          const z = 1.45 + k * 0.38;
          grab([xe - d * 0.5, s * FRAME_Y, z], [xe - d * 0.05, s * FRAME_Y, z], [0, s, 0]);
          grab([d * (XB + 0.035), s * 0.62, z], [d * (XB + 0.035), s * 1.12, z], [d, 0, 0]);
        }
        // Stirrup steps under the corners (both sides).
        for (const ss of [-1, 1]) {
          const x = d * (XB - 0.3);
          const y = ss * (FRAME_Y - 0.03);
          lad.push(rod([x - 0.18, y, 0.95], [x - 0.18, y, 0.55], 0.03));
          lad.push(rod([x + 0.18, y, 0.95], [x + 0.18, y, 0.55], 0.03));
          lad.push(rod([x - 0.18, y, 0.56], [x + 0.18, y, 0.56], 0.04));
        }
      }
      ctx.part('ladders', merge(lad));
    }

    // Hand brake: vertical staff on the B end, horizontal wheel at roof level.
    const bm: Mesh[] = [
      rod(
        [-(XB + 0.13), -0.85, 0.85],
        [-(XB + 0.13), -0.85, WALK_TOP - 0.06],
        0.035,
        iron,
        lod === 2 ? 0 : 6,
      ),
    ];
    for (const z of [1.0, 2.3, EAVE_Z - 0.1])
      bm.push(bx(-XB, -(XB + 0.15), -0.89, -0.81, z, z + 0.05, iron));
    const wheelSegs = [16, 10, 6][lod] ?? 6;
    bm.push(
      lathe({
        profile: [
          [0.17, WALK_TOP - 0.06],
          [0.205, WALK_TOP - 0.06],
          [0.205, WALK_TOP - 0.035],
          [0.17, WALK_TOP - 0.035],
          [0.17, WALK_TOP - 0.06],
        ],
        segments: wheelSegs,
        color: iron,
        at: [-(XB + 0.13), -0.85, 0],
      }),
    );
    if (lod < 2)
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        bm.push(
          rod(
            [-(XB + 0.13), -0.85, WALK_TOP - 0.05],
            [-(XB + 0.13) + Math.cos(a) * 0.18, -0.85 + Math.sin(a) * 0.18, WALK_TOP - 0.05],
            0.025,
          ),
        );
      }
    if (lod < 2) ctx.part('brake', merge(bm));

    // Air brake: reservoir, cylinder, triple valve, train line (hidden under the car beyond LOD0).
    if (lod === 0) {
      const ab: Mesh[] = [
        cylinder({
          radius: 0.2,
          length: 1.1,
          segments: 12,
          axis: 'x',
          at: [-0.9, 0.55, 0.9],
          color: iron,
        }),
        cylinder({
          radius: 0.16,
          length: 0.5,
          segments: 12,
          axis: 'x',
          at: [0.4, -0.5, 0.92],
          color: iron,
        }),
        bx(-0.25, -0.05, 0.2, 0.42, 0.85, 1.1, iron),
        rod([-0.35, 0.55, 1.08], [-0.35, 0.2, 1.08], 0.05, iron),
        rod([-1.45, 0.55, 0.9], [-1.45, 0.2, 0.9], 0.04, iron),
        rod([0.15, -0.5, 1.0], [0.15, -0.2, 1.0], 0.04, iron),
        rod([-XB, 0.3, 0.84], [XB, 0.3, 0.84], 0.035, iron, 6),
        rod([0.65, -0.5, 0.92], [1.8, -0.1, 0.8], 0.04, iron),
      ];
      // Hanger straps up to the centre sill for the reservoir / train line.
      for (const x of [-1.3, -0.5]) ab.push(bx(x - 0.03, x + 0.03, 0.2, 0.75, 1.08, 1.1, iron));
      for (const x of [-4.0, -2.0, 2.0, 4.0])
        ab.push(bx(x - 0.03, x + 0.03, 0.2, 0.33, 0.82, 1.1, iron));
      ctx.part('air_brake', merge(ab));
    }

    // Livery: road name left of the door, marks + number under it (both sides, read left→right).
    if (lod < 2) {
      const lm: Mesh[] = [];
      /** |y| of the painted surface at x on a side: post faces or boards. */
      const face = (x: number): number => {
        const ax = Math.abs(x);
        if (posts.some((q) => Math.abs(ax - q) <= postW / 2)) return FRAME_Y;
        if (ax >= DOOR_W / 2 + 0.01 && ax <= DOOR_W / 2 + 0.1) return FRAME_Y;
        // Braces cross over the paint (they read as the brace in front of the lettering); a
        // stroke painted on a diagonal brace face jumps sideways in parallax and garbles the word.
        return SHEATH_Y;
      };
      for (const s of [-1, 1]) {
        const dirX = s < 0 ? 1 : -1; // read left → right for a viewer on that side
        const xl = -dirX * (XB + DOOR_W / 2) * 0.5; // centre of the left half
        const put = (str: string, cx: number, base: number, h: number, maxWidth?: number): void => {
          lm.push(
            text(str, {
              origin: [cx, s * SHEATH_Y, base],
              along: [dirX, 0, 0],
              up: [0, 0, 1],
              height: h,
              color: p.letter,
              align: 'centre',
              font: 'block',
              ...(maxWidth ? { maxWidth } : {}),
              // Painted over the proud posts and braces as on the real car.
              surface: (u) => face(cx + dirX * u) - SHEATH_Y,
            }),
          );
        };
        put(p.road, xl, 3.0, 0.42, XB - DOOR_W / 2 - 0.5);
        put(p.marks, xl, 2.43, 0.24);
        put(p.number, xl, 1.92, 0.36);
        if (lod === 0) {
          put(p.marks, -xl, 3.29, 0.12);
          put(p.number, -xl, 3.09, 0.12);
        }
      }
      ctx.part('lettering', merge(lm));
    }
  },
});

export const boxcar = usra.variant({
  name: 'boxcar',
  description:
    'USRA 50-ton single-sheathed 40 ft boxcar (1918), Clinchfield C.C.& O. 8024: wood sheathing in outside steel framing, sliding doors, cast trucks with spinning axles.',
});

export const boxcar_nw = usra.variant({
  name: 'boxcar_nw',
  description: 'USRA single-sheathed boxcar in Norfolk & Western lettering, oxide red.',
  params: { road: 'NORFOLK & WESTERN', marks: 'N.& W.', number: '42574', paint: hex('#74382a') },
});
