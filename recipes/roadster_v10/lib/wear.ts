// Use marks of a driven car, all in vertex colour so every LOD and every livery keeps them: road
// film thrown up the lower body by the tyres, brake dust baked onto the rims, heat tint along the
// exhaust, soot at the pipe tips and oily dust low in the engine bay. Painted parts store a tone
// (colour ÷ slot colour), so their marks only ever darken the lacquer.

import type { Mesh, Rng, Vec3 } from '@developerz.ai/ts23d';
import { valueNoise } from '@developerz.ai/ts23d';
import { R_F, R_R, RIDE, X_FA, X_RA, Y_WF, Y_WR, Z_FA, Z_RA } from '../dims.ts';
import { clamp, smooth } from './geo.ts';

type Tint = (p: Vec3, c: Vec3, n: Vec3) => Vec3;

/** Map every vertex colour of a mesh (position and normal given in the mesh's own frame). */
export function tinted(m: Mesh, f: Tint): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const at = (a: Float32Array): Vec3 => [a[i * 3] ?? 0, a[i * 3 + 1] ?? 0, a[i * 3 + 2] ?? 0];
    colors.set(f(at(m.positions), at(m.colors), at(m.normals)), i * 3);
  }
  return { ...m, colors };
}

const mix = (a: Vec3, b: Vec3, k: number): Vec3 => {
  const t = clamp(k, 0, 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
};

/** Seeded speckle in 0..1 with the car's symmetry (same on both sides). */
export function speckle(rng: Rng, scale: number): (p: Vec3) => number {
  const f = valueNoise(rng, { scale, octaves: 3 });
  return (p) => clamp(0.5 + 0.5 * f([p[0], Math.abs(p[1]), p[2]]), 0, 1);
}

/**
 * Road film on the body, 0 (clean lacquer) .. 1 (caked): a band rising from the rocker, a fan
 * thrown back and up behind each wheel, the wake on the tail under the lamps and a light peppering
 * of the nose under the lip. Broken up by noise so it never reads as a painted two-tone.
 * `only: 'spray'` leaves out the rocker band, the arch lips and the tail wake.
 */
export function roadFilm(rng: Rng, only?: 'spray'): (p: Vec3) => number {
  const blotch = speckle(rng.fork('blotch'), 0.22);
  const fleck = speckle(rng.fork('fleck'), 0.05);
  const wheels = [
    { x: X_FA, y: Y_WF, z: Z_FA, r: R_F },
    { x: X_RA, y: Y_WR, z: Z_RA, r: R_R },
  ];
  return (p) => {
    const z = p[2];
    const ragged = 0.6 + 0.8 * blotch(p);
    // Rocker band: thick at the sill, gone 35 cm up.
    let f = only ? 0 : (1 - smooth(RIDE, RIDE + 0.35 * ragged, z)) * 0.85;
    for (const w of wheels) {
      // Spray: behind the wheel, fading over 0.9 m, rising to hub height + 20 cm at the arch.
      const back = (w.x - w.r - p[0]) / 0.9;
      if (back > -0.12 && back < 1) {
        const top = w.z + 0.2 + 0.25 * (1 - Math.max(0, back));
        const fan = (1 - smooth(0, 1, back)) * (1 - smooth(top - 0.3, top * ragged, z));
        f = Math.max(f, fan * 0.95);
      }
      // Arch lip: the last few centimetres round the opening catch what the tread throws.
      const d = Math.hypot(p[0] - w.x, z - w.z) - w.r;
      if (!only && d < 0.1 && z > w.z - 0.1) f = Math.max(f, (1 - smooth(0.02, 0.1, d)) * 0.7);
    }
    // Spray only (where dried mud flecks sit): the fans behind the wheels and the nose, which
    // meets the grit head on up to the lamps.
    if (only) {
      if (p[0] > 1.85) f = Math.max(f, (1 - smooth(0.3, 0.6, z)) * 0.7);
      return clamp(f * (0.7 + 0.6 * fleck(p)), 0, 1);
    }
    // Tail wake: the low-pressure zone behind the car sucks the spray onto the tail.
    if (p[0] < -1.9) f = Math.max(f, (1 - smooth(0.45, 0.85 * ragged, z)) * 0.8);
    // Nose: grit under the mouth.
    if (p[0] > 1.85) f = Math.max(f, (1 - smooth(0.22, 0.42, z)) * 0.5);
    return clamp(f * (0.7 + 0.6 * fleck(p)), 0, 1);
  };
}

/** Lacquer under road film: the tone drops toward a dull, dark crust (never brighter). */
export function filmed(paint: Vec3, film: (p: Vec3) => number): (p: Vec3) => Vec3 {
  return (p) => {
    const k = 1 - 0.72 * film(p);
    return [paint[0] * k, paint[1] * k, paint[2] * k];
  };
}

const DUST: Vec3 = [0.2, 0.15, 0.11];
const SOOT: Vec3 = [0.035, 0.032, 0.03];

/**
 * Brake dust on a rim (wheel frame: axle along Y, outer face +Y): thickest in the barrel and at
 * the spoke roots, thin on the faces the wash mitt reaches. `load` 1 = front axle (most braking).
 */
export function brakeDust(rim: Mesh, r: number, load: number, rng: Rng): Mesh {
  const blotch = valueNoise(rng, { scale: 0.05, octaves: 2 });
  return tinted(rim, (p, c, n) => {
    const rho = Math.hypot(p[0], p[2]);
    // Faces pointing at the axle or along the barrel hold dust; the outer face is wiped.
    const facing = 1 - smooth(0.2, 0.85, n[1]);
    const well = smooth(r * 0.55, r * 0.95, rho) * (1 - smooth(0.02, 0.07, p[1] + 0.02));
    const hub = 1 - smooth(0.05, 0.11, rho);
    const k = clamp(0.5 + 0.4 * facing + 0.4 * well + 0.3 * hub, 0, 1);
    return mix(
      c,
      [c[0] * DUST[0], c[1] * DUST[1], c[2] * DUST[2]],
      load * k * (0.75 + 0.25 * blotch(p)),
    );
  });
}

/** Dusty lower sidewall and a scrubbed, darker tread on a tyre (wheel frame). */
export function tyreDust(tyre: Mesh, rim: number, r: number): Mesh {
  return tinted(tyre, (p, c) => {
    const rho = Math.hypot(p[0], p[2]);
    const wall = smooth(rim, rim + (r - rim) * 0.5, rho) * (1 - smooth(r - 0.012, r - 0.002, rho));
    return mix(c, [c[0] * 0.78, c[1] * 0.7, c[2] * 0.6], wall * 0.8);
  });
}

/**
 * Heat tint on bright exhaust steel along X: straw, then bronze, purple and blue toward the hot
 * end (`hot`), fading to bare metal at the cold end (`cold`), with soot inside 6 cm of the tip.
 */
export function heatTint(m: Mesh, hot: number, cold: number, tip?: number): Mesh {
  const bands: readonly (readonly [number, Vec3])[] = [
    [0, [0.42, 0.5, 0.78]], // blue at the collector
    [0.2, [0.55, 0.36, 0.62]], // purple
    [0.42, [0.78, 0.5, 0.28]], // bronze
    [0.68, [0.95, 0.82, 0.5]], // straw
    [1, [1, 1, 1]],
  ];
  return tinted(m, (p, c) => {
    const t = clamp((p[0] - hot) / (cold - hot), 0, 1);
    let k: Vec3 = [1, 1, 1];
    for (let i = 0; i + 1 < bands.length; i++) {
      const a = bands[i];
      const b = bands[i + 1];
      if (a && b && t >= a[0] && t <= b[0]) k = mix(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
    }
    const out: Vec3 = [c[0] * k[0], c[1] * k[1], c[2] * k[2]];
    return tip === undefined ? out : mix(out, SOOT, 1 - smooth(0.0, 0.07, Math.abs(p[0] - tip)));
  });
}

/** Cast manifolds: brown heat scale that darkens away from the ports (z falls from `top`). */
export function heatScale(m: Mesh, top: number, bottom: number): Mesh {
  return tinted(m, (p, c) => {
    const t = clamp((top - p[2]) / (top - bottom), 0, 1);
    return mix([c[0] * 1.0, c[1] * 0.62, c[2] * 0.42], [c[0] * 0.5, c[1] * 0.42, c[2] * 0.42], t);
  });
}

/**
 * Oily dust low in the engine bay and under the car: darkening that grows toward `floor` and is
 * gone by `clean`, plus a film on upward faces (nobody wipes under the plenum).
 */
export function bayGrime(m: Mesh, floor: number, clean: number, strength = 0.6): Mesh {
  return tinted(m, (p, c, n) => {
    const low = 1 - smooth(floor, clean, p[2]);
    const k = clamp(strength * low + 0.12 * smooth(0.5, 1, n[2]), 0, 0.9);
    return mix(c, [c[0] * 0.2, c[1] * 0.18, c[2] * 0.16], k);
  });
}

const BAY_DUST: Vec3 = [0.3, 0.26, 0.21];
const BAY_OIL: Vec3 = [0.03, 0.027, 0.024];

/**
 * A driven engine's top end: tan dust settled in blotches on every upward face (valve covers,
 * runners, plenum) and black oil weep on the side faces below `gasket`, fading over 12 cm.
 */
export function bayDust(m: Mesh, gasket: number, rng: Rng): Mesh {
  const blotch = valueNoise(rng, { scale: 0.09, octaves: 3 });
  return tinted(m, (p, c, n) => {
    const b = clamp(0.5 + 0.5 * blotch(p), 0, 1);
    const dust = smooth(0.35, 0.9, n[2]) * (0.3 + 0.5 * b);
    const weep = (1 - smooth(0.2, 0.7, n[2])) * (1 - smooth(gasket - 0.12, gasket, p[2])) * 0.75;
    return mix(mix(c, BAY_DUST, dust), BAY_OIL, weep * (0.6 + 0.4 * b));
  });
}

/** A soot plume on whatever sits near a pipe tip: `at` the tip, trailing back (−X) over `reach`. */
export function sootAt(m: Mesh, at: Vec3, reach: number, strength = 0.85): Mesh {
  return tinted(m, (p, c) => {
    const dx = (at[0] - p[0]) / reach;
    if (dx < -0.25 || dx > 1) return c;
    const d = Math.hypot((p[1] - at[1]) / (0.1 + 0.12 * Math.max(0, dx)), (p[2] - at[2]) / 0.14);
    return mix(
      c,
      [c[0] * 0.12, c[1] * 0.12, c[2] * 0.12],
      strength * (1 - smooth(0.2, 1, d)) * (1 - smooth(0.3, 1, dx)),
    );
  });
}
