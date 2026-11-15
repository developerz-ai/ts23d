import { describe, expect, it } from 'bun:test';
import { compareFingerprints, fingerprint, srgbToLab } from './ref-fingerprint.ts';

type Paint = (x: number, y: number) => [number, number, number] | null;

/** RGBA image; `paint` returns the colour of an object pixel, null = background (alpha 0). */
function image(w: number, h: number, paint: Paint): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = paint(x, y);
      if (c) px.set([...c, 255], (y * w + x) * 4);
    }
  return px;
}

/** Deterministic value noise in 0–255 (integer hash, no Math.random). */
const noise = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) & 255;
};

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

describe('fingerprint', () => {
  it('refuses bytes that match neither RGBA nor a mask of the size', () => {
    expect(() => fingerprint(new Uint8Array(10), 4, 4)).toThrow(/T3D_RENDER_OPTIONS|neither/);
  });

  it('has the documented shape', () => {
    const f = fingerprint(
      image(64, 48, (x, y) => (inEllipse(x, y, 32, 24, 28, 18) ? [120, 110, 100] : null)),
      64,
      48,
    );
    expect(f.mask128.length).toBe(128 * 128);
    expect(f.lab).toHaveLength(48);
    expect(f.spectrum).toHaveLength(8);
    expect(f.edges).toHaveLength(64);
    expect(f.lab.slice(0, 16).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 6);
  });

  it('is framing-agnostic: the same shape at another size and offset matches', () => {
    const a = fingerprint(
      image(100, 60, (x, y) => (inEllipse(x, y, 50, 30, 40, 20) ? [90, 90, 90] : null)),
      100,
      60,
    );
    const b = fingerprint(
      image(300, 300, (x, y) => (inEllipse(x, y, 100, 200, 80, 40) ? [90, 90, 90] : null)),
      300,
      300,
    );
    const d = compareFingerprints(a, b);
    expect(d.iou).toBeGreaterThan(0.95);
    expect(d.valueEmd).toBeLessThan(0.01);
  });

  it('is deterministic', () => {
    const img = image(80, 80, (x, y) =>
      inEllipse(x, y, 40, 40, 30, 30) ? [noise(x, y), 80, 60] : null,
    );
    expect(fingerprint(img, 80, 80)).toEqual(fingerprint(img, 80, 80));
  });

  it('treats a one-byte mask as a grey object', () => {
    const m = new Uint8Array(32 * 32).map((_, i) =>
      inEllipse(i % 32, Math.floor(i / 32), 16, 16, 12, 8) ? 1 : 0,
    );
    const f = fingerprint(m, 32, 32);
    expect(f.mask128.some((v) => v === 1)).toBe(true);
    expect(f.spectrum.every((v) => v === 0)).toBe(true);
  });
});

describe('compareFingerprints', () => {
  const blob = (headDy: number): Uint8Array =>
    image(200, 120, (x, y) =>
      inEllipse(x, y, 90, 70, 60, 25) || inEllipse(x, y, 165, 45 + headDy, 22, 18)
        ? [100, 100, 100]
        : null,
    );

  it('drops IoU when a mass moves', () => {
    const a = fingerprint(blob(0), 200, 120);
    const b = fingerprint(blob(40), 200, 120);
    expect(compareFingerprints(a, b).iou).toBeLessThan(0.85);
    expect(compareFingerprints(a, a).iou).toBe(1);
  });

  it('finds a mirrored side view only when asked', () => {
    const a = fingerprint(blob(0), 200, 120);
    const flipped = image(200, 120, (x, y) =>
      inEllipse(199 - x, y, 90, 70, 60, 25) || inEllipse(199 - x, y, 165, 45, 22, 18)
        ? [100, 100, 100]
        : null,
    );
    const b = fingerprint(flipped, 200, 120);
    expect(compareFingerprints(a, b).iou).toBeLessThan(0.85);
    expect(compareFingerprints(a, b, { mirror: true }).iou).toBeGreaterThan(0.97);
  });

  it('separates flat from detailed surfaces by spectrum and edges', () => {
    const shape = (x: number, y: number): boolean => inEllipse(x, y, 64, 64, 60, 40);
    const flat = fingerprint(
      image(128, 128, (x, y) => (shape(x, y) ? [128, 120, 110] : null)),
      128,
      128,
    );
    const furry = fingerprint(
      image(128, 128, (x, y) => (shape(x, y) ? [noise(x, y), noise(x, y), noise(x, y)] : null)),
      128,
      128,
    );
    const d = compareFingerprints(flat, furry);
    expect(d.spectrumGap).toBeGreaterThan(0.5);
    expect(d.edgeGap).toBeGreaterThan(0.3);
  });

  it('measures value distance on L', () => {
    const shape = (x: number, y: number): boolean => inEllipse(x, y, 32, 32, 30, 20);
    const dark = fingerprint(
      image(64, 64, (x, y) => (shape(x, y) ? [30, 30, 30] : null)),
      64,
      64,
    );
    const light = fingerprint(
      image(64, 64, (x, y) => (shape(x, y) ? [220, 220, 220] : null)),
      64,
      64,
    );
    expect(compareFingerprints(dark, light).valueEmd).toBeGreaterThan(0.5);
  });
});

describe('srgbToLab', () => {
  it('maps white and black to L 100 and 0', () => {
    expect(srgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 1);
    expect(srgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 6);
  });
});
