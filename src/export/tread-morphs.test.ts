import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, compile, dmath, LOOP_SECONDS } from '../core/index.ts';
import { beltRun } from '../passes/index.ts';
import { exportLodGlb, toGlb } from './glb.ts';
import { mergeToPivots } from './merge-pivots.ts';
import { optimizeParts } from './optimize-parts.ts';
import { beltTank, posedAt, type ReadBelt, readBelts, WHEEL_R } from './tread-fixtures.ts';
import { TREAD_TOLERANCE, treadMorphs } from './tread-morphs.ts';

const lod = (n: 0 | 1 | 2, o = {}): CompiledAsset => compile(beltTank(o), { lod: n });
const belt = (glb: Uint8Array, tree = 0): ReadBelt => {
  const found = readBelts(glb, 'track_l')[tree];
  if (!found) throw new Error('no track_l node');
  return found;
};

/** Furthest any point of `a` is from the nearest point of `b` (metres). */
function apart(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let worst = 0;
  for (let i = 0; i < a.length; i += 3) {
    let near = Infinity;
    for (let j = 0; j < b.length; j += 3)
      near = Math.min(
        near,
        dmath.pow((a[i] ?? 0) - (b[j] ?? 0), 2) +
          dmath.pow((a[i + 1] ?? 0) - (b[j + 1] ?? 0), 2) +
          dmath.pow((a[i + 2] ?? 0) - (b[j + 2] ?? 0), 2),
      );
    worst = Math.max(worst, near);
  }
  return Math.sqrt(worst);
}

