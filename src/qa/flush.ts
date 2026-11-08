// Flush or proud? Where part A meets part B as seen from one side, how far does one stand in
// front of the other. Read off the same axis depth views the `gaps` gate uses: every pixel of A
// with a pixel of B within a few pixels across the boundary is a sample; the median depth step is
// the answer. A door leaf flush in its frame reads ~0; a leaf hung 6 cm proud reads 0.06.

import { boundsOf, type CompiledAsset, type Mesh, merge, worldMeshes } from '../core/index.ts';
import { depthView, VIEW_NAMES, viewName } from './depth-views.ts';
import { glob } from './inspect.ts';

export interface Flushness {
  /** Median |depth A − depth B| along the shared boundary, metres (0 = flush). */
  readonly step: number;
  /** Signed median (B − A): positive = A stands proud of (in front of) B. */
  readonly proud: number;
  /** Boundary pixels sampled (0 = A and B never meet seen from this side). */
  readonly samples: number;
  /** Side looked from: '+X', '-Y', … */
  readonly view: string;
}

export interface FlushOptions {
  /** Side to look from; default the side where A and B share the longest boundary. */
  readonly view?: (typeof VIEW_NAMES)[number];
  /** Metres per pixel; default 5 mm. */
  readonly px?: number;
  /** How far across a boundary to look for the other part, pixels; default 3. */
  readonly reach?: number;
}

/** Measure how flush the parts matching `a` sit with those matching `b` (globs allowed). */
export function flushness(
  asset: CompiledAsset,
  a: string,
  b: string,
  o: FlushOptions = {},
): Flushness {
  const world = worldMeshes(asset.parts);
  const pick = (sel: string): Mesh[] =>
    [...world].filter(([n]) => glob(sel).test(n)).map(([, m]) => m);
  const ma = pick(a);
  const mb = pick(b);
  const none: Flushness = { step: Infinity, proud: 0, samples: 0, view: o.view ?? '' };
  if (ma.length === 0 || mb.length === 0) return none;
  const meshes = [merge(ma), merge(mb)];
  const bounds = boundsOf(merge(meshes));
  const px = o.px ?? 0.005;
  const reach = o.reach ?? 3;
  let best = none;
  for (const name of o.view ? [o.view] : VIEW_NAMES) {
    const axis = 'XYZ'.indexOf(name[1] ?? 'X') as 0 | 1 | 2;
    const v = depthView(meshes, bounds, axis, name[0] === '+' ? 1 : -1, px);
    const steps: number[] = [];
    for (let y = 0; y < v.height; y++)
      for (let x = 0; x < v.width; x++) {
        const k = y * v.width + x;
        if (v.part[k] !== 0) continue;
        // Nearest B pixel along the four directions, within reach.
        let found = Infinity;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const)
          for (let r = 1; r <= reach && found === Infinity; r++) {
            const xx = x + dx * r;
            const yy = y + dy * r;
            if (xx < 0 || yy < 0 || xx >= v.width || yy >= v.height) break;
            const q = yy * v.width + xx;
            if (v.part[q] === 1) found = (v.depth[q] ?? 0) - (v.depth[k] ?? 0);
            else if (v.part[q] === 0) break;
          }
        if (found !== Infinity) steps.push(found);
      }
    if (steps.length <= best.samples) continue;
    const sorted = [...steps].sort((p, q) => p - q);
    const abs = steps.map(Math.abs).sort((p, q) => p - q);
    best = {
      step: abs[abs.length >> 1] ?? Infinity,
      proud: sorted[sorted.length >> 1] ?? 0,
      samples: steps.length,
      view: viewName(v),
    };
  }
  return best;
}
