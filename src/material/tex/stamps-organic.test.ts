import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { dmath } from '../../core/index.ts';
import { hash2 } from '../paint/noise.ts';
import type { TexContext } from './field.ts';
import { scales } from './stamps-organic.ts';

const ctx: TexContext = {
  w: 200,
  h: 100,
  metresU: 0.4,
  metresV: 0.2,
  wrapU: true,
  seed: 5,
  tileU: 0.4,
};
const width = 0.02;
const height = 0.01;
const point = 0.3;

/** The id of the topmost scale over (xm, ym), searching far more rows than any overlap needs. */
function topmost(xm: number, ym: number, overlap: number): number {
  const n = Math.round(ctx.tileU / width);
  const cell = ctx.tileU / n;
  const len = height / (1 - overlap);
  const r0 = Math.floor(ym / height);
  for (let r = r0 + 12; r >= r0; r--) {
    const t = ((r + 1) * height - ym) / len;
    if (t < 0 || t > 1) continue;
    const u = xm / cell + (r % 2 ? 0.5 : 0);
    const col = Math.floor(u);
    const s = Math.abs(u - col - 0.5) * 2;
    const half = Math.sqrt(Math.max(0, 1 - dmath.pow(t, 2 + 4 * point))) * (1 - 0.35 * point * t);
    if (s <= half) return hash2(((col % n) + n) % n, r, ctx.seed);
  }
  return 0;
}

describe('tex.scales', () => {
  it('stacks the topmost row over every texel at high overlap (0.7, 0.8)', () => {
    for (const overlap of [0.7, 0.8]) {
      const id = scales({ width, height, overlap, point }).id.eval(ctx);
      let wrong = 0;
      for (let y = 0; y < ctx.h; y++)
        for (let x = 0; x < ctx.w; x++) {
          const want = Math.fround(topmost((x + 0.5) * 0.002, (y + 0.5) * 0.002, overlap));
          if (id[y * ctx.w + x] !== want) wrong++;
        }
      expect(wrong).toBe(0);
    }
  });

  it('keeps its bytes at overlap ≤ 0.6 (rows r0 … r0+2 were already enough)', () => {
    const golden: Record<string, string> = {
      '0.2': 'c366b3907edcc10a',
      '0.4': '80d4086ad1c65dd3',
      '0.6': 'e20eb1f29261e5ca',
    };
    for (const [overlap, want] of Object.entries(golden)) {
      const st = scales({ width, height, overlap: Number(overlap), point });
      const h = createHash('sha256');
      for (const a of [st.height.eval(ctx), st.id.eval(ctx), st.mask.eval(ctx)])
        h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
      expect(h.digest('hex').slice(0, 16)).toBe(want);
    }
  });
});
