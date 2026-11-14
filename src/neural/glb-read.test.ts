// Hostile GLBs: every malformed count, offset and data URI is one T3D_IMPORT_GLB, never a
// RangeError, a DOMException or a multi-gigabyte allocation.
import { describe, expect, test } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { type GltfJson, MAX_EMPTY_ACCESSOR, readAccessor, readGlb, readImage } from './glb-read.ts';
import { packGlb } from './glb-write.ts';

const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? e.code : `not a Ts23dError: ${String(e)}`;
  }
  return 'no error';
};

const doc = (accessor: GltfJson, over: GltfJson = {}) =>
  readGlb(
    packGlb(
      {
        asset: { version: '2.0' },
        buffers: [{ byteLength: 24 }],
        bufferViews: [{ buffer: 0, byteLength: 24 }],
        accessors: [accessor],
        ...over,
      },
      new Uint8Array(24),
    ),
  );

const vec3 = { bufferView: 0, componentType: 5126, type: 'VEC3' };

describe('readAccessor: malformed input → T3D_IMPORT_GLB', () => {
  test('negative count', () => {
    expect(code(() => readAccessor(doc({ ...vec3, count: -1 }), 0))).toBe('T3D_IMPORT_GLB');
  });
  test('negative byteOffset', () => {
    expect(code(() => readAccessor(doc({ ...vec3, count: 1, byteOffset: -4 }), 0))).toBe(
      'T3D_IMPORT_GLB',
    );
  });
  test('fractional count and negative bufferView byteOffset', () => {
    expect(code(() => readAccessor(doc({ ...vec3, count: 1.5 }), 0))).toBe('T3D_IMPORT_GLB');
    const view = { bufferViews: [{ buffer: 0, byteOffset: -4, byteLength: 12 }] };
    expect(code(() => readAccessor(doc({ ...vec3, count: 1 }, view), 0))).toBe('T3D_IMPORT_GLB');
  });
  test('bad base64 in a data: URI', () => {
    const over = { buffers: [{ byteLength: 12, uri: 'data:application/octet-stream;base64,@@@' }] };
    expect(code(() => readAccessor(doc({ ...vec3, count: 1 }, over), 0))).toBe('T3D_IMPORT_GLB');
    const img = { images: [{ uri: 'data:image/png;base64,%%%' }] };
    expect(code(() => readImage(doc({ ...vec3, count: 1 }, img), 0))).toBe('T3D_IMPORT_GLB');
  });
  test('huge count without a bufferView fails fast, no allocation', () => {
    const t0 = performance.now();
    const { bufferView: _, ...noView } = vec3;
    expect(code(() => readAccessor(doc({ ...noView, count: 1e10 }), 0))).toBe('T3D_IMPORT_GLB');
    expect(code(() => readAccessor(doc({ ...noView, count: MAX_EMPTY_ACCESSOR + 1 }), 0))).toBe(
      'T3D_IMPORT_GLB',
    );
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('readAccessor: well-formed input', () => {
  test('a valid accessor and a small zero-filled one decode', () => {
    expect(readAccessor(doc({ ...vec3, count: 2 }), 0).data.length).toBe(6);
    const { bufferView: _, ...noView } = vec3;
    expect(readAccessor(doc({ ...noView, count: 4 }), 0).data).toEqual(new Float32Array(12));
  });
});
