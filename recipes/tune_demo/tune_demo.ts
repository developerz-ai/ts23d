// Tune demo: a two-handled storage amphora whose ten proportions are `tune.params`. The defaults
// make a squat jar; `t3d tune` fits the front silhouette to the hand-drawn `target_front.svg` and
// commits the numbers to `tune.json`, imported below, so every build reads the same values
// (docs/idea/20-tuning.md). Body: a lathe through a monotone cubic profile (no overshoot between
// stations), closed at the base and inside the neck. Handles: tubes swept along a cubic from the
// neck to the shoulder, both ends sunk into the wall. Dossier: recipes/tune_demo/README.md.

import { defineAsset, hex, lathe, sweep, type Vec2, type Vec3 } from '@developerz.ai/ts23d';
import saved from './tune.json';

const H = 0.6;
const CLAY = hex('#b5643c');
const WALL = 0.012;
const TUBE = 0.013;

/** Fritsch–Carlson monotone cubic through (z, r) stations, z strictly increasing. */
function monotone(st: readonly Vec2[]): (z: number) => number {
  const n = st.length;
  const d = st.slice(1).map((p, i) => {
    const q = st[i] ?? p;
    return (p[1] - q[1]) / (p[0] - q[0]);
  });
  const m = st.map((_, i) => {
    if (i === 0) return d[0] ?? 0;
    if (i === n - 1) return d[n - 2] ?? 0;
    const a = d[i - 1] ?? 0;
    const b = d[i] ?? 0;
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  return (z) => {
    let i = 0;
    while (i < n - 2 && z > (st[i + 1]?.[0] ?? z)) i++;
    const [z0, r0] = st[i] ?? [0, 0];
    const [z1, r1] = st[i + 1] ?? [z0 + 1, r0];
    const h = z1 - z0;
    const t = Math.min(1, Math.max(0, (z - z0) / h));
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * r0 +
      (t3 - 2 * t2 + t) * h * (m[i] ?? 0) +
      (-2 * t3 + 3 * t2) * r1 +
      (t3 - t2) * h * (m[i + 1] ?? 0)
    );
  };
}

const cubic = (p: readonly Vec3[], t: number): Vec3 => {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  const at = (k: 0 | 1 | 2): number => p.reduce((s, q, i) => s + (w[i] ?? 0) * q[k], 0);
  return [at(0), at(1), at(2)];
};

export const tune_demo = defineAsset({
  name: 'tune_demo',
  kind: 'prop',
  description:
    'Two-handled storage amphora whose proportions were fitted to a drawn front silhouette by `t3d tune`',
  tags: ['tune', 'demo', 'amphora', 'pottery', 'lathe'],
  license: 'CC0-1.0',
  budget: { triangles: [5000, 1500, 400] },
  tune: {
    params: {
      footR: { min: 0.03, max: 0.12, default: 0.1, step: 0.0005 },
      bellyR: { min: 0.08, max: 0.24, default: 0.2, step: 0.0005 },
      bellyZ: { min: 0.25, max: 0.6, default: 0.35, step: 0.0025 },
      shoulder: { min: 0, max: 1, default: 0.5, step: 0.005 },
      neckR: { min: 0.03, max: 0.1, default: 0.09, step: 0.0005 },
      neckZ: { min: 0.65, max: 0.88, default: 0.7, step: 0.0025 },
      lipFlare: { min: 0.9, max: 1.7, default: 1.1, step: 0.005 },
      handleReach: { min: 0, max: 0.12, default: 0.01, step: 0.0005 },
      handleTop: { min: 0.2, max: 0.9, default: 0.45, step: 0.005 },
      handleRise: { min: 0, max: 0.08, default: 0.03, step: 0.0005 },
    },
    objectives: [{ kind: 'silhouette', view: '+X', mask: 'target_front.svg' }],
    saved,
  },
  build(ctx) {
    const v = (n: string): number => ctx.tuned(n);
    const zB = v('bellyZ') * H;
    const zN = v('neckZ') * H;
    const r = monotone([
      [0, v('footR')],
      [0.05 * H, v('footR') * 0.72],
      [zB, v('bellyR')],
      [(zB + zN) / 2, v('neckR') + v('shoulder') * (v('bellyR') - v('neckR'))],
      [zN, v('neckR')],
      [0.95 * H, v('neckR') * 0.96],
      [H, v('neckR') * v('lipFlare')],
    ]);
    const rows = ctx.pick([44, 22, 9]);
    const profile: Vec2[] = [[0, 0]];
    for (let i = 0; i <= rows; i++) {
      const z = (i / rows) * H;
      profile.push([r(z), z]);
    }
    const inner = v('neckR') * 0.96 - WALL;
    profile.push([v('neckR') * v('lipFlare') - WALL, H], [inner, H - 0.06], [0, H - 0.06]);
    ctx.part(
      'body',
      lathe({ profile, segments: ctx.pick([36, 18, 8]), color: CLAY, strip: 'plain' }),
    );

    // Loop handles at ±Y, neck → shoulder; ends sunk WALL into the vessel so they touch it.
    const zA = zN + v('handleTop') * (0.95 * H - zN);
    const zS = zN - 0.4 * (zN - zB);
    const reach = v('handleReach');
    for (const [side, s] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      const ctrl: Vec3[] = [
        [0, s * (r(zA) - WALL), zA],
        [0, s * (r(zA) + reach + 0.05), zA + v('handleRise')],
        [0, s * (r(zS) + reach + 0.04), zS + 0.06],
        [0, s * (r(zS) - WALL), zS],
      ];
      const steps = ctx.pick([16, 9, 4]);
      ctx.part(
        `handle_${side}`,
        sweep({
          section: { radius: TUBE, segments: ctx.pick([10, 7, 4]) },
          path: Array.from({ length: steps + 1 }, (_, i) => cubic(ctrl, i / steps)),
          color: CLAY,
          strip: 'plain',
          caps: true,
        }),
      );
    }
  },
});
