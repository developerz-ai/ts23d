import { describe, expect, it } from 'bun:test';
import { boundsOf, type Mesh, Ts23dError, triangleCount } from '../core/index.ts';
import { windingFlips } from './closed.ts';
import { measureText, type TextOptions, text, VECTOR_FONTS } from './text.ts';

const C = [1, 1, 1] as const;
const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};
const sign = (s: string, o: Partial<TextOptions> = {}): Mesh =>
  text(s, { origin: [0, 0, 0], height: 0.42, color: C, font: 'sans', ...o });

describe('text, vector fonts', () => {
  it('refuses bad weight, segments, cap, font and non-ASCII with a fix', () => {
    const e = fails(() => sign('ЗА РОДИНУ'));
    expect(e.code).toBe('T3D_RECIPE_INVALID');
    expect(e.message).toContain('U+0417');
    expect(e.fix).toContain("'5x7'");
    expect(fails(() => measureText('é', { height: 1, font: 'serif' })).fix).toContain('ASCII');
    expect(fails(() => sign('A', { weight: 0 })).fix).toContain('fraction of the cap height');
    expect(fails(() => sign('A', { weight: 0.5 })).code).toBe('T3D_RECIPE_INVALID');
    expect(fails(() => sign('A', { segments: 0 })).fix).toContain('1 to 8');
    expect(fails(() => sign('A', { segments: 1.5 })).code).toBe('T3D_RECIPE_INVALID');
    expect(fails(() => sign('A', { cap: 'butt' as 'round' })).fix).toContain("'square'");
    expect(fails(() => sign('A', { font: 'comic' as 'sans' })).fix).toContain("'gothic'");
  });

  it('bounds: ink edge to ink edge = measureText; cap height + half a stroke; align; 2 mm lift', () => {
    const w = measureText('Halt 8', { height: 0.42, font: 'sans' });
    const b = boundsOf(sign('Halt 8'));
    const h = (0.12 * 0.42) / 2;
    // measureText reads the raw strokes; the smoothed curve may bulge out by < 1 % of the height.
    expect(b.min[1]).toBeCloseTo(0, 3);
    expect(Math.abs(b.max[1] - w)).toBeLessThan(0.01 * 0.42);
    expect(Math.abs(b.max[2] - (0.42 + h))).toBeLessThan(0.01 * 0.42);
    expect(Math.abs(b.min[2] + h)).toBeLessThan(0.01 * 0.42);
    expect(b.max[0]).toBeCloseTo(0.002, 6);
    expect(boundsOf(sign('Halt 8', { align: 'centre' })).min[1]).toBeCloseTo(-w / 2, 3);
    expect(Math.abs(boundsOf(sign('Halt 8', { align: 'right' })).max[1])).toBeLessThan(0.005);
    const fit = boundsOf(sign('Halt 8', { maxWidth: 0.5 }));
    expect(Math.abs(fit.max[1] - fit.min[1] - 0.5)).toBeLessThan(0.005);
    expect(boundsOf(sign('Halt 8', { depth: 0.01 })).max[0]).toBeCloseTo(0.01, 6);
    // Descenders go below the baseline.
    expect(boundsOf(sign('g')).min[2]).toBeLessThan(-0.1);
  });

  it('triangles = 2 per ribbon quad + steps per fan; caps = segments + 1 steps, joins twice that', () => {
    // 'I' = one straight stroke: 1 quad + 2 round caps of segments + 1 steps.
    for (const s of [1, 2, 3])
      expect(triangleCount(sign('I', { segments: s }))).toBe(2 + 2 * (s + 1));
    // 'L' = two straight strokes; '<' = one stroke with a sharp turn: 2 quads + 2 caps + 1 disc.
    expect(triangleCount(sign('L', { segments: 2 }))).toBe(2 * (2 + 2 * 3));
    expect(triangleCount(sign('<', { segments: 2 }))).toBe(2 * 2 + 2 * 3 + 6);
    // Square: 3-triangle caps, 1-triangle bevels, independent of segments.
    expect(triangleCount(sign('I', { cap: 'square', segments: 3 }))).toBe(2 + 3 + 3);
    expect(triangleCount(sign('<', { cap: 'square' }))).toBe(2 * 2 + 3 + 3 + 1);
    // Raised adds one wall quad per outline edge: 'I' at segments 1 = 2 sides + 2 · 2 cap edges.
    expect(triangleCount(sign('I', { segments: 1, depth: 0.01 }))).toBe(6 + 2 * 6);
    // Curves gain points with segments; straight stems do not.
    const t = [1, 2, 3].map((s) => triangleCount(sign('OSCAR', { segments: s })));
    expect(t[0] ?? 0).toBeLessThan(t[1] ?? 0);
    expect(t[1] ?? 0).toBeLessThan(t[2] ?? 0);
  });

  it('faces along × up, raised strokes wound outward, walls perpendicular to the face', () => {
    for (const font of VECTOR_FONTS) {
      const flat = sign('Rg&@', { font });
      for (let i = 0; i < flat.normals.length; i += 3) expect(flat.normals[i]).toBeCloseTo(1, 9);
      const m = sign('Rg&@', { font, depth: 0.02, cap: font === 'gothic' ? 'square' : 'round' });
      expect(windingFlips(m)).toBe(0);
      expect(windingFlips(flat)).toBe(0);
      for (let i = 0; i < m.normals.length; i += 3) {
        const nx = m.normals[i] ?? 0;
        expect(Math.abs(nx) < 1e-9 || Math.abs(nx - 1) < 1e-9).toBe(true);
      }
    }
  });

  it('kerns loose pairs from the glyph shapes, leaves straight pairs and script alone', () => {
    const m = (s: string, kerning: boolean, font: 'sans' | 'script' = 'sans'): number =>
      measureText(s, { height: 1, font, kerning });
    // One font unit = 1/21 of the cap height.
    expect(m('To', true)).toBeLessThan(m('To', false) - 1.5 / 21);
    expect(m('LT', true)).toBeLessThan(m('LT', false) - 1.5 / 21);
    expect(m('AV', true)).toBeLessThan(m('AV', false));
    expect(m('HH', true)).toBeCloseTo(m('HH', false), 9);
    expect(m('AV', true, 'script')).toBeCloseTo(m('AV', false, 'script'), 9);
    // Word space: 9 font units, not Hershey's 16 (which opens a cap-height gap between words).
    expect(m('H H', true) - m('HH', true)).toBeCloseTo(9 / 21, 9);
    // Tracking is in 5 × 7 pixels (height / 7) for every font.
    expect(measureText('HH', { height: 0.7, font: 'sans', tracking: 1 })).toBeCloseTo(
      measureText('HH', { height: 0.7, font: 'sans' }) + 0.1,
      9,
    );
  });

  it('follows a stepped surface: strokes over a post sit on the post', () => {
    const surface = (u: number): number => (u > 0.1 && u < 0.2 ? 0.05 : 0);
    const m = sign('HHHH', { surface, depth: 0.01 });
    for (let i = 0; i < m.positions.length; i += 3) {
      const u = m.positions[i + 1] ?? 0;
      if (u > 0.1 && u < 0.2) expect(m.positions[i] ?? 0).toBeGreaterThanOrEqual(0.05 - 1e-9);
    }
    expect(boundsOf(m).max[0]).toBeCloseTo(0.06, 6);
  });

  it('is deterministic', () => {
    expect(sign('Type Specimen 1886', { font: 'serif', depth: 0.01 })).toEqual(
      sign('Type Specimen 1886', { font: 'serif', depth: 0.01 }),
    );
  });
});
