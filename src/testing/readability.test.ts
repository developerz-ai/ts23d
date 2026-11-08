import { describe, expect, it } from 'bun:test';
import {
  type Asset,
  type BuildContext,
  defineAsset,
  Ts23dError,
  type Vec2,
  type Vec3,
} from '../core/index.ts';
import { box, lathe, prism, sdf } from '../primitives/index.ts';
import {
  artMetrics,
  assertArt,
  focalPoint,
  grounded,
  restAreas,
  shapeLanguage,
  silhouetteReads,
} from './readability.ts';

const grey: Vec3 = [0.5, 0.5, 0.5];
const white: Vec3 = [0.9, 0.9, 0.9];
const black: Vec3 = [0.03, 0.03, 0.03];

const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? `${e.code} ${e.message} fix: ${e.fix}` : `non-ts23d ${e}`;
  }
  return 'passed';
};

const asset = (name: string, build: (ctx: BuildContext) => void, kind = 'prop'): Asset =>
  defineAsset({ name, kind, budget: { triangles: [99999, 99999, 99999] }, build });

const ball = (r: number, at: Vec3, color: Vec3) =>
  lathe({
    profile: Array.from({ length: 17 }, (_, k): Vec2 => {
      const a = -Math.PI / 2 + (k * Math.PI) / 16;
      return [Math.max(1e-4, r * Math.cos(a)), r + r * Math.sin(a)];
    }),
    segments: 32,
    color,
    at,
  });

/** A block with a mast; `dropMast` loses the mast at LOD2 — the thumbnail changes. */
const tower = (dropMast: boolean) =>
  asset(`tower_${dropMast ? 'bad' : 'ok'}`, (ctx) => {
    ctx.part('body', box({ size: [2, 2, 2], color: grey }));
    if (!(dropMast && ctx.lod === 2))
      ctx.part('mast', box({ size: [0.7, 0.7, 3], at: [0, 0, 2], color: grey }));
  });

describe('silhouetteReads — failure case first', () => {
  it('fails when LOD2 drops a big mass, naming the view and IoU', () => {
    const r = code(() => silhouetteReads(tower(true)));
    expect(r).toContain('T3D_ART_SILHOUETTE');
    expect(r).toMatch(/from front matches LOD0 at IoU 0\.\d+ < 0\.85/);
  }, 30_000); // first beauty render paints the default trim sheet
  it('passes when LOD2 keeps every mass', () => {
    for (const v of silhouetteReads(tower(false))) expect(v.iou).toBeGreaterThan(0.99);
  });
});

/** A blob covered in uniform bumps (noise everywhere) vs a plain block with one greeble cluster. */
const noisyBlob = asset('noisy_blob', (ctx) => {
  const bump = ([x, y, z]: Vec3): number =>
    Math.hypot(x, y, z - 1) - 1 + 0.04 * Math.sin(25 * x) * Math.sin(25 * y) * Math.sin(25 * z);
  const bounds: [Vec3, Vec3] = [
    [-1.2, -1.2, -0.2],
    [1.2, 1.2, 2.2],
  ];
  ctx.part('blob', sdf({ field: bump, bounds, resolution: 0.025, lipschitz: 2, color: grey }));
});
const clustered = asset('clustered', (ctx) => {
  ctx.part('block', box({ size: [2, 2, 2], color: grey }));
  for (let k = 0; k < 120; k++) {
    const at: Vec3 = [1, ctx.rng.range(-0.6, 0.1), ctx.rng.range(1.2, 1.95)];
    ctx.part(`greeble_${k}`, box({ size: [0.1, 0.1, 0.1], at, color: grey }));
  }
});

describe('restAreas — failure case first', () => {
  it('fails uniform detail everywhere (no calm surface)', () => {
    const r = code(() => restAreas(noisyBlob));
    expect(r).toContain('T3D_ART_REST');
    expect(r).toMatch(/calm surface covers \d+% of the visible asset < 25%/);
  }, 30_000); // meshing the noisy SDF
  it('passes calm planes with detail clustered', () => {
    const m = restAreas(clustered);
    expect(m.share).toBeGreaterThan(0.5);
    expect(m.spread).toBeGreaterThan(0.3);
  });
});

