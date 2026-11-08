// SVG showcase: drawings in code turned into game-ready solids, the "draw → 3D" test card. Every
// object starts as an inline SVG string: a bevelled 12-tooth gear with a hub and lightening holes
// (`extrudeSvg`, even-odd holes), a turned amphora from a half profile (`latheSvg`), a creature
// head blocked out from front + side + top silhouettes (`visualHull`) and refined with ordinary
// sculpt edits, and a bevelled star emblem on the plinth front. Curves flatten coarser per LOD
// (`lod: ctx.lod`), the sculpt cell grows. Dossier: recipes/svg_showcase/README.md.

import {
  box,
  defineAsset,
  extrudeSvg,
  hex,
  latheSvg,
  sculpt,
  type Vec3,
  visualHull,
} from '@developerz.ai/ts23d';

const PLINTH: Vec3 = [0.5, 1.8, 0.06];
const TOP = PLINTH[2];
const STEEL = hex('#8a9096');
const CLAY = hex('#b5643c');
const SLATE = hex('#3b4048');
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
  <circle r="12"/>${holes}
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

/** Five-point star emblem, 100 units = 0.05 m (fits the plinth face). */
const STAR = `<svg viewBox="-50 -50 100 100"><polygon points="${Array.from(
  { length: 10 },
  (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 48 : 20;
    return `${(r * Math.cos(a)).toFixed(3)},${(r * Math.sin(a)).toFixed(3)}`;
  },
).join(' ')}"/></svg>`;

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
  budget: { triangles: [40000, 10500, 2000] },
  build(ctx) {
    const lod = ctx.lod;
    ctx.part('plinth', box({ size: PLINTH, at: [0, 0, 0], color: SLATE, bevel: 0.006 }));

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
      strip: 'steel_painted',
    });
    ctx.part('gear', gear);

    ctx.part(
      'amphora',
      latheSvg(AMPHORA, {
        scale: 0.005,
        segments: ctx.pick([40, 20, 10]),
        lod,
        at: [0, 0, TOP],
        color: CLAY,
        strip: 'plain',
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
      at: [0, 0, TOP],
    });
    const z = (y: number): number => TOP + (105 - y) * s;
    const at = (x: number, y: number, zz: number): Vec3 => [x * s, y * s, z(zz)];
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
          // Brow ridge and cheek pads soften the hull's planes.
          { shape: 'capsule', at: at(30, -14, 34), to: at(30, 14, 34), size: 5 * s, blend: 0.02 },
          { shape: 'ellipsoid', at: at(22, -24, 66), size: [12 * s, 10 * s, 10 * s], blend: 0.03 },
          { shape: 'ellipsoid', at: at(22, 24, 66), size: [12 * s, 10 * s, 10 * s], blend: 0.03 },
          // Eye sockets, eyeballs, pupils.
          { shape: 'sphere', at: at(33, -14, 45), size: 9 * s, op: 'subtract', blend: 0.01 },
          { shape: 'sphere', at: at(33, 14, 45), size: 9 * s, op: 'subtract', blend: 0.01 },
          { shape: 'sphere', at: at(28, -14, 45), size: 8 * s, color: hex('#e8d890') },
          { shape: 'sphere', at: at(28, 14, 45), size: 8 * s, color: hex('#e8d890') },
          {
            shape: 'sphere',
            at: at(36, -14, 45),
            size: 3 * s,
            op: 'paint',
            blend: 0.004,
            color: hex('#1a1408'),
          },
          {
            shape: 'sphere',
            at: at(36, 14, 45),
            size: 3 * s,
            op: 'paint',
            blend: 0.004,
            color: hex('#1a1408'),
          },
          // Nostrils and a wide mouth groove.
          { shape: 'sphere', at: at(46, -5, 60), size: 3 * s, op: 'subtract', blend: 0.006 },
          { shape: 'sphere', at: at(46, 5, 60), size: 3 * s, op: 'subtract', blend: 0.006 },
          {
            shape: 'capsule',
            at: at(36, -18, 72),
            to: at(36, 18, 72),
            size: 2.5 * s,
            op: 'subtract',
            blend: 0.008,
            color: hex('#3a2418'),
          },
          // Tusks up from the lower lip.
          {
            shape: 'cone',
            at: at(34, -12, 76),
            size: [3 * s, 0.5 * s, 14 * s],
            color: hex('#efe6cf'),
          },
          {
            shape: 'cone',
            at: at(34, 12, 76),
            size: [3 * s, 0.5 * s, 14 * s],
            color: hex('#efe6cf'),
          },
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
        resolution: ctx.pick([0.006, 0.012, 0.03]),
        color: SKIN,
        mirror: 'y',
        strip: 'plain',
      }),
      // Sculpted about y = 0 (mirror plane), then placed on the plinth.
      { at: [0, 0.55, 0] },
    );

    const emblem = extrudeSvg(STAR, {
      size: 0.05,
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
