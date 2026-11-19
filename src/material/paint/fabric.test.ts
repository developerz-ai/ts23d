import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { createCanvas } from './canvas.ts';
import { paintWeave } from './fabric.ts';

const hash = (...a: Float32Array[]): string => {
  const h = createHash('sha256');
  for (const b of a) h.update(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
  return h.digest('hex').slice(0, 16);
};

describe('paintWeave', () => {
  it('snaps a user pitch to an even thread count, so the over-under lattice tiles across U', () => {
    // 0.004995 m on 4 m is 800.8 threads; snapped to 800 (5 texels each, parity period 10).
    const w = 4000;
    const c = createCanvas(w, 16, 4, 0.25, true);
    const params = { pitch: 0.004995, folds: 0, stains: 0 };
    paintWeave(c, { kind: 'weave', scaleMetres: 0.25, roughness: 0.8, params }, 3);
    let worst = 0;
    for (let y = 0; y < c.h; y++)
      for (let x = 0; x < w; x++) {
        const a = c.height[y * w + x] ?? 0;
        const b = c.height[y * w + ((x + 10) % w)] ?? 0;
        worst = Math.max(worst, Math.abs(a - b));
      }
    expect(worst).toBeLessThan(1e-9);
  });

  it('keeps the default bytes (pitch 0.004, relief 0 and 1, several widths)', () => {
    const golden: [number, number, string][] = [
      [512, 0, '9a3971623f3cb401'],
      [4096, 0, '19ddefed7a434a91'],
      [4096, 1, '1aa9c4a551113438'],
      [1000, 0, '536729afca757be5'],
    ];
    for (const [w, relief, want] of golden) {
      const c = createCanvas(w, 32, 4, 0.5, true);
      paintWeave(c, { kind: 'weave', scaleMetres: 0.5, roughness: 0.8, params: { relief } }, 11);
      expect(hash(c.height, c.tone, c.rough, c.mix)).toBe(want);
    }
  });
});
