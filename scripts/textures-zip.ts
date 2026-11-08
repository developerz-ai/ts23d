// A tiny deterministic zip reader for texture downloads (ambientCG ships every set as a zip):
// finds the central directory, lists entries, and extracts one by name — stored (method 0) or
// deflate (method 8, via node:zlib's raw inflate). No zip64, no encryption: those throw with a
// fix. Scripts only; the library (src/) stays zero-dependency and never unzips.

import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly size: number;
  /** Offset of the entry's local file header. */
  readonly offset: number;
}

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;

function fail(msg: string): never {
  throw new Error(
    `zip: ${msg}\nfix: re-download the archive, or pick the set's PNG zip (e.g. *_1K-PNG.zip)`,
  );
}

/** Every entry in the archive's central directory, in directory order. */
export function zipEntries(zip: Uint8Array): ZipEntry[] {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--)
    if (dv.getUint32(i, true) === EOCD) {
      end = i;
      break;
    }
  if (end < 0) fail('no end-of-central-directory record (not a zip, or truncated)');
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  if (count === 0xffff || p === 0xffffffff) fail('zip64 archives are not supported');
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (p + 46 > zip.length || dv.getUint32(p, true) !== CEN)
      fail(`central directory entry ${k} is corrupt`);
    const flags = dv.getUint16(p + 8, true);
    if (flags & 1) fail('encrypted entries are not supported');
    const nameLen = dv.getUint16(p + 28, true);
    const extra = dv.getUint16(p + 30, true);
    const comment = dv.getUint16(p + 32, true);
    out.push({
      name: dec.decode(zip.subarray(p + 46, p + 46 + nameLen)),
      method: dv.getUint16(p + 10, true),
      compressedSize: dv.getUint32(p + 20, true),
      size: dv.getUint32(p + 24, true),
      offset: dv.getUint32(p + 42, true),
    });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

/** The bytes of entry `name`; throws when it is missing, unsupported or the wrong size. */
export function unzipEntry(zip: Uint8Array, name: string): Uint8Array {
  const entries = zipEntries(zip);
  const e = entries.find((x) => x.name === name);
  if (!e) fail(`no entry '${name}' (has: ${entries.map((x) => x.name).join(', ')})`);
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  if (dv.getUint32(e.offset, true) !== LOC) fail(`local header of '${name}' is corrupt`);
  const start =
    e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const raw = zip.subarray(start, start + e.compressedSize);
  let data: Uint8Array;
  if (e.method === 0) data = raw;
  else if (e.method === 8) data = new Uint8Array(inflateRawSync(raw));
  else fail(`entry '${name}' uses compression method ${e.method} (only stored/deflate)`);
  if (data.length !== e.size)
    fail(`entry '${name}' is ${data.length} bytes, directory says ${e.size}`);
  return new Uint8Array(data);
}
