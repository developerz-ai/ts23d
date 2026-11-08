// One character's face from the shared base: the race + character targets drive a thin-plate warp
// of every base vertex (`tpsWarp`, src/primitives/warp-solve.ts), the ears get their own
// deformer, then the whole bust scales to the race's head size about the chest cut. Returns the
// warped quad mesh (base topology: edge loops kept) and a mapper for any base point (eye centres,
// hair and tusk roots follow the same warp).

import { type Rng, type Tps, Ts23dError, tpsWarp, type Vec3 } from '@developerz.ai/ts23d';
import { faceBase, type QuadMesh } from './base.ts';
import { earMask, shapeEars } from './ears.ts';
import { LEFT, mirrorY } from './landmarks.ts';
import type { Character } from './spec.ts';
import { warpPairs } from './targets.ts';

/** The chest cut on the base (z, metres): the bust's bottom; scaling pivots here. */
export const CUT_Z = 0.452;
const PIVOT: Vec3 = [0.03, 0, CUT_Z];

export interface FaceHead {
  readonly mesh: QuadMesh;
  /** Base point → bust point (warp, then scale). */
  readonly map: (p: Vec3) => Vec3;
  /** Local size factor of the warp at a base point (cube root of the Jacobian's determinant). */
  readonly sizeAt: (p: Vec3) => number;
  readonly scale: number;
  readonly tps: Tps;
  /** Left and right ear tips after the ear deformer (bust space): hair keeps clear of them. */
  readonly earTips: readonly [Vec3, Vec3];
}

/** Ratios must stay positive and finite, knobs in range: a zero scale or width collapses the head. */
function check(c: Character): void {
  const r = c.race;
  const ratios: [string, number][] = [
    ['scale', r.scale],
    ['cranium.width', r.cranium.width],
    ['cranium.height', r.cranium.height],
    ['cranium.depth', r.cranium.depth],
    ['eyes.spacing', r.eyes.spacing],
    ['eyes.open', r.eyes.open],
    ['nose.width', r.nose.width],
    ['nose.projection', r.nose.projection],
    ['nose.length', r.nose.length],
    ['zygoma.width', r.zygoma.width],
    ['jaw.width', r.jaw.width],
    ['chin.width', r.chin.width],
    ['mouth.width', r.mouth.width],
    ['face', r.face],
    ['ears.length', r.ears.length],
    ['body.neck', r.body.neck],
    ['body.shoulders', r.body.shoulders],
  ];
  for (const [k, v] of ratios)
    if (!(v > 0.2 && v < 5))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `face preset ${k} = ${v}`,
        fix: 'keep every ratio against the human base between 0.2 and 5 (1 = human)',
      });
  for (const [k, v, lo, hi] of [
    ['age', c.age, 0, 1],
    ['weight', c.weight, -1, 1],
    ['asym', c.asym, 0, 1],
  ] as const)
    if (!(v >= lo && v <= hi))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `character ${k} = ${v}`,
        fix: `keep ${k} in [${lo}, ${hi}] (it is a ratio-like knob, not metres)`,
      });
}

export function faceHead(c: Character, rng: Rng): FaceHead {
  check(c);
  const { mesh: base } = faceBase();
  const pairs = warpPairs(c, rng.fork('asym'));
  const tps = tpsWarp(pairs.from, pairs.to, { stiffness: 0 });
  const s = c.race.scale;
  const scaled = (q: Vec3): Vec3 => [
    PIVOT[0] + (q[0] - PIVOT[0]) * s,
    PIVOT[1] + (q[1] - PIVOT[1]) * s,
    PIVOT[2] + (q[2] - PIVOT[2]) * s,
  ];
  const p = new Float64Array(base.p.length);
  for (let v = 0; v < p.length; v += 3) {
    const q = tps.map([base.p[v] ?? 0, base.p[v + 1] ?? 0, base.p[v + 2] ?? 0]);
    p[v] = q[0];
    p[v + 1] = q[1];
    p[v + 2] = q[2];
  }
  const frame = (side: 1 | -1) => {
    const f = (k: Vec3): Vec3 => tps.map(side > 0 ? k : mirrorY(k));
    return { top: f(LEFT.earTop), lobe: f(LEFT.earLobe), tragion: f(LEFT.tragion) };
  };
  shapeEars(p, earMask(base), c.race.ears, frame(1), frame(-1));
  // The helix tops through the same deformer (weight 1), for the hair to avoid.
  const tips = new Float64Array([...tps.map(LEFT.earTop), ...tps.map(mirrorY(LEFT.earTop))]);
  shapeEars(tips, new Float32Array([1, 1]), c.race.ears, frame(1), frame(-1));
  const tip = (i: number): Vec3 =>
    scaled([tips[i * 3] ?? 0, tips[i * 3 + 1] ?? 0, tips[i * 3 + 2] ?? 0]);
  for (let v = 0; v < p.length; v += 3) {
    const q = scaled([p[v] ?? 0, p[v + 1] ?? 0, p[v + 2] ?? 0]);
    p[v] = q[0];
    p[v + 1] = q[1];
    p[v + 2] = q[2];
  }
  const sizeAt = (q: Vec3): number => {
    const [a = 1, b = 0, cc = 0, d = 0, e = 1, f = 0, g = 0, h = 0, i = 1] = tps.jacobian(q);
    const det = a * (e * i - f * h) - b * (d * i - f * g) + cc * (d * h - e * g);
    return Math.cbrt(Math.max(1e-3, det)) * s;
  };
  return {
    mesh: { p, q: base.q },
    map: (q) => scaled(tps.map(q)),
    sizeAt,
    scale: s,
    tps,
    earTips: [tip(0), tip(1)],
  };
}
