import { describe, expect, it } from 'bun:test';
import { CREATURE_MATERIALS } from './creature.ts';
import type { MaterialDef } from './material-def.ts';
import { createCanvas } from './paint/canvas.ts';
import { paintGraph } from './tex/graph.ts';

/** Mean linear albedo of a creature material's graph on a small tile. */
function meanAlbedo(d: MaterialDef): [number, number, number] {
  const c = createCanvas(64, 32, 0.5, 0.25, true);
  const m: [number, number, number] = [0, 0, 0];
  if (d.graph) paintGraph(c, d.graph, 1);
  const lin = c.linear;
  if (!lin) return m;
  for (let i = 0; i < lin.length; i += 3)
    for (let k = 0; k < 3; k++) m[k as 0 | 1 | 2] += (lin[i + k] ?? 0) / (lin.length / 3);
  return m;
}

/** Spread of the channels ÷ their mean: 0 = grey, the hue a strip adds to any vertex colour. */
const chroma = (c: readonly [number, number, number]): number =>
  (Math.max(...c) - Math.min(...c)) / ((c[0] + c[1] + c[2]) / 3 || 1);

describe('creature materials (D24: tinted coats)', () => {
  it('the brown `fur` strip tints any coat: it fails the neutral test', () => {
    expect(chroma(meanAlbedo(CREATURE_MATERIALS.fur))).toBeGreaterThan(0.3);
  });

  it('`fur_neutral` is grey and bright, so the vertex colour carries the coat', () => {
    const m = meanAlbedo(CREATURE_MATERIALS.fur_neutral);
    expect(chroma(m)).toBeLessThan(0.02);
    expect(Math.min(...m)).toBeGreaterThan(0.45);
    expect(CREATURE_MATERIALS.fur.id).toBe('fur');
  });
});
