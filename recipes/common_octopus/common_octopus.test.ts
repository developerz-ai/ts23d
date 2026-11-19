// The octopus against its sources (README table) and its motion: sourced lengths along the bones,
// the two sucker rows, QA at every LOD, and clips that really move the parts they claim to.

import { describe, expect, it } from 'bun:test';
import {
  type Clip,
  type CompiledAsset,
  compile,
  quatRotate,
  runQa,
  type Vec3,
} from '@developerz.ai/ts23d';
import { clipPose, jointWorlds } from '../../src/qa/clip-pose.ts';
import { blanketCreases } from '../../src/qa/connections-crease.ts';
import { SCULPT_TRIS } from '../../src/qa/connections-seam.ts';
import { assetShells } from '../../src/qa/connections-shells.ts';
import {
  ARM_IDS,
  armRadius,
  DORSAL_ARM,
  REAL,
  REGEN_ARM,
  REGEN_FROM,
  REGEN_LENGTH,
  radiusOf,
} from './anatomy.ts';
import { common_octopus, OCTOPUS_PLAN } from './common_octopus.ts';
import { mantleTint, papillaColour, scarAt } from './skin.ts';

const SLOW = 180_000;
const lod0: CompiledAsset = compile(common_octopus, { lod: 0 });
const clips: readonly Clip[] = lod0.clips ?? [];
const clip = (name: string): Clip => {
  const c = clips.find((x) => x.name === name);
  if (!c) throw new Error(`no clip ${name}`);
  return c;
};
const skeleton = { bones: OCTOPUS_PLAN.bones };
const arc = (id: string): number =>
  OCTOPUS_PLAN.chains.find((c) => c.id === id)?.links.reduce((t, l) => t + l.length, 0) ?? 0;

function tip(c: Clip, bone: string, t: number): Vec3 {
  const b = OCTOPUS_PLAN.bones.find((x) => x.name === bone);
  const w = jointWorlds(skeleton, clipPose(c, t)).get(bone);
  if (!b || !w) throw new Error(`no bone ${bone}`);
  const o = quatRotate(w.rot, [
    b.tail[0] - b.head[0],
    b.tail[1] - b.head[1],
    b.tail[2] - b.head[2],
  ]);
  return [w.head[0] + o[0], w.head[1] + o[1], w.head[2] + o[2]];
}
const gap = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const within = (v: number, want: number, tol: number): void => {
  expect(Math.abs(v - want) / want).toBeLessThanOrEqual(tol);
};

describe('sourced anatomy', () => {
  it('total length is mantle + head + arm, and the arm share is in the published 70 to 85 %', () => {
    expect(REAL.mantle + REAL.head + REAL.arm).toBeCloseTo(REAL.total, 9);
    expect(REAL.arm / REAL.total).toBeGreaterThanOrEqual(0.7);
    expect(REAL.arm / REAL.total).toBeLessThanOrEqual(0.85);
  });

  it('holds the mantle and every arm to their lengths along the bones (2 %)', () => {
    within(arc('mantle'), REAL.mantle, 0.02);
    ARM_IDS.forEach((id, k) => {
      const want = k === REGEN_ARM ? REGEN_LENGTH : k === 0 || k === 7 ? DORSAL_ARM : REAL.arm;
      within(arc(id), want, 0.02);
    });
  });

  it('tapers every arm continuously from the web to the tip', () => {
    for (let u = 0.05; u < 1; u += 0.05) expect(armRadius(u)).toBeLessThan(armRadius(u - 0.05));
    // Half way out an arm is already well under three quarters of its base width.
    expect(armRadius(0.5) / armRadius(0)).toBeLessThan(0.6);
  });

  it('regrows one lost tip: shorter, and thinner than the stump past the break', () => {
    expect(REGEN_LENGTH).toBeLessThan(REAL.arm * 0.9);
    const before = radiusOf(REGEN_ARM, REGEN_FROM - 0.01);
    expect(radiusOf(REGEN_ARM, REGEN_FROM + 0.02)).toBeLessThan(before * 0.7);
  });

  it('carries healed scars on the mantle', () => {
    let best = 0;
    for (let u = 0; u <= 1; u += 0.01)
      best = Math.max(
        best,
        scarAt({
          u,
          angle: 0,
          s: 0,
          radius: 0.1,
          chain: 'mantle',
          lod: 0,
          p: [0, 0, 0],
          n: [0.19, -0.97, 0.15],
        }),
      );
    expect(best).toBeGreaterThan(0.8);
  });

  it('keeps the dorsal pair slightly shorter than the other arms', () => {
    expect(DORSAL_ARM).toBeLessThan(REAL.arm);
    expect(DORSAL_ARM / REAL.arm).toBeGreaterThan(0.9);
  });

  it('curls no two arms alike', () => {
    const ends = ARM_IDS.map((id) => {
      const c = OCTOPUS_PLAN.chains.find((x) => x.id === id);
      const b = c?.links.at(-1)?.bone;
      const h = c?.links[0]?.bone.head;
      if (!b || !h) throw new Error(id);
      return Math.hypot(b.tail[0] - h[0], b.tail[1] - h[1]) + b.tail[2];
    });
    expect(new Set(ends.map((e) => e.toFixed(2))).size).toBe(ends.length);
  });
});

