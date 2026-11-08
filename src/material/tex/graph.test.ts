import { describe, expect, it } from 'bun:test';
import { Ts23dError } from '../../core/index.ts';
import { createCanvas } from '../paint/canvas.ts';
import { paintGraph, probeGraph } from './graph.ts';
import { type MaterialGraph, type TexField, tex } from './index.ts';
import { scales, strands } from './stamps-organic.ts';

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof Ts23dError) return `${e.code}: ${e.message} ${e.fix}`;
    throw e;
  }
  return 'no error';
};

const graph = (height: TexField, roughness: TexField | number = 0.8): MaterialGraph =>
  tex.material({ height, albedo: height, roughness });

describe('tex graphs: bad input', () => {
  it('rejects a graph that does not tile along U, naming the output and the fix', () => {
    const ramp = tex.fn((xm) => xm, 'rampU');
    const msg = code(() => probeGraph(graph(ramp.levels(0, 8)), 4, 0.5, 'test'));
    expect(msg).toContain('T3D_MATERIAL_INVALID');
    expect(msg).toContain('does not tile');
    expect(msg).toContain('ctx.tileU');
  });

  it('rejects roughness outside 0..1 and NaN outputs', () => {
    const n = tex.noise({ size: 0.1 });
    expect(code(() => probeGraph(graph(n, n.mul(3)), 4, 0.5, 'test'))).toContain('outside 0..1');
    const nan = tex.fn(() => Number.NaN);
    expect(code(() => probeGraph(graph(nan), 4, 0.5, 'test'))).toContain('NaN');
  });

  it('rejects a material() whose nodes are not texture nodes', () => {
    const bad = { height: 0.5, albedo: '#fff', roughness: 0.5 } as unknown as MaterialGraph;
    expect(code(() => tex.material(bad))).toContain('T3D_MATERIAL_INVALID');
  });
});

describe('tex graphs: output', () => {
  const nodes: Record<string, TexField> = {
    noise: tex.noise({ size: 0.1 }),
    ridged: tex.ridged({ size: 0.2, sizeV: 0.05 }),
    cells: tex.cells({ size: 0.1, out: 'edge' }),
    cellsId: tex.cells({ size: 0.1, out: 'id' }),
    bricks: tex.bricks({ width: 0.23, height: 0.075 }).height,
    planks: tex.planks({ width: 0.14, length: 1.2 }).height,
    pebbles: tex.pebbles({ size: 0.03, radius: 0.6, aspect: 1.5, rotate: true }).height,
    strata: tex.strata({ thickness: 0.1 }).height,
    scales: scales({ width: 0.1, height: 0.06 }).height,
    strands: strands({ width: 0.003, length: 0.2 }).height,
    warped: tex.noise({ size: 0.1 }).warp(tex.noise({ size: 0.4, seed: 2 }), 0.05),
    blurred: tex.cells({ size: 0.1 }).blur(0.01),
    wear: tex.edgeWear(tex.bricks({ width: 0.2, height: 0.1 }).height),
    tileableFn: tex.fn((xm, _ym, ctx) => 0.5 + 0.5 * Math.sin((2 * Math.PI * xm) / ctx.tileU)),
  };

  it('every generator, stamp and filter tiles along U and stays in range', () => {
    for (const [name, f] of Object.entries(nodes))
      expect(code(() => probeGraph(graph(f.clamp()), 4, 0.5, name))).toBe('no error');
  });

  it('is deterministic per seed and changes with the seed', () => {
    const g = graph(tex.pebbles({ size: 0.03 }).height.add(tex.noise({ size: 0.2 }).mul(0.3)));
    const paint = (seed: number): Float32Array => {
      const c = createCanvas(256, 16, 1, 0.25, true);
      paintGraph(c, g, seed);
      return c.height;
    };
    expect([...paint(7)]).toEqual([...paint(7)]);
    expect([...paint(7)]).not.toEqual([...paint(8)]);
  });

  it('writes colour ramps as linear albedo and height in metres', () => {
    const h = tex.noise({ size: 0.1 });
    const c = createCanvas(64, 8, 1, 0.25, true);
    paintGraph(
      c,
      {
        height: h,
        depth: 0.01,
        albedo: h.ramp([
          [0, '#000000'],
          [1, '#ffffff'],
        ]),
        roughness: 0.4,
      },
      1,
    );
    expect(c.linear?.length).toBe(64 * 8 * 3);
    expect(Math.max(...c.height)).toBeLessThanOrEqual(0.01);
    expect(c.rough[5]).toBeCloseTo(0.4);
  });
});
