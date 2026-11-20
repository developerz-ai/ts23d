// Renders must not depend on the platform's libm (defect D403). (1) Rendering a scene with a
// clearcoat, brushed metal, a glass pane, skin and a hair card (path-traced hero, raster hero,
// contact sheet, icon, thumbnail, blueprint) makes no call to Math.sin, Math.exp, Math.pow or any
// sibling. (2) A child process where glibc is told this CPU has no FMA,
// so it loads its other set of routines, gets the same film and the same float64 results from the
// samplers, the sky, the skin profile and the tone curve.
// The counters see calls only: `**` and a call a module makes once at import (raster's light, the
// optimizer's score table) are refused statically by `bun run determinism` (scripts/determinism.ts)
// in every file under src/, tests included. The asset is compiled inside the counted job, so a
// primitive or pass that went back to libm fails here too.

import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { type CompiledAsset, compile, defineAsset, translate } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { beauty } from './beauty.ts';
import { blueprint } from './blueprint.ts';
import { envBrdf, thinFilm } from './brdf.ts';
import { icon } from './icon.ts';
import { envRadiance, fromSrgb, tone, toSrgb8 } from './lighting.ts';
import { ggxAlbedo } from './path/ggx-table.ts';
import { sampleSphere } from './path/hair.ts';
import { renderPath } from './path/path-hero.ts';
import { makeSky, sampleSky, sampleSun, skyAt } from './path/sky.ts';
import { burley, sampleRadius } from './path/sss.ts';
import { contactSheet } from './sheet.ts';
import { thumbnail } from './thumbnail.ts';

const flat = (rgba: readonly number[]): Uint8Array => {
  const out = new Uint8Array(64);
  for (let i = 0; i < 16; i++) out.set(rgba, i * 4);
  return out;
};
const sheet: PaintedSheet = {
  size: 4,
  albedo: flat([230, 200, 180, 255]),
  normal: flat([128, 128, 255, 255]),
  orm: flat([255, 110, 0, 255]),
};

const scene = (): CompiledAsset =>
  compile(
    defineAsset({
      name: 'libm_probe',
      kind: 'creature',
      budget: { triangles: [600, 600, 600] },
      finishes: {
        skin: { metallic: 0, roughness: 0.5 },
        lacquer: { metallic: 0, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04 },
        brushed: { metallic: 1, roughness: 0.3, anisotropy: { strength: 0.8, rotation: 0.6 } },
      },
      build: (ctx) => {
        ctx.part(
          'torso',
          translate(
            cylinder({ radius: 0.35, length: 0.9, segments: 16, color: [0.8, 0.6, 0.5] }),
            [0, 0, 0.45],
          ),
          {
            finish: 'skin',
          },
        );
        ctx.part(
          'shell',
          translate(
            cylinder({ radius: 0.3, length: 0.5, segments: 16, color: [0.7, 0.05, 0.05] }),
            [0.8, 0, 0.25],
          ),
          { finish: 'lacquer' },
        );
        ctx.part(
          'plate',
          translate(box({ size: [0.5, 0.5, 0.3], color: [0.8, 0.8, 0.8] }), [0, 0.8, 0.15]),
          {
            finish: 'brushed',
          },
        );
        ctx.part(
          'visor',
          translate(box({ size: [0.9, 0.04, 0.7], color: [1, 1, 1] }), [0.3, -0.6, 0.35]),
          {
            surface: 'glass',
          },
        );
        ctx.part(
          'mane',
          translate(box({ size: [0.5, 0.01, 0.4], color: [0.3, 0.2, 0.1] }), [0, 0, 1.1]),
          {
            surface: 'cutout',
          },
        );
      },
    }),
  );

/** Hash of the linear float film and the 8-bit image: one changed last bit shows. */
function film(asset: CompiledAsset): string {
  const r = renderPath(asset, { width: 48, height: 32, spp: 4, sheet });
  return createHash('sha256')
    .update(new Uint8Array(r.linear.buffer, r.linear.byteOffset, r.linear.byteLength))
    .update(r.rgba)
    .digest('hex');
}

