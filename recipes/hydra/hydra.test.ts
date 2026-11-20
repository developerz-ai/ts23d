// The hydra against its own dossier and against what its motion claims: proportions borrowed from
// real animals, four planted legs, five distinct heads, heads that look about on their own, strikes
// that stay in the acceleration bound with the body answering and the feet locked, QA at every LOD.

import { describe, expect, it } from 'bun:test';
import {
  type Clip,
  type CompiledAsset,
  compile,
  dmath,
  quatRotate,
  runQa,
  type StripId,
  stripRect,
  type Vec3,
} from '@developerz.ai/ts23d';
import { clipPose, jointWorlds } from '../../src/qa/clip-pose.ts';
import { blanketCreases } from '../../src/qa/connections-crease.ts';
import { SCULPT_TRIS } from '../../src/qa/connections-seam.ts';
import { assetShells } from '../../src/qa/connections-shells.ts';
import { DESIGN, HEAD_IDS, JAW_IDS, LEG_FEET, NECK_IDS, NECKS } from './anatomy.ts';
import { HEAD_STYLES } from './head.ts';
import { HYDRA_PLAN, hydra } from './hydra.ts';
import { KERATIN, SCALES } from './material.ts';
import { bodyRelief, mudAt } from './skin.ts';

const SLOW = 240_000;
const lod0: CompiledAsset = compile(hydra, { lod: 0 });
const clips: readonly Clip[] = lod0.clips ?? [];
const clip = (name: string): Clip => {
  const c = clips.find((x) => x.name === name);
  if (!c) throw new Error(`no clip ${name}`);
  return c;
};
const skeleton = { bones: HYDRA_PLAN.bones };
const chain = (id: string) => {
  const c = HYDRA_PLAN.chains.find((x) => x.id === id);
  if (!c) throw new Error(`no chain ${id}`);
  return c;
};
const arc = (id: string): number => chain(id).links.reduce((t, l) => t + l.length, 0);

function tip(c: Clip, bone: string, t: number): Vec3 {
  const b = HYDRA_PLAN.bones.find((x) => x.name === bone);
  const w = jointWorlds(skeleton, clipPose(c, t)).get(bone);
  if (!b || !w) throw new Error(`no bone ${bone}`);
  const o = quatRotate(w.rot, [
    b.tail[0] - b.head[0],
    b.tail[1] - b.head[1],
    b.tail[2] - b.head[2],
  ]);
  return [w.head[0] + o[0], w.head[1] + o[1], w.head[2] + o[2]];
}
const gap = (a: Vec3, b: Vec3): number => dmath.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const headTip = (k: number): string => `head_${k}_0`;

function correlation(a: readonly number[], b: readonly number[]): number {
  const mean = (v: readonly number[]): number => v.reduce((x, y) => x + y, 0) / v.length;
  const [ma, mb] = [mean(a), mean(b)];
  let [ab, aa, bb] = [0, 0, 0];
  a.forEach((x, i) => {
    const y = b[i] ?? 0;
    ab += (x - ma) * (y - mb);
    aa += dmath.pow(x - ma, 2);
    bb += dmath.pow(y - mb, 2);
  });
  return ab / Math.sqrt(aa * bb);
}

describe('design against the borrowed animals', () => {
  it('has a tail about as long as the body, as a monitor lizard does', () => {
    const [body, tail] = [arc('body'), arc('tail')];
    expect(Math.abs(body - DESIGN.trunk) / DESIGN.trunk).toBeLessThan(0.05);
    expect(Math.abs(tail - DESIGN.tail) / DESIGN.tail).toBeLessThan(0.08);
    expect(tail / body).toBeGreaterThan(0.9);
    expect(tail / body).toBeLessThan(1.25);
  });

  it('stretches the necks past the giraffe maximum of 2.4 m, by at most a half', () => {
    for (const id of NECK_IDS) {
      expect(arc(id)).toBeGreaterThan(2.4);
      expect(arc(id)).toBeLessThan(2.4 * 1.5);
    }
  });

  it('stands on four feet on the ground, every leg a real limb', () => {
    expect(LEG_FEET).toHaveLength(4);
    for (const id of LEG_FEET) {
      const c = chain(id);
      expect(c.links).toHaveLength(3);
      const last = c.links.at(-1)?.bone;
      expect(last?.tail[2] ?? 1).toBeLessThan(0.12);
      const drop = (c.links[0]?.bone.head[2] ?? 0) - (last?.tail[2] ?? 0);
      expect(drop).toBeGreaterThan(0.5 * c.length);
    }
    const feet = lod0.parts.find((p) => p.name === 'feet')?.mesh;
    const zs = [...(feet?.positions ?? [])].filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeGreaterThan(-0.01);
    expect(Math.min(...zs)).toBeLessThan(0.01);
  });
});

