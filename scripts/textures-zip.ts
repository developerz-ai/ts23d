// A tiny deterministic zip reader for texture downloads (ambientCG ships every set as a zip):
// finds the central directory, lists entries, and extracts one by name — stored (method 0) or
// deflate (method 8, via node:zlib's raw inflate). No zip64, no encryption: those throw with a
// fix. Hostile archives are bounded: every header offset is checked against the bytes, and an
// entry inflates to at most its declared size (cap 256 MB). Errors name the archive (`file`).
// Scripts only; the library (src/) stays zero-dependency and never unzips.

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

/** Largest entry we inflate: a 4K PNG map is ~50 MB, so this is generous, not a limit in use. */
export const MAX_ENTRY_BYTES = 256 * 1024 * 1024;

function fail(file: string, msg: string): never {
  throw new Error(
    `zip ${file}: ${msg}\nfix: re-download the archive, or pick the set's PNG zip (e.g. *_1K-PNG.zip)`,
  );
}

/** Every entry in the archive's central directory, in directory order. */
export function zipEntries(zip: Uint8Array, file = 'archive'): ZipEntry[] {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--)
    if (dv.getUint32(i, true) === EOCD) {
      end = i;
      break;
    }
  if (end < 0) fail(file, 'no end-of-central-directory record (not a zip, or truncated)');
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  if (count === 0xffff || p === 0xffffffff) fail(file, 'zip64 archives are not supported');
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (p + 46 > zip.length || dv.getUint32(p, true) !== CEN)
      fail(file, `central directory entry ${k} is corrupt`);
    const flags = dv.getUint16(p + 8, true);
    if (flags & 1) fail(file, 'encrypted entries are not supported');
    const nameLen = dv.getUint16(p + 28, true);
    const extra = dv.getUint16(p + 30, true);
    const comment = dv.getUint16(p + 32, true);
    if (p + 46 + nameLen > zip.length) fail(file, `central directory entry ${k} runs past the end`);
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
export function unzipEntry(zip: Uint8Array, name: string, file = 'archive'): Uint8Array {
  const entries = zipEntries(zip, file);
  const e = entries.find((x) => x.name === name);
  if (!e) fail(file, `no entry '${name}' (has: ${entries.map((x) => x.name).join(', ')})`);
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  if (e.offset + 30 > zip.length || dv.getUint32(e.offset, true) !== LOC)
    fail(file, `local header of '${name}' is corrupt`);
  const start =
    e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  if (start + e.compressedSize > zip.length)
    fail(file, `entry '${name}' runs past the end of the archive (truncated download?)`);
  if (e.size > MAX_ENTRY_BYTES)
    fail(file, `entry '${name}' declares ${e.size} bytes, over the ${MAX_ENTRY_BYTES} cap`);
  const raw = zip.subarray(start, start + e.compressedSize);
  let data: Uint8Array;
  if (e.method === 0) data = raw;
  else if (e.method === 8) data = inflate(raw, e.size, name, file);
  else fail(file, `entry '${name}' uses compression method ${e.method} (only stored/deflate)`);
  if (data.length !== e.size)
    fail(file, `entry '${name}' is ${data.length} bytes, directory says ${e.size}`);
  return new Uint8Array(data);
}

/** Raw inflate that stops at the declared size: a lying header cannot buy a huge buffer. */
function inflate(raw: Uint8Array, size: number, name: string, file: string): Uint8Array {
  try {
    return new Uint8Array(inflateRawSync(raw, { maxOutputLength: Math.max(1, size) }));
  } catch (e) {
    return fail(file, `entry '${name}' does not inflate to its declared ${size} bytes (${e})`);
  }
}