const mix = (d: Float64Array): number => (d[0] ?? 0) * 3 + (d[1] ?? 0) * 5 + (d[2] ?? 0) * 7;

/** Float64 results of the render's own maths over a fixed grid, hashed bit for bit. */
function maths(): string {
  const hash = createHash('sha256');
  const out = new Float64Array(8);
  const sky = makeSky({
    sun: [0.4, -0.5, 0.76],
    sunColor: [9, 8.5, 8],
    zenith: [0.5, 0.6, 0.9],
    horizon: [0.9, 0.9, 0.95],
    ground: [0.3, 0.28, 0.26],
  });
  const dir = new Float64Array(3);
  const pair = new Float64Array(2);
  for (let i = 0; i < 4000; i++) {
    const u = (i + 0.5) / 4000;
    const v = (((i * 2654435761) >>> 0) + 0.5) / 4294967296;
    out[0] = sampleSky(sky, u, v, dir) + mix(dir);
    out[1] = sampleSun(sky, u, v, dir) + mix(dir);
    out[2] = sampleSphere(u, v, dir) + mix(dir);
    out[3] = sampleRadius(u, 0.002 + v * 0.01) + burley(0.0005 + u * 0.01, 0.001 + v * 0.004);
    out[4] = tone(u * 6) + toSrgb8(v) + fromSrgb(u) + skyAt(sky, 2 * v - 1, i % 3);
    out[5] = envRadiance(2 * u - 1, v, i % 3) + thinFilm(i % 3, 1.3 + v, 100 + 600 * u, 0.5, v);
    envBrdf(u, v, pair);
    out[6] = mix(pair);
    ggxAlbedo(u, v, pair);
    out[7] = mix(pair);
    hash.update(new Uint8Array(out.buffer));
  }
  return hash.digest('hex');
}

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

const CHILD = 'T3D_LIBM_CHILD';
const child = process.env[CHILD] !== undefined;

it.skipIf(child)('a render never calls the platform libm', () => {
  expect(libmCalls(() => Math.hypot(Math.sin(1), Math.exp(1)))).toBe(3); // the count is live
  let built: CompiledAsset | undefined;
  expect(libmCalls(() => (built = scene()))).toBe(0);
  const asset = built ?? scene();
  expect(libmCalls(() => film(asset))).toBe(0);
  expect(libmCalls(() => maths())).toBe(0);
  expect(libmCalls(() => beauty(asset, { width: 96, height: 54, sheet }))).toBe(0);
  expect(libmCalls(() => contactSheet(asset, { sheet }))).toBe(0);
  expect(libmCalls(() => icon(asset, { sheet }))).toBe(0);
  expect(libmCalls(() => thumbnail(asset, { sheet }))).toBe(0);
  expect(libmCalls(() => blueprint(asset))).toBe(0);
});

it.skipIf(!child)('child: prints the film and maths hashes', () => {
  console.log(`FILM:${film(scene())} MATHS:${maths()}`);
});

/** [film, maths] hashes from a fresh process started with `env` on top of this one's. */
function childHashes(env: Record<string, string>): string[] {
  const run = Bun.spawnSync([process.execPath, 'test', import.meta.path], {
    env: { ...process.env, ...env, [CHILD]: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const text = run.stdout.toString() + run.stderr.toString();
  const found = /FILM:([0-9a-f]{64}) MATHS:([0-9a-f]{64})/.exec(text);
  expect([run.exitCode, found?.length]).toEqual([0, 3]);
  return [found?.[1] ?? '', found?.[2] ?? ''];
}

it.skipIf(child)(
  'gives the same bits whichever libm routines glibc picks for the CPU (FMA or not)',
  () => {
    const here = [film(scene()), maths()];
    expect(childHashes({})).toEqual(here);
    // glibc on x86-64 reads this and loads its SSE2 sin/cos/exp/pow instead of the FMA ones;
    // elsewhere it is ignored and this is the plain cross-process check.
    expect(childHashes({ GLIBC_TUNABLES: 'glibc.cpu.hwcaps=-FMA,-AVX2,-FMA4' })).toEqual(here);
  },
  60000,
);
