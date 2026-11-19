// City wear as vertex colour. The story is a century of New York street life: traffic grime and
// splash darken the first storey, soot settles in a band under every cornice and drips below it,
// each building has its own age (fresh repointing next to a sooty neighbour), tar roofs are
// patched in different greys.

import { type Mesh, type Rng, type Vec3, valueNoise } from '@developerz.ai/ts23d';

export type Shade = (p: Vec3, n: Vec3, c: Vec3) => Vec3;

/** Run `f` over every vertex colour (meshes in asset space). */
export function shade(m: Mesh, f: Shade): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const at = (a: Float32Array, k: number): number => a[i * 3 + k] ?? 0;
    const p: Vec3 = [at(m.positions, 0), at(m.positions, 1), at(m.positions, 2)];
    const n: Vec3 = [at(m.normals, 0), at(m.normals, 1), at(m.normals, 2)];
    colors.set(f(p, n, [at(colors, 0), at(colors, 1), at(colors, 2)]), i * 3);
  }
  return { ...m, colors };
}

const mix = (c: Vec3, to: Vec3, w: number): Vec3 => {
  const k = Math.min(1, Math.max(0, w));
  return [c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k, c[2] + (to[2] - c[2]) * k];
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const GRIME: Vec3 = [0.05, 0.045, 0.04];
const SOOT: Vec3 = [0.025, 0.023, 0.022];

/**
 * Facade wear for one building: street grime up to ~2.5 m (ragged), a soot band under the roof
 * line fading 2 m down, and blotchy age over the wall; `age` 0..1 is the building's own.
 */
export function facadeWear(rng: Rng, o: { base: number; top: number; age: number }): Shade {
  const blot = valueNoise(rng.fork('facade'), { scale: 2.5, octaves: 3 });
  return (p, _n, c) => {
    const h = p[2] - o.base;
    const b = blot(p);
    let out = mix(c, GRIME, (0.35 + 0.3 * o.age) * (1 - smooth(0.6, 2.6 + 0.6 * b, h)));
    out = mix(out, SOOT, (0.25 + 0.45 * o.age) * smooth(o.top - 2.4 - b, o.top - 0.2, p[2]));
    return mix(out, GRIME, 0.18 * o.age * smooth(-0.1, 0.6, b));
  };
}

/**
 * Roof grime: a tone per roof that drifts slowly across the block (patching shows as its own
 * boxes). A roof is two triangles, so 3 m blotches sampled at its corners drew diagonal seams
 * across it; at 25 m a roof's corners agree.
 */
export function roofWear(rng: Rng): Shade {
  const blot = valueNoise(rng.fork('roof'), { scale: 25, octaves: 2 });
  return (p, n, c) => (n[2] > 0.5 ? mix(c, GRIME, 0.35 * smooth(-0.2, 0.6, blot(p))) : c);
}
