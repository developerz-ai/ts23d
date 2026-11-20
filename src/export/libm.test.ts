// Building an asset must not depend on the platform's libm (defect D403): compiling a tracked
// vehicle at every LOD (round primitives, a lathe, a swept pipe, placed belt links, weathering,
// spinning wheels and a tread belt), painting its trim sheet and writing textured, animated GLBs
// with physics makes no call to Math.sin, Math.hypot, Math.pow or any sibling. Before the move to
// dmath the same build made tens of thousands of them, and their last bit, which differs between
// CPUs and C library versions, reached vertex normals, tangents and a triangle count.
// This counts calls at run time, so it cannot see `**` (an operator, not a call) nor a libm call a
// module makes once at import, before the counters go in. Both are refused statically in every
// file under src/ and recipes/ (tests included) by `bun run determinism` (scripts/determinism.ts,
// with tests for `**` and for spellings split across lines); this test is the run-time half.

import { expect, it } from 'bun:test';
import { type Asset, compile, defineAsset, dmath, type Lod, type Vec2 } from '../core/index.ts';
import { DEFAULT_SHEET, sheetFor } from '../material/index.ts';
import { weather } from '../passes/index.ts';
import { cylinder, lathe, sweep } from '../primitives/index.ts';
import { toGlb } from './glb.ts';
import { beltMesh, stadium, WHEEL_R } from './tread-fixtures.ts';

const C: [number, number, number] = [0.3, 0.32, 0.25];
const Y = 0.8;

const vehicle: Asset = defineAsset({
  name: 'libm_probe',
  kind: 'vehicle',
  budget: { triangles: [20000, 20000, 20000] },
  build(ctx) {
    const segments = [24, 16, 8][ctx.lod] ?? 8;
    const dome: Vec2[] = Array.from({ length: 9 }, (_, i) => {
      const a = (Math.PI / 2) * (i / 8);
      return [0.6 * dmath.cos(a) + 0.05, 0.5 + 0.35 * dmath.sin(a)];
    });
    const hull = lathe({ profile: [[0.9, 0.2], [0.9, 0.5], ...dome], segments, color: C });
    ctx.part(
      'hull',
      weather(hull, { lod: ctx.lod, seed: 3, effects: { dust: { amount: 0.3 } } }).mesh,
    );
    ctx.part(
      'exhaust',
      sweep({
        section: { radius: 0.05, segments: Math.max(6, segments / 2) },
        path: Array.from({ length: 8 }, (_, i) => [-0.9 - 0.05 * i, 0.3, 0.5 + 0.02 * i * i]),
        color: C,
      }),
    );
    const { mesh, pitch } = beltMesh([40, 20, 10][ctx.lod] ?? 10);
    ctx.part('track_l', mesh, {
      motion: { kind: 'tread', path: stadium().map(([x, z]) => [x, Y, z] as const), pitch },
    });
    for (const [i, x] of [-1, 1].entries())
      ctx.part(
        `wheel_l_${i}`,
        cylinder({ radius: WHEEL_R, length: 0.2, segments, axis: 'y', color: C }),
        { at: [x, Y, 0.3], motion: { kind: 'spin', axis: [0, 1, 0], rps: 0.75 } },
      );
  },
});

const LIBM = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log2',
  'log10',
  'log1p',
  'pow',
  'cbrt',
  'hypot',
];
type Fn = (...a: number[]) => number;

/** How many times `job` calls a libm-backed Math function. */
function libmCalls(job: () => void): number {
  const math = Math as unknown as Record<string, Fn>;
  const real = LIBM.map((name) => math[name]);
  let calls = 0;
  LIBM.forEach((name, i) => {
    const fn = real[i];
    if (fn)
      math[name] = (...a) => {
        calls++;
        return fn(...a);
      };
  });
  try {
    job();
  } finally {
    LIBM.forEach((name, i) => {
      const fn = real[i];
      if (fn) math[name] = fn;
    });
  }
  return calls;
}

it('compile, trim sheet and GLB of a tracked vehicle never call the platform libm', () => {
  expect(libmCalls(() => Math.hypot(Math.sin(1), Math.exp(1)))).toBe(3); // the count is live
  let bytes = 0;
  const calls = libmCalls(() => {
    const lods = ([0, 1, 2] as Lod[]).map((lod) => compile(vehicle, { lod }));
    const sheet = sheetFor(lods, { ...DEFAULT_SHEET, size: 512 });
    for (const c of lods) bytes += toGlb(c, { sheet, animations: true, physics: true }).byteLength;
  });
  expect(bytes).toBeGreaterThan(100000); // it really built three textured files
  expect(calls).toBe(0);
}, 60000);