describe('track belt in the run clip', () => {
  const glb = toGlb(lod(0), { animations: true });
  const b = belt(glb);
  const cycle = b.times[b.targets.length] ?? 0;

  it('moves the belt vertices (a belt with no targets or no weights channel stands still)', () => {
    expect(b.targets.length).toBeGreaterThanOrEqual(2);
    expect(b.weights.length).toBe(b.times.length * b.targets.length);
    const half = posedAt(b, cycle / 2);
    let moved = 0;
    for (let i = 0; i < half.length; i += 3)
      moved = Math.max(
        moved,
        dmath.norm([0, 1, 2].map((k) => (half[i + k] ?? 0) - (b.positions[i + k] ?? 0))),
      );
    // Half a pitch of travel: 40 links round a 5.885 m loop.
    expect(moved).toBeGreaterThan(0.06);
  });

  it('keeps every vertex within tolerance of its true pose, on and between keys', () => {
    const merged = optimizeParts(mergeToPivots(lod(0), []), {}).asset;
    const part = merged.parts.find((p) => p.name === 'track_l');
    const morphs = part ? treadMorphs(merged.parts, part, 0) : null;
    if (!part?.mesh || part.motion?.kind !== 'tread' || !morphs) throw new Error('no belt morphs');
    const run = beltRun(part.motion.path, Math.sign(morphs.speed) * part.motion.pitch, part.mesh);
    const truth = new Float64Array(b.positions.length);
    let worst = 0;
    for (const f of [0, 0.125, 0.3, 0.5, 0.6875, 0.9, 1]) {
      run.pose(f, truth, new Float64Array(truth.length));
      const shown = posedAt(b, f * cycle);
      for (let i = 0; i < truth.length; i += 3)
        worst = Math.max(
          worst,
          dmath.norm([0, 1, 2].map((k) => (shown[i + k] ?? 0) - (truth[i + k] ?? 0))),
        );
    }
    expect(worst).toBeLessThanOrEqual(TREAD_TOLERANCE[0] + morphs.still + 1e-6);
    expect(morphs.error).toBeLessThanOrEqual(TREAD_TOLERANCE[0]);
  });

  it('closes the loop: the pose at the end of a pitch and of the clip covers the rest pose', () => {
    for (const t of [cycle, LOOP_SECONDS]) {
      const end = posedAt(b, t);
      expect(apart(end, b.positions)).toBeLessThan(1e-4);
      expect(apart(b.positions, end)).toBeLessThan(1e-4);
    }
    // One float32 step after a pitch the weights are back at rest: no blend is ever shown.
    const k = b.targets.length;
    expect((b.times[k + 1] ?? 0) - (b.times[k] ?? 0)).toBeLessThan(1e-6);
    expect([...b.weights.subarray((k + 1) * k, (k + 2) * k)]).toEqual(Array(k).fill(0));
    expect(b.times.at(-1)).toBe(LOOP_SECONDS);
  });

  it('runs the ground run backwards at the road wheels rim speed, to the nearest whole pitch', () => {
    const pitch = 5.885 / 40;
    // 0.75 rev/s over a 4 s clip = 3 whole turns of a 0.28 m wheel.
    const rim = (3 * 2 * Math.PI * WHEEL_R) / LOOP_SECONDS;
    const cycles = b.times.length / (b.targets.length + 1);
    const speed = (cycles * pitch) / LOOP_SECONDS;
    expect(Math.abs(speed - rim)).toBeLessThanOrEqual(pitch / 2 / LOOP_SECONDS + 1e-3);
    // A vertex on the ground run (z ≈ 0, away from the end wheels) moves towards −X.
    let ground = -1;
    for (let v = 0; v < b.positions.length / 3 && ground < 0; v++)
      if (Math.abs(b.positions[v * 3] ?? 9) < 0.3 && (b.positions[v * 3 + 2] ?? 9) < 0.05)
        ground = v;
    const dt = cycle / 16;
    const dx = ((posedAt(b, dt)[ground * 3] ?? 0) - (b.positions[ground * 3] ?? 0)) / dt;
    expect(dx).toBeCloseTo(-speed, 2);
  });

  it('reverses with the wheels', () => {
    const back = belt(toGlb(lod(0, { rps: -0.75 }), { animations: true }));
    const dt = (back.times[1] ?? 0) / 2;
    let ground = -1;
    for (let v = 0; v < back.positions.length / 3 && ground < 0; v++)
      if (Math.abs(back.positions[v * 3] ?? 9) < 0.3 && (back.positions[v * 3 + 2] ?? 9) < 0.05)
        ground = v;
    expect(
      (posedAt(back, dt)[ground * 3] ?? 0) - (back.positions[ground * 3] ?? 0),
    ).toBeGreaterThan(0);
  });

  it('builds one belt mesh anew for reversed wheels and for another LOD tolerance', () => {
    const asset = lod(0);
    const part = asset.parts.find((p) => p.name === 'track_l');
    if (!part) throw new Error('no track_l part');
    const reversed = asset.parts.map((p) =>
      p.motion?.kind === 'spin' ? { ...p, motion: { ...p.motion, rps: -p.motion.rps } } : p,
    );
    const forward = treadMorphs(asset.parts, part, 0);
    const back = treadMorphs(reversed, part, 0);
    if (!forward || !back) throw new Error('no belt morphs');
    // Wheels rolling forward run the ground run back along this path's winding.
    expect(forward.speed).toBeLessThan(0);
    expect(back.speed).toBe(-forward.speed);
    // The same mesh at a coarser LOD is held to that LOD's tolerance, not the first caller's.
    const far = treadMorphs(asset.parts, part, 2);
    expect(far?.still).toBeCloseTo(TREAD_TOLERANCE[2] * 0.1, 9);
    expect(forward.still).toBeCloseTo(TREAD_TOLERANCE[0] * 0.1, 9);
    // Equal inputs are still built once.
    expect(treadMorphs(asset.parts, part, 0)).toBe(forward);
  });

  it('writes no morph targets without animations', () => {
    const still = belt(toGlb(lod(0), {}));
    expect(still.targets).toEqual([]);
    expect(still.weights.length).toBe(0);
    expect(toGlb(lod(0), {}).byteLength).toBeLessThan(glb.byteLength);
  });

  it('leaves a belt that does not repeat every pitch still', () => {
    const gapped = belt(toGlb(lod(0, { gap: true }), { animations: true }));
    expect(gapped.targets).toEqual([]);
    expect(gapped.weights.length).toBe(0);
  });

  it('animates every LOD tree of a single-file GLB with its own targets and keys', () => {
    const all = exportLodGlb([lod(0), lod(1), lod(2)], { animations: true }).glb;
    const trees = readBelts(all, 'track_l');
    expect(trees.length).toBe(3);
    expect(new Set(trees.map((t) => t.targets.length)).size).toBeGreaterThan(1);
    for (const t of trees) {
      expect(t.targets.length).toBeGreaterThanOrEqual(2);
      expect(t.weights.length).toBe(t.times.length * t.targets.length);
      const end = posedAt(t, t.times[t.targets.length] ?? 0);
      expect(apart(end, t.positions)).toBeLessThan(1e-4);
    }
  });
});
