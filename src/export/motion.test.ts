import { expect, it } from 'bun:test';
import { quatFromAxisAngle } from '../core/index.ts';
import { BinWriter, type Json } from './bin-writer.ts';
import { cyclesOf, keysPerCycle, LOOP_SECONDS, motionChannels } from './motion.ts';

it('rounds every motion to whole cycles so the loop has no seam', () => {
  expect(cyclesOf(0.8)).toBe(3); // 0.8 rps × 4 s = 3.2 → 3 whole turns
  expect(cyclesOf(0.05)).toBe(1); // slower than one cycle per clip still loops once
  expect(cyclesOf(-0.6)).toBe(-2);
  const last = quatFromAxisAngle([0, 1, 0], cyclesOf(0.8) * Math.PI * 2);
  const first = quatFromAxisAngle([0, 1, 0], 0);
  // q and -q are the same rotation: compare up to sign.
  const dot = last.reduce((s, v, i) => s + v * (first[i] ?? 0), 0);
  expect(Math.abs(dot)).toBeCloseTo(1, 6);
  expect(LOOP_SECONDS).toBe(4);
});

/** The only channel a single-path motion writes. */
function only(written: ReturnType<typeof motionChannels>): { sampler: Json; channel: Json } {
  const [first] = written;
  if (!first || written.length !== 1)
    throw new Error(`expected one channel, got ${written.length}`);
  return first;
}

/** The `i`-th VEC3/VEC4 key of the sampler output `motionChannel` just wrote. */
function key(bin: BinWriter, sampler: Json, width: number, i: number): number[] {
  const acc = bin.accessors[sampler['output'] as number];
  const view = bin.views[acc?.['bufferView'] as number];
  const at = (view?.['byteOffset'] as number) + i * width * 4;
  return [...new Float32Array(bin.bytes().slice(at, at + width * 4).buffer)];
}

it('keeps a rest yaw: spin keys are yaw ∘ spin, slide offsets turn with the part', () => {
  const quarter = Math.PI / 2;
  const bin = new BinWriter();
  const spin = only(
    motionChannels(bin, { kind: 'spin', axis: [0, 1, 0], rps: 1 }, 0, [0, 0, 0], quarter),
  );
  // Key 0 is the rest pose: the 90° yaw about Z, not identity (which would drop the yaw).
  const rest = key(bin, spin.sampler, 4, 0);
  expect(rest[2] ?? 0).toBeCloseTo(Math.SQRT1_2, 6);
  expect(rest[3] ?? 0).toBeCloseTo(Math.SQRT1_2, 6);
  const slide = only(
    motionChannels(bin, { kind: 'slide', offset: [1, 0, 0], hz: 1 }, 0, [0, 0, 0], quarter),
  );
  // 1 Hz over 4 s = 4 cycles, 16 keys each: key 4 is the first peak. +X in the part's frame is
  // +Y in its parent's.
  const peak = key(bin, slide.sampler, 3, 4);
  expect(peak[0] ?? 9).toBeCloseTo(0, 6);
  expect(peak[1] ?? 0).toBeCloseTo(1, 6);
});

it('leaves a zero-yaw spin untouched (identity rest key)', () => {
  const bin = new BinWriter();
  const spin = only(motionChannels(bin, { kind: 'spin', axis: [0, 1, 0], rps: 1 }, 0, [0, 0, 0]));
  expect(key(bin, spin.sampler, 4, 0)).toEqual([0, 0, 0, 1]);
});

it('bakes an orbit densely enough that LINEAR keys stay within 1 mm of the circle', () => {
  const bin = new BinWriter();
  const r = 0.3;
  const orbit = only(
    motionChannels(bin, { kind: 'orbit', axis: [0, 1, 0], arm: [0, 0, r], hz: 1 }, 0, [0, 0, 0]),
  );
  expect(orbit.channel['target']).toEqual({ node: 0, path: 'translation' });
  // Midpoint of two neighbouring keys vs the circle the rod point rides (centre [0, 0, −r]).
  const a = key(bin, orbit.sampler, 3, 10);
  const b = key(bin, orbit.sampler, 3, 11);
  const mid = [0, 1, 2].map((k) => ((a[k] ?? 0) + (b[k] ?? 0)) / 2);
  const off = Math.hypot(mid[0] ?? 0, (mid[2] ?? 0) + r);
  expect(r - off).toBeLessThan(0.001);
  expect(r - off).toBeGreaterThan(0);
});

it('bakes every linkage (orbit, crank, piston) at 48 keys per cycle or more', () => {
  const at = {
    axis: [0, 1, 0],
    centre: [-2, 0, -0.3],
    pin: [-1.7, 0, -0.3],
    line: [1, 0, 0],
  } as const;
  expect(
    keysPerCycle({ kind: 'orbit', axis: [0, 1, 0], arm: [0, 0, 0.3], hz: 1 }),
  ).toBeGreaterThanOrEqual(48);
  expect(keysPerCycle({ kind: 'crank', ...at, hz: 1 })).toBeGreaterThanOrEqual(48);
  expect(keysPerCycle({ kind: 'piston', ...at, hz: 1 })).toBeGreaterThanOrEqual(48);
});

it('bakes a crank as translation + rotation, a piston as translation only', () => {
  const linkage = {
    axis: [0, 1, 0] as const,
    centre: [-2, 0, -0.3] as const,
    pin: [-1.7, 0, -0.3] as const,
    line: [1, 0, 0] as const,
    hz: 1,
  };
  const bin = new BinWriter();
  const crank = motionChannels(bin, { kind: 'crank', ...linkage }, 3, [1, 2, 3]);
  expect(crank.map((w) => w.channel['target'])).toEqual([
    { node: 3, path: 'translation' },
    { node: 3, path: 'rotation' },
  ]);
  const [move] = crank;
  if (move) expect(key(bin, move.sampler, 3, 0)).toEqual([1, 2, 3]);
  const piston = motionChannels(bin, { kind: 'piston', ...linkage }, 4, [0, 0, 0]);
  expect(piston.map((w) => w.channel['target'])).toEqual([{ node: 4, path: 'translation' }]);
});
