import { describe, expect, it } from 'bun:test';
import { createRng, dmath, type Mesh, type Vec3 } from '../core/index.ts';
import { sculpt } from './sculpt.ts';
import { meshDetail } from './sculpt-mesh-detail.ts';
import { meshBrick, meshField } from './sculpt-mesh-field.ts';
import { sdf } from './sdf.ts';
import { similarityFit } from './similarity-fit.ts';

const R = 0.5;
const sphereMesh = (r = R, at: Vec3 = [0, 0, 0]): Mesh =>
  sdf({
    field: (p) => dmath.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]) - r,
    bounds: [
      [at[0] - r - 0.05, at[1] - r - 0.05, at[2] - r - 0.05],
      [at[0] + r + 0.05, at[1] + r + 0.05, at[2] + r + 0.05],
    ],
    resolution: 0.01,
    color: [0.5, 0.5, 0.5],
  });
const sphere = sphereMesh();

/** Without the hole, minus every triangle whose centroid has z > cut. */
function holed(m: Mesh, cut: number): Mesh {
  const keep: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const z =
      [0, 1, 2].reduce((s, v) => s + (m.positions[(m.indices[t + v] ?? 0) * 3 + 2] ?? 0), 0) / 3;
    if (z <= cut) keep.push(m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0);
  }
  return { ...m, indices: Uint32Array.from(keep) };
}

describe('meshBrick (mesh → sculpt field)', () => {
  const cell = 0.02;
  const b = meshBrick(sphere, { cell });

  it('a sphere mesh reads back as the sphere distance within cell/2 across the band', () => {
    const rng = createRng(3);
    let worst = 0;
    for (let i = 0; i < 2000; i++) {
      const dir: Vec3 = [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)];
      const l = dmath.norm(dir) || 1;
      const rad = R + rng.range(-0.06, 0.06);
      const p: Vec3 = [(dir[0] / l) * rad, (dir[1] / l) * rad, (dir[2] / l) * rad];
      worst = Math.max(worst, Math.abs(b.field(p) - (rad - R)));
    }
    expect(worst).toBeLessThan(cell / 2);
  });

  it('signs regions past the band: −band at the centre, +band in the corners, box distance off-grid', () => {
    expect(b.field([0, 0, 0])).toBeCloseTo(-b.band, 6);
    expect(b.field([0.55, 0.55, 0.55])).toBeCloseTo(b.band, 6);
    expect(b.field([5, 0, 0])).toBeGreaterThan(4);
  });

  it('a mesh with a hole still has the right sign (winding number, not ray parity)', () => {
    const open = meshBrick(holed(sphere, 0.45), { cell });
    expect(open.field([0, 0, 0])).toBeLessThan(0);
    expect(open.field([0, 0, -0.45])).toBeLessThan(0);
    expect(open.field([0.6, 0, 0])).toBeGreaterThan(0);
  });

  it('moves the mesh by its fit: scale 2 and a shift give the bigger sphere', () => {
    const fit = similarityFit(
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      [
        [1, 0, 0],
        [3, 0, 0],
        [1, 2, 0],
        [1, 0, 2],
      ],
    );
    const big = meshBrick(sphere, { cell: 0.03, fit });
    expect(Math.abs(big.field([1 + 2 * R, 0, 0]))).toBeLessThan(0.015);
    expect(big.field([1, 0, 0])).toBeLessThan(0);
  });

  it('is deterministic and Lipschitz-clamped: neighbouring samples differ by ≤ one cell', () => {
    const again = meshBrick(sphereMesh(), { cell });
    expect(Bun.hash(again.samples)).toBe(Bun.hash(b.samples));
    const [nx] = b.dims;
    let worst = 0;
    for (let id = 0; id + 1 < b.samples.length; id++)
      if ((id + 1) % nx !== 0)
        worst = Math.max(worst, Math.abs((b.samples[id + 1] ?? 0) - (b.samples[id] ?? 0)));
    expect((worst * b.band) / 32767).toBeLessThanOrEqual(cell * 1.001);
  });

  it('refuses a cell ≤ 0 and an oversized brick', () => {
    expect(() => meshBrick(sphere, { cell: 0 })).toThrow('T3D_RECIPE_INVALID');
    expect(() => meshBrick(sphere, { cell: 0.001, maxPoints: 1000 })).toThrow(/brick points/);
  });

  it('as a sculpt edit, meshes back to the sphere', () => {
    const m = sculpt({ edits: [meshField(sphere, { cell })], resolution: 0.04, color: [1, 1, 1] });
    let worst = 0;
    for (let i = 0; i < m.positions.length; i += 3)
      worst = Math.max(
        worst,
        Math.abs(
          dmath.hypot(m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0) - R,
        ),
      );
    expect(worst).toBeLessThan(cell);
  });
});

