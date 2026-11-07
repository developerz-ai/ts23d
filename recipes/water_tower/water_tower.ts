// Railroad water tank: the Frisco's 50,000-gallon cypress-stave tank at Beaumont, Kansas (c. 1886,
// NRHP 93000843): a 22 ft × 14 ft stave tub on a 14 ft timber trestle of eight posts round a
// wooden core, six-sided shingle roof, goose-neck spout over the track (+X). Z up, ground z = 0.
// Dossier: ./README.md.

import {
  beam,
  box,
  clear,
  cylinder,
  defineAsset,
  grime,
  hex,
  lathe,
  type Mesh,
  merge,
  place,
  planar,
  tiled,
  type Vec3,
} from '@developerz.ai/ts23d';

const FT = 0.3048;
const TANK_R = (22 * FT) / 2; // 3.353
const TANK_H = 14 * FT; // 4.267
const FLOOR_Z = 14 * FT; // superstructure height
const TANK_TOP = FLOOR_Z + TANK_H;
const CORE_R = (10 * FT) / 2;
const POST_R = 2.75; // post circle (estimate: posts sit under the tank, inside its rim)
const POST_W = 0.3;
const FOOT_H = 0.45;
const CAP_Z0 = 3.72;
const CAP_Z1 = 4.02;
const ROOF_APOTHEM = TANK_R + 0.35;
const ROOF_RISE = 1.05;
const SPOUT_L = 3.4;
const SPOUT_REST = (25 * Math.PI) / 180;
const PIVOT: Vec3 = [TANK_R + 0.32, 0, FLOOR_Z + 0.55];

const cypress = hex('#7a5a3e');
const timber = hex('#8c7b66');
const timberDark = hex('#6b5d4d');
const steel = hex('#2b2826');
const concrete = hex('#b9b3a6');
const shingle = hex('#4e463e');

/** Ring of `n` flat vertical facets (outward), boards running up: staves, the core's planking. */
function staveRing(
  r: number,
  z0: number,
  h: number,
  n: number,
  color: Vec3,
  strip: 'wood' | 'plain',
): Mesh {
  const out: Mesh[] = [];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const p0: Vec3 = [Math.cos(a0) * r, Math.sin(a0) * r, z0];
    const p1: Vec3 = [Math.cos(a1) * r, Math.sin(a1) * r, z0];
    out.push(
      tiled({
        origin: p1,
        u: [0, 0, h],
        v: [p0[0] - p1[0], p0[1] - p1[1], 0],
        color,
        strip,
        ...(strip === 'plain' ? { vMetres: 100 } : {}),
      }),
    );
  }
  return merge(out);
}

/** Axis-aligned box from two corners. */
const bx = (
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color: Vec3,
  strip: 'wood' | 'iron' | 'concrete' | 'plain' = 'wood',
  bevel = 0,
): Mesh => {
  const small = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  return box({
    size: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)],
    at: [(x0 + x1) / 2, (y0 + y1) / 2, Math.min(z0, z1)],
    color,
    strip,
    ...(bevel > 0 && bevel < small / 2 ? { bevel } : {}),
  });
};

