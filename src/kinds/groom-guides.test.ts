import { describe, expect, test } from 'bun:test';
import { createRng, dmath, type Vec3 } from '../core/index.ts';
import { readGlb, scenePrimitives } from '../neural/index.ts';
import { groomJson, scalpGlb, scalpGuides } from './groom-guides.ts';

// A 10 cm ball head, hair on its upper half, combed back (-X).
const R = 0.1;
const ball = (p: Vec3): number => dmath.norm(p) - R;
const opts = () => ({
  field: ball,
  bounds: [
    [-0.12, -0.12, -0.12],
    [0.12, 0.12, 0.12],
  ] as const satisfies readonly [Vec3, Vec3],
  cell: 0.008,
  comb: (): Vec3 => [-1, 0, -0.3],
  layer: { region: (p: Vec3) => 0.02 - p[2], density: 4000, length: 0.06 },
  segments: 6,
  rng: createRng(5),
});

describe('scalpGuides', () => {
  test('no hair region → no guides (failure first)', () => {
    const g = scalpGuides({ ...opts(), layer: { ...opts().layer, region: () => 1 } });
    expect(g.guides).toHaveLength(0);
    expect(g.area).toBe(0);
  });
  test('guides root on the scalp inside the region, segments + 1 points, outward normals', () => {
    const { guides, area } = scalpGuides(opts());
    expect(guides.length).toBeGreaterThan(20);
    // Upper cap above z = 2 cm: 2πR(R − 0.02) ≈ 0.050 m².
    expect(area).toBeGreaterThan(0.04);
    expect(area).toBeLessThan(0.06);
    for (const g of guides) {
      const r = g.points[0] ?? [0, 0, 0];
      expect(g.points).toHaveLength(7);
      expect(Math.abs(ball(r))).toBeLessThan(0.006);
      expect(r[2]).toBeGreaterThan(0.015);
      expect(g.normal[0] * r[0] + g.normal[1] * r[1] + g.normal[2] * r[2]).toBeGreaterThan(0);
      for (const q of g.points.slice(1)) expect(ball(q)).toBeGreaterThan(-0.002);
    }
  });
  test('same seed, same JSON bytes; strand ops carry one mask weight per guide', () => {
    const a = scalpGuides(opts());
    const ops = [
      { op: 'comb', toward: [-1, 0, 0], strength: 0.5 },
      { op: 'clump', locks: 8, strength: 0.6, region: (p: Vec3) => p[1] },
    ] as const;
    const j1 = groomJson(a.guides, ops, { width: [0.02, 0.01], fold: 0.5 });
    const j2 = groomJson(scalpGuides(opts()).guides, ops, { width: [0.02, 0.01], fold: 0.5 });
    expect(Buffer.from(j1).equals(Buffer.from(j2))).toBe(true);
    const doc = JSON.parse(new TextDecoder().decode(j1)) as {
      contract: string;
      ops: { op: string; mask: number[] }[];
    };
    expect(doc.contract).toBe('t3d-groom/1');
    // comb is a guide op (already applied in TS): only the strand op travels, with its mask.
    expect(doc.ops.map((o) => o.op)).toEqual(['clump']);
    expect(doc.ops[0]?.mask).toHaveLength(a.guides.length);
  });
  test('the surface GLB is in the glTF frame (ts23d Z up → glTF Y up)', () => {
    const { surface } = scalpGuides(opts());
    const [prim] = scenePrimitives(readGlb(scalpGlb(surface)));
    let top = -1;
    for (let i = 1; i < (prim?.mesh.positions.length ?? 0); i += 3)
      top = Math.max(top, prim?.mesh.positions[i] ?? 0);
    expect(top).toBeGreaterThan(0.09);
  });
});
