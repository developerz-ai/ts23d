// Boxcar wear and the brake rigging under the floor. Wear: road grime rising from the rails (dark
// at the sill, gone by mid-height) with blotchy fade, roof soot from locomotive smoke, and rust
// streaks as thin tapered decals below bolts, the door track and brace ends. Darken-only, so the
// painted `body` slot never clamps. Brake gear: brake beams + shoes on every truck, cylinder
// lever and the rods that carry its pull to the trucks (the first thing a railfan checks).

import {
  beam,
  box,
  type Lod,
  type Mesh,
  merge,
  type Rng,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';

/** Darken-only weathering: rail grime gradient, blotchy fade, optional roof soot. */
export function ager(
  rng: Rng,
): (m: Mesh, o: { ground?: number; strength?: number; soot?: number }) => Mesh {
  const noise = valueNoise(rng, { scale: 0.6, octaves: 3 });
  return (m, o) => {
    const colors = new Float32Array(m.colors);
    const g = o.ground ?? 2.2;
    for (let i = 0; i < m.positions.length / 3; i++) {
      const p: Vec3 = [
        m.positions[i * 3] ?? 0,
        m.positions[i * 3 + 1] ?? 0,
        m.positions[i * 3 + 2] ?? 0,
      ];
      const n = noise(p);
      const h = Math.max(0, Math.min(1, (p[2] - 0.3) / g + 0.2 * n));
      let f = 1 - (o.strength ?? 0.5) * (1 - h) ** 1.6;
      f *= 1 - 0.08 * (0.5 + 0.5 * n); // uneven fade / patch repaint
      if (o.soot && (m.normals[i * 3 + 2] ?? 0) > 0.3) f *= 1 - o.soot * (0.6 + 0.4 * n);
      for (let k = 0; k < 3; k++) colors[i * 3 + k] = (colors[i * 3 + k] ?? 0) * f;
    }
    return { ...m, colors };
  };
}

export interface StreakSource {
  /** Bolt / track end on the side face; the streak runs down from here. */
  readonly at: Vec3;
  /** Outward side (±1 on Y). */
  readonly s: number;
  /** Lowest z the streak may reach (the bottom of the plate it runs down); default unbounded. */
  readonly floor?: number;
}

/** Thin rust streaks (iron_rust slivers 4 mm proud of the face), seeded lengths and widths. */
export function rustStreaks(rng: Rng, from: readonly StreakSource[], tint: Vec3): Mesh {
  const out: Mesh[] = [];
  for (const src of from) {
    if (rng.next() < 0.35) continue;
    // Draw first, clamp after: the seeded stream stays the same whether a floor is set or not.
    const len = Math.min(rng.range(0.3, 1.1), src.at[2] - (src.floor ?? -Infinity));
    const w = rng.range(0.025, 0.05);
    const [x, y, z] = src.at;
    // Two stacked slivers: a wide head under the bolt and a narrower drip below it.
    out.push(
      box({
        size: [w, 0.004, len * 0.4],
        at: [x, y + src.s * 0.002, z - len * 0.4],
        color: tint,
        strip: 'iron_rust',
        omit: ['back', 'bottom', 'top'],
      }),
      box({
        size: [w * 0.45, 0.004, len * 0.6],
        at: [x, y + src.s * 0.002, z - len],
        color: tint,
        strip: 'iron_rust',
        omit: ['back', 'bottom', 'top'],
      }),
    );
  }
  return merge(out);
}

/** Truck brake beams with shoes 3 cm off the treads (truck-local, axles at ±wb/2). */
export function truckBrakes(lod: Lod, wb: number, r: number, wheelY: number, color: Vec3): Mesh {
  if (lod === 2) return merge([]);
  const out: Mesh[] = [];
  for (const d of [-1, 1]) {
    const x = d * (wb / 2 - r - 0.05);
    out.push(
      beam({
        from: [x, -wheelY + 0.08, r * 0.95],
        to: [x, wheelY - 0.08, r * 0.95],
        width: 0.07,
        color,
        strip: 'iron_cast',
      }),
    );
    for (const s of [-1, 1])
      out.push(
        box({
          size: [0.04, 0.12, 0.28],
          at: [x, s * wheelY, r * 0.95 - 0.14],
          color,
          strip: 'iron_cast',
        }),
      );
    if (lod === 0)
      // Truck lever standing up from the beam centre.
      out.push(box({ size: [0.03, 0.05, 0.5], at: [x, 0, r * 0.95], color, strip: 'iron_cast' }));
  }
  return merge(out);
}

/** Car-body brake rigging between the trucks: cylinder lever, pull rods to each truck lever. */
export function brakeRigging(lod: Lod, tc: number, wb: number, r: number, color: Vec3): Mesh {
  if (lod === 2) return merge([]);
  const z = 0.92;
  const rod = (a: Vec3, b: Vec3, w: number): Mesh =>
    beam({ from: a, to: b, width: w, color, strip: 'iron_rust' });
  const lever = (x: number): Mesh =>
    box({ size: [0.04, 0.6, 0.06], at: [x, -0.05, z - 0.03], color, strip: 'iron_rust' });
  const out: Mesh[] = [
    // Cylinder (live) lever and the floating lever behind it, tied by a rod.
    lever(0.75),
    lever(-0.6),
    rod([0.75, -0.3, z], [-0.6, -0.3, z], 0.035),
    // Push rod from the cylinder to the live lever.
    rod([0.65, -0.5, 0.92], [0.75, -0.2, z], 0.04),
  ];
  for (const d of [-1, 1]) {
    // Pull rod out to the truck lever top (lever at the inner brake beam).
    const xt = d * (tc / 2 - (wb / 2 - r - 0.05));
    out.push(rod([d > 0 ? 0.75 : -0.6, 0.2, z], [xt, 0, r * 0.95 + 0.45], 0.035));
  }
  if (lod === 0) {
    // Hand-brake chain rod from the B-end staff to the floating lever.
    out.push(rod([-6.2, -0.8, 0.85], [-0.6, 0.2, z], 0.025));
    // Retainer pipe up the B end.
    out.push(rod([-6.0, 0.6, 0.86], [-6.25, 0.9, 1.1], 0.02));
  }
  return merge(out);
}
