import { describe, expect, it } from 'bun:test';
import { type Mesh, merge, place } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { BeltLoop } from './belt-loop.ts';
import { beltRun } from './belt-run.ts';

const c: [number, number, number] = [0.3, 0.3, 0.3];
const R = 0.3;

/** A stadium in XZ at y = 0: bottom run +x, half a turn round x = 1, top run back, round x = −1. */
function stadium(): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 40; i++) pts.push([-1 + (2 * i) / 40, 0, 0]);
  for (let i = 0; i < 90; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 90;
    pts.push([1 + R * Math.cos(a), 0, R + R * Math.sin(a)]);
  }
  for (let i = 0; i < 40; i++) pts.push([1 - (2 * i) / 40, 0, 2 * R]);
  for (let i = 0; i < 90; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 90;
    pts.push([-1 + R * Math.cos(a), 0, R + R * Math.sin(a)]);
  }
  return pts;
}

/** `n` links (a plate and an off-centre grouser) laid tangent to the loop at even stations. */
function links(n: number, skip = -1): { mesh: Mesh; pitch: number } {
  const loop = new BeltLoop(stadium());
  const pitch = loop.length / n;
  const link = merge([
    box({ size: [pitch * 0.8, 0.3, 0.04], color: c }),
    box({ size: [pitch * 0.2, 0.3, 0.03], at: [pitch * 0.2, 0, -0.035], color: c }),
  ]);
  const f = new Float64Array(6);
  const placed: Mesh[] = [];
  for (let k = 0; k < n; k++) {
    if (k === skip) continue;
    loop.frame(k * pitch, f);
    placed.push(
      place(link, {
        at: [f[0] ?? 0, f[1] ?? 0, f[2] ?? 0],
        pitch: Math.atan2(-(f[5] ?? 0), f[3] ?? 1),
      }),
    );
  }
  return { mesh: merge(placed), pitch };
}

const posed = (run: ReturnType<typeof beltRun>, f: number): Float64Array => {
  const p = new Float64Array(run.vertices * 3);
  run.pose(f, p, new Float64Array(p.length));
  return p;
};

/** Furthest a point of `a` is from the nearest point of `b`. */
function apart(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let worst = 0;
  for (let i = 0; i < a.length; i += 3) {
    let near = Infinity;
    for (let j = 0; j < b.length; j += 3)
      near = Math.min(
        near,
        Math.hypot(
          (a[i] ?? 0) - (b[j] ?? 0),
          (a[i + 1] ?? 0) - (b[j + 1] ?? 0),
          (a[i + 2] ?? 0) - (b[j + 2] ?? 0),
        ),
      );
    worst = Math.max(worst, near);
  }
  return worst;
}

describe('beltRun', () => {
  it('reports the vertices of a belt that does not repeat every pitch', () => {
    const { mesh, pitch } = links(36, 5);
    // The link before the gap has nowhere to land: its 48 vertices have no twin.
    expect(beltRun(stadium(), pitch, mesh).unmatched).toBe(48);
    expect(beltRun(stadium(), pitch * 1.4, links(36).mesh).unmatched).toBeGreaterThan(0);
  });

  it('carries every link onto the next one: the pose after one pitch covers the rest pose', () => {
    const { mesh, pitch } = links(36);
    for (const dir of [1, -1]) {
      const run = beltRun(stadium(), dir * pitch, mesh);
      expect(run.unmatched).toBe(0);
      expect(apart(posed(run, 0), mesh.positions)).toBeLessThan(1e-9);
      expect(apart(posed(run, 1), mesh.positions)).toBeLessThan(1e-6);
      expect(apart(mesh.positions, posed(run, 1))).toBeLessThan(1e-6);
    }
  });

  it('moves the bottom run along the winding and turns links round the end wheel', () => {
    const { mesh, pitch } = links(36);
    const run = beltRun(stadium(), pitch, mesh);
    const half = posed(run, 0.5);
    // Link 3 (48 vertices a link) sits mid bottom run: half a pitch along +x, no lift.
    const v = 3 * 48 * 3;
    expect((half[v] ?? 0) - (mesh.positions[v] ?? 0)).toBeCloseTo(pitch / 2, 5);
    expect((half[v + 2] ?? 0) - (mesh.positions[v + 2] ?? 0)).toBeCloseTo(0, 5);
    // One pitch round a 0.3 m wheel turns a link by pitch / R.
    expect(run.turn).toBeCloseTo(pitch / R, 1);
  });

  it('keeps links rigid on the way: every edge keeps its length mid-pitch', () => {
    const { mesh, pitch } = links(36);
    const mid = posed(beltRun(stadium(), pitch, mesh), 0.37);
    const len = (p: ArrayLike<number>, a: number, b: number): number =>
      Math.hypot(...[0, 1, 2].map((k) => (p[a * 3 + k] ?? 0) - (p[b * 3 + k] ?? 0)));
    let worst = 0;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b] = [mesh.indices[i] ?? 0, mesh.indices[i + 1] ?? 0];
      worst = Math.max(worst, Math.abs(len(mid, a, b) - len(mesh.positions, a, b)));
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('pairs a link a pass has pressed flat with its neighbours and eases it into shape', () => {
    const { mesh, pitch } = links(36);
    const positions = Float32Array.from(mesh.positions);
    // Lift one corner of a ground-run link by 8 mm, the way `onGround` clamps a dipping corner.
    const corner = 3 * 48 * 3 + 2;
    positions[corner] = (positions[corner] ?? 0) + 0.008;
    const run = beltRun(stadium(), pitch, { ...mesh, positions });
    expect(run.unmatched).toBe(0);
    expect(run.residual).toBeGreaterThan(0.007);
    expect(run.residual).toBeLessThan(0.009);
    expect(apart(posed(run, 1), positions)).toBeLessThan(1e-6);
  });

  it('bends a continuous band vertex by vertex', () => {
    const loop = new BeltLoop(stadium());
    const n = 60;
    const pitch = loop.length / n;
    const f = new Float64Array(6);
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    for (let k = 0; k < n; k++) {
      loop.frame(k * pitch, f);
      for (const y of [-0.1, 0.1]) {
        positions.push(f[0] ?? 0, y, f[2] ?? 0);
        // Outward: the belt normal crossed with the tangent.
        const [n, t] = [loop.normal, [f[3] ?? 0, f[4] ?? 0, f[5] ?? 0] as const];
        normals.push(
          n[1] * t[2] - n[2] * t[1],
          n[2] * t[0] - n[0] * t[2],
          n[0] * t[1] - n[1] * t[0],
        );
      }
      const [a, b] = [k * 2, ((k + 1) % n) * 2];
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const run = beltRun(stadium(), pitch, { positions, normals, indices });
    expect(run.unmatched).toBe(0);
    expect(apart(posed(run, 1), positions)).toBeLessThan(1e-6);
  });
});

describe('BeltLoop', () => {
  it('measures the loop and frames it at any arc length', () => {
    const loop = new BeltLoop(stadium());
    expect(loop.length).toBeCloseTo(4 + 2 * Math.PI * R, 2);
    const f = new Float64Array(6);
    loop.frame(1 + loop.length * 3, f);
    expect(f[0]).toBeCloseTo(0, 3);
    expect(f[2]).toBeCloseTo(0, 3);
    expect(f[3]).toBeCloseTo(1, 3);
    expect(loop.nearest([0.5, 0.2, 0.61])).toBeCloseTo(2 + Math.PI * R + 0.5, 1);
    expect(Math.abs(loop.normal[1])).toBeCloseTo(1, 9);
  });
});
