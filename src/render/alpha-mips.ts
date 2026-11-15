// Cutout-safe albedo mips: colour is averaged alpha-weighted (empty texels don't bleach thin
// strands), and each mip's alpha is rescaled region by region so the share of texels passing the
// alpha test matches mip 0 — coverage-preserving alpha mips (Castaño, "Computing alpha mipmaps").
// Without it, 1-px strands at 40% coverage average to ~0.4 alpha and vanish at the 0.5 cut.

import type { Mip } from './texture.ts';

/** Alpha-test threshold of cutout surfaces (glTF `alphaCutoff` default). */
export const ALPHA_CUT = 0.5;
/** Side, in mip-0 texels, of the regions whose alpha coverage each mip preserves. */
const REGION = 64;
/**
 * Contrast about the cut applied to mips ≥ 1 after the rescale. Monotone, so texel coverage is
 * unchanged; it keeps bilinear filtering from pulling texels that sit just above the cut under it.
 */
const SHARPEN = 4;

/** Alpha-weighted mean of colour channel `c` over the 2 × 2 block at texels a, a+1, b, b+1. */
export function weighted(p: Float32Array, a: number, b: number, c: number): number {
  const o = 3 - c;
  const w0 = p[a + o] ?? 0;
  const w1 = p[a + 4 + o] ?? 0;
  const w2 = p[b + o] ?? 0;
  const w3 = p[b + 4 + o] ?? 0;
  const sum = w0 + w1 + w2 + w3;
  if (sum === 4 || sum <= 0)
    return ((p[a] ?? 0) + (p[a + 4] ?? 0) + (p[b] ?? 0) + (p[b + 4] ?? 0)) * 0.25;
  return ((p[a] ?? 0) * w0 + (p[a + 4] ?? 0) * w1 + (p[b] ?? 0) * w2 + (p[b + 4] ?? 0) * w3) / sum;
}

/** Share of texels with alpha ≥ ALPHA_CUT in one mip (what an alpha test keeps). */
export function alphaCoverage(m: Mip): number {
  let n = 0;
  for (let i = 3; i < m.data.length; i += 4) if ((m.data[i] ?? 0) >= ALPHA_CUT) n++;
  return n / (m.size * m.size);
}

/** Rescale every mip's alpha, region by region, so its alpha-test coverage matches mip 0. */
export function keepCoverage(mips: Mip[]): void {
  const top = mips[0];
  if (!top) return;
  const n = top.size;
  const pre = new Int32Array((n + 1) * (n + 1));
  let opaque = true;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const a = top.data[((y * n + x) << 2) + 3] ?? 0;
      if (a < 1) opaque = false;
      const i = (y + 1) * (n + 1) + x + 1;
      pre[i] =
        (a >= ALPHA_CUT ? 1 : 0) +
        (pre[i - 1] ?? 0) +
        (pre[i - n - 1] ?? 0) -
        (pre[i - n - 2] ?? 0);
    }
  // Opaque sheets need nothing; non-power-of-two sizes don't tile into whole regions.
  if (opaque || (n & (n - 1)) !== 0) return;
  const covered = (x0: number, y0: number, x1: number, y1: number): number =>
    (pre[y1 * (n + 1) + x1] ?? 0) -
    (pre[y0 * (n + 1) + x1] ?? 0) -
    (pre[y1 * (n + 1) + x0] ?? 0) +
    (pre[y0 * (n + 1) + x0] ?? 0);
  for (let k = 1; k < mips.length; k++) {
    const m = mips[k];
    if (!m) continue;
    const s = m.size;
    const r = Math.min(s, Math.max(4, REGION >> k));
    const buf = new Float32Array(r * r);
    for (let by = 0; by < s; by += r)
      for (let bx = 0; bx < s; bx += r) {
        const target =
          covered(bx << k, by << k, (bx + r) << k, (by + r) << k) / ((r * r) << (2 * k));
        rescaleRegion(m, bx, by, r, Math.round(target * r * r), buf);
      }
    const d = m.data;
    for (let i = 3; i < d.length; i += 4)
      d[i] = Math.max(0, Math.min(1, ALPHA_CUT + ((d[i] ?? 0) - ALPHA_CUT) * SHARPEN));
  }
}

/**
 * Scale one r × r region's alpha so `want` texels pass ALPHA_CUT. Texels tied at the cut value
 * can't be split by a scale, so the right number of them (spread by an odd-stride walk) go just
 * over the cut and the rest just under it.
 */
function rescaleRegion(
  m: Mip,
  bx: number,
  by: number,
  r: number,
  want: number,
  buf: Float32Array,
): void {
  if (want <= 0) return;
  const s = m.size;
  const d = m.data;
  const at = (j: number): number => (((by + Math.floor(j / r)) * s + bx + (j % r)) << 2) + 3;
  const cnt = r * r;
  for (let j = 0; j < cnt; j++) buf[j] = d[at(j)] ?? 0;
  buf.sort();
  const first = cnt - want;
  const hi = buf[first] ?? 0;
  if (hi <= 0) return;
  let below = first;
  while (below > 0 && buf[below - 1] === hi) below--;
  const lo = below > 0 ? (buf[below - 1] ?? 0) : 0;
  if (below === first) {
    // The ties at `hi` are all kept: put the cut midway between `hi` and the next value down.
    if (hi >= ALPHA_CUT && lo < ALPHA_CUT) return;
    const k = 1 / (hi + lo);
    for (let j = 0; j < cnt; j++) d[at(j)] = Math.min(1, (d[at(j)] ?? 0) * k);
    return;
  }
  const k = ALPHA_CUT / hi;
  let drop = first - below;
  const stride = Math.round(cnt * 0.618) | 1;
  for (let j = 0, i = 0; j < cnt; j++, i = (i + stride) % cnt) {
    const v = d[at(i)] ?? 0;
    d[at(i)] = v !== hi ? Math.min(1, v * k) : drop-- > 0 ? ALPHA_CUT * 0.99 : ALPHA_CUT * 1.01;
  }
}
