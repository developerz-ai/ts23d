// Finish demo: a EUR pallet carrying a kit crate and an oak cask — plain code-built props that the
// AI finish layer (`t3d finish`, docs/idea/22-ai-finish.md) weathers WITHOUT touching their
// structure. The recipe is ordinary; the finish runs after it:
//   bun run t3d finish recipes/finish_demo/finish_demo.ts --model mock --prompt "soot, rust, worn"
// Origin = pallet base centre; pallet long side along X. Numbers: ./README.md.

import { box, defineAsset, hex, type Mesh, merge } from '@developerz.ai/ts23d';
import { barrel, crate } from '../_parts/index.ts';

const PINE = hex('#b08a5a');
const BLOCK = hex('#9a7a50');

// EUR pallet (EN 13698-1): 1200 × 800 × 144 mm; boards 22 mm, blocks 78 mm.
const L = 1.2;
const W = 0.8;
const BOARD = 0.022;
const BLOCK_H = 0.078;
const TOP = 2 * BOARD + BLOCK_H + BOARD; // 0.144

function pallet(lod: 0 | 1 | 2): Mesh {
  if (lod === 2) return box({ size: [L, W, TOP], color: PINE, strip: 'pine' });
  const bev = lod === 0 ? 0.003 : 0;
  const plank = (size: [number, number, number], at: [number, number, number]): Mesh =>
    box({ size, at, color: PINE, strip: 'pine', bevel: bev });
  const parts: Mesh[] = [];
  // Bottom boards (3, along X), blocks (3 × 3), stringer boards (3, along X), top deck (5, along X).
  const rows = [-(W - 0.1) / 2, 0, (W - 0.1) / 2];
  const rowW = [0.1, 0.145, 0.1];
  rows.forEach((y, i) => {
    const w = rowW[i] ?? 0.1;
    parts.push(plank([L, w, BOARD], [0, y, 0]));
    for (const x of [-(L - 0.145) / 2, 0, (L - 0.145) / 2])
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
  // Top deck: 5 boards across the stringers, outer ones wider (145 / 100 / 145 mm).
  const deck = [
    [-(W - 0.145) / 2, 0.145],
    [-0.19, 0.1],
    [0, 0.145],
    [0.19, 0.1],
    [(W - 0.145) / 2, 0.145],
  ] as const;
  for (const [y, w] of deck) parts.push(plank([L, w, BOARD], [0, y, TOP - BOARD]));
  return merge(parts);
}

export const finish_demo = defineAsset({
  name: 'finish_demo',
  kind: 'prop',
  description:
    'A EUR pallet with a wooden crate and an oak cask: plain code-built props for the AI finish layer (t3d finish) to weather',
  sources: [
    'https://en.wikipedia.org/wiki/EUR-pallet',
    'https://en.wikipedia.org/wiki/Barrel#Wine_barrels',
  ],
  real: {
    length: L,
    width: W,
    height: TOP + 0.8,
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
  budget: { triangles: [12000, 4000, 1200] },
  build(ctx) {
    ctx.part('pallet', pallet(ctx.lod));
    crate(ctx, 'crate', { size: [0.55, 0.75, 0.6] }, { at: [-0.31, 0, TOP] });
    barrel(ctx, 'cask', { style: 'wood', height: 0.8, diameter: 0.48 }, { at: [0.3, 0, TOP] });
  },
});
