// A small, strict glTF 2.0 binary READER: the 12-byte header, the JSON chunk, the BIN chunk, and
// accessors decoded to Float32Array (every component type, `normalized`, `byteStride`). What it
// does not read — Draco/meshopt compression, sparse accessors, external URIs — fails with
// T3D_IMPORT_UNSUPPORTED naming the way out; anything malformed fails with T3D_IMPORT_GLB.
// Pure functions of the bytes: no I/O, deterministic, browser-safe.

import { Ts23dError } from '../core/index.ts';

export type GltfJson = Record<string, unknown>;

export interface GlbDoc {
  readonly json: GltfJson;
  readonly bin: Uint8Array | null;
}

const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const UNSUPPORTED_EXT = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression'];

export function bad(cause: string, fix = 'export the file again as glTF 2.0 binary (.glb)'): never {
  throw new Ts23dError('T3D_IMPORT_GLB', { cause, fix });
}

export function unsupported(cause: string, fix: string): never {
  throw new Ts23dError('T3D_IMPORT_UNSUPPORTED', { cause, fix });
}

/** Split a .glb into its JSON and BIN chunks, validating header, lengths and alignment. */
export function readGlb(bytes: Uint8Array): GlbDoc {
  if (bytes.byteLength < 20) bad(`${bytes.byteLength} bytes is too short for a GLB header`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) bad('missing the "glTF" magic: not a .glb file');
  const version = dv.getUint32(4, true);
  if (version !== 2)
    unsupported(`glTF version ${version}`, 'convert to glTF 2.0 (Blender: File › Export › glTF)');
  const total = dv.getUint32(8, true);
  if (total > bytes.byteLength) bad(`header says ${total} bytes, file has ${bytes.byteLength}`);
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== JSON_CHUNK || 20 + jsonLen > total)
    bad('the first chunk is not a well-formed JSON chunk');
  let json: GltfJson;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      bad('the JSON chunk is not an object');
    json = parsed as GltfJson;
  } catch (e) {
    if (e instanceof Ts23dError) throw e;
    return bad(`the JSON chunk does not parse (${String(e)})`);
  }
  let bin: Uint8Array | null = null;
  const at = 20 + jsonLen;
  if (at + 8 <= total) {
    const len = dv.getUint32(at, true);
    if (dv.getUint32(at + 4, true) !== BIN_CHUNK || at + 8 + len > total)
      bad('the second chunk is not a well-formed BIN chunk');
    bin = bytes.subarray(at + 8, at + 8 + len);
  }
  const required = arr(json, 'extensionsRequired').filter(
    (e): e is string => typeof e === 'string',
  );
  const blocked = required.filter((e) => UNSUPPORTED_EXT.includes(e));
  if (blocked.length)
    unsupported(
      `compressed geometry (${blocked.join(', ')}) is not decoded`,
      'export without compression (Blender: uncheck "Compression"; gltf-transform: `gltf-transform copy in.glb out.glb`)',
    );
  return { json, bin };
}

/** `json[key]` as an array (missing → empty). */
export function arr(o: GltfJson, key: string): unknown[] {
  const v = o[key];
  if (v === undefined) return [];
  if (!Array.isArray(v)) bad(`"${key}" is not an array`);
  return v as unknown[];
}

/** `json[key]` as an array of records (missing → empty). */
export const list = (o: GltfJson, key: string): GltfJson[] => arr(o, key) as GltfJson[];

/** `json[key]` as an array of indices (non-integers are malformed). */
export function indices(o: GltfJson, key: string): number[] {
  const v = arr(o, key);
  if (!v.every((x) => Number.isInteger(x))) bad(`"${key}" holds a non-index`);
  return v as number[];
}

export function num(o: GltfJson, key: string, fallback?: number): number {
  const v = o[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v === undefined && fallback !== undefined) return fallback;
  return bad(`"${key}" is ${JSON.stringify(v)}, expected a number`);
}

/** `json[key]` as a count/offset/length: an integer ≥ 0 (malformed otherwise). */
export function uint(o: GltfJson, key: string, fallback?: number): number {
  const v = num(o, key, fallback);
  if (!Number.isSafeInteger(v) || v < 0) bad(`"${key}" is ${v}, expected an integer ≥ 0`);
  return v;
}

/** Record `i` of `json[key]`, or T3D_IMPORT_GLB naming the dangling reference. */
export function at(doc: GlbDoc, key: string, i: number): GltfJson {
  const r = list(doc.json, key)[i];
  if (!r || typeof r !== 'object') bad(`${key}[${i}] is referenced but missing`);
  return r;
}

