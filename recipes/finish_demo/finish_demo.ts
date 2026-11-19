// Finish demo: a EUR pallet carrying a battened crate and an oak cask — code-built props with their
// own use wear (scuffed, dirty pallet deck; chipped crate battens; wine weeping from the cask bung),
// which the AI finish layer (`t3d finish`, docs/idea/22-ai-finish.md) then weathers further WITHOUT
// touching their structure. The finish runs after the recipe:
//   bun run t3d finish recipes/finish_demo/finish_demo.ts --model mock --prompt "soot, rust, worn"
// Origin = pallet base centre; pallet long side along X. Numbers: ./README.md.

import { box, defineAsset, hex, type Mesh, merge, weather } from '@developerz.ai/ts23d';
import { bungAt, caskMesh, crateMesh } from './props.ts';

const PINE = hex('#b08a5a');
const BLOCK = hex('#9a7a50');

// EUR pallet (EN 13698-1): 1200 × 800 × 144 mm; boards 22 mm, blocks 78 mm.
const L = 1.2;
const W = 0.8;
const BOARD = 0.022;
const BLOCK_H = 0.078;
const TOP = 2 * BOARD + BLOCK_H + BOARD; // 0.144

const CRATE: readonly [number, number, number] = [0.55, 0.75, 0.6];
const CASK_H = 0.8;
const CASK_R = 0.24; // head
const CASK_RB = 0.285; // bilge

const ROWS = [-(W - 0.1) / 2, 0, (W - 0.1) / 2];
const ROW_W = [0.1, 0.145, 0.1];
const BLOCK_X = [-(L - 0.145) / 2, 0, (L - 0.145) / 2];
const DECK = [
  [-(W - 0.145) / 2, 0.145],
  [-0.19, 0.1],
  [0, 0.145],
  [0.19, 0.1],
  [(W - 0.145) / 2, 0.145],
] as const;

/** EUR pallet. LOD2 keeps the nine blocks, so both fork openings still show daylight. */
function pallet(lod: 0 | 1 | 2): Mesh {
  const bev = lod === 0 ? 0.003 : 0;
  const parts: Mesh[] = [];
  if (lod === 2) {
    // Deck as one slab, the nine blocks and the three bottom boards: the gaps survive.
    parts.push(box({ size: [L, W, BOARD], at: [0, 0, TOP - BOARD], color: PINE, strip: 'pine' }));
    ROWS.forEach((y, i) => {
      const w = ROW_W[i] ?? 0.1;
      parts.push(
        box({ size: [L, w, BOARD], at: [0, y, 0], color: PINE, strip: 'pine', omit: ['bottom'] }),
      );
      for (const x of BLOCK_X)
        parts.push(
          box({
            size: [0.145, w, BLOCK_H + BOARD],
            at: [x, y, BOARD],
            color: BLOCK,
            strip: 'pine',
            omit: ['bottom', 'top'],
          }),
        );
    });
    return merge(parts);
  }
  const plank = (size: [number, number, number], at: [number, number, number]): Mesh =>
    box({ size, at, color: PINE, strip: 'pine', bevel: bev });
  // Bottom boards (3, along X), blocks (3 × 3), stringer boards (3, along X), top deck (5, along X).
  ROWS.forEach((y, i) => {
    const w = ROW_W[i] ?? 0.1;
    parts.push(plank([L, w, BOARD], [0, y, 0]));
    for (const x of BLOCK_X)
      parts.push(
        box({
          size: [0.145, w, BLOCK_H],
          at: [x, y, BOARD],
          color: BLOCK,
          strip: 'pine',
          bevel: bev,
        }),
      );
    parts.push(plank([L, w, BOARD], [0, y, BOARD + BLOCK_H]));
  });
  for (const [y, w] of DECK) parts.push(plank([L, w, BOARD], [0, y, TOP - BOARD]));
  return merge(parts);
}

export const finish_demo = defineAsset({
  name: 'finish_demo',
  kind: 'prop',
  description:
    'A EUR pallet with a battened pine crate and an oak cask: code-built props with their own use wear, for the AI finish layer (t3d finish) to weather further',
  sources: [
    'https://en.wikipedia.org/wiki/EUR-pallet',
    'https://en.wikipedia.org/wiki/Barrel#Wine_barrels',
  ],
  real: {
    length: L,
    width: W,
    height: TOP + CASK_H,
    measures: [
      { label: 'pallet length', value: L, axis: 'x', parts: ['pallet'], source: 'EN 13698-1' },
      { label: 'pallet width', value: W, axis: 'y', parts: ['pallet'], source: 'EN 13698-1' },
      { label: 'pallet height', value: TOP, axis: 'z', parts: ['pallet'], source: 'EN 13698-1' },
    ],
  },
  gaps: [
    { parts: ['crate', 'cask'], why: 'two separate props standing side by side on the pallet' },
  ],
  tags: ['demo', 'finish', 'prop'],
  budget: { triangles: [5000, 1500, 300] },
  build(ctx) {
    const lod = ctx.lod;
    // Forklift and boot traffic: the deck is scuffed and dusty, the blocks muddy, edges chipped.
    const p = weather(
      ctx,
      { pallet: pallet(lod) },
      {
        name: 'pallet_wear',
        seed: 5,
        age: 0.6,
        resolution: [0, 0, 0],
        under: hex('#d8c3a0'),
        effects: {
          chips: { where: 'convex-edges', amount: 0.25 },
          mud: { where: 'ground-near & side-facing', amount: 0.4 },
          dust: { where: 'up-facing', amount: 0.3 },
        },
      },
    );
    ctx.part('pallet', p.pallet ?? pallet(lod));
    // The crate's battens are chipped and its lid dusty from storage.
    const c = weather(
      ctx,
      { crate: crateMesh(lod, CRATE) },
      {
        name: 'crate_wear',
        seed: 9,
        age: 0.5,
        resolution: [0, 0, 0],
        under: hex('#b08656'),
        effects: {
          chips: { where: 'convex-edges', amount: 0.25 },
          dust: { where: 'up-facing', amount: 0.4 },
          mud: { where: 'ground-near & side-facing', amount: 0.25 },
        },
      },
    );
    ctx.part('crate', c.crate ?? crateMesh(lod, CRATE), { at: [-0.31, 0, TOP] });
    // Wine weeps from the bung and runs down the staves; dust on the head, damp at the foot.
    const k = weather(
      ctx,
      { cask: caskMesh(lod, CASK_H, CASK_R, CASK_RB, ctx.rng.fork('staves')) },
      {
        name: 'cask_wear',
        seed: 13,
        age: 0.6,
        resolution: [0, 0, 0],
        fasteners: [{ at: bungAt(CASK_H, CASK_RB), radius: 0.03 }],
        effects: {
          // The stain needs the bung's vertices: LOD2 has no bung, so no stain there.
          ...(lod < 2
            ? {
                rust: {
                  where: 'below-fasteners | fasteners',
                  amount: 0.5,
                  streaks: true,
                  streakLength: 0.35,
                  color: [0.12, 0.02, 0.03] as const,
                  strength: 0.75,
                },
              }
            : {}),
          dust: { where: 'up-facing', amount: 0.4 },
          mud: { where: 'ground-near', amount: 0.3 },
        },
      },
    );
    ctx.part('cask', k.cask ?? caskMesh(lod, CASK_H, CASK_R, CASK_RB, ctx.rng.fork('staves')), {
      at: [0.3, 0, TOP],
    });
  },
});
