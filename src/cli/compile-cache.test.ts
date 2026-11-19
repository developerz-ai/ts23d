import { afterEach, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  box,
  type CompiledAsset,
  compile,
  cylinder,
  defineAsset,
  paintTrimSheet,
} from '../index.ts';
import { DEFAULT_SHEET } from '../material/index.ts';
import { parseArgs } from './args.ts';
import { buildOne } from './build-one.ts';
import { compileKey, compileOnce, shareCompiles, sharedCompiles } from './compile-cache.ts';
import { iconOne } from './icon-cmd.ts';
import { blueprintOne, heroOne } from './render-cmds.ts';

let builds = 0;
const drum = (name: string) =>
  defineAsset({
    name,
    kind: 'prop',
    seed: 7,
    budget: { triangles: [2000, 2000, 2000], draws: 1 },
    paint: { body: '#ffffff' },
    variants: { blue: { body: '#2222aa' } },
    build(ctx) {
      builds++;
      ctx.part(
        'drum',
        cylinder({ radius: 0.3, length: 1, segments: ctx.pick([32, 16, 8]), color: [1, 1, 1] }),
        { paint: 'body' },
      );
    },
  });

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
});

/** The vertex array two views of one compile share. */
const verts = (a: CompiledAsset): Float32Array | undefined => a.parts[0]?.mesh?.positions;

/** Every byte a consumer could change: typed arrays as hex, the rest as JSON. */
const fingerprint = (a: CompiledAsset): string =>
  new Bun.CryptoHasher('sha256')
    .update(
      JSON.stringify(a, (_k, v: unknown) =>
        ArrayBuffer.isView(v)
          ? Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('hex')
          : typeof v === 'function'
            ? String(v)
            : v,
      ),
    )
    .digest('hex');

it('is plain compile until shareCompiles(): every call compiles again', () => {
  const a = drum('off');
  builds = 0;
  expect(verts(compileOnce(a, { lod: 0 }))).not.toBe(verts(compileOnce(a, { lod: 0 })));
  expect(builds).toBe(2);
  expect(sharedCompiles()).toEqual({ count: 0, bytes: 0 });
});

it('misses on another LOD, seed or variant, and hits on the same ones', () => {
  stop = shareCompiles();
  const a = drum('keys');
  builds = 0;
  const lod0 = compileOnce(a, { lod: 0 });
  expect(verts(compileOnce(a, { lod: 0 }))).toBe(verts(lod0));
  expect(verts(compileOnce(a))).toBe(verts(lod0)); // the default LOD is 0
  expect(verts(compileOnce(a, { seed: 7 }))).toBe(verts(lod0)); // the asset's own seed
  expect(builds).toBe(1);
  expect(verts(compileOnce(a, { lod: 2 }))).not.toBe(verts(lod0));
  expect(verts(compileOnce(a, { lod: 0, seed: 8 }))).not.toBe(verts(lod0));
  const blue = compileOnce(a, { lod: 0, variant: 'blue' });
  expect(blue.variant).toBe('blue');
  expect(verts(blue)).not.toBe(verts(lod0));
  expect(verts(compileOnce(a, { lod: 0, variant: 'blue' }))).toBe(verts(blue));
  expect(builds).toBe(4);
  expect(compileKey(a, { lod: 0 })).not.toBe(compileKey(a, { lod: 0, variant: 'blue' }));
});

it('never hands one asset another asset’s compile, even under the same name', () => {
  stop = shareCompiles();
  const first = drum('twin');
  const again = drum('twin'); // what a re-imported (edited) recipe is: a new object
  const a = compileOnce(first, { lod: 0 });
  const b = compileOnce(again, { lod: 0 });
  expect(verts(b)).not.toBe(verts(a));
  expect(verts(compileOnce(first, { lod: 0 }))).toBe(verts(a));
  expect(verts(compileOnce(again, { lod: 0 }))).toBe(verts(b));
});

