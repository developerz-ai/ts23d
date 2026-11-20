// Type specimen: a free-standing notice board that shows every `text()` face, each row set twice,
// as flush painted decals (left column, cream) and as raised cast letters (right column, brass).
// Faces: the built-in 5 × 7 pixel font ('5x7', 'block') and the Hershey stroke fonts ('sans',
// 'serif', 'script', 'gothic'). The board is twenty vertical tongue-and-groove boards under a felted, gabled
// hood on two bracketed posts, bolted through back battens; the paint fades up the board, rain
// streaks run from the capping, the frame is chipped, the post feet damp. LOD policy: LOD0 raised
// polished brass at 2 curve steps (flush rows 1); LOD1 every row flush at 1 step; LOD2 sets each
// word as a greeked bar in its colour, so both columns still read at distance.
// Board faces +X, reads along +Y.

import {
  box,
  cylinder,
  defineAsset,
  hex,
  type Lod,
  type Mesh,
  measureText,
  merge,
  place,
  prism,
  stripRect,
  type TextFont,
  text,
  type Vec3,
  weather,
} from '@developerz.ai/ts23d';
import { POLISHED_BRASS } from './brass.ts';

const GREEN = hex('#1d3a2f');
const FADED = hex('#7d9488');
const FRAME = hex('#6b4c30');
const POST = hex('#5e4430');
const HOOD = hex('#d8d8d8');
const CREAM = hex('#ece4cc');
const BRASS = hex('#b8913f');
const IRON = hex('#3c3a37');
const STREAK = hex('#0d1813');
const CHIP = hex('#8a8272');
const FASCIA = hex('#4a3524');

const FACE_X = 0.1; // board front face
const BOTTOM = 0.8;
const HEIGHT = 1.9;
const TOP = BOTTOM + HEIGHT;
const WIDTH = 3.2;
const CAP = 0.1; // specimen cap height
const DEPTH = 0.012; // raised letters
const POST_Y = 1.35;
const POST_W = 0.12;
const PLANKS = 20; // vertical boards, 0.16 m

/** Curve steps per Hershey segment, per LOD (LOD2 does not set letters at all). */
const SEGMENTS: Readonly<Record<Lod, number>> = { 0: 2, 1: 1, 2: 1 };

/** One specimen row per face: the face name in its own letters plus a sample. */
const ROWS: readonly (readonly [TextFont, string])[] = [
  ['5x7', '5X7 PIXEL 1904'],
  ['block', 'BLOCK 8424'],
  ['sans', 'Sans Halt 42'],
  ['serif', 'Serif Station'],
  ['script', 'Script Express'],
  ['gothic', 'Gothic Ales'],
];

interface Line {
  readonly y: number;
  readonly z: number;
  readonly height: number;
  readonly font: TextFont;
  readonly depth: number;
  readonly color: Vec3;
  readonly align?: 'left' | 'centre';
  readonly weight?: number;
  readonly maxWidth?: number;
}

/**
 * Greeked text: one flat bar per word, as wide as the word would set, 60 % of the cap height. What
 * a far viewer sees of a lettered row (its colour and rhythm) for 2 triangles a word.
 */
function greek(str: string, l: Line): Mesh[] {
  const m = { height: l.height, font: l.font, ...(l.weight ? { weight: l.weight } : {}) };
  const full = measureText(str, m);
  const scale = l.maxWidth !== undefined && full > l.maxWidth ? l.maxWidth / full : 1;
  const start = l.align === 'centre' ? l.y - (full * scale) / 2 : l.y;
  const out: Mesh[] = [];
  let at = 0;
  for (const word of str.split(' ')) {
    const w = measureText(word, m) * scale;
    out.push(
      box({
        // 90 % of the word, centred: the word break stays open at distance.
        size: [0.002, w * 0.9, l.height * 0.6],
        at: [FACE_X + 0.001, start + at * scale + w / 2, l.z + l.height * 0.2],
        color: l.color,
        strip: l.depth > 0 ? POLISHED_BRASS : 'plain',
        omit: ['back', 'left', 'right', 'top', 'bottom'],
      }),
    );
    at += measureText(`${word} `, m);
  }
  return out;
}

