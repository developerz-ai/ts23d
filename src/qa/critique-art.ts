// Image-space art measures over a beauty render and its aligned part buffer: where the value
// contrast peaks (focal point) and whether luminance rises from base to top (grounded). Rest areas
// live in critique-rest.ts. Pure functions of pixels; deterministic.

import type { PartBuffer } from './critique-raster.ts';

/** Relative luminance 0–1 of sRGB-encoded RGBA (Rec. 709 weights), NaN off the asset. */
export function greyscale(rgba: Uint8Array, buf: PartBuffer): Float32Array {
  const out = new Float32Array(buf.width * buf.height).fill(Number.NaN);
  for (let i = 0; i < out.length; i++)
    if ((buf.part[i] ?? -1) >= 0)
      out[i] =
        (0.2126 * (rgba[i * 4] ?? 0) +
          0.7152 * (rgba[i * 4 + 1] ?? 0) +
          0.0722 * (rgba[i * 4 + 2] ?? 0)) /
        255;
  return out;
}

/** Box sums over a (2r+1)² window of `v` where finite: [sum, sum², count] per pixel. */
function windowStats(v: Float32Array, W: number, H: number, r: number) {
  const S = new Float64Array((W + 1) * (H + 1));
  const Q = new Float64Array((W + 1) * (H + 1));
  const N = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = v[y * W + x] ?? Number.NaN;
      const ok = Number.isFinite(a);
      const k = (y + 1) * (W + 1) + x + 1;
      S[k] = (ok ? a : 0) + (S[k - 1] ?? 0) + (S[k - W - 1] ?? 0) - (S[k - W - 2] ?? 0);
      Q[k] = (ok ? a * a : 0) + (Q[k - 1] ?? 0) + (Q[k - W - 1] ?? 0) - (Q[k - W - 2] ?? 0);
      N[k] = (ok ? 1 : 0) + (N[k - 1] ?? 0) + (N[k - W - 1] ?? 0) - (N[k - W - 2] ?? 0);
    }
  return (x: number, y: number): [number, number, number] => {
    const x0 = Math.max(0, x - r);
    const y0 = Math.max(0, y - r);
    const x1 = Math.min(W, x + r + 1);
    const y1 = Math.min(H, y + r + 1);
    const box = (T: Float64Array): number =>
      (T[y1 * (W + 1) + x1] ?? 0) -
      (T[y0 * (W + 1) + x1] ?? 0) -
      (T[y1 * (W + 1) + x0] ?? 0) +
      (T[y0 * (W + 1) + x0] ?? 0);
    return [box(S), box(Q), box(N)];
  };
}

export interface FocalStats {
  /** Part under the strongest contrast cluster. */
  readonly peakPart: string;
  /** Peak pixel (image coordinates of the beauty camera). */
  readonly peak: readonly [number, number];
  /** Share of the top-5 % contrast pixels that land on the declared focal part(s). */
  readonly focalShare: number;
  /** The focal part(s)' share of all visible asset pixels. */
  readonly focalArea: number;
  /** Parts holding the most top-contrast pixels, largest first (≤ 3). */
  readonly top: readonly { readonly part: string; readonly share: number }[];
  /** 1 = pixel is in the top-5 % contrast set (for the value map). */
  readonly hot: Uint8Array;
}

