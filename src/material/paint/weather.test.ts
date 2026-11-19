import { describe, expect, it } from 'bun:test';
import { createCanvas } from './canvas.ts';
import { weather } from './weather.ts';

/** A strip with a trough down its middle rows and a tilted image normal everywhere. */
function troughWithNormals() {
  const c = createCanvas(32, 16, 1, 0.25, true);
  for (let y = 0; y < c.h; y++)
    c.height.fill(y >= 6 && y < 10 ? -0.002 : 0, y * c.w, (y + 1) * c.w);
  const n = new Uint8Array(c.w * c.h * 4);
  for (let i = 0; i < n.length; i += 4) n.set([200, 90, 220, 255], i);
  c.normalRgba = n;
  return c;
}

describe('weather: wet', () => {
  it('flattens an image normal map where water pools (puddles are flat)', () => {
    const c = troughWithNormals();
    weather(c, { wet: 1 }, 1);
    const pool = (8 * c.w + 4) * 4;
    const dry = (1 * c.w + 4) * 4;
    expect([...(c.normalRgba ?? new Uint8Array()).subarray(pool, pool + 4)]).toEqual([
      128, 128, 255, 255,
    ]);
    expect([...(c.normalRgba ?? new Uint8Array()).subarray(dry, dry + 4)]).toEqual([
      200, 90, 220, 255,
    ]);
  });

  it('leaves the normal map alone below wet 0.5 (no standing water)', () => {
    const c = troughWithNormals();
    weather(c, { wet: 0.4 }, 1);
    const pool = (8 * c.w + 4) * 4;
    expect([...(c.normalRgba ?? new Uint8Array()).subarray(pool, pool + 4)]).toEqual([
      200, 90, 220, 255,
    ]);
  });
});
