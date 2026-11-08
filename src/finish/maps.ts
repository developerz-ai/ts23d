// Secondary maps derived from the finished albedo. HEURISTICS, not measurements — an image model
// gives colour only:
//   roughness = trim roughness + local luminance variation (grime, rust and wear break up the
//               sheen) + darkening vs the base colour (dirt is matte)
//   metal     = trim metal, faded where the finish changed the colour a lot (paint/rust over metal)
//   normal    = a detail normal from the albedo's high-pass (luminance as a height field), only
//               inside one part, tangent space with +Y toward decreasing V (as the trim sheet)

import type { Texels } from './texels.ts';

const lum = (a: Uint8Array, i: number): number =>
  0.2126 * (a[i * 4] ?? 0) + 0.7152 * (a[i * 4 + 1] ?? 0) + 0.0722 * (a[i * 4 + 2] ?? 0);

export interface DerivedMaps {
  /** R occlusion (trim), G roughness, B metal: glTF metallicRoughness + occlusion layout. */
  readonly orm: Uint8Array;
  readonly normal: Uint8Array;
}

export function deriveMaps(t: Texels, albedo: Uint8Array, strength = 2): DerivedMaps {
  const N = t.size;
  const L = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) L[i] = lum(albedo, i);
  const orm = new Uint8Array(N * N * 4);
  const normal = new Uint8Array(N * N * 4);
  const at = (x: number, y: number, p: number, fallback: number): number => {
    if (x < 0 || y < 0 || x >= N || y >= N) return fallback;
    const j = y * N + x;
    return t.part[j] === p ? (L[j] ?? fallback) : fallback;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const p = t.part[i] ?? -1;
      const h = L[i] ?? 0;
      if (p < 0) {
        orm.set([255, 204, 0, 255], i * 4);
        normal.set([128, 128, 255, 255], i * 4);
        continue;
      }
      let s = 0;
      let s2 = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const v = at(x + dx, y + dy, p, h);
          s += v;
          s2 += v * v;
        }
      const std = Math.sqrt(Math.max(0, s2 / 9 - (s / 9) ** 2));
      const darker = Math.max(0, lum(t.base, i) - h);
      const change = Math.abs(lum(t.base, i) - h);
      const rough = (t.orm[i * 4 + 1] ?? 204) + 1.5 * std + 0.5 * darker;
      const metal = (t.orm[i * 4 + 2] ?? 0) * Math.max(0, 1 - change / 60);
      orm.set(
        [t.orm[i * 4] ?? 255, Math.min(255, Math.round(rough)), Math.round(metal), 255],
        i * 4,
      );
      const gx = (at(x + 1, y, p, h) - at(x - 1, y, p, h)) / 510;
      const gy = (at(x, y - 1, p, h) - at(x, y + 1, p, h)) / 510;
      const nx = -gx * strength;
      const ny = -gy * strength;
      const len = Math.hypot(nx, ny, 1);
      normal.set(
        [nx / len, ny / len, 1 / len].map((c) => Math.round((c * 0.5 + 0.5) * 255)).concat(255),
        i * 4,
      );
    }
  return { orm, normal };
}