/** The bytes of bufferView `i` (buffer 0 = the BIN chunk; data: URIs decoded). */
export function viewBytes(doc: GlbDoc, i: number): { bytes: Uint8Array; stride: number } {
  const view = at(doc, 'bufferViews', i);
  const buffer = bufferBytes(doc, uint(view, 'buffer'));
  const off = uint(view, 'byteOffset', 0);
  const len = uint(view, 'byteLength');
  if (off + len > buffer.byteLength) bad(`bufferViews[${i}] runs past its buffer`);
  return { bytes: buffer.subarray(off, off + len), stride: uint(view, 'byteStride', 0) };
}

function bufferBytes(doc: GlbDoc, i: number): Uint8Array {
  const b = at(doc, 'buffers', i);
  const uri = b['uri'];
  if (typeof uri === 'string') {
    const m = /^data:[^;]*;base64,(.*)$/.exec(uri);
    if (!m) unsupported(`buffers[${i}] points to an external file '${uri}'`, 'pack it as a .glb');
    return base64(m?.[1] ?? '', `buffers[${i}]`);
  }
  if (i !== 0 || !doc.bin) bad(`buffers[${i}] has no data`);
  return doc.bin;
}

/** Decode a data: URI payload; malformed base64 is a malformed file, not a DOMException. */
function base64(text: string, what: string): Uint8Array {
  let raw: string;
  try {
    raw = atob(text);
  } catch (e) {
    return bad(`${what} has a data: URI that is not valid base64 (${String(e)})`);
  }
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Elements an accessor without a bufferView may declare (all zeros): 2^24, ~200 MB of VEC3. */
export const MAX_EMPTY_ACCESSOR = 2 ** 24;

const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

export interface AccessorData {
  readonly data: Float32Array;
  readonly count: number;
  readonly width: number;
}

/** Accessor `i` decoded to floats; integer data scaled to 0..1 / −1..1 when `normalized`. */
export function readAccessor(doc: GlbDoc, i: number): AccessorData {
  const acc = at(doc, 'accessors', i);
  if (acc['sparse'] !== undefined)
    unsupported(`accessors[${i}] is sparse`, 'export without sparse accessors (morph targets)');
  const width = WIDTH[String(acc['type'])];
  const ct = num(acc, 'componentType');
  const size = SIZE[ct];
  if (!width || !size) bad(`accessors[${i}] has type ${acc['type']} / componentType ${ct}`);
  const count = uint(acc, 'count');
  if (acc['bufferView'] === undefined) {
    if (count > MAX_EMPTY_ACCESSOR)
      bad(
        `accessors[${i}] declares ${count} elements with no bufferView (cap ${MAX_EMPTY_ACCESSOR})`,
      );
    return { data: new Float32Array(count * width), count, width };
  }
  const { bytes, stride } = viewBytes(doc, uint(acc, 'bufferView'));
  const off = uint(acc, 'byteOffset', 0);
  const step = stride || width * size;
  if (count > 0 && off + (count - 1) * step + width * size > bytes.byteLength)
    bad(`accessors[${i}] reads past its bufferView`);
  const data = new Float32Array(count * width);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const norm = acc['normalized'] === true;
  for (let e = 0; e < count; e++)
    for (let k = 0; k < width; k++) {
      const p = off + e * step + k * size;
      data[e * width + k] = component(dv, p, ct, norm);
    }
  return { data, count, width };
}

function component(dv: DataView, p: number, ct: number, norm: boolean): number {
  switch (ct) {
    case 5126:
      return dv.getFloat32(p, true);
    case 5125:
      return dv.getUint32(p, true);
    case 5123:
      return norm ? dv.getUint16(p, true) / 65535 : dv.getUint16(p, true);
    case 5122:
      return norm ? Math.max(dv.getInt16(p, true) / 32767, -1) : dv.getInt16(p, true);
    case 5121:
      return norm ? dv.getUint8(p) / 255 : dv.getUint8(p);
    default:
      return norm ? Math.max(dv.getInt8(p) / 127, -1) : dv.getInt8(p);
  }
}

/** Image `i`'s encoded bytes and MIME type (embedded bufferView or data: URI). */
export function readImage(doc: GlbDoc, i: number): { bytes: Uint8Array; mime: string } {
  const img = at(doc, 'images', i);
  const uri = img['uri'];
  if (typeof uri === 'string') {
    const m = /^data:([^;]*);base64,(.*)$/.exec(uri);
    if (!m) unsupported(`images[${i}] points to an external file '${uri}'`, 'pack it as a .glb');
    return { bytes: base64(m?.[2] ?? '', `images[${i}]`), mime: m?.[1] ?? '' };
  }
  const { bytes } = viewBytes(doc, uint(img, 'bufferView'));
  return { bytes, mime: String(img['mimeType'] ?? '') };
}
