import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { encodePng } from '../../core/index.ts';
import { createCanvas } from './canvas.ts';
import { stampImage } from './stamp.ts';

describe('stampImage', () => {
  it('has no dark fringe where an opaque texel meets a transparent black one', () => {
    // Left pixel opaque red, right pixel fully transparent black (a typical cut-out edge).
    const png = encodePng(2, 1, new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0]));
    const c = createCanvas(8, 1, 1, 1, false);
    stampImage(c, png);
    const out = c.rgba ?? new Uint8Array();
    let edge = 0;
    for (let x = 0; x < 8; x++) {
      const a = out[x * 4 + 3] ?? 0;
      if (a > 0 && a < 255) edge++;
      if (a > 0) expect([...out.subarray(x * 4, x * 4 + 3)]).toEqual([255, 0, 0]);
    }
    expect(edge).toBeGreaterThan(0);
  });

  it('keeps the bytes of an opaque image (no premultiply round-trip)', () => {
    const W = 7;
    const px = new Uint8Array(W * W * 4);
    for (let i = 0; i < W * W; i++)
      px.set([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255], i * 4);
    const c = createCanvas(23, 17, 1, 1, false);
    stampImage(c, encodePng(W, W, px));
    const h = createHash('sha256')
      .update(c.rgba ?? new Uint8Array())
      .digest('hex');
    expect(h.slice(0, 16)).toBe('c35d0da85d4866ec');
  });
});
