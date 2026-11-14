import { describe, expect, it } from 'bun:test';
import { deflateRawSync } from 'node:zlib';
import { unzipEntry, zipEntries } from './textures-zip.ts';

/** A minimal zip writer (test fixture): stored or deflate entries, no CRC check needed. */
export function makeZip(entries: readonly { name: string; data: Uint8Array; deflate?: boolean }[]) {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const e of entries) {
    const name = enc.encode(e.name);
    const body = e.deflate ? new Uint8Array(deflateRawSync(e.data)) : e.data;
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true);
    loc.setUint16(8, e.deflate ? 8 : 0, true);
    loc.setUint32(18, body.length, true);
    loc.setUint32(22, e.data.length, true);
    loc.setUint16(26, name.length, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(10, e.deflate ? 8 : 0, true);
    cen.setUint32(20, body.length, true);
    cen.setUint32(24, e.data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    parts.push(new Uint8Array(loc.buffer), name, body);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cenSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let p = 0;
  for (const b of all) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

const a = new Uint8Array(1000).map((_, i) => i % 7);
const b = new Uint8Array([1, 2, 3, 4, 5]);

describe('zip reader: bad input', () => {
  it('rejects bytes that are not a zip, with a fix', () => {
    expect(() => zipEntries(new Uint8Array(100))).toThrow('fix:');
  });
  it('rejects a missing entry and lists what is there', () => {
    const zip = makeZip([{ name: 'a.png', data: a }]);
    expect(() => unzipEntry(zip, 'b.png')).toThrow('has: a.png');
  });
});

describe('zip reader: hostile archives', () => {
  it('a declared size smaller than the inflated data fails, without a big buffer', () => {
    const big = new Uint8Array(4 * 1024 * 1024); // 4 MB of zeros deflates to ~4 KB
    const zip = makeZip([{ name: 'bomb.png', data: big, deflate: true }]);
    const cen = zip.length - 22 - 46 - 'bomb.png'.length;
    new DataView(zip.buffer).setUint32(cen + 24, 16, true); // central directory: size = 16
    expect(() => unzipEntry(zip, 'bomb.png', 'Bomb_1K-PNG.zip')).toThrow('Bomb_1K-PNG.zip');
    expect(() => unzipEntry(zip, 'bomb.png')).toThrow('declared 16 bytes');
  });
  it('a local header offset past the end fails with the archive name', () => {
    const zip = makeZip([{ name: 'a.png', data: a }]);
    const cen = zip.length - 22 - 46 - 'a.png'.length;
    new DataView(zip.buffer).setUint32(cen + 42, 0x7fffffff, true);
    expect(() => unzipEntry(zip, 'a.png', 'x.zip')).toThrow('zip x.zip: local header');
  });
  it('compressed data running past the end fails, not a short read', () => {
    const zip = makeZip([{ name: 'a.png', data: a }]);
    const cen = zip.length - 22 - 46 - 'a.png'.length;
    new DataView(zip.buffer).setUint32(cen + 20, 0x7fffff, true);
    expect(() => unzipEntry(zip, 'a.png')).toThrow('runs past the end');
  });
});

describe('zip reader: output', () => {
  it('extracts stored and deflated entries byte for byte', () => {
    const zip = makeZip([
      { name: 'x_Color.png', data: a, deflate: true },
      { name: 'x_Roughness.png', data: b },
    ]);
    expect(zipEntries(zip).map((e) => [e.name, e.method])).toEqual([
      ['x_Color.png', 8],
      ['x_Roughness.png', 0],
    ]);
    expect([...unzipEntry(zip, 'x_Color.png')]).toEqual([...a]);
    expect([...unzipEntry(zip, 'x_Roughness.png')]).toEqual([...b]);
  });
});
