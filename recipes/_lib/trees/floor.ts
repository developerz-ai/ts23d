// The ground patch under a tree: an irregular disc (radius wobbled by noise, same mean area at
// every LOD so the far silhouette keeps it) split into small triangles and box-projected so its
// strip keeps true scale, then mottled in vertex colour at metre scale: patches of the `mix`
// colours by noise, and a rim band blending to `rim` so the patch fades into the grass round it
// instead of ending as a hard coloured mat. LOD2 is the bare polygon in the mean colour.

import { type Mesh, planar, type StripId, type Vec3 } from '@developerz.ai/ts23d';
import { reproject, tessellate } from '../finish/finish.ts';

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
  const r = Math.hypot(p[0], p[1]) / R;
  const e = Math.min(1, Math.max(0, (r - 0.55) / 0.45));
  return lerp3(c, f.rim, e * e);
}

export function floorPatch(f: Floor, lod: 0 | 1 | 2, noise: Noise): Mesh {
  const n = f.sides[lod];
  // Same area at every LOD (a coarser polygon is pushed out), so the far silhouette keeps it.
  const R = f.radius * Math.sqrt((Math.PI * 2) / (n * Math.sin((Math.PI * 2) / n)));
  const points = Array.from({ length: n }, (_, k): Vec3 => {
    const a = (k / n) * Math.PI * 2;
    const unit: Vec3 = [Math.cos(a), Math.sin(a), 0];
    const w = lod === 2 ? 1 : 1 + f.wobble * noise([unit[0] * 9, unit[1] * 9, 3]);
    return [unit[0] * R * w, unit[1] * R * w, 0.005];
  });
  const mean = lerp3(f.mix[Math.floor(f.mix.length / 2)] ?? f.rim, f.rim, 0.35);
  const disc = planar({ points, color: mean, strip: f.strip });
  if (lod === 2) return disc;
  const m = reproject(tessellate(disc, lod === 0 ? f.radius / 7 : f.radius / 4));
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const p: Vec3 = [m.positions[i * 3] ?? 0, m.positions[i * 3 + 1] ?? 0, 0];
    colors.set(colourAt(f, noise, p, f.radius * (1 + f.wobble)), i * 3);
  }
  return { ...m, colors };
}
