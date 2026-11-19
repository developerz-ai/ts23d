// SVG showcase: drawings in code turned into game-ready solids, the "draw → 3D" test card. Every
// object starts as an inline SVG string: a bevelled 12-tooth gear with a hub and lightening holes
// (`extrudeSvg`, even-odd holes), a turned amphora from a half profile (`latheSvg`), a creature
// head blocked out from front + side + top silhouettes (`visualHull`) and refined with ordinary
// sculpt edits on a turned oak stand, and a bevelled star emblem on the plinth front. Each sits on a
// real material strip (machined steel gear with face-weighted normals, a thrown-clay amphora strip
// with throw rings, pored skin, a lacquered walnut plinth) and wears its story: oil on the gear
// teeth, dust on the amphora shoulder and a chipped lip, dust settled along the plinth's back and
// ends and its front arris rubbed through. Curves flatten coarser per LOD (`lod: ctx.lod`), the sculpt cell grows.
// Dossier: recipes/svg_showcase/README.md.

import {
  box,
  defineAsset,
  extrudeSvg,
  hex,
  lathe,
  latheSvg,
  type Mesh,
  merge,
  sculpt,
  tiled,
  type Vec3,
  visualHull,
  weather,
  weightedNormals,
} from '@developerz.ai/ts23d';
import { CLAY_STRIP } from './clay.ts';

const PLINTH: Vec3 = [0.5, 1.8, 0.12];
const TOP = PLINTH[2];
/** The head stands on a turned oak display stand this tall. */
const STAND = 0.05;
const BASE = TOP + STAND;
const STEEL = hex('#c4c8cc');
const OAK = hex('#c9a27a');
const CLAY = hex('#b5643c');
const WALNUT = hex('#5a3d2a');
const DUST = hex('#9a958a');
const SCUFF = hex('#a07a55');
const mixC = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
/** Pale maple stringing inlaid round the plinth top. */
const MAPLE = hex('#d8c29a');
const SKIN = hex('#6f8f4a');
const GOLD = hex('#d8b24a');

/** 12 teeth (one tip flat at the bottom), hub hole, four lightening holes. 100 units = 0.5 m. */
const TEETH = 12;
const tooth = (i: number): string => {
  const a = Math.PI / 2 + (i / TEETH) * Math.PI * 2;
  const p = (r: number, da: number): string =>
    `${(r * Math.cos(a + da)).toFixed(3)} ${(r * Math.sin(a + da)).toFixed(3)}`;
  return `${i === 0 ? 'M' : 'L'}${p(40, -0.15)} L${p(48, -0.09)} L${p(48, 0.09)} L${p(40, 0.15)}`;
};
const holes = [0, 1, 2, 3]
  .map((i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    return `<circle cx="${(26 * Math.cos(a)).toFixed(3)}" cy="${(26 * Math.sin(a)).toFixed(3)}" r="7"/>`;
  })
  .join('');
const GEAR = `<svg viewBox="-50 -50 100 100">
  <path d="${Array.from({ length: TEETH }, (_, i) => tooth(i)).join(' ')} Z"/>
  <path d="M-4 -11.31 L-4 -16.5 L4 -16.5 L4 -11.31 A12 12 0 1 1 -4 -11.31 Z"/>${holes}
</svg>`;
const GEAR_SCALE = 0.005;
/** The bottom tooth's flat tip, below the gear centre. */
const GEAR_DROP = 48 * Math.cos(0.09) * GEAR_SCALE;

/** Amphora half profile: axis on the left edge, foot at the bottom, open mouth with a lip. */
const AMPHORA = `<svg viewBox="0 0 30 100">
  <path d="M0 100 H10 L12 98 L9 95 C24 86 28 64 25 50 C22 38 10 33 8 24 L8 9
           Q8 4 13 2 L13 0 H6 L6 12 L0 14 Z"/>
</svg>`;