/** A lettered line: real letters at LOD0/1 (raised only at LOD0), greeked bars at LOD2. */
function line(str: string, l: Line, lod: Lod): Mesh[] {
  if (lod === 2) return greek(str, l);
  return [
    text(str, {
      origin: [FACE_X, l.y, l.z],
      height: l.height,
      color: l.color,
      font: l.font,
      // 12 mm of relief is a few pixels past LOD0's distance: LOD1 sets the brass flush.
      depth: lod === 0 ? l.depth : 0,
      align: l.align ?? 'left',
      maxWidth: l.maxWidth ?? 1.36,
      // Flush rows are paint: one curve step is enough for a decal's outline.
      segments: l.depth > 0 ? SEGMENTS[lod] : 1,
      strip: l.depth > 0 ? POLISHED_BRASS : 'plain',
      ...(l.weight === undefined ? {} : { weight: l.weight }),
    }),
  ];
}

/** Sun-faded paint at height z: green below mid-board, 90 % toward the faded tone at the top. */
function paintAt(z: number): Vec3 {
  const f = 0.9 * Math.min(1, Math.max(0, (z - BOTTOM - 0.45 * HEIGHT) / (0.5 * HEIGHT)));
  return [0, 1, 2].map((k) => (GREEN[k] ?? 0) * (1 - f) + (FADED[k] ?? 0) * f) as unknown as Vec3;
}

/**
 * One vertical board's texture: grain up the board (U = height at true metres, shifted per board
 * so the butt joints never line up), V inside ONE board of the pale `wood` strip (rows 6–15 of
 * its 32, between two seams), so each board shows one board, not four squeezed courses. The paint
 * is the vertex colour; `wood_painted`'s chip marks read as dark blotches under a dark green.
 */
function boardUV(m: Mesh, y0: number, width: number, shift: number): Mesh {
  const r = stripRect('wood');
  const uvs = new Float32Array(m.uvs);
  for (let v = 0; v < uvs.length / 2; v++) {
    const y = m.positions[v * 3 + 1] ?? 0;
    const z = m.positions[v * 3 + 2] ?? 0;
    const across = Math.min(1, Math.max(0, (y - y0) / width));
    uvs[v * 2] = r.u0 + ((z - BOTTOM + shift) / r.metres) * (r.u1 - r.u0);
    uvs[v * 2 + 1] = r.v0 + (0.2 + 0.26 * across) * (r.v1 - r.v0);
  }
  return { ...m, uvs };
}

/**
 * Vertical tongue-and-groove boards, each in two lifts (the seam is hidden: U runs on), so the
 * paint stays green to mid-board and fades above it, and damp darkens the foot. LOD2: one box in
 * flat paint (the same fade), no texture to alias at distance.
 */
function planks(lod: Lod): Mesh[] {
  if (lod === 2) {
    const slab = box({
      size: [0.05, WIDTH, HEIGHT],
      at: [0.075, 0, BOTTOM],
      color: GREEN,
      strip: 'plain',
    });
    return [{ ...slab, colors: paintColors(slab, 0) }];
  }
  const bw = WIDTH / PLANKS;
  const lift = 0.45 * HEIGHT;
  const out: Mesh[] = [];
  for (let i = 0; i < PLANKS; i++) {
    const y0 = -WIDTH / 2 + i * bw;
    const tone = i % 2 === 0 ? 1 : 0.94;
    const shift = (i * 0.618 * 4) % 4;
    for (const [z, h, omit] of [
      [BOTTOM, lift, 'top'],
      [BOTTOM + lift, HEIGHT - lift, 'bottom'],
    ] as const) {
      const b = box({
        size: [0.05, bw, h],
        at: [0.075, y0 + bw / 2, z],
        color: GREEN,
        strip: 'wood',
        omit: [omit],
      });
      const m = boardUV(b, y0, bw, shift);
      out.push({ ...m, colors: paintColors(m, 1 - tone) });
    }
  }
  return out;
}

/** Faded paint by height, darkened by `shade`, damp at the foot (dark at the bottom edge). */
function paintColors(m: Mesh, shade: number): Float32Array {
  const colors = new Float32Array(m.colors);
  for (let v = 0; v < colors.length / 3; v++) {
    const z = m.positions[v * 3 + 2] ?? 0;
    const c = paintAt(z);
    const damp = z < BOTTOM + 0.01 ? 0.72 : 1;
    for (let k = 0; k < 3; k++) colors[v * 3 + k] = (c[k] ?? 0) * (1 - shade) * damp;
  }
  return colors;
}

