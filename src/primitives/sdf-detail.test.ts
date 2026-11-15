import { describe, expect, it } from 'bun:test';
import { createRng, type Mesh, Ts23dError, triangleCount, type Vec3 } from '../core/index.ts';
import { nonManifoldEdges, openEdges, zeroArea } from './closed.ts';
import { sculpt } from './sculpt.ts';
import { sdf } from './sdf.ts';
import type { DetailRegion } from './sdf-detail.ts';
import { type Field, sd } from './sdf-ops.ts';
import { valueNoise } from './value-noise.ts';

const C: Vec3 = [0.5, 0.5, 0.5];
const B: readonly [Vec3, Vec3] = [
  [-1.2, -1.2, -1.2],
  [1.2, 1.2, 1.2],
];
const mesh = (field: Field, detail: readonly DetailRegion[], extra = {}): Mesh =>
  sdf({ field, bounds: B, resolution: 0.1, color: C, detail, ...extra });

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

/**
 * Share of area in triangles whose winding opposes their vertex normals (closed.ts windingFlips'
 * test, area-weighted like the normals-winding gate, which tolerates 1 %).
 */
function flippedArea(m: Mesh): number {
  let flipped = 0;
  let total = 0;
  const P = m.positions;
  const N = m.normals;
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [0, 1, 2].map((j) => (m.indices[t + j] ?? 0) * 3);
    const [a, b, c] = [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
    const e = [0, 1, 2].map((k) => (P[b + k] ?? 0) - (P[a + k] ?? 0));
    const f = [0, 1, 2].map((k) => (P[c + k] ?? 0) - (P[a + k] ?? 0));
    const g = [0, 1, 2].map(
      (k) =>
        (e[(k + 1) % 3] ?? 0) * (f[(k + 2) % 3] ?? 0) -
        (e[(k + 2) % 3] ?? 0) * (f[(k + 1) % 3] ?? 0),
    );
    const n = [0, 1, 2].map((k) => (N[a + k] ?? 0) + (N[b + k] ?? 0) + (N[c + k] ?? 0));
    const gl = Math.hypot(g[0] ?? 0, g[1] ?? 0, g[2] ?? 0);
    const nl = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0);
    total += gl;
    const cos = [0, 1, 2].reduce((s, k) => s + (g[k] ?? 0) * (n[k] ?? 0), 0) / (gl * nl || 1);
    if (cos < -0.1) flipped += gl;
  }
  return flipped / total;
}

const inBox = (m: Mesh, lo: Vec3, hi: Vec3): number => {
  let n = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const i = (m.indices[t] ?? 0) * 3;
    const p = [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0];
    if ([0, 1, 2].every((k) => (p[k] ?? 0) > (lo[k] ?? 0) && (p[k] ?? 0) < (hi[k] ?? 0))) n++;
  }
  return n;
};