describe('five distinct heads', () => {
  it('gives each head its own ornament', () => {
    expect(new Set(HEAD_STYLES.map((s) => s.ornament)).size).toBe(NECKS);
  });

  it('binds skulls, jaws, eyes, horns and teeth to the head and jaw bones only', () => {
    const allowed = new Set([...HEAD_IDS, ...JAW_IDS].map((id) => `${id}_0`));
    for (const name of ['heads', 'jaws', 'eyes', 'horns', 'teeth']) {
      const m = lod0.parts.find((p) => p.name === name)?.mesh;
      expect(m?.joints).toBeDefined();
      const used = new Set<number>();
      (m?.joints ?? []).forEach((j, i) => {
        if ((m?.weights?.[i] ?? 0) > 0) used.add(j);
      });
      for (const j of used) expect(allowed.has(HYDRA_PLAN.bones[j]?.name ?? '')).toBe(true);
    }
  });

  it(
    'drops teeth at LOD2 and keeps the horns',
    () => {
      const far = compile(hydra, { lod: 2 });
      expect(far.parts.some((p) => p.name === 'teeth')).toBe(false);
      expect(far.parts.some((p) => p.name === 'horns')).toBe(true);
    },
    SLOW,
  );
});

describe('idle', () => {
  const idle = clip('idle');
  const frames = Array.from({ length: 64 }, (_, f) =>
    Array.from({ length: NECKS }, (_, k) => tip(idle, headTip(k), (f / 64) * idle.seconds)),
  );

  it('moves every head, each on its own loop', () => {
    for (let k = 0; k < NECKS; k++) {
      const ys = frames.map((f) => f[k]?.[1] ?? 0);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.05);
    }
    for (let i = 0; i < NECKS; i++)
      for (let j = i + 1; j < NECKS; j++) {
        const y = (k: number): number[] => frames.map((f) => f[k]?.[1] ?? 0);
        expect(Math.abs(correlation(y(i), y(j)))).toBeLessThan(0.85);
      }
  });

  it('never swaps the order of the heads across the fan', () => {
    for (const f of frames)
      for (let k = 1; k < NECKS; k++) expect(f[k]?.[1] ?? 0).toBeGreaterThan(f[k - 1]?.[1] ?? 0);
  });
});

describe('strikes', () => {
  const each = Array.from({ length: NECKS }, (_, k) => k);

  it('drives the head well away and back, inside the snake acceleration bound', () => {
    for (const k of each) {
      const c = clip(`strike_${k}`);
      const n = (c.tracks[0]?.times.length ?? 1) - 1;
      const dt = c.seconds / n;
      const path = Array.from({ length: n + 1 }, (_, i) => tip(c, headTip(k), i * dt));
      const start = path[0] as Vec3;
      expect(Math.max(...path.map((p) => gap(p, start)))).toBeGreaterThan(0.3);
      let peak = 0;
      for (let i = 1; i < n; i++) {
        const [a, b, d] = [path[i - 1] as Vec3, path[i] as Vec3, path[i + 1] as Vec3];
        peak = Math.max(
          peak,
          dmath.hypot(a[0] - 2 * b[0] + d[0], a[1] - 2 * b[1] + d[1], a[2] - 2 * b[2] + d[2]) /
            (dt * dt),
        );
      }
      expect(peak).toBeLessThanOrEqual(279);
    }
  });

  it('moves the body against the strike while every foot stays planted', () => {
    for (const k of each) {
      const c = clip(`strike_${k}`);
      const root = c.tracks[0];
      if (!root) throw new Error('no root track');
      const n = root.times.length;
      const shift = Array.from({ length: n }, (_, i) =>
        dmath.hypot(root.values[i * 3] ?? 0, root.values[i * 3 + 1] ?? 0),
      );
      expect(Math.max(...shift)).toBeGreaterThan(0.01);
      for (const leg of LEG_FEET) {
        const bone = `${leg}_2`;
        const rest = tip(c, bone, 0);
        for (let i = 0; i < n; i++)
          expect(gap(tip(c, bone, root.times[i] ?? 0), rest)).toBeLessThan(0.002);
      }
    }
  });

  it('gapes the jaw of the striking head and snaps it shut at the end of the lunge', () => {
    const c = clip('strike_2');
    const n = 48;
    const opening = Array.from({ length: n + 1 }, (_, i) => {
      const t = (i / n) * c.seconds;
      return gap(tip(c, 'jaw_2_0', t), tip(c, 'head_2_0', t));
    });
    const widest = Math.max(...opening);
    const at = opening.indexOf(widest);
    expect(widest).toBeGreaterThan((opening[0] ?? 0) + 0.08);
    expect(Math.min(...opening.slice(at))).toBeLessThan(widest - 0.08);
  });
});

