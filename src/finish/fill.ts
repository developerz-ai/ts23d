// Close the projection's holes: grow seen texels into unseen ones of the SAME part (a few texels:
// raster cracks, grazing faces), give what no view saw the part's base colour shifted by the
// part's mean finish/base ratio (it keeps the part's new tone, not the bare trim), then dilate into
// empty atlas padding so mip-maps and bilinear filtering never pull in black. Deterministic sweeps.

import type { Projection } from './bake.ts';
import type { Texels } from './texels.ts';

const STEPS = [-1, 1, 0, 0];
const STEPS_Y = [0, 0, -1, 1];

/** One dilation sweep: each empty texel with a filled neighbour (passing `ok`) takes their mean. */
function dilate(
  N: number,
  rgb: Float32Array,
  filled: Uint8Array,
  ok: (i: number, j: number) => boolean,
): number {
  const add: [number, number, number, number][] = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (filled[i]) continue;
      let n = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < 4; k++) {
        const xx = x + (STEPS[k] ?? 0);
        const yy = y + (STEPS_Y[k] ?? 0);
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const j = yy * N + xx;
        if (!filled[j] || !ok(i, j)) continue;
        n++;
        r += rgb[j * 3] ?? 0;
        g += rgb[j * 3 + 1] ?? 0;
        b += rgb[j * 3 + 2] ?? 0;
      }
      if (n) add.push([i, r / n, g / n, b / n]);
    }
  for (const [i, r, g, b] of add) {
    rgb.set([r, g, b], i * 3);
    filled[i] = 1;
  }
  return add.length;
}

export interface Filled {
  /** Finished albedo, RGBA8 sRGB (alpha 255 everywhere: padding is dilated too). */
  readonly albedo: Uint8Array;
  /** Share of covered texels some view saw directly. */
  readonly seen: number;
}

export function fillAtlas(t: Texels, pr: Projection, parts: number, grow = 4, pad = 6): Filled {
  const N = t.size;
  const rgb = Float32Array.from(pr.rgb);
  const filled = new Uint8Array(N * N);
  let covered = 0;
  let seen = 0;
  // Per part: mean finished vs mean base over seen texels.
  const sumF = new Float64Array(parts * 3);
  const sumB = new Float64Array(parts * 3);
  for (let i = 0; i < N * N; i++) {
    const p = t.part[i] ?? -1;
    if (p < 0) continue;
    covered++;
    if ((pr.weight[i] ?? 0) <= 0) continue;
    seen++;
    filled[i] = 1;
    for (let c = 0; c < 3; c++) {
      sumF[p * 3 + c] = (sumF[p * 3 + c] ?? 0) + (rgb[i * 3 + c] ?? 0);
      sumB[p * 3 + c] = (sumB[p * 3 + c] ?? 0) + (t.base[i * 4 + c] ?? 0);
    }
  }
  const samePart = (i: number, j: number): boolean =>
    t.part[i] === t.part[j] && (t.part[i] ?? -1) >= 0;
  for (let k = 0; k < grow; k++) if (!dilate(N, rgb, filled, samePart)) break;
  for (let i = 0; i < N * N; i++) {
    const p = t.part[i] ?? -1;
    if (p < 0 || filled[i]) continue;
    for (let c = 0; c < 3; c++) {
      const ratio =
        (sumB[p * 3 + c] ?? 0) > 0 ? (sumF[p * 3 + c] ?? 0) / (sumB[p * 3 + c] ?? 1) : 1;
      rgb[i * 3 + c] = (t.base[i * 4 + c] ?? 0) * Math.max(0.5, Math.min(1.5, ratio));
    }
    filled[i] = 1;
  }
  const empty = (i: number): boolean => (t.part[i] ?? -1) < 0;
  for (let k = 0; k < pad; k++) if (!dilate(N, rgb, filled, (i) => empty(i))) break;
  const albedo = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    for (let c = 0; c < 3; c++)
      albedo[i * 4 + c] = Math.max(0, Math.min(255, Math.round(rgb[i * 3 + c] ?? 0)));
    albedo[i * 4 + 3] = 255;
  }
  return { albedo, seen: covered ? seen / covered : 0 };
}

/** The base atlas (before the finish) with its padding dilated, so it filters like the finish. */
export function paddedBase(t: Texels, pad = 6): Uint8Array {
  const N = t.size;
  const rgb = new Float32Array(N * N * 3);
  const filled = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++)
    if ((t.part[i] ?? -1) >= 0) {
      filled[i] = 1;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = t.base[i * 4 + c] ?? 0;
    }
  for (let k = 0; k < pad; k++) if (!dilate(N, rgb, filled, () => true)) break;
  const out = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(rgb[i * 3 + c] ?? 0);
    out[i * 4 + 3] = 255;
  }
  return out;
}