describe('sdf detail regions', () => {
  it('rejects boxes that overlap, touch, leave the bounds or use another factor', () => {
    const ball = sd.sphere([0, 0, 0], 1);
    const box = (lo: Vec3, hi: Vec3, factor: 2 | 4 = 2): DetailRegion => ({
      bounds: [lo, hi],
      factor,
    });
    const cases: (readonly DetailRegion[])[] = [
      [box([0, 0, 0], [0.5, 0.5, 0.5]), box([0.3, 0.3, 0.3], [0.8, 0.8, 0.8])],
      [box([0, 0, 0], [0.5, 0.5, 0.5]), box([0.5, 0, 0], [0.9, 0.5, 0.5])],
      [box([3, 3, 3], [4, 4, 4])],
      [
        {
          bounds: [
            [0, 0, 0],
            [0.5, 0.5, 0.5],
          ],
          factor: 3 as 2,
        },
      ],
    ];
    for (const detail of cases)
      expect(fails(() => mesh(ball, detail)).code).toBe('T3D_RECIPE_INVALID');
    const cubes = fails(() => mesh(ball, [box([0, 0, 0], [0.5, 0.5, 0.5])], { mesher: 'cubes' }));
    expect(cubes.fix).toContain('cubes');
  });

  it('stitches levels into one closed, consistently wound surface (factors 2 and 4)', () => {
    const noise = valueNoise(createRng(5), { scale: 0.35 });
    const fields: Field[] = [
      sd.sphere([0.03, -0.02, 0.01], 0.93),
      sd.smoothUnion(0.2, sd.sphere([-0.3, 0, 0], 0.6), sd.torus([0.4, 0.1, 0], 0.45, 0.17)),
      sd.displace(sd.sphere([0, 0, 0], 0.85), noise, 0.08),
    ];
    const boxes: [Vec3, Vec3][] = [
      [
        [0.2, -0.45, -0.35],
        [1.1, 0.35, 0.55],
      ], // a face box straddling the surface
      [
        [-0.55, -0.55, -0.55],
        [0.55, 0.55, 0.55],
      ], // inside, crossing thin features
      [
        [-1.05, -0.2, 0.3],
        [-0.1, 0.9, 1.1],
      ], // a corner and box edges cutting the shell
    ];
    for (const field of fields)
      for (const factor of [2, 4] as const) {
        const m = mesh(field, [
          { bounds: boxes[0] ?? B, factor },
          { bounds: boxes[2] ?? B, factor: factor === 2 ? 4 : 2 },
        ]);
        expect(openEdges(m)).toBe(0);
        expect(zeroArea(m)).toBe(0);
        // Dual contouring folds a rare sliver in the transition ring; it stays far under 1 %.
        expect(flippedArea(m)).toBeLessThan(1e-3);
        const inner = mesh(field, [{ bounds: boxes[1] ?? B, factor }]);
        expect(openEdges(inner)).toBe(0);
        expect(flippedArea(inner)).toBeLessThan(1e-3);
      }
  });

  it('stays watertight for random boxes over a noisy field', () => {
    const rng = createRng(11);
    for (let t = 0; t < 24; t++) {
      const field = sd.displace(
        sd.smoothUnion(
          0.15,
          sd.sphere([rng.range(-0.2, 0.2), 0, 0], 0.7),
          sd.capsule([-0.5, -0.5, 0], [0.6, 0.5, 0.3], 0.18),
        ),
        valueNoise(createRng(t), { scale: 0.3 }),
        0.07,
      );
      const lo: Vec3 = [rng.range(-1.1, 0.3), rng.range(-1.1, 0.3), rng.range(-1.1, 0.3)];
      const hi: Vec3 = [
        lo[0] + rng.range(0.3, 0.8),
        lo[1] + rng.range(0.3, 0.8),
        lo[2] + rng.range(0.3, 0.8),
      ];
      const m = mesh(field, [{ bounds: [lo, hi], factor: t % 2 === 0 ? 2 : 4 }]);
      expect(openEdges(m)).toBe(0);
      expect(flippedArea(m)).toBeLessThan(1e-3);
    }
  });

  it('puts factor² more triangles inside the box and leaves the rest coarse', () => {
    const ball = sd.sphere([0, 0, 0], 1);
    const lo: Vec3 = [0.4, -0.4, -0.4];
    const hi: Vec3 = [1.2, 0.4, 0.4];
    const plain = mesh(ball, []);
    const fine = mesh(ball, [{ bounds: [lo, hi], factor: 4 }]);
    const ratio = inBox(fine, lo, hi) / inBox(plain, lo, hi);
    expect(ratio).toBeGreaterThan(12);
    expect(ratio).toBeLessThan(20);
    const far: [Vec3, Vec3] = [
      [-1.2, -1.2, -1.2],
      [0, 1.2, 1.2],
    ];
    expect(inBox(fine, ...far)).toBe(inBox(plain, ...far));
    expect(nonManifoldEdges(fine)).toBe(nonManifoldEdges(plain));
  });

  it('works through sculpt, mirrored: a detail box symmetric about y = 0 keeps the mesh symmetric', () => {
    const m = sculpt({
      edits: [
        { shape: 'ellipsoid', at: [0, 0, 0], size: [0.2, 0.12, 0.1] },
        { shape: 'sphere', at: [0.17, 0.05, 0.03], size: 0.03, blend: 0.02 },
      ],
      resolution: 0.012,
      color: C,
      mirror: 'y',
      kernel: 'cubic',
      detail: [
        {
          bounds: [
            [0.1, -0.1, -0.06],
            [0.25, 0.1, 0.08],
          ],
          factor: 2,
        },
      ],
    });
    expect(openEdges(m)).toBe(0);
    const key = (x: number, y: number, z: number): string =>
      `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    const set = new Set<string>();
    for (let i = 0; i < m.positions.length; i += 3)
      set.add(key(m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0));
    let missing = 0;
    for (let i = 0; i < m.positions.length; i += 3)
      if (!set.has(key(m.positions[i] ?? 0, -(m.positions[i + 1] ?? 0), m.positions[i + 2] ?? 0)))
        missing++;
    expect(missing).toBe(0);
    expect(triangleCount(m)).toBeGreaterThan(0);
  });
});