describe('surface detail', () => {
  const part = (a: CompiledAsset, name: string) => a.parts.find((p) => p.name === name)?.mesh;

  it(
    'gates the suckers by LOD: full rows, a thinned base stretch, none far away',
    () => {
      const count = (lod: 0 | 1 | 2): number => {
        const m = part(compile(common_octopus, { lod }), 'suckers');
        return m ? m.indices.length / 3 : 0;
      };
      expect(count(0)).toBeGreaterThan(50000);
      expect(count(1)).toBeLessThan(count(0) / 8);
      expect(count(2)).toBe(0);
    },
    SLOW,
  );

  it('binds the suckers to arm bones, so they ride the arms', () => {
    const m = part(lod0, 'suckers');
    expect(m?.joints).toBeDefined();
    const names = new Set(
      [...(m?.joints ?? [])].map((j) => lod0.skeleton?.bones[j]?.name.split('_')[0]),
    );
    expect(names.has('arm')).toBe(true);
    expect(names.has('mantle')).toBe(false);
  });
});

describe('mantle', () => {
  it('colours papillae as raised skin, a shade off the mantle under them, not pale studs', () => {
    const luma = (c: readonly number[]): number =>
      0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
    for (const p of [
      [-0.1, 0.05, 0.3],
      [-0.15, -0.08, 0.32],
      [-0.2, 0, 0.36],
    ] as Vec3[]) {
      const skin = mantleTint(
        { u: 0.5, angle: 0, s: 0.1, radius: 0.1, chain: 'mantle', lod: 0, p, n: [0, 0, 1] },
        [1, 1, 1],
      );
      expect(luma(papillaColour(p)) / luma(skin)).toBeLessThan(1.45);
    }
  });

  it('is one surface with the head: no separate mantle part to leave a seam collar', () => {
    expect(lod0.parts.some((p) => p.name === 'mantle')).toBe(false);
  });

  it('lets the rib joints carry the mantle skin, so the pulse moves it', () => {
    const m = lod0.parts.find((p) => p.name === 'body')?.mesh;
    const names = lod0.skeleton?.bones.map((b) => b.name) ?? [];
    let carried = 0;
    (m?.joints ?? []).forEach((j, i) => {
      if ((m?.weights?.[i] ?? 0) > 0.2 && names[j]?.startsWith('rib_')) carried++;
    });
    expect(carried).toBeGreaterThan(500);
  });
});

describe('clips', () => {
  it('has idle, one reach per arm, fetch, crawl and the mantle pulse', () => {
    const names = clips.map((c) => c.name);
    for (const n of ['idle', 'fetch', 'crawl', 'mantle_pulse']) expect(names).toContain(n);
    for (const k of ARM_IDS.keys()) expect(names).toContain(`reach_${k}`);
  });

  it('every reach moves its own arm tip far and leaves the other arms alone', () => {
    ARM_IDS.forEach((id, k) => {
      const c = clip(`reach_${k}`);
      const end = `${id}_15`;
      expect(gap(tip(c, end, 0), tip(c, end, c.seconds))).toBeGreaterThan(0.25);
      const other = `${ARM_IDS[(k + 3) % 8]}_15`;
      expect(gap(tip(c, other, 0), tip(c, other, c.seconds))).toBeLessThan(1e-6);
    });
  });

  it('idle keeps every arm tip moving and closes on itself', () => {
    const c = clip('idle');
    for (const id of ARM_IDS) {
      const end = `${id}_15`;
      const start = tip(c, end, 0);
      const far = Math.max(...[1, 2, 3, 4, 5].map((t) => gap(start, tip(c, end, t))));
      expect(far).toBeGreaterThan(0.02);
      expect(gap(start, tip(c, end, c.seconds))).toBeLessThan(1e-3);
    }
  });

  it('crawl travels and its arms do not repeat one rhythm', () => {
    const c = clip('crawl');
    const root = c.tracks[0];
    if (!root) throw new Error('no root track');
    const n = root.times.length;
    expect(root.values[(n - 1) * 3] ?? 0).toBeGreaterThan(0.1);
    const lift = (id: string): number[] =>
      Array.from({ length: 40 }, (_, i) => tip(c, `${id}_8`, (i / 40) * c.seconds)[2]);
    expect(lift('arm_2')).not.toEqual(lift('arm_5'));
  });

  it('breathes through the mantle ribs, inside the measured range, on leaf joints only', () => {
    const c = clip('mantle_pulse');
    const scale = c.tracks.filter((t) => t.path === 'scale');
    expect(scale.length).toBe(3);
    const v = [...(scale[0]?.values ?? [])];
    expect(Math.min(...v)).toBeLessThan(0.9);
    expect(Math.max(...v)).toBeGreaterThan(1.05);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0.6);
  });

  it('stays compact: crawl under 300 KiB', () => {
    const c = clip('crawl');
    const size = c.tracks.reduce(
      (n, t) => n + t.values.byteLength,
      c.tracks[0]?.times.byteLength ?? 0,
    );
    expect(size).toBeLessThan(300 * 1024);
  });
});

describe('honest connections', () => {
  it('declares one small fold and blankets nothing', () => {
    const creases = lod0.creases ?? [];
    expect(creases.map((c) => c.name)).toEqual(['arm_crown_rear']);
    expect(blanketCreases(creases, assetShells(lod0), SCULPT_TRIS)).toEqual([]);
  });
});

describe('QA', () => {
  for (const lod of [0, 1, 2] as const)
    it(
      `passes every gate at LOD${lod}`,
      () => {
        const a = lod === 0 ? lod0 : compile(common_octopus, { lod });
        expect(runQa(a).map((f) => f.message)).toEqual([]);
      },
      SLOW,
    );
});
