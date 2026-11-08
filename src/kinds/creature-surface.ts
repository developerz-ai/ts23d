// Surface relief per skin type, LOD-gated (LOD0 only; coarser LODs carry it in colour): fur as
// clumps stretched along the body (hair lies toward the tail), scales as domed Worley cells (the
// dragon's method), feathers as overlapping scalloped rows. Amplitudes are a fraction of the
// sculpt cell so the relief reads without breaking the silhouette.

import type { Vec3 } from '../core/index.ts';
import { createRng } from '../core/index.ts';
import { valueNoise } from '../primitives/index.ts';
import { smoothstep } from './creature-curve.ts';
import type { Relief } from './creature-mesh.ts';
import { worley } from './creature-pattern.ts';
import type { Surface } from './creature-spec.ts';

/** Relief for a surface at sculpt cell `res`; `size` = feature size, metres. */
export function relief(surface: Surface, res: number, size: number, seed: number): Relief | null {
  if (surface === 'skin') return null;
  if (surface === 'fur') {
    const n = valueNoise(createRng(seed), { scale: size, octaves: 2 });
    const amp = res * 0.45;
    // Stretched along X and Z: clumps run with the hair flow (back on the trunk, down the legs).
    return { amp, at: (p) => amp * n([p[0] * 0.4, p[1], p[2] * 0.6]) };
  }
  if (surface === 'scales') {
    const amp = res * 0.25;
    return {
      amp,
      at: (p: Vec3) => {
        const c = worley(p[0] / size, p[1] / (size * 0.8), p[2] / (size * 0.8), seed);
        // Domed scale: high at the centre, a seam groove at the cell border.
        const dome = 1 - smoothstep(0, 0.7, c.f1);
        const seam = smoothstep(0.12, 0, c.f2 - c.f1);
        return amp * Math.max(-1, Math.min(1, dome * 0.9 - 0.35 - 0.6 * seam));
      },
    };
  }
  // Feathers: rows of scallops overlapping toward the tail.
  const amp = res * 0.3;
  return {
    amp,
    at: (p) => {
      const row = p[0] / size;
      const k = Math.floor(row);
      const lat = (p[2] + p[1] * 0.3) / (size * 0.7) + (k % 2) * 0.5;
      const u = row - k;
      const w = Math.abs(lat - Math.floor(lat) - 0.5) * 2;
      return amp * (u * 0.9 - 0.45 + 0.3 * (1 - w * w));
    },
  };
}