describe('meshDetail (high-pass relief)', () => {
  const cell = 0.01;
  const smooth = meshBrick(sphere, { cell });

  it('a smooth model surface adds (almost) nothing: its shape is the code sculpt’s job', () => {
    const d = meshDetail(smooth, { amp: 0.01, sigma: 0.02 });
    let worst = 0;
    for (const p of [
      [R, 0, 0],
      [0, R, 0],
      [0, 0, -R],
      [0.3, 0.3, Math.sqrt(R * R - 0.18)],
    ] as Vec3[])
      worst = Math.max(worst, Math.abs(d.at(p)));
    expect(worst).toBeLessThan(0.0015);
  });

  it('a bump narrower than sigma passes, clamped under amp', () => {
    const bumped: Mesh = sdf({
      field: (p) => Math.min(dmath.norm(p) - R, dmath.hypot(p[0] - R, p[1], p[2]) - 0.025),
      bounds: [
        [-0.6, -0.6, -0.6],
        [0.6, 0.6, 0.6],
      ],
      resolution: 0.01,
      color: [0.5, 0.5, 0.5],
    });
    const d = meshDetail(meshBrick(bumped, { cell }), { amp: 0.008, sigma: 0.03 });
    const top = d.at([R, 0, 0]);
    expect(top).toBeGreaterThan(0.004);
    expect(top).toBeLessThan(0.008);
  }, 30_000);

  it('fades out where the model surface is far from the code surface', () => {
    const d = meshDetail(smooth, { amp: 0.01, sigma: 0.02, reach: 0.01 });
    expect(d.at([R + 0.03, 0, 0])).toBe(0);
  });

  it('refuses sigma below the cell', () => {
    expect(() => meshDetail(smooth, { amp: 0.01, sigma: 0.001 })).toThrow('T3D_RECIPE_INVALID');
  });
});

describe('narrow band (D56)', () => {
  it('terminates on near-duplicate triangles (float32 ties cannot swap forever)', () => {
    // A decimated model mesh has overlapping faces whose distances differ below float32 precision.
    const P: number[] = [];
    const I: number[] = [];
    for (let k = 0; k < 40; k++) {
      const e = k * 1e-9;
      const base = P.length / 3;
      P.push(0, 0, e, 1, 0, -e, 0, 1, e * 0.5);
      I.push(base, base + 1, base + 2);
    }
    const sheet: Mesh = {
      positions: Float32Array.from(P),
      normals: new Float32Array(P.length),
      uvs: new Float32Array((P.length / 3) * 2),
      colors: new Float32Array(P.length),
      indices: Uint32Array.from(I),
    };
    const b = meshBrick(sheet, { cell: 0.02, band: 0.08 });
    expect(Math.abs(b.field([0.3, 0.3, 0.05]))).toBeCloseTo(0.05, 2);
  }, 5000);
});

describe('meshDetail band-pass', () => {
  it('a pre-smoothing as broad as the low-pass leaves nothing (fine = sigma → 0)', () => {
    const b = meshBrick(sphereMesh(), { cell: 0.02 });
    const d = meshDetail(b, { amp: 0.01, sigma: 0.04, fine: 0.04 });
    expect(d.at([R, 0, 0])).toBe(0);
  }, 30_000);
});