/** A white column striped black (loud) under a plain grey ball named head (quiet). */
const totem = asset('totem', (ctx) => {
  ctx.part('body', box({ size: [1, 1, 2], color: white }));
  for (let k = 0; k < 6; k++)
    ctx.part(
      `body_stripe_${k}`,
      box({ size: [1.04, 1.04, 0.12], at: [0, 0, 0.2 + k * 0.3], color: black }),
    );
  ctx.part('head', ball(0.45, [0, 0, 2], grey));
});

describe('focalPoint — failure case first', () => {
  it('fails when the contrast peak is not on the declared focal part', () => {
    const r = code(() => focalPoint(totem, { art: { focal: 'head' } }));
    expect(r).toContain('T3D_ART_FOCAL');
    expect(r).toMatch(/contrast sits on 'body(_stripe_\d)?', not head/);
  });
  it('passes when it is (prefix: body covers body_stripe_*)', () => {
    expect(focalPoint(totem, { art: { focal: 'body' } }).focalShare).toBeGreaterThan(0.5);
  });
  it('only reports when no focal is declared', () => {
    expect(focalPoint(totem).peakPart).toMatch(/^body/);
  });
});

/** Two stacked blocks: `lightTop` = dark base, light top (grounded). */
const figure = (lightTop: boolean, kind = 'character') =>
  asset(
    `figure_${lightTop ? 'ok' : 'bad'}_${kind}`,
    (ctx) => {
      ctx.part('legs', box({ size: [1, 1, 1], color: lightTop ? black : white }));
      ctx.part('torso', box({ size: [1, 1, 1], at: [0, 0, 1], color: lightTop ? white : black }));
    },
    kind,
  );

describe('grounded — failure case first', () => {
  it('fails a character that is light at the base and dark on top', () => {
    const r = code(() => grounded(figure(false)));
    expect(r).toContain('T3D_ART_GROUNDED');
    expect(r).toMatch(/luminance falls from base to top \(rise -0\.\d+\)/);
  });
  it('passes dark base, light top', () => {
    expect(grounded(figure(true))?.rise).toBeGreaterThan(0.2);
  });
  it('skips kinds where it means nothing, unless declared', () => {
    expect(grounded(figure(false, 'prop'))).toBeUndefined();
    expect(code(() => grounded(figure(false, 'prop'), { art: { grounded: true } }))).toContain(
      'T3D_ART_GROUNDED',
    );
  });
});

const star = (n: number, r0: number, r1: number): Vec2[] =>
  Array.from({ length: n * 2 }, (_, k) => {
    const a = (k * Math.PI) / n;
    const r = k % 2 ? r1 : r0;
    return [r * Math.cos(a), 1.2 + r * Math.sin(a)];
  });
const spiky = asset('spiky', (ctx) => {
  for (const plane of ['xz', 'yz'] as const)
    ctx.part(
      `star_${plane}`,
      prism({ profile: star(5, 1.2, 0.3), depth: 0.3, plane, color: grey }),
    );
});
const cube = asset('cube', (ctx) => ctx.part('body', box({ size: [2, 2, 2], color: grey })));
const orb = asset('orb', (ctx) => ctx.part('body', ball(1, [0, 0, 0], grey)));

describe('shapeLanguage — failure case first', () => {
  it('fails a block declared aggressive, with the measured class', () => {
    const r = code(() => shapeLanguage(cube, { art: { shape: 'aggressive' } }));
    expect(r).toContain('T3D_ART_SHAPE');
    expect(r).toMatch(/silhouette reads stable .* declared aggressive/);
  });
  it('classifies spikes, blocks and balls', () => {
    expect(shapeLanguage(spiky).shape).toBe('aggressive');
    expect(shapeLanguage(cube).shape).toBe('stable');
    expect(shapeLanguage(orb).shape).toBe('friendly');
  });
});

describe('assertArt', () => {
  it('throws the first T3D_ART_* code and lists every finding with value and limit', () => {
    const r = code(() => assertArt(tower(true), { art: { shape: 'friendly' } }));
    expect(r).toStartWith('T3D_ART_SILHOUETTE');
    expect(r).toContain('T3D_ART_SHAPE');
    expect(r).toMatch(/measured 0\.\d+, limit 0\.85/);
  });
  it('passes a sound asset and returns the metrics, deterministically', () => {
    const m = assertArt(tower(false));
    expect(m.shape.shape).toBe('stable');
    expect(JSON.stringify(artMetrics(tower(false)).metrics)).toBe(JSON.stringify(m));
  });
});
