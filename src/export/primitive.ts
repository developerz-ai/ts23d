// One mesh → one glTF primitive: POSITION (with bounds), NORMAL, TEXCOORD_0, COLOR_0 as unorm16
// RGBA, TANGENT only when a normal map is bound, and the smallest index type that fits.

import type { Mesh } from '../core/index.ts';
import { ARRAY_BUFFER, type BinWriter, ELEMENT_ARRAY_BUFFER, type Json } from './bin-writer.ts';
import { tangentsOf } from './tangents.ts';

export function writePrimitive(bin: BinWriter, m: Mesh, material: number, tangents: boolean): Json {
  // COLOR_0 as normalised unsigned short RGBA: 8 bytes/vertex instead of 16, no banding in
  // darks (8-bit would). VEC4 because vertex attributes must be 4-byte aligned.
  const colors = new Uint16Array((m.colors.length / 3) * 4);
  const q = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 65535);
  for (let i = 0; i < m.colors.length / 3; i++)
    colors.set(
      [q(m.colors[i * 3] ?? 1), q(m.colors[i * 3 + 1] ?? 1), q(m.colors[i * 3 + 2] ?? 1), 65535],
      i * 4,
    );
  return {
    attributes: {
      POSITION: bin.accessor(m.positions, 'VEC3', ARRAY_BUFFER, true),
      NORMAL: bin.accessor(m.normals, 'VEC3', ARRAY_BUFFER),
      TEXCOORD_0: bin.accessor(m.uvs, 'VEC2', ARRAY_BUFFER),
      COLOR_0: bin.accessor(colors, 'VEC4', ARRAY_BUFFER, false, true),
      // A bound normal map needs a tangent space (validator S10 / G15).
      ...(tangents ? { TANGENT: bin.accessor(tangentsOf(m), 'VEC4', ARRAY_BUFFER) } : {}),
    },
    // 16-bit indices whenever the primitive allows: half the bytes, every engine reads them.
    indices: bin.accessor(
      m.positions.length / 3 <= 65535 ? Uint16Array.from(m.indices) : m.indices,
      'SCALAR',
      ELEMENT_ARRAY_BUFFER,
    ),
    material,
  };
}