export const water_tower = defineAsset({
  name: 'water_tower',
  kind: 'building',
  description:
    'Frisco 50,000-gallon cypress-stave railroad water tank (Beaumont, Kansas, c. 1886): hooped tub on an eight-post timber trestle with a central core, six-sided shingle roof, goose-neck spout.',
  tags: ['railroad', 'water-tank', 'lineside', '1880s', 'usa'],
  license: 'CC0-1.0',
  sources: [
    'https://npgallery.nps.gov/GetAsset/f632b7b3-36b4-4a36-be22-47bb617fad0d',
    'https://commons.wikimedia.org/wiki/File:Beaumont_Kansas_Water_Tower.jpg',
    'https://en.wikipedia.org/wiki/Beaumont_St._Louis_and_San_Francisco_Railroad_Water_Tank',
    'https://davesriogrande.net/Structures/WaterTanks/watertanks.htm',
  ],
  real: {
    // Overall box: tank + roof eave (−X) to the spout mouth (+X); roof apex + finial on Z.
    length: 4.27 + PIVOT[0] + SPOUT_L * Math.cos(SPOUT_REST) + 0.1,
    width: 2 * ROOF_APOTHEM,
    height: TANK_TOP + 0.15 + ROOF_RISE + 0.9,
    measures: [
      {
        label: 'tank diameter (22 ft)',
        value: 22 * FT,
        axis: 'y',
        parts: ['tank'],
        source: 'NRHP 93000843 §7',
      },
      {
        label: 'tank height (14 ft)',
        value: TANK_H,
        axis: 'z',
        parts: ['tank'],
        source: 'NRHP 93000843 §7',
      },
      {
        label: 'superstructure height (14 ft)',
        value: FLOOR_Z,
        axis: 'z',
        parts: ['trestle'],
        source: 'NRHP 93000843 §7',
      },
      {
        label: 'core diameter (10 ft)',
        value: 10 * FT,
        axis: 'y',
        parts: ['core'],
        source: 'NRHP 93000843 §7',
      },
      {
        label: 'core height (14 ft)',
        value: 14 * FT,
        axis: 'z',
        parts: ['core'],
        source: 'NRHP 93000843 §7',
      },
    ],
  },
  budget: { triangles: [7900, 3350, 590] },
  checks: [clear('spout', 'tank', 0.02), clear('spout', 'roof', 0.05)],
  build(ctx) {
    const lod = ctx.lod;
    const bevel = ctx.pick([0.02, 0.01, 0]);
    const facets = ctx.pick([32, 20, 8]);
    const dirt = (m: Mesh): Mesh => grime(m, { ground: 1.4, groundStrength: 0.4 });

    // ---- trestle: footings, eight posts, cap ring, X bracing, joists under the tank floor.
    const tr: Mesh[] = [];
    const postAt = Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      return [Math.cos(a) * POST_R, Math.sin(a) * POST_R] as const;
    });
    for (const [x, y] of postAt) {
      tr.push(bx(x - 0.33, x + 0.33, y - 0.33, y + 0.33, 0, FOOT_H, concrete, 'concrete', bevel));
      tr.push(
        bx(
          x - POST_W / 2,
          x + POST_W / 2,
          y - POST_W / 2,
          y + POST_W / 2,
          FOOT_H,
          CAP_Z0,
          timber,
          'wood',
          bevel / 2,
        ),
      );
    }
    postAt.forEach(([x, y], k) => {
      const [nx, ny] = postAt[(k + 1) % 8] ?? [x, y];
      // Cap beam post → post (ring), sitting on the post tops.
      tr.push(
        beam({
          from: [x, y, CAP_Z0 + 0.15],
          to: [nx, ny, CAP_Z0 + 0.15],
          width: 0.3,
          height: 0.3,
          color: timberDark,
          strip: 'wood',
          up: [0, 0, 1],
        }),
      );
      if (lod < 2) {
        // X brace on the outer face of the bay, foot of one post to the head of the next.
        const mx = (x + nx) / 2;
        const my = (y + ny) / 2;
        const ml = Math.hypot(mx, my);
        const off = 0.2 / ml;
        const o = (px: number, py: number, z: number): Vec3 => [px + mx * off, py + my * off, z];
        tr.push(
          beam({
            from: o(x, y, FOOT_H + 0.25),
            to: o(nx, ny, CAP_Z0 - 0.1),
            width: 0.2,
            height: 0.1,
            color: timber,
            strip: 'wood',
            up: [mx / ml, my / ml, 0],
          }),
        );
        tr.push(
          beam({
            from: o(nx, ny, FOOT_H + 0.25),
            to: o(x, y, CAP_Z0 - 0.1),
            width: 0.2,
            height: 0.1,
            color: timber,
            strip: 'wood',
            up: [mx / ml, my / ml, 0],
          }),
        );
        if (lod === 0) {
          // Through-bolt at the crossing and at each brace end.
          const bolt = cylinder({
            radius: 0.035,
            length: 0.06,
            segments: 6,
            axis: 'x',
            color: steel,
          });
          const n = [mx / ml, my / ml];
          for (const [px, py, z] of [
            [mx, my, (FOOT_H + 0.25 + CAP_Z0 - 0.1) / 2],
            [x, y, FOOT_H + 0.3],
            [nx, ny, FOOT_H + 0.3],
            [x, y, CAP_Z0 - 0.15],
            [nx, ny, CAP_Z0 - 0.15],
          ] as const) {
            const at = o(px, py, z);
            tr.push(
              place(bolt, {
                at: [at[0] + (n[0] ?? 0) * 0.06, at[1] + (n[1] ?? 0) * 0.06, at[2]],
                yaw: Math.atan2(n[1] ?? 0, n[0] ?? 1),
              }),
            );
          }
        }
      }
    });
    // Joists along X across the tank floor, ends showing past the staves.
    const joistStep = ctx.pick([0.55, 0.9, 1.6]);
    for (let y = -TANK_R + 0.35; y <= TANK_R - 0.3; y += joistStep) {
      const half = Math.sqrt(Math.max(0, TANK_R * TANK_R - y * y)) + 0.15;
      tr.push(bx(-half, half, y - 0.1, y + 0.1, CAP_Z1, FLOOR_Z, timberDark, 'wood'));
    }
    ctx.part('trestle', dirt(merge(tr)));

    // ---- central core: vertical planking round a 10 ft cylinder, with its access door.
    const coreN = ctx.pick([12, 12, 8]);
    const core: Mesh[] = [
      staveRing(CORE_R, 0, 14 * FT, coreN, timberDark, lod === 2 ? 'plain' : 'wood'),
    ];
    core.push(
      lathe({
        profile: [
          [0, 14 * FT - 0.01],
          [CORE_R, 14 * FT - 0.01],
          [CORE_R, 14 * FT],
        ],
        segments: coreN,
        color: timberDark,
      }),
    ); // lid
    if (lod < 2) {
      const da = Math.PI; // door faces −X, away from the track
      const dx = Math.cos(da) * CORE_R * Math.cos(Math.PI / coreN);
      core.push(bx(dx - 0.06, dx + 0.002, -0.4, 0.4, 0.05, 2.0, timber, 'wood'));
      if (lod === 0) {
        core.push(bx(dx - 0.09, dx - 0.06, -0.45, 0.45, 1.98, 2.06, timberDark, 'wood'));
        for (const z of [0.4, 1.6])
          core.push(bx(dx - 0.08, dx - 0.06, 0.05, 0.38, z, z + 0.05, steel, 'iron')); // strap hinges
      }
    }
    ctx.part('core', dirt(merge(core)));

    // ---- tank: stave tub, hoops (closer near the bottom), lugs, chime overhang.
    ctx.part(
      'tank',
      staveRing(TANK_R, FLOOR_Z, TANK_H, facets, cypress, lod === 2 ? 'plain' : 'wood'),
    );
    if (lod < 2) {
      const hoops: Mesh[] = [];
      const n = lod === 0 ? 14 : 7;
      const hoopSegs = ctx.pick([32, 20, 8]);
      for (let i = 0; i < n; i++) {
        // Spacing grows with height: pressure falls off toward the top.
        const t = (i + 0.5) / n;
        const z = FLOOR_Z + 0.12 + (TANK_H - 0.3) * t ** 1.35;
        const rr = TANK_R / Math.cos(Math.PI / facets) + 0.004;
        hoops.push(
          lathe({
            profile: [
              [rr, z],
              [rr + 0.012, z + 0.004],
              [rr + 0.012, z + 0.03],
              [rr, z + 0.034],
            ],
            segments: hoopSegs,
            color: steel,
            strip: 'iron',
          }),
        );
        if (lod === 0) {
          // Lug (the hoop's tightening nut), staggered round the tank.
          const a = (i * 2.399) % (Math.PI * 2);
          hoops.push(
            place(
              box({ size: [0.05, 0.16, 0.07], at: [0, 0, -0.02], color: steel, strip: 'iron' }),
              { at: [Math.cos(a) * (rr + 0.03), Math.sin(a) * (rr + 0.03), z], yaw: a },
            ),
          );
        }
      }
      ctx.part('tank_hoops', merge(hoops));
    }

    // ---- roof: low six-sided pyramid of shingles, fascia, finial and lightning rod, hatch.
    const roofM: Mesh[] = [];
    const circ = ROOF_APOTHEM / Math.cos(Math.PI / 6);
    const eaveZ = TANK_TOP + 0.15;
    const apex: Vec3 = [0, 0, eaveZ + ROOF_RISE];
    const corner = (k: number, z: number, r = circ): Vec3 => [
      Math.cos((k * Math.PI) / 3) * r,
      Math.sin((k * Math.PI) / 3) * r,
      z,
    ];
    for (let k = 0; k < 6; k++) {
      roofM.push(
        planar({
          points: [corner(k, eaveZ), corner(k + 1, eaveZ), apex],
          color: shingle,
          strip: 'slate',
        }),
      );
      roofM.push(
        tiled({
          origin: corner(k + 1, TANK_TOP),
          u: [corner(k, 0)[0] - corner(k + 1, 0)[0], corner(k, 0)[1] - corner(k + 1, 0)[1], 0],
          v: [0, 0, 0.15],
          color: timberDark,
          strip: 'wood',
        }),
      ); // fascia
      roofM.push(
        planar({
          points: [corner(k + 1, TANK_TOP), corner(k, TANK_TOP), [0, 0, TANK_TOP]],
          color: timberDark,
          strip: 'wood',
        }),
      ); // soffit
    }
    if (lod < 2) {
      roofM.push(
        lathe({
          profile: [
            [0.12, apex[2] - 0.05],
            [0.12, apex[2] + 0.12],
            [0.06, apex[2] + 0.25],
            [0, apex[2] + 0.3],
          ],
          segments: 8,
          color: steel,
        }),
      ); // finial cap
      roofM.push(
        cylinder({
          radius: 0.012,
          length: 0.62,
          segments: 4,
          at: [0, 0, apex[2] + 0.58],
          color: steel,
        }),
      ); // lightning rod
    }
    if (lod === 0) {
      // Hip caps (ridge boards) and a hatch on the −X slope.
      for (let k = 0; k < 6; k++)
        roofM.push(
          beam({
            from: corner(k, eaveZ + 0.02),
            to: [0, 0, apex[2] + 0.02],
            width: 0.1,
            height: 0.04,
            color: timberDark,
            strip: 'wood',
          }),
        );
      const slope = Math.atan2(ROOF_RISE, ROOF_APOTHEM);
      roofM.push(
        place(
          box({ size: [0.7, 0.7, 0.12], at: [0, 0, -0.04], color: timberDark, strip: 'wood' }),
          { at: [-ROOF_APOTHEM * 0.55, 0, eaveZ + ROOF_RISE * 0.45], pitch: -slope },
        ),
      );
    }
    ctx.part('roof', merge(roofM));

    // ---- outlet + hinge on the track side; the spout swings on it.
    const outlet: Mesh[] = [
      cylinder({
        radius: 0.2,
        length: PIVOT[0] - TANK_R + 0.08,
        segments: ctx.pick([14, 10, 6]),
        axis: 'x',
        at: [(TANK_R - 0.08 + PIVOT[0]) / 2, 0, PIVOT[2]],
        color: steel,
      }),
    ];
    if (lod < 2)
      outlet.push(
        cylinder({
          radius: 0.27,
          length: 0.06,
          segments: ctx.pick([14, 10, 6]),
          axis: 'x',
          at: [TANK_R + 0.03, 0, PIVOT[2]],
          color: steel,
        }),
      ); // flange
    ctx.part('outlet', merge(outlet));

    ctx.group('spout', {
      at: PIVOT,
      motion: { kind: 'sway', axis: [0, 1, 0], degrees: 15, hz: 0.1 },
      clearOf: ['outlet'], // the hinge knuckle turns inside the outlet flange by design
    });
    const dir: Vec3 = [Math.cos(SPOUT_REST), 0, Math.sin(SPOUT_REST)];
    const along = (d: number, z = 0): Vec3 => [dir[0] * d, 0, dir[2] * d + z];
    const sp: Mesh[] = [
      beam({
        from: along(0),
        to: along(SPOUT_L * 0.72),
        width: 0.4,
        segments: ctx.pick([12, 8, 6]),
        color: steel,
      }),
      beam({
        from: along(SPOUT_L * 0.7),
        to: along(SPOUT_L),
        width: 0.32,
        segments: ctx.pick([12, 8, 6]),
        color: steel,
      }),
    ];
    if (lod < 2) {
      sp.push(cylinder({ radius: 0.25, length: 0.42, segments: 10, axis: 'y', color: steel })); // hinge knuckle
      sp.push(
        place(
          lathe({
            profile: [
              [0.16, 0],
              [0.24, 0.16],
              [0.24, 0.2],
            ],
            segments: 10,
            color: steel,
          }),
          { at: along(SPOUT_L - 0.05), pitch: Math.PI / 2 - SPOUT_REST },
        ),
      );
      for (const d of [0.9, 1.9])
        sp.push(
          place(cylinder({ radius: 0.215, length: 0.05, segments: 10, axis: 'x', color: steel }), {
            at: along(d),
            pitch: -SPOUT_REST,
          }),
        ); // bands
    }
    if (lod === 0) {
      // Pull chain hanging from the mouth (the fireman pulls it down over the tender).
      const tip = along(SPOUT_L - 0.1, -0.2);
      for (let i = 0; i < 9; i++)
        sp.push(
          place(box({ size: [0.03, 0.06, 0.12], color: steel, strip: 'iron' }), {
            at: [tip[0], 0, tip[2] - i * 0.13],
            yaw: (i % 2) * (Math.PI / 2),
          }),
        );
    }
    ctx.part('spout_body', merge(sp), { parent: 'spout' });
    ctx.socket('water_fill', {
      kind: 'interact',
      parent: 'spout',
      at: along(SPOUT_L),
      dir: [0, 0, -1],
    });

    // ---- ladder up the −X side to the eave, with stays to the tank and the cap ring.
    if (lod < 2) {
      const lx = -(TANK_R + 0.42);
      const top = TANK_TOP - 0.1;
      const lad: Mesh[] = [];
      for (const y of [-0.22, 0.22])
        lad.push(bx(lx - 0.05, lx + 0.05, y - 0.03, y + 0.03, 0, top, timber, 'wood'));
      const rung = ctx.pick([0.3, 0.6, 1]);
      for (let z = 0.3; z < top - 0.1; z += rung)
        lad.push(
          cylinder({
            radius: 0.018,
            length: 0.44,
            segments: lod === 0 ? 6 : 4,
            axis: 'y',
            at: [lx, 0, z],
            color: timber,
          }),
        );
      for (const z of [CAP_Z0 + 0.15, FLOOR_Z + 1.5, TANK_TOP - 0.4])
        for (const y of [-0.22, 0.22]) {
          const r =
            z > FLOOR_Z
              ? TANK_R / Math.cos(Math.PI / facets) - 0.01
              : POST_R * Math.cos(Math.PI / 8) + 0.05;
          lad.push(
            beam({
              from: [lx + 0.05, y, z],
              to: [-r, y * 0.6, z],
              width: 0.05,
              height: 0.03,
              color: steel,
              strip: 'iron',
            }),
          );
        }
      ctx.part('ladder', dirt(merge(lad)));
    }
  },
});