/** Creature head, 0.004 m per unit. Front: paper right = +Y. Side: paper right = +X (snout). */
const HEAD_FRONT = `<svg viewBox="-70 0 140 105">
  <path d="M-14 105 L-16 88 C-30 84 -36 74 -36 58 L-66 40 L-35 36 C-34 14 -20 3 0 3
           C20 3 34 14 35 36 L66 40 L36 58 C36 74 30 84 16 88 L14 105 Z"/>
</svg>`;
const HEAD_SIDE = `<svg viewBox="-50 0 100 105">
  <path d="M-20 105 L-18 86 C-40 80 -46 56 -42 36 C-38 12 -16 3 4 4 C22 5 32 14 34 28
           L40 34 L34 40 C40 50 50 54 46 60 L36 64 C40 70 38 78 32 80 C26 90 14 90 8 88 L8 105 Z"/>
</svg>`;
/** Plan (paper up = +Y): the skull, a snout, and the ears as thin flaps. */
const HEAD_TOP = `<svg viewBox="-50 -70 100 140">
  <path d="M50 0 C46 -14 36 -30 14 -36 L-2 -38 L-12 -68 L-16 -36 C-36 -32 -48 -16 -46 0
           C-48 16 -36 32 -16 36 L-12 68 L-2 38 L14 36 C36 30 46 14 50 0 Z"/>
</svg>`;

/** Five-point star emblem, 100 units = 0.09 m (fits the 0.12 m plinth face). */
const STAR = `<svg viewBox="-50 -50 100 100"><polygon points="${Array.from(
  { length: 10 },
  (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 48 : 20;
    return `${(r * Math.cos(a)).toFixed(3)},${(r * Math.sin(a)).toFixed(3)}`;
  },
).join(' ')}"/></svg>`;

/**
 * A lacquered walnut plinth that has stood in a workshop: a maple stringing inlay round its top,
 * dust settled in a soft band along the back edge and the two ends (each a quad whose inner edge
 * fades to the lacquer: vertex colours interpolate), and the front arris rubbed through to pale
 * wood where hands and tools catch it.
 */