it('hands every caller its own asset, parts and mesh objects over the shared vertex arrays', () => {
  stop = shareCompiles();
  const a = drum('views');
  const one = compileOnce(a, { lod: 0 });
  const two = compileOnce(a, { lod: 0 });
  // What QA and the renderers memoise on (world meshes per parts array, grids per mesh object).
  expect(two).not.toBe(one);
  expect(two.parts).not.toBe(one.parts);
  expect(two.parts[0]).not.toBe(one.parts[0]);
  expect(two.parts[0]?.mesh).not.toBe(one.parts[0]?.mesh);
  expect(verts(two)).toBe(verts(one));
  expect(two).toEqual(one);
});

it('never shares a compile made with tuned trial values', () => {
  stop = shareCompiles();
  const a = drum('tuned');
  builds = 0;
  compileOnce(a, { lod: 0, tuned: {} });
  compileOnce(a, { lod: 0, tuned: {} });
  expect(builds).toBe(2);
  expect(sharedCompiles().count).toBe(0);
});

it('does not keep a compile that threw', () => {
  stop = shareCompiles();
  let fail = true;
  const a = defineAsset({
    name: 'flaky',
    kind: 'prop',
    budget: { triangles: [100, 100, 100], draws: 1 },
    build(ctx) {
      if (fail) throw new RangeError('first time');
      ctx.part('b', box({ size: [1, 1, 1], color: [1, 1, 1] }));
    },
  });
  expect(() => compileOnce(a)).toThrow('first time');
  fail = false;
  expect(compileOnce(a).parts.length).toBe(1);
});

it('drops the oldest compiles over the byte limit and forgets everything on stop', () => {
  const a = drum('bounded');
  const one = compile(a, { lod: 0 });
  const bytes = Object.values(one.parts[0]?.mesh ?? {}).reduce(
    (n, v) => n + (ArrayBuffer.isView(v) ? v.byteLength : 0),
    0,
  );
  stop = shareCompiles(bytes * 2); // room for two LOD0-sized compiles
  const first = compileOnce(a, { lod: 0 });
  compileOnce(a, { lod: 2 });
  expect(sharedCompiles()).toEqual({ count: 2, bytes: expect.any(Number) });
  expect(sharedCompiles().bytes).toBeLessThanOrEqual(bytes * 2);
  compileOnce(a, { lod: 0, variant: 'blue' }); // pushes the first LOD0 out
  expect(sharedCompiles().bytes).toBeLessThanOrEqual(bytes * 2);
  expect(verts(compileOnce(a, { lod: 0 }))).not.toBe(verts(first));
  stop();
  expect(sharedCompiles()).toEqual({ count: 0, bytes: 0 });
  expect(verts(compileOnce(a, { lod: 2 }))).not.toBe(verts(compileOnce(a, { lod: 2 })));
});

it('shot, hero, blueprint and icon share one compile per LOD and leave it untouched', async () => {
  const out = await mkdtemp(join(tmpdir(), 't3d-compile-cache-'));
  try {
    stop = shareCompiles();
    const a = drum('shared');
    const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
    const lod0 = compileOnce(a, { lod: 0 });
    const lod2 = compileOnce(a, { lod: 2 });
    const before = [fingerprint(lod0), fingerprint(lod2)];
    builds = 0;
    const size = ['--size', '96x54'];
    await buildOne(a, parseArgs(['shot', 'x.ts', '--out', out]));
    await heroOne(a, parseArgs(['hero', 'x.ts', '--out', out, ...size]), sheet);
    await heroOne(
      a,
      parseArgs(['hero', 'x.ts', '--out', out, ...size, '--quality', 'path', '--spp', '1']),
      sheet,
    );
    await blueprintOne(a, parseArgs(['blueprint', 'x.ts', '--out', out]));
    await iconOne(a, parseArgs(['icon', 'x.ts', '--out', out]), sheet);
    expect(builds).toBe(1); // only shot's LOD1; LOD0 and LOD2 were already held
    expect(verts(compileOnce(a, { lod: 0 }))).toBe(verts(lod0));
    expect([fingerprint(lod0), fingerprint(lod2)]).toEqual(before);
    // The same bytes as a compile nobody has used.
    expect(fingerprint(lod0)).toBe(fingerprint(compile(a, { lod: 0 })));
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
