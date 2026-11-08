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