/**
 * Close-up wear on the face (LOD0/1), as 1 mm-proud quads: rain run down from the capping in dark
 * streaks (each fading out downward, vertex colours interpolate), and the frame's arrises chipped
 * through to grey timber.
 */
function faceWear(): Mesh[] {
  const quad = (
    y: number,
    z: number,
    w: number,
    hh: number,
    top: Vec3,
    bottom: Vec3,
    x = FACE_X,
  ) => {
    const q = box({
      size: [0.001, w, hh],
      at: [x + 0.0005, y, z],
      color: top,
      strip: 'wood_painted',
      omit: ['back', 'left', 'right', 'top', 'bottom'],
    });
    const colors = new Float32Array(q.colors);
    for (let v = 0; v < colors.length / 3; v++)
      if ((q.positions[v * 3 + 2] ?? 0) < z + hh / 2) colors.set(bottom, v * 3);
    return { ...q, colors };
  };
  const out: Mesh[] = [];
  // Rain streaks under the capping, between the letter columns' ends.
  for (const [y, w, len] of [
    [-1.5, 0.07, 0.75],
    [-1.1, 0.045, 0.32],
    [-0.62, 0.06, 0.4],
    [0.02, 0.07, 0.55],
    [0.95, 0.05, 0.45],
    [1.47, 0.08, 0.8],
  ] as const) {
    // Darkest where the water leaves the capping, gone into the paint at its foot.
    const z0 = TOP - 0.06 - len;
    out.push(quad(y, z0, w, len, STREAK, paintAt(z0)));
  }
  // Chips on the frame's front arrises: bare grey timber.
  const fx = FACE_X + 0.03;
  for (const [y, z, w, hh] of [
    [-1.2, BOTTOM + 0.045, 0.09, 0.012],
    [0.4, BOTTOM + 0.04, 0.05, 0.015],
    [1.05, TOP - 0.02, 0.08, 0.012],
    [-0.5, TOP - 0.018, 0.12, 0.01],
    [-1.585, BOTTOM + 0.6, 0.012, 0.1],
    [1.585, BOTTOM + 1.2, 0.012, 0.07],
  ] as const)
    out.push(quad(y, z, w, hh, CHIP, CHIP, fx));
  return out;
}

/** Frame moulding, capping, gabled hood, brackets: the wood that weathers. */
function joinery(lod: Lod): Mesh[] {
  const fx = FACE_X + 0.015;
  const out: Mesh[] = [
    box({ size: [0.03, WIDTH, 0.06], at: [fx, 0, BOTTOM], color: FRAME, strip: 'wood' }),
    box({ size: [0.03, WIDTH, 0.06], at: [fx, 0, TOP - 0.06], color: FRAME, strip: 'wood' }),
    box({ size: [0.17, WIDTH + 0.1, 0.05], at: [0.05, 0, TOP], color: FRAME, strip: 'wood' }),
  ];
  for (const s of [-1, 1])
    out.push(
      box({
        size: [0.03, 0.06, HEIGHT - 0.12],
        at: [fx, s * (WIDTH / 2 - 0.03), BOTTOM + 0.06],
        color: FRAME,
        strip: 'wood',
      }),
    );
  // Gabled hood: a shallow pitched roof on the capping, eaves over the face and the back.
  const z0 = TOP + 0.05;
  out.push(
    prism({
      plane: 'xz',
      depth: WIDTH + 0.3,
      profile: [
        [-0.13, z0],
        [0.27, z0],
        [0.27, z0 + 0.03],
        [0.07, z0 + 0.17],
        [-0.13, z0 + 0.03],
      ],
      color: HOOD,
      // Bitumen roofing felt: a dark granular finish.
      strip: 'asphalt',
    }),
  );
  // Fascia boards along both eaves, capping the felt's edge (LOD0).
  if (lod === 0)
    for (const x of [0.265, -0.125])
      out.push(
        box({
          size: [0.02, WIDTH + 0.32, 0.05],
          at: [x, 0, z0 - 0.015],
          color: FASCIA,
          strip: 'wood',
        }),
      );
  // Brackets under the front eave, over each post (LOD0/1: the hood reads on its own at LOD2).
  if (lod < 2)
    for (const s of [-1, 1])
      out.push(
        place(
          prism({
            plane: 'xz',
            depth: 0.04,
            profile: [
              [FACE_X + 0.03, TOP - 0.16],
              [0.26, z0],
              [FACE_X + 0.03, z0],
            ],
            color: FRAME,
            strip: 'wood',
          }),
          { at: [0, s * POST_Y, 0] },
        ),
      );
  return out;
}

