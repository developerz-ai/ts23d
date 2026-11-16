import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, defineStyle, type Vec3 } from '../core/index.ts';
import { hex } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { coherence, coherenceFindings, robustZ, styleMetrics } from './coherence.ts';
import { ciede2000, labOfLinear } from './coherence-colour.ts';

const style = defineStyle({
  name: 'kit',
  palette: { stone: '#8a8178', moss: '#4f6b3a', wood: '#6b4a2e' },
});

const crate = (name: string, color: Vec3, bevel = 0.02) =>
  compile(
    defineAsset({
      name,
      kind: 'prop',
      budget: { triangles: [5000, 1500, 300] },
      build(ctx) {
        ctx.part('body', box({ size: [1, 1, 1], at: [0, 0, 0], color, bevel }));
      },
    }),
    { lod: 0 },
  );

const SET = [
  crate('a', hex('#8a8178')),
  crate('b', hex('#4f6b3a')),
  crate('c', hex('#6b4a2e')),
  crate('d', hex('#7f776f')),
];

describe('coherence', () => {
  it('flags an off-palette asset in the set (hot pink among stone, moss and wood)', () => {
    const f = coherence(style, [...SET, crate('pink', hex('#ff3fb4'))]);
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.code === 'T3D_STYLE_OUTLIER' && x.part === 'pink')).toBe(true);
    expect(f[0]?.message).toContain('#ff3fb4');
  });

  it('passes a set built from its palette, shade ramps included', () => {
    expect(coherence(style, SET)).toEqual([]);
    const shade = hex('#8a8178').map((c) => c * 0.6) as unknown as Vec3;
    expect(styleMetrics(crate('s', shade), style).palette).toBe(1);
  });

  it('robust z names the odd one out on a metric the bible is silent about', () => {
    const ms = SET.map((a) => styleMetrics(a, style));
    const odd = {
      ...styleMetrics(crate('flat', hex('#8a8178'), 0), style),
      name: 'flat',
      texelDensity: 9000,
    };
    const f = coherenceFindings(style, [...ms, odd]);
    expect(f.map((x) => x.part)).toEqual(['flat']);
    expect(f[0]?.message).toMatch(/texelDensity .*robust z/);
    expect(robustZ([1, 1, 1, 1, 5], 0.1).map((z) => Math.round(z))).toEqual([0, 0, 0, 0, 27]);
  });

  it('checks the declared ranges: wear and value key', () => {
    const strict = defineStyle({
      ...style,
      wear: [0.2, 0.4],
      valueKey: { mean: 0.9, spread: 0.05 },
    });
    const f = coherenceFindings(strict, [styleMetrics(SET[0] ?? crate('x', [0, 0, 0]), strict)]);
    expect(f.map((x) => /wear|value mean/.exec(x.message)?.[0])).toEqual(['wear', 'value mean']);
  });

  it('measures bevels as chamfer width and CIEDE2000 matches the published test pair', () => {
    const m = styleMetrics(crate('bev', hex('#8a8178'), 0.03), style);
    expect(m.bevel).toBeGreaterThan(0.005);
    expect(m.bevel).toBeLessThan(0.05);
    expect(styleMetrics(crate('sharp', hex('#8a8178'), 0), style).bevel).toBe(0);
    // Sharma, Wu & Dalal 2005, table 1, pair 1: ΔE00 = 2.0425.
    expect(ciede2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
    expect(ciede2000(labOfLinear([1, 1, 1]), [100, 0, 0])).toBeLessThan(0.05);
  });
});
