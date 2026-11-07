// The GLB container: 12-byte header, JSON chunk (space-padded), BIN chunk (zero-padded), every
// length a multiple of 4 [glTF 2.0 §glb-file-format-specification].

import type { Json } from './bin-writer.ts';

export function packGlb(gltf: Json, body: Uint8Array): Uint8Array {
  let json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (json.byteLength % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(json.byteLength + jsonPad).fill(0x20);
    padded.set(json);
    json = padded;
  }
  const total = 12 + 8 + json.byteLength + 8 + body.byteLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, json.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  const binAt = 20 + json.byteLength;
  dv.setUint32(binAt, body.byteLength, true);
  dv.setUint32(binAt + 4, 0x004e4942, true);
  out.set(body, binAt + 8);
  return out;
}

export function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a);
  out.set(b, a.byteLength);
  return out;
}