/** Posts and the two back battens the board is bolted through. */
function frameworks(lod: Lod): Mesh[] {
  const out = [-POST_Y, POST_Y].map((y) =>
    box({
      size: [POST_W, POST_W, TOP + 0.05],
      at: [FACE_X - 0.05 - POST_W / 2, y, 0],
      color: POST,
      strip: 'wood',
    }),
  );
  // The battens hide behind the board: LOD2 drops them.
  if (lod < 2)
    for (const z of [BOTTOM + 0.25, TOP - 0.35])
      out.push(
        box({
          size: [0.03, WIDTH - 0.2, 0.09],
          at: [FACE_X - 0.05 - POST_W - 0.015, 0, z],
          color: FRAME,
          strip: 'wood',
        }),
      );
  return out;
}

export const type_specimen = defineAsset({
  name: 'type_specimen',
  kind: 'prop',
  description:
    'Type specimen notice board: every text() face (5x7 pixel, block, Hershey sans, serif, script, gothic) as flush painted decals and raised brass letters, under a gabled hood.',
  tags: ['text', 'typography', 'sign', 'demo', 'showcase'],
  license: 'CC0-1.0',
  budget: { triangles: [32000, 9000, 300] },
  build(ctx) {
    const lod = ctx.lod;
    // Damp and mud at the post feet, dust on the hood, chipped and sun-bleached frame edges.
    const worn = weather(
      ctx,
      { posts: merge(frameworks(lod)), joinery: merge(joinery(lod)) },
      {
        name: 'board_weather',
        seed: 7,
        age: 0.6,
        resolution: [0.6, 0, 0],
        sun: [0.8, -0.3, 1],
        under: hex('#a8865c'),
        effects: {
          chips: { where: 'convex-edges', amount: 0.25 },
          bleach: { where: 'up-facing', amount: 0.4, strength: 0.4 },
          moss: { where: 'shaded & wet & !down-facing', amount: 0.2 },
          mud: { where: 'ground-near', amount: 0.45 },
        },
      },
    );
    ctx.part('posts', worn.posts);
    const parts: Mesh[] = [worn.joinery, ...planks(lod), ...(lod < 2 ? faceWear() : [])];
    parts.push(
      box({
        size: [0.006, 0.02, 1.36],
        at: [FACE_X + 0.003, 0, BOTTOM + 0.12],
        color: BRASS,
        strip: POLISHED_BRASS,
      }),
    );
    if (lod < 2)
      // Carriage-bolt heads through the board into the posts, with square washers.
      for (const y of [-POST_Y, POST_Y])
        for (const z of [BOTTOM + 0.3, TOP - 0.3]) {
          parts.push(
            box({ size: [0.005, 0.06, 0.06], at: [FACE_X + 0.0025, y, z - 0.03], color: IRON }),
            cylinder({
              radius: 0.018,
              length: 0.012,
              segments: lod === 0 ? 8 : 4,
              color: IRON,
              strip: 'iron',
              at: [FACE_X + 0.009, y, z],
              axis: 'x',
            }),
          );
        }
    parts.push(
      ...line(
        'Type Specimen',
        {
          y: 0,
          z: TOP - 0.32,
          height: 0.16,
          font: 'serif',
          weight: 0.08,
          depth: DEPTH,
          color: BRASS,
          align: 'centre',
          maxWidth: 3,
        },
        lod,
      ),
    );
    const left = -WIDTH / 2 + 0.14;
    const right = 0.08;
    const head = { z: TOP - 0.47, height: 0.05, font: 'sans' as const, color: CREAM, depth: 0 };
    parts.push(...line('flat (depth 0)', { ...head, y: left }, lod));
    parts.push(...line('raised (depth 12 mm)', { ...head, y: right }, lod));
    ROWS.forEach(([font, sample], i) => {
      const z = TOP - 0.72 - i * 0.2;
      parts.push(
        ...line(sample, { y: left, z, height: CAP, font, depth: 0, color: CREAM }, lod),
        ...line(sample, { y: right, z, height: CAP, font, depth: DEPTH, color: BRASS }, lod),
      );
    });
    ctx.part('board', merge(parts));
  },
});
