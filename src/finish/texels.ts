// The atlas as surface samples: rasterise every finishable part's triangles in atlas-UV space, so
// each covered texel knows its part, triangle and barycentrics — and from those (scene.ts) its
// world position, normal, base colour and trim ORM. The bake projects views onto these points.

import { type FinishScene, newPoint, surfaceAt } from './scene.ts';

export interface Texels {
  readonly size: number;
  /** Scene part index per texel; −1 = empty atlas space (padding). */
  readonly part: Int32Array;
  /** World position and unit normal, xyz per texel. */
  readonly position: Float32Array;
  readonly normal: Float32Array;
  /** Base colour (vertex colour × trim albedo), RGBA8 sRGB; alpha 255 where covered. */
  readonly base: Uint8Array;
  /** Trim ORM under the texel, RGBA8 (R occlusion, G roughness, B metal). */
  readonly orm: Uint8Array;
}

export function atlasTexels(s: FinishScene): Texels {
  const N = s.atlas.size;
  const part = new Int32Array(N * N).fill(-1);
  const tri = new Int32Array(N * N);
  const b1 = new Float32Array(N * N);
  const b2 = new Float32Array(N * N);
  s.world.forEach((m, pi) => {
    if (!m || s.finishable[pi] !== true) return;
    const U = m.uvs;
    const I = m.indices;
    for (let t = 0; t < I.length / 3; t++) {
      const [a, b, c] = [I[t * 3] ?? 0, I[t * 3 + 1] ?? 0, I[t * 3 + 2] ?? 0];
      const ax = (U[a * 2] ?? 0) * N;
      const ay = (U[a * 2 + 1] ?? 0) * N;
      const bx = (U[b * 2] ?? 0) * N;
      const by = (U[b * 2 + 1] ?? 0) * N;
      const cx = (U[c * 2] ?? 0) * N;
      const cy = (U[c * 2 + 1] ?? 0) * N;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-12) continue;
      const inv = 1 / area;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inv;
          const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inv;
          const w2 = 1 - w0 - w1;
          // Closed edges: neighbouring triangles of one chart leave no crack between them.
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const i = y * N + x;
          if ((part[i] ?? -1) >= 0) continue;
          part[i] = pi;
          tri[i] = t;
          b1[i] = w1;
          b2[i] = w2;
        }
    }
  });
  const position = new Float32Array(N * N * 3);
  const normal = new Float32Array(N * N * 3);
  const base = new Uint8Array(N * N * 4);
  const orm = new Uint8Array(N * N * 4);
  const pt = newPoint();
  for (let i = 0; i < N * N; i++) {
    const p = part[i] ?? -1;
    if (p < 0) continue;
    surfaceAt(s, p, tri[i] ?? 0, b1[i] ?? 0, b2[i] ?? 0, pt);
    position.set(pt.p, i * 3);
    normal.set(pt.n, i * 3);
    base.set([pt.rgb[0] ?? 0, pt.rgb[1] ?? 0, pt.rgb[2] ?? 0, 255], i * 4);
    orm.set([pt.orm[0] ?? 255, pt.orm[1] ?? 204, pt.orm[2] ?? 0, 255], i * 4);
  }
  return { size: N, part, position, normal, base, orm };
}