function plinth(lod: number): Mesh {
  const [L, W, H] = PLINTH;
  const out: Mesh[] = [
    box({ size: PLINTH, color: WALNUT, strip: 'oak', bevel: lod < 2 ? 0.006 : 0 }),
  ];
  const m = 0.012; // stay inside the 6 mm bevel
  // The top's own veneer, 0.5 mm over the box's top face: that face stretched the whole oak band
  // across the plinth, and the band's pale edge rows drew a light stripe along the back and one
  // end only (an L). Here U starts a metre into the strip and V keeps to the band's middle half.
  out.push(
    tiled({
      origin: [-L / 2 + m, -W / 2 + m, H + 0.0005],
      u: [L - 2 * m, 0, 0],
      v: [0, W - 2 * m, 0],
      color: WALNUT,
      strip: 'oak',
      uOffset: 1,
      vMetres: 2 * (W - 2 * m),
      vOffset: (W - 2 * m) / 2,
    }),
  );
  // Maple stringing 8 mm wide, 3 cm in from every edge: a closed inlay border on all four sides.
  const s = 0.03;
  for (const [cx, cy, sx, sy] of [
    [L / 2 - s, 0, 0.008, W - 2 * s + 0.008],
    [-L / 2 + s, 0, 0.008, W - 2 * s + 0.008],
    [0, W / 2 - s, L - 2 * s - 0.008, 0.008],
    [0, -W / 2 + s, L - 2 * s - 0.008, 0.008],
  ] as const)
    out.push(
      box({
        size: [sx, sy, 0.001],
        at: [cx, cy, H + 0.002],
        color: MAPLE,
        strip: 'oak',
        omit: ['bottom'],
      }),
    );
  // Dust over the rectangle x0..x1 × y0..y1 (1–2 mm over the top, under the stringing), heaviest
  // at its `dusty` edge and fading to the lacquer in four steps of uniform colour. (A two-colour
  // quad left the fade to vertex interpolation, which the sheet's flat raster does not do: each
  // triangle took its first vertex's colour, so one end band drew solid dust, the other none.)
  const band = (x0: number, x1: number, y0: number, y1: number, dustyX: boolean, at0: boolean) =>
    merge(
      [0, 1, 2, 3].map((k) => {
        // Step k from the dusty edge: its span along the fade axis, and its share of dust.
        const [a, b] = dustyX ? [x0, x1] : [y0, y1];
        const t0 = at0 ? a + ((b - a) * k) / 4 : b - ((b - a) * (k + 1)) / 4;
        const t1 = t0 + (b - a) / 4;
        const [sx0, sx1, sy0, sy1] = dustyX ? [t0, t1, y0, y1] : [x0, x1, t0, t1];
        return box({
          size: [sx1 - sx0, sy1 - sy0, 0.001],
          at: [(sx0 + sx1) / 2, (sy0 + sy1) / 2, H + 0.001],
          color: mixC(DUST, WALNUT, (k + 0.5) / 4),
          strip: 'oak',
          omit: ['front', 'back', 'left', 'right', 'bottom'],
        });
      }),
    );
  // Far, the stepped dust reads as a painted border: LOD0/1 only.
  if (lod < 2)
    out.push(
      band(-L / 2 + m, -L / 2 + 0.14, -W / 2 + m, W / 2 - m, true, true),
      band(-L / 2 + 0.14, L / 2 - m, -W / 2 + m, -W / 2 + 0.12, false, true),
      band(-L / 2 + 0.14, L / 2 - m, W / 2 - 0.12, W / 2 - m, false, false),
    );
  if (lod === 0)
    // Rubbed-through lacquer along the front top arris, in three worn stretches.
    for (const [y, w, h] of [
      [-0.66, 0.09, 0.01],
      [-0.52, 0.05, 0.007],
      [-0.26, 0.07, 0.009],
      [0.3, 0.11, 0.01],
      [0.47, 0.04, 0.006],
      [0.7, 0.08, 0.008],
    ] as const)
      out.push(
        box({
          size: [0.001, w, h],
          at: [L / 2 + 0.0005, y, H - 0.006 - h],
          color: SCUFF,
          strip: 'oak',
          omit: ['back', 'left', 'right', 'top', 'bottom'],
        }),
      );
  return merge(out);
}

/** Throw rings: the potter's fingers leave faint horizontal bands; tone the clay by height. */
function throwRings(m: Mesh, z0: number): Mesh {
  const colors = new Float32Array(m.colors);
  for (let v = 0; v < colors.length / 3; v++) {
    const z = (m.positions[v * 3 + 2] ?? 0) - z0;
    const k = 0.93 + 0.07 * Math.sin(z * 2 * Math.PI * 55) + (z > 0.42 ? 0.04 : 0);
    for (let c = 0; c < 3; c++) colors[v * 3 + c] = (colors[v * 3 + c] ?? 0) * k;
  }
  return { ...m, colors };
}

