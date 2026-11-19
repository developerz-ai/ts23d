// The far LOD's garment colour helpers: one colour per triangle (no mixed garment triangles), the
// colour of the garment on top along the normal (not the nearer hollow shell), and an even dust
// tint on what faces up only. Failure first: a mixed triangle and a buried-shell pick.

import { describe, expect, it } from 'bun:test';
import { box, type Mesh, sculpt, type Vec3 } from '@developerz.ai/ts23d';
import { faceBlocks, type GarmentLayer, outermostColours, settled } from './layers.ts';

const colourAt = (m: Mesh, i: number): Vec3 => [
  m.colors[i * 3] ?? 0,
  m.colors[i * 3 + 1] ?? 0,
  m.colors[i * 3 + 2] ?? 0,
];

describe('faceBlocks', () => {
  it('gives every triangle one of its own vertex colours, the same at all three corners', () => {
    const m = box({ size: [1, 1, 1], color: [1, 1, 1] });
    const colors = new Float32Array(m.colors);
    // Paint one corner of every triangle red: the medoid is the white the other two share.
    for (let t = 0; t < m.indices.length; t += 3) colors.set([1, 0, 0], (m.indices[t] ?? 0) * 3);
    const out = faceBlocks({ ...m, colors });
    expect(out.indices.length).toBe(m.indices.length);
    for (let t = 0; t < out.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => colourAt(out, out.indices[t + k] ?? 0));
      expect(a).toEqual(b as Vec3);
      expect(b).toEqual(c as Vec3);
    }
  });
});

describe('outermostColours', () => {
  /** A hollow spherical shell of radius r, `t` thick, in `color`. */
  const shell = (name: string, r: number, color: Vec3): GarmentLayer => ({
    name,
    strip: 'plain',
    color,
    cell: [0.01, 0.01, 0.01],
    part: 'clothes',
    edits: [
      {
        field: (p) => Math.abs(Math.hypot(p[0], p[1], p[2]) - r) - 0.002,
        bounds: [
          [-0.2, -0.2, -0.2],
          [0.2, 0.2, 0.2],
        ],
        color,
      },
    ],
  });
  it('takes the shell on top, even where the surface vertex lies nearer the inner one', () => {
    const inner = shell('shirt', 0.1, [1, 1, 1]);
    const outer = shell('vest', 0.106, [0.3, 0.15, 0.05]);
    // A coarse far surface sitting just over the inner shell, below the outer one.
    const far = sculpt({
      edits: [{ shape: 'sphere', at: [0, 0, 0], size: 0.101 }],
      resolution: 0.02,
      color: [0, 0, 0],
    });
    const out = outermostColours(far, [inner, outer]);
    for (let i = 0; i < out.positions.length / 3; i++)
      expect(colourAt(out, i)[0]).toBeCloseTo(0.3, 3);
  });
});

describe('settled', () => {
  it('dusts what faces up and leaves what faces down', () => {
    const m = box({ size: [1, 1, 1], color: [0.2, 0.2, 0.2] });
    const out = settled(m, [0.6, 0.5, 0.4], 0.5);
    for (let i = 0; i < m.positions.length / 3; i++) {
      const nz = m.normals[i * 3 + 2] ?? 0;
      const r = colourAt(out, i)[0];
      if (nz > 0.9) expect(r).toBeCloseTo(0.4, 5);
      if (nz < 0.1) expect(r).toBeCloseTo(0.2, 5);
    }
  });
});
