// Type specimen: a free-standing notice board that shows every `text()` face, each row set twice,
// as flush painted decals (left column, cream) and as raised cast letters (right column, brass).
// Faces: the built-in 5 × 7 pixel font ('5x7', 'block') and the Hershey stroke fonts ('sans',
// 'serif', 'script', 'gothic'). Lettering resolution is LOD-gated via `segments`; LOD2 keeps the
// title and the raised column, flush. Board faces +X, reads along +Y.

import {
  box,
  defineAsset,
  hex,
  type Lod,
  type Mesh,
  merge,
  type TextFont,
  text,
} from '@developerz.ai/ts23d';

const GREEN = hex('#1d3a2f');
const FRAME = hex('#2a2622');
const POST = hex('#4a3a2a');
const CREAM = hex('#ece4cc');
const BRASS = hex('#b8913f');

const FACE_X = 0.1; // board front face
const BOTTOM = 0.8;
const HEIGHT = 1.9;
const WIDTH = 3.2;
const CAP = 0.1; // specimen cap height
const DEPTH = 0.012; // raised letters
const SEGMENTS: Readonly<Record<Lod, number>> = { 0: 3, 1: 2, 2: 1 };

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
  readonly color: readonly [number, number, number];
  readonly align?: 'left' | 'centre';
  readonly weight?: number;
}

function line(str: string, l: Line, lod: Lod): Mesh {
  return text(str, {
    origin: [FACE_X, l.y, l.z],
    height: l.height,
    color: [l.color[0], l.color[1], l.color[2]],
    font: l.font,
    // LOD2 sees 12 mm of relief as a few pixels: the raised letters become flush brass decals.
    depth: lod === 2 ? 0 : l.depth,
    align: l.align ?? 'left',
    maxWidth: 1.36,
    segments: SEGMENTS[lod],
    strip: l.depth > 0 ? 'brass' : 'plain',
    ...(l.weight === undefined ? {} : { weight: l.weight }),
  });
}

/** Board, frame moulding, capping and the brass divider; lettering is added by the caller. */
function board(): Mesh[] {
  const top = BOTTOM + HEIGHT;
  const fx = FACE_X + 0.015;
  return [
    box({
      size: [0.05, WIDTH, HEIGHT],
      at: [0.075, 0, BOTTOM],
      color: GREEN,
      strip: 'wood_painted',
    }),
    box({ size: [0.03, WIDTH, 0.06], at: [fx, 0, BOTTOM], color: FRAME, strip: 'wood' }),
    box({ size: [0.03, WIDTH, 0.06], at: [fx, 0, top - 0.06], color: FRAME, strip: 'wood' }),
    box({
      size: [0.03, 0.06, HEIGHT - 0.12],
      at: [fx, -WIDTH / 2 + 0.03, BOTTOM + 0.06],
      color: FRAME,
      strip: 'wood',
    }),
    box({
      size: [0.03, 0.06, HEIGHT - 0.12],
      at: [fx, WIDTH / 2 - 0.03, BOTTOM + 0.06],
      color: FRAME,
      strip: 'wood',
    }),
    box({ size: [0.17, WIDTH + 0.1, 0.05], at: [0.05, 0, top], color: FRAME, strip: 'wood' }),
    box({
      size: [0.006, 0.02, 1.36],
      at: [FACE_X + 0.003, 0, BOTTOM + 0.12],
      color: BRASS,
      strip: 'brass',
    }),
  ];
}

export const type_specimen = defineAsset({
  name: 'type_specimen',
  kind: 'prop',
  description:
    'Type specimen notice board: every text() face (5x7 pixel, block, Hershey sans, serif, script, gothic) as flush painted decals and raised brass letters.',
  tags: ['text', 'typography', 'sign', 'demo', 'showcase'],
  license: 'CC0-1.0',
  budget: { triangles: [45000, 30000, 6000] },
  build(ctx) {
    const lod = ctx.lod;
    ctx.part(
      'posts',
      merge(
        [-1.35, 1.35].map((y) =>
          box({ size: [0.1, 0.1, BOTTOM + HEIGHT], at: [0, y, 0], color: POST, strip: 'wood' }),
        ),
      ),
    );
    const parts = board();
    const top = BOTTOM + HEIGHT;
    parts.push(
      text('Type Specimen', {
        origin: [FACE_X, 0, top - 0.32],
        height: 0.16,
        color: [BRASS[0], BRASS[1], BRASS[2]],
        font: 'serif',
        weight: 0.08,
        depth: lod === 2 ? 0 : DEPTH,
        align: 'centre',
        segments: SEGMENTS[lod],
        strip: 'brass',
      }),
    );
    const left = -WIDTH / 2 + 0.14;
    const right = 0.08;
    if (lod < 2) {
      const head = { z: top - 0.47, height: 0.05, font: 'sans' as const, color: CREAM };
      parts.push(line('flat (depth 0)', { ...head, y: left, depth: 0 }, lod));
      parts.push(line('raised (depth 12 mm)', { ...head, y: right, depth: 0 }, lod));
    }
    ROWS.forEach(([font, sample], i) => {
      const z = top - 0.72 - i * 0.2;
      if (lod < 2)
        parts.push(line(sample, { y: left, z, height: CAP, font, depth: 0, color: CREAM }, lod));
      parts.push(line(sample, { y: right, z, height: CAP, font, depth: DEPTH, color: BRASS }, lod));
    });
    ctx.part('board', merge(parts));
  },
});
