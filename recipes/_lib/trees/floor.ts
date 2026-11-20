// The ground patch under a tree: an irregular disc (radius wobbled by noise, same mean area at
// every LOD so the far silhouette keeps it) split into small triangles and projected so its
// strip keeps true scale, then mottled in vertex colour at metre scale: patches of the `mix`
// colours by noise, and a rim band blending to `rim` so the patch fades into the grass round it
// instead of ending as a hard coloured mat. V is kept off the strip's padded edge rows (their
// texels are constant along V and drew straight streaks). LOD2 is the bare polygon in the mean
// colour; with `far` it is flat colour on the `plain` row (a fan of long triangles cannot carry
// a strip at true scale: V squeezed into each drew zig-zag stripes).

import { dmath, type Mesh, planar, type StripId, stripRect, type Vec3 } from '@developerz.ai/ts23d';
import { tessellate } from '../finish/finish.ts';
import { projectStripUV } from '../terrain/strip-inset.ts';

export interface Floor {
  readonly radius: number;
  /** Outline points per LOD. */
  readonly sides: readonly [number, number, number];
  readonly strip: StripId;
  /** Patch colours (vertex colour over the strip), picked by noise. */
  readonly mix: readonly Vec3[];
  /** Colour at the outer edge. */
  readonly rim: Vec3;
  /** Outline wobble, ± fraction of the radius. */
  readonly wobble: number;
  /** LOD2 colour on the plain row: LOD0's mean with the strip's own albedo multiplied in. */
  readonly far?: Vec3;
}

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Noise in [−1, 1] at a ground point (the recipe's seeded field). */
type Noise = (p: Vec3) => number;

function colourAt(f: Floor, noise: Noise, p: Vec3, R: number): Vec3 {
  const n = Math.min(0.999, Math.max(0, 0.5 + 0.5 * noise(p) * 1.6));
  const x = n * (f.mix.length - 1);
  const i = Math.floor(x);
  const a = f.mix[i] ?? f.rim;
  const b = f.mix[i + 1] ?? a;
  const t = x - i;
  const c = lerp3(a, b, t * t * (3 - 2 * t));
  const r = dmath.hypot(p[0], p[1]) / R;
  const e = Math.min(1, Math.max(0, (r - 0.55) / 0.45));
  return lerp3(c, f.rim, e * e);
}

export function floorPatch(f: Floor, lod: 0 | 1 | 2, noise: Noise): Mesh {
  const n = f.sides[lod];
  // Same area at every LOD (a coarser polygon is pushed out), so the far silhouette keeps it.
  const R = f.radius * Math.sqrt((Math.PI * 2) / (n * dmath.sin((Math.PI * 2) / n)));
  const points = Array.from({ length: n }, (_, k): Vec3 => {
    const a = (k / n) * Math.PI * 2;
    const unit: Vec3 = [dmath.cos(a), dmath.sin(a), 0];
    const w = lod === 2 ? 1 : 1 + f.wobble * noise([unit[0] * 9, unit[1] * 9, 3]);
    return [unit[0] * R * w, unit[1] * R * w, 0.005];
  });
  const mean = lerp3(f.mix[Math.floor(f.mix.length / 2)] ?? f.rim, f.rim, 0.35);
  if (lod === 2 && f.far) return planar({ points, color: f.far, strip: 'plain' });
  const disc = planar({ points, color: mean, strip: f.strip });
  if (lod === 2) return disc;
  // Planar, V mirrored band to band (continuous: no seam line every band, as a per-triangle
  // restart drew) and off the padded rows. A row is 64 texels of a 4096-wide strip; the ~1 m
  // triangles need a band as tall, so the strip is magnified 6× with square texels.
  const m = projectStripUV(
    tessellate(disc, lod === 0 ? f.radius / 7 : f.radius / 4),
    f.strip,
    (stripRect(f.strip).metres / 64) * 6,
    6,
  );
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const p: Vec3 = [m.positions[i * 3] ?? 0, m.positions[i * 3 + 1] ?? 0, 0];
    colors.set(colourAt(f, noise, p, f.radius * (1 + f.wobble)), i * 3);
  }
  return { ...m, colors };
}
