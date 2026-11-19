// The ranger's Blender program (task `blender`, examples/blender/README.md): the rigged 280 k
// triangle model → a game mesh. `clean` → `retopo` to a closed shell with more triangles kept on
// the head and hands → fresh UVs → bake of the model's own colour, relief, AO and roughness →
// `bind from: 'source'` (the model's 24-bone rig, weights transferred, its clips kept) → the
// wear and the roughness contrast painted into the maps (wear.ts) → two decimated LODs → one GLB. Coordinates are in the asset frame (metres, Z up, +X front): a
// rigged source cannot take a `transform`, so they are where the hosted rig stands the figure
// (feet on z = 0, 1.78 m, a-pose). Every number here is in the cache key.

import type { BlenderStep } from '@developerz.ai/ts23d';
import { paintStep } from '../bear_hybrid/paint.ts';
import { rangerPaint } from './wear.ts';

/** LOD triangles asked of Blender: budget.triangles (ranger.ts), the playbook's model-tier band
 *  (30 000 / 10 000 / 6 000). It was 39 000 / 11 800: over the band at LOD 0 and 1. */
export const TRIANGLES = [30000, 10000, 3900] as const;

/** Where the model's detail is read first: the face, then the hands, where this sample's rig
 *  stands them (a re-rolled mesh needs these re-read from `t3d blender review`). The hands take
 *  × 5, up from × 3: at 30 000 triangles the fingers need the share the body gave up. */
const HEAD = { at: [0.03, 0, 1.64], r: 0.13, weight: 4 } as const;
const HANDS = ([1, -1] as const).map(
  (s) => ({ at: [0.16, s * 0.5, 0.9], r: 0.13, weight: 5 }) as const,
);

export const STEPS: readonly BlenderStep[] = [
  { op: 'clean' },
  { op: 'retopo', triangles: TRIANGLES[0], focus: [HEAD, ...HANDS] },
  { op: 'uv', kind: 'smart' },
  // The default cage (2 % of the diagonal = 42 mm) is wider than the gap between two fingers or
  // between a hand and the coat hem: rays started there hit the neighbour first and bake its
  // dark side onto the hand (black speckles). The shell sits within a voxel (6 mm) of the model.
  {
    op: 'bake',
    size: 2048,
    maps: ['albedo', 'normal', 'ao', 'roughness'],
    cage: 0.012,
    maxRay: 0.03,
  },
  { op: 'bind', from: 'source' },
  paintStep(
    rangerPaint(),
    'boots and hem were clean and wool shone like leather: mud, dust, strap scuffs, rubbed elbows and the roughness contrast go into the maps (a textured part takes no grime pass)',
  ),
  { op: 'lods', triangles: [TRIANGLES[1], TRIANGLES[2]], focus: [HEAD] },
  { op: 'export', normalSize: 1024, ormSize: 1024 },
];
