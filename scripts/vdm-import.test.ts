import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng, Ts23dError } from '../src/core/index.ts';
import { decodeVdmBin, encodeVdmBin, main, mapToStamp } from './vdm-import.ts';

/** A 24² tangent-space map: a centred dome in blue (normal), mid-grey elsewhere. */
function domePng(): { w: number; rgba: Uint8Array } {
  const w = 24;
  const rgba = new Uint8Array(w * w * 4);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - 11.5, y - 11.5) / 9;
      const z = r < 1 ? (1 - r * r) ** 2 : 0;
      rgba.set([128, 128, Math.round(127.5 + 127 * z), 255], (y * w + x) * 4);
    }
  return { w, rgba };
}

const CC0 = { license: 'CC0-1.0', author: 'test', url: 'https://example.org/brush' };

describe('vdm import', () => {
  it('refuses an unknown or non-commercial licence, and a broken .vdm.bin', async () => {
    const { w, rgba } = domePng();
    const s = mapToStamp({ width: w, height: w, data: rgba }, 0.2, 17);
    const nc = { ...CC0, license: 'CC-BY-NC-4.0' };
    const bin = encodeVdmBin(s, nc, 'x', 'nc credit');
    expect(() => decodeVdmBin(bin)).toThrow(Ts23dError);
    expect(() => decodeVdmBin(bin.subarray(0, 40))).toThrow(Ts23dError);
    const ok = encodeVdmBin(s, CC0, 'x', 'c');
    ok[0] = 0;
    expect(() => decodeVdmBin(ok)).toThrow(Ts23dError);
    const dir = mkdtempSync(join(tmpdir(), 'vdm-'));
    try {
      const png = join(dir, 'b.png');
      await Bun.write(png, encodePng(w, w, rgba));
      await expect(
        main([png, join(dir, 'o.vdm.bin'), '--license', 'free', '--author', 'a', '--url', 'u']),
      ).rejects.toThrow(Ts23dError);
      expect(await main([png])).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('PNG → .vdm.bin → stamp round-trips: windowed, quantised, provenance kept', async () => {
    const { w, rgba } = domePng();
    const dir = mkdtempSync(join(tmpdir(), 'vdm-'));
    try {
      const png = join(dir, 'b.png');
      const out = join(dir, 'b.vdm.bin');
      await Bun.write(png, encodePng(w, w, rgba));
      const args = [png, out, '--license', 'CC0-1.0', '--author', 'test', '--url', CC0.url];
      expect(await main([...args, '--res', '17', '--amp', '0.2'])).toBe(0);
      const bytes = new Uint8Array(await Bun.file(out).arrayBuffer());
      const { stamp, meta } = decodeVdmBin(bytes);
      expect(meta.source).toEqual(CC0);
      expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(stamp.size).toBe(17);
      const centre = stamp.grid[(8 * 17 + 8) * 3 + 2] ?? 0;
      expect(centre).toBeGreaterThan(0.15);
      expect(stamp.grid[2]).toBe(0);
      // Same input, same bytes.
      expect(await main([...args, '--res', '17', '--amp', '0.2'])).toBe(0);
      expect(new Uint8Array(await Bun.file(out).arrayBuffer())).toEqual(bytes);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
