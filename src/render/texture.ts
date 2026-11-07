// The trim sheet as the beauty renderer samples it: albedo (linear, alpha), tangent-space normal
// and ORM, each as a box-filtered mip chain, sampled bilinearly — U repeats (strips tile), V clamps
// (rows never bleed). The mip level is chosen per triangle by the caller (texel ÷ pixel footprint).

import type { PaintedSheet } from '../material/index.ts';

export interface Mip {
  readonly size: number;
  /** 4 floats per texel. */
  readonly data: Float32Array;
}

export interface SheetTextures {
  readonly size: number;
  readonly albedo: readonly Mip[];
  readonly normal: readonly Mip[];
  readonly orm: readonly Mip[];
}

const SRGB = new Float32Array(256).map((_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

function chain(src: Uint8Array, size: number, decode: (c: number, v: number) => number): Mip[] {
  const top = new Float32Array(size * size * 4);
  for (let i = 0; i < top.length; i++) top[i] = decode(i & 3, src[i] ?? 0);
  const out: Mip[] = [{ size, data: top }];
  let cur = out[0];
  while (cur && cur.size > 4) {
    const s = cur.size / 2;
    const d = new Float32Array(s * s * 4);
    const p = cur.data;
    const w = cur.size;
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++)
        for (let c = 0; c < 4; c++) {
          const a = ((2 * y * w + 2 * x) << 2) + c;
          const b = a + w * 4;
          d[((y * s + x) << 2) + c] =
            ((p[a] ?? 0) + (p[a + 4] ?? 0) + (p[b] ?? 0) + (p[b + 4] ?? 0)) * 0.25;
        }
    cur = { size: s, data: d };
    out.push(cur);
  }
  return out;
}

const cache = new WeakMap<PaintedSheet, SheetTextures>();

export function sheetTextures(sheet: PaintedSheet): SheetTextures {
  const hit = cache.get(sheet);
  if (hit) return hit;
  const t: SheetTextures = {
    size: sheet.size,
    albedo: chain(sheet.albedo, sheet.size, (c, v) => (c === 3 ? v / 255 : (SRGB[v] ?? 0))),
    normal: chain(sheet.normal, sheet.size, (c, v) => (c === 3 ? 1 : v / 127.5 - 1)),
    orm: chain(sheet.orm, sheet.size, (_c, v) => v / 255),
  };
  cache.set(sheet, t);
  return t;
}

/** Bilinear sample of mip `level` at (u, v) into out[0..3]. */
export function sample(
  mips: readonly Mip[],
  level: number,
  u: number,
  v: number,
  out: Float32Array,
): void {
  const m = mips[Math.min(mips.length - 1, Math.max(0, level))] ?? mips[0];
  if (!m) return;
  const s = m.size;
  const x = u * s - 0.5;
  const y = Math.min(s - 1, Math.max(0, v * s - 0.5));
  const xf = Math.floor(x);
  const yf = Math.floor(y);
  const fx = x - xf;
  const fy = y - yf;
  const x0 = ((xf % s) + s) % s;
  const x1 = (x0 + 1) % s;
  const y0 = yf;
  const y1 = Math.min(s - 1, yf + 1);
  const d = m.data;
  const a = (y0 * s + x0) << 2;
  const b = (y0 * s + x1) << 2;
  const c = (y1 * s + x0) << 2;
  const e = (y1 * s + x1) << 2;
  const w0 = (1 - fx) * (1 - fy);
  const w1 = fx * (1 - fy);
  const w2 = (1 - fx) * fy;
  const w3 = fx * fy;
  for (let k = 0; k < 4; k++)
    out[k] =
      (d[a + k] ?? 0) * w0 + (d[b + k] ?? 0) * w1 + (d[c + k] ?? 0) * w2 + (d[e + k] ?? 0) * w3;
}