describe('honest connections', () => {
  const shells = assetShells(lod0);

  it('declares only small folds: none blankets a piece, none is over 14 cm', () => {
    expect(blanketCreases(lod0.creases ?? [], shells, SCULPT_TRIS)).toEqual([]);
    for (const c of lod0.creases ?? []) expect(c.radius).toBeLessThanOrEqual(0.14);
  });

  it('says why for every crease', () => {
    for (const c of lod0.creases ?? []) expect(c.why?.length ?? 0).toBeGreaterThan(10);
  });

  it('lets horns, teeth, claws and spines face the grown-appendage checks', () => {
    for (const name of ['horns', 'teeth', 'claws', 'spines'])
      expect(lod0.parts.find((p) => p.name === name)?.connect).toBeUndefined();
  });
});

describe('surface and wear', () => {
  const part = (name: string) => {
    const m = lod0.parts.find((p) => p.name === name)?.mesh;
    if (!m) throw new Error(`no part ${name}`);
    return m;
  };
  const rowOf = (strip: StripId): [number, number] => {
    const r = stripRect(strip);
    return [r.v0, r.v1];
  };
  const onStrip = (name: string, strip: StripId): number => {
    const m = part(name);
    const [v0, v1] = rowOf(strip);
    let n = 0;
    for (let i = 1; i < m.uvs.length; i += 2)
      if ((m.uvs[i] ?? 0) >= v0 && (m.uvs[i] ?? 0) <= v1) n++;
    return n / (m.uvs.length / 2);
  };
  it('puts the skin on the scale strip and horns, claws, teeth on keratin', () => {
    expect(onStrip('body', SCALES)).toBeGreaterThan(0.95);
    for (const name of ['horns', 'claws', 'teeth', 'spines'])
      expect(onStrip(name, KERATIN)).toBeGreaterThan(0.95);
  });
  it('rounds the trunk into a barrel: widest mid-trunk, not a box between the legs', () => {
    const flankAt = (u: number): number =>
      bodyRelief({
        u,
        angle: Math.PI / 2,
        s: u * 2.9,
        radius: 0.55,
        chain: 'body',
        lod: 0,
        p: [0, 0.6, 1],
        n: [0, 1, 0],
      });
    expect(flankAt(0.5) - flankAt(0.25)).toBeGreaterThan(0.08);
    expect(flankAt(0.5) - flankAt(0.75)).toBeGreaterThan(0.08);
  });
  it('cakes mud on the feet and up the shins, broad enough to read from the hero camera', () => {
    expect(mudAt([1.2, 0.9, 0.05])).toBeGreaterThan(0.6);
    expect(mudAt([1.0, 0.9, 0.35])).toBeGreaterThan(0.5);
    expect(mudAt([0, 0, 1.6], 0)).toBe(0);
  });
  it('spends LOD0 on heads, not on rings: the body is under a third of the triangles', () => {
    const tris = (name: string): number => part(name).indices.length / 3;
    const all = lod0.parts.reduce((t, p) => t + (p.mesh?.indices.length ?? 0) / 3, 0);
    expect(tris('body') / all).toBeLessThan(1 / 3);
    expect(all).toBeLessThan(165_000);
  });
});

describe('QA', () => {
  for (const lod of [0, 1, 2] as const)
    it(
      `passes every gate at LOD${lod}`,
      () => {
        const a = lod === 0 ? lod0 : compile(hydra, { lod });
        expect(runQa(a).map((f) => f.message)).toEqual([]);
      },
      SLOW,
    );
});