export const svg_showcase = defineAsset({
  name: 'svg_showcase',
  kind: 'prop',
  description:
    'Draw → 3D test card: a bevelled gear, a turned amphora, a silhouette-sculpted creature head and a star emblem, each from an inline SVG drawing',
  tags: ['svg', 'showcase', 'extrude', 'lathe', 'sculpt', 'silhouette'],
  license: 'CC0-1.0',
  sources: [
    'recipes/svg_showcase/README.md (design spec; the SVG drawings are inline in this file)',
  ],
  budget: { triangles: [22000, 7000, 2000] },
  build(ctx) {
    const lod = ctx.lod;
    ctx.part('plinth', plinth(lod));

    const gear = extrudeSvg(GEAR, {
      scale: GEAR_SCALE,
      origin: 'centre',
      view: 'front',
      depth: 0.06,
      bevel: ctx.pick([0.006, 0.006, 0]),
      tolerance: 0.0006,
      lod,
      at: [0, -0.55, TOP + GEAR_DROP],
      color: STEEL,
      strip: 'aluminium',
    });
    const amphora = throwRings(
      latheSvg(AMPHORA, {
        scale: 0.005,
        segments: ctx.pick([40, 20, 10]),
        lod,
        at: [0, 0, TOP],
        color: CLAY,
        strip: CLAY_STRIP,
        uv: 'metres',
      }),
      TOP,
    );
    // Workshop story: oil darkens the gear's tooth flanks and bore; the amphora has stood on a
    // shelf (dust on the shoulder, a chipped lip, grime at the foot).
    const oiled = weather(
      ctx,
      { gear },
      {
        name: 'gear_wear',
        seed: 19,
        age: 0.6,
        resolution: [0.06, 0, 0],
        effects: {
          rust: { where: 'convex-edges', amount: 0.25, color: [0.03, 0.028, 0.024], strength: 0.6 },
          dust: { where: 'up-facing', amount: 0.4, strength: 0.5 },
        },
      },
    );
    const shelved = weather(
      ctx,
      { amphora },
      {
        name: 'amphora_wear',
        seed: 23,
        age: 0.6,
        resolution: [0.06, 0, 0],
        sun: [0.2, 0.2, 1],
        under: hex('#d9a27c'),
        effects: {
          chips: { where: 'convex-edges', amount: 0.15 },
          dust: { where: 'up-facing', amount: 0.5, strength: 0.6 },
          mud: { where: 'ground-near', amount: 0.25 },
        },
      },
    );
    // Face-weighted normals: the big flat faces stay dead flat (the extrude's chamfer normals bled
    // into the triangulated faces as shading streaks) while the chamfers catch the light.
    ctx.part('gear', weightedNormals(oiled.gear, { hardAngle: 30 }));
    ctx.part('amphora', shelved.amphora);

    ctx.part(
      'stand',
      lathe({
        profile: [
          [0, 0],
          [0.1, 0],
          [0.1, 0.012],
          [0.085, 0.02],
          [0.07, 0.04],
          [0.075, STAND],
          [0, STAND],
        ],
        segments: ctx.pick([32, 16, 8]),
        color: OAK,
        strip: 'oak',
        at: [0, 0.55, TOP],
      }),
    );

    const s = 0.004;
    const hull = visualHull({
      front: HEAD_FRONT,
      side: HEAD_SIDE,
      top: HEAD_TOP,
      scale: s,
      round: 0.02,
      tolerance: 0.001,
      lod,
      at: [0, 0, BASE],
    });
    const z = (y: number): number => BASE + (105 - y) * s;
    const at = (x: number, y: number, zz: number): Vec3 => [x * s, y * s, z(zz)];
    // Features smaller than the LOD2 cell (3.4 cm) only scatter stray colour over its coarse
    // facets: the far head keeps its planes, ears and eyes and leaves these out.
    const fine = <T>(...e: T[]): T[] => (lod < 2 ? e : []);
    ctx.part(
      'head',
      sculpt({
        edits: [
          { ...hull, color: SKIN },
          // A skull-sized ellipsoid trims the boxy corners where the drawn views cut each other
          // (and the ears, which the next group puts back from the same hull).
          {
            shape: 'ellipsoid',
            at: [0.01, 0, z(55)],
            size: [0.2, 0.15, 0.245],
            op: 'intersect',
            blend: 0.03,
          },
          {
            group: [
              { ...hull },
              // Only the ear flaps: outside the skull (|y| > 0.15 m), at ear height.
              { shape: 'roundBox', at: [0, 0.22, z(47)], size: [0.4, 0.14, 0.14], op: 'intersect' },
            ],
            blend: 0.015,
            color: SKIN,
          },
          // A short neck stump carries the head off the stand (sinks 5 mm into its top).
          {
            shape: 'capsule',
            at: [-0.015, 0, BASE + 0.05],
            to: [-0.01, 0, z(80)],
            size: 0.055,
            blend: 0.03,
            color: SKIN,
          },
          // Brow ridge and cheek pads soften the hull's planes.
          { shape: 'capsule', at: at(30, -14, 34), to: at(30, 14, 34), size: 5 * s, blend: 0.02 },
          { shape: 'ellipsoid', at: at(22, -24, 66), size: [12 * s, 10 * s, 10 * s], blend: 0.03 },
          { shape: 'ellipsoid', at: at(22, 24, 66), size: [12 * s, 10 * s, 10 * s], blend: 0.03 },
          // Forehead wrinkles: three grooves above the brow, deep enough to catch the key light
          // (LOD0: at LOD1's 1.6 cm cell they would only blur the brow).
          ...(lod === 0
            ? [22, 15, 8].map((zz) => ({
                shape: 'capsule' as const,
                at: at(30 - (34 - zz) * 0.4, -13, zz),
                to: at(30 - (34 - zz) * 0.4, 13, zz),
                size: 2 * s,
                op: 'subtract' as const,
                blend: 0.006,
              }))
            : []),
          // A notch bitten out of each ear's trailing edge.
          ...fine({
            shape: 'sphere' as const,
            at: at(-6, 52, 44),
            size: 6.5 * s,
            op: 'subtract' as const,
            blend: 0.004,
          }),
          // Eye sockets, eyeballs, pupils.
          { shape: 'sphere', at: at(33, -14, 45), size: 9 * s, op: 'subtract', blend: 0.01 },
          { shape: 'sphere', at: at(33, 14, 45), size: 9 * s, op: 'subtract', blend: 0.01 },
          { shape: 'sphere', at: at(28, -14, 45), size: 8 * s, color: hex('#e8d890') },
          { shape: 'sphere', at: at(28, 14, 45), size: 8 * s, color: hex('#e8d890') },
          ...fine(
            {
              shape: 'sphere' as const,
              at: at(36, -14, 45),
              size: 3 * s,
              op: 'paint' as const,
              blend: 0.004,
              color: hex('#1a1408'),
            },
            {
              shape: 'sphere' as const,
              at: at(36, 14, 45),
              size: 3 * s,
              op: 'paint' as const,
              blend: 0.004,
              color: hex('#1a1408'),
            },
            // Nostrils and a wide mouth groove.
            {
              shape: 'sphere' as const,
              at: at(46, -5, 60),
              size: 3 * s,
              op: 'subtract' as const,
              blend: 0.006,
            },
            {
              shape: 'sphere' as const,
              at: at(46, 5, 60),
              size: 3 * s,
              op: 'subtract' as const,
              blend: 0.006,
            },
            {
              shape: 'capsule' as const,
              at: at(36, -18, 72),
              to: at(36, 18, 72),
              size: 2.5 * s,
              op: 'subtract' as const,
              blend: 0.008,
              color: hex('#3a2418'),
            },
            // Tusks up from the lower lip.
            {
              shape: 'cone' as const,
              at: at(34, -12, 76),
              size: [3 * s, 0.5 * s, 14 * s] as Vec3,
              color: hex('#efe6cf'),
            },
            {
              shape: 'cone' as const,
              at: at(34, 12, 76),
              size: [3 * s, 0.5 * s, 14 * s] as Vec3,
              color: hex('#efe6cf'),
            },
          ),
          // Darker crown, warm ear insides.
          {
            shape: 'sphere',
            at: at(-10, 0, 0),
            size: 30 * s,
            op: 'paint',
            blend: 0.06,
            color: hex('#4f6a34'),
          },
        ],
        resolution: ctx.pick([0.0095, 0.016, 0.034]),
        color: SKIN,
        mirror: 'y',
        strip: 'concrete',
      }),
      // Sculpted about y = 0 (mirror plane), then placed on the plinth.
      { at: [0, 0.55, 0] },
    );

    const emblem = extrudeSvg(STAR, {
      size: 0.09,
      origin: 'centre',
      view: 'front',
      depth: 0.012,
      bevel: ctx.pick([0.003, 0.003, 0]),
      lod,
      at: [PLINTH[0] / 2 + 0.006, 0, TOP / 2],
      color: GOLD,
      strip: 'brass',
    });
    if (lod < 2) ctx.part('emblem', emblem);
  },
});
