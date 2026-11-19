// Water-tank wear as vertex colour: the story is water. Leaks weep down the staves from the chime
// and the hoop lugs and soak the bottom course dark; drips off the tank floor stain the joists, the
// cap ring and the post heads; the shaded north faces of the footings grow moss; sun bleaches what
// faces up. Pure colour work on finished meshes (shape stays in water_tower.ts), seeded noise only.

import { type Mesh, type Rng, type Vec3, valueNoise } from '@developerz.ai/ts23d';

/** One vertex as the shader sees it: world position, normal and current colour. */
export type Shade = (p: Vec3, n: Vec3, c: Vec3) => Vec3;

/** Run `f` over every vertex colour (the mesh is in asset space: parts are authored at origin). */
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

export const mix = (c: Vec3, to: Vec3, w: number): Vec3 => {
  const k = Math.min(1, Math.max(0, w));
  return [c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k, c[2] + (to[2] - c[2]) * k];
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const WET: Vec3 = [0.09, 0.07, 0.045];
const ALGAE: Vec3 = [0.1, 0.11, 0.05];
const MOSS: Vec3 = [0.2, 0.26, 0.09];
const SILVER: Vec3 = [0.62, 0.6, 0.56];

export interface TankWear {
  readonly floorZ: number;
  readonly topZ: number;
  /** Angle (rad) of the outlet: the heaviest weep runs down under it. */
  readonly outletAngle: number;
  readonly outletZ: number;
}

/**
 * Staves: the bottom 0.5 m soaked (the chime always weeps), long vertical weeps from a few staves
 * (noise stretched 12× along Z, so a stain follows one stave down), a heavy run under the outlet
 * flange, and the top course sun-bleached silver where rain dries fastest.
 */
export function tankWear(rng: Rng, w: TankWear): Shade {
  const streak = valueNoise(rng.fork('streak'), { scale: 0.35, octaves: 2 });
  const blot = valueNoise(rng.fork('blot'), { scale: 0.9, octaves: 3 });
  const h = w.topZ - w.floorZ;
  return (p, _n, c) => {
    const up = (p[2] - w.floorZ) / h;
    const a = Math.atan2(p[1], p[0]);
    let out = mix(c, SILVER, 0.35 * smooth(0.82, 1, up) * (0.6 + 0.4 * blot(p)));
    out = mix(out, ALGAE, 0.7 * (1 - smooth(0.0, 0.22, up)) * (0.7 + 0.3 * blot(p)));
    const s = streak([p[0] * 1.6, p[1] * 1.6, p[2] * 0.08]);
    out = mix(out, WET, 0.75 * smooth(0.1, 0.55, s) * (1 - smooth(0.35, 1, up)));
    const da = Math.abs(Math.atan2(Math.sin(a - w.outletAngle), Math.cos(a - w.outletAngle)));
    const under = (1 - smooth(0.04, 0.12, da)) * (1 - smooth(w.outletZ - 0.2, w.outletZ, p[2]));
    return mix(out, WET, 0.7 * under);
  };
}

export interface TrestleWear {
  /** Tank floor: the drip line. */
  readonly floorZ: number;
  readonly footH: number;
  /** Direction toward the sun (unit, xy): the far side of a footing is the mossy side. */
  readonly sun: readonly [number, number];
}

/**
 * Timber under the tank: drips off the floor darken everything near it, fading down the posts in
 * runs; footings get moss on their shaded faces and a dark wet line at the ground.
 */
export function trestleWear(rng: Rng, w: TrestleWear): Shade {
  const run = valueNoise(rng.fork('drip'), { scale: 0.3, octaves: 2 });
  const patch = valueNoise(rng.fork('moss'), { scale: 0.25, octaves: 3 });
  return (p, n, c) => {
    const drip = 1 - smooth(0.6, 3.4, w.floorZ - p[2]);
    const r = run([p[0] * 2.5, p[1] * 2.5, p[2] * 0.15]);
    let out = mix(c, WET, 0.75 * drip * (0.35 + 0.65 * smooth(-0.3, 0.4, r)));
    if (p[2] <= w.footH + 0.05) {
      const shaded = 1 - smooth(-0.3, 0.3, n[0] * w.sun[0] + n[1] * w.sun[1]);
      const low = 1 - smooth(0, w.footH + 0.05, p[2]);
      const m = shaded * (0.35 + 0.65 * low) * smooth(-0.3, 0.4, patch(p));
      out = mix(out, MOSS, 0.75 * m * (n[2] > 0.7 ? 0.6 : 1));
      out = mix(out, WET, 0.35 * (1 - smooth(0, 0.12, p[2])));
    }
    return out;
  };
}

const LICHEN: Vec3 = [0.36, 0.38, 0.2];
const SOOT: Vec3 = [0.06, 0.055, 0.05];

/**
 * Shingle roof: lichen and moss in blotches on the north (shaded) slopes, a sun-bleached crown,
 * dark run-off lines along the eave, and engine soot drifting onto the track (+X) side.
 */
export function roofWear(
  rng: Rng,
  o: { eaveZ: number; apexZ: number; sun: readonly [number, number] },
): Shade {
  const blot = valueNoise(rng.fork('lichen'), { scale: 0.5, octaves: 3 });
  const fine = valueNoise(rng.fork('fine'), { scale: 0.15, octaves: 2 });
  return (p, n, c) => {
    if (n[2] < 0.3) return c;
    const up = (p[2] - o.eaveZ) / (o.apexZ - o.eaveZ);
    const shaded = 1 - smooth(-0.2, 0.2, n[0] * o.sun[0] + n[1] * o.sun[1]);
    let out = mix(c, SILVER, 0.3 * smooth(0.4, 1, up));
    const b = blot(p) + 0.35 * fine(p);
    out = mix(out, LICHEN, (0.25 + 0.5 * shaded) * smooth(0.05, 0.6, b));
    out = mix(out, WET, 0.45 * (1 - smooth(0, 0.18, up)));
    return mix(out, SOOT, 0.4 * smooth(0.5, 3, p[0]) * (0.6 + 0.4 * fine(p)));
  };
}