/** `focal` names a part when equal, a `name_` prefix, or a `*` glob. */
export const partMatcher = (focal: readonly string[]) => {
  const res = focal.map((f) =>
    f.includes('*')
      ? new RegExp(`^${f.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
      : new RegExp(`^${f.replace(/[.+?^${}()|[\]\\]/g, '\\$&')}(?:[_./].*)?$`),
  );
  return (name: string): boolean => res.some((r) => r.test(name));
};

export function focalStats(
  lum: Float32Array,
  buf: PartBuffer,
  focal: readonly string[],
): FocalStats {
  const { width: W, height: H } = buf;
  const r = Math.max(2, Math.round(H / 60));
  const at = windowStats(lum, W, H, r);
  const contrast = new Float32Array(W * H).fill(Number.NaN);
  const vals: number[] = [];
  const need = 0.5 * (2 * r + 1) ** 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!Number.isFinite(lum[y * W + x] ?? Number.NaN)) continue;
      const [s, q, n] = at(x, y);
      if (n < need) continue;
      const m = s / n;
      const c = Math.sqrt(Math.max(0, q / n - m * m));
      contrast[y * W + x] = c;
      vals.push(c);
    }
  vals.sort((a, b) => a - b);
  const cut = vals[Math.floor(vals.length * 0.95)] ?? Infinity;
  const isFocal = partMatcher(focal);
  const hot = new Uint8Array(W * H);
  const perPart = new Map<number, number>();
  let nHot = 0;
  let nFocalHot = 0;
  let nAsset = 0;
  let nFocal = 0;
  for (let i = 0; i < W * H; i++) {
    const p = buf.part[i] ?? -1;
    if (p < 0) continue;
    nAsset++;
    const f = isFocal(buf.names[p] ?? '');
    if (f) nFocal++;
    if ((contrast[i] ?? Number.NaN) >= cut) {
      hot[i] = 1;
      nHot++;
      if (f) nFocalHot++;
      perPart.set(p, (perPart.get(p) ?? 0) + 1);
    }
  }
  // Peak: the densest cluster of hot pixels (box sum, radius 3r), then the part most hot inside it.
  const hotF = Float32Array.from(hot, (h) => h);
  const near = windowStats(hotF, W, H, 3 * r);
  let peak: [number, number] = [0, 0];
  let best = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!hot[y * W + x]) continue;
      const s = near(x, y)[0];
      if (s > best) {
        best = s;
        peak = [x, y];
      }
    }
  const local = new Map<number, number>();
  for (let y = Math.max(0, peak[1] - 3 * r); y <= Math.min(H - 1, peak[1] + 3 * r); y++)
    for (let x = Math.max(0, peak[0] - 3 * r); x <= Math.min(W - 1, peak[0] + 3 * r); x++)
      if (hot[y * W + x])
        local.set(buf.part[y * W + x] ?? -1, (local.get(buf.part[y * W + x] ?? -1) ?? 0) + 1);
  const topOf = (m: Map<number, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return {
    peakPart: buf.names[topOf(local)[0]?.[0] ?? -1] ?? '',
    peak,
    focalShare: nHot ? nFocalHot / nHot : 0,
    focalArea: nAsset ? nFocal / nAsset : 0,
    top: topOf(perPart)
      .slice(0, 3)
      .map(([p, n]) => ({ part: buf.names[p] ?? '', share: n / Math.max(1, nHot) })),
    hot,
  };
}

export interface GroundedStats {
  /** Least-squares rise of mean luminance from base (0) to top (1) of the visible height. */
  readonly rise: number;
  /** Mean luminance per height band, base first (NaN = band too small). */
  readonly bands: readonly number[];
}

export function groundedStats(lum: Float32Array, buf: PartBuffer, nBands = 5): GroundedStats {
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < lum.length; i++)
    if (Number.isFinite(lum[i] ?? Number.NaN)) {
      z0 = Math.min(z0, buf.z[i] ?? 0);
      z1 = Math.max(z1, buf.z[i] ?? 0);
    }
  const sum = new Float64Array(nBands);
  const cnt = new Float64Array(nBands);
  let all = 0;
  for (let i = 0; i < lum.length; i++) {
    const l = lum[i] ?? Number.NaN;
    if (!Number.isFinite(l)) continue;
    const b = Math.min(
      nBands - 1,
      Math.floor((((buf.z[i] ?? 0) - z0) / Math.max(1e-9, z1 - z0)) * nBands),
    );
    sum[b] = (sum[b] ?? 0) + l;
    cnt[b] = (cnt[b] ?? 0) + 1;
    all++;
  }
  const bands = [...sum].map((s, b) =>
    (cnt[b] ?? 0) >= all * 0.01 ? s / (cnt[b] ?? 1) : Number.NaN,
  );
  const pts = bands.flatMap((l, b) =>
    Number.isFinite(l) ? [[(b + 0.5) / nBands, l] as const] : [],
  );
  const mx = pts.reduce((s, p) => s + p[0], 0) / Math.max(1, pts.length);
  const my = pts.reduce((s, p) => s + p[1], 0) / Math.max(1, pts.length);
  const sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  return { rise: sxx > 0 ? sxy / sxx : 0, bands };
}
