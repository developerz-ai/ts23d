import { describe, expect, test } from 'bun:test';
import { boundsOf, type Mesh, Ts23dError, triangleCount } from '../core/index.ts';
import { cube } from './fixtures.ts';
import { packGlb, writeMeshGlb } from './glb-write.ts';
import { type ImportSource, importGlb } from './import-glb.ts';
import { sha256Hex } from './sha256.ts';

const src = (bytes: Uint8Array, over: Partial<ImportSource> = {}): ImportSource => ({
  path: 'test.glb',
  sha256: sha256Hex(bytes),
  bytes,
  license: 'CC0-1.0',
  author: 'ts23d tests',
  url: 'own fixture',
  ...over,
});

const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? e.code : `not a Ts23dError: ${String(e)}`;
  }
  return 'no error';
};

describe('importGlb: failures first', () => {
  test('bad bytes → T3D_IMPORT_GLB', () => {
    const junk = new TextEncoder().encode('definitely not a binary gltf file');
    expect(code(() => importGlb(src(junk)))).toBe('T3D_IMPORT_GLB');
  });
  test('truncated file → T3D_IMPORT_GLB', () => {
    const glb = writeMeshGlb([{ name: 'box', mesh: cube() }]);
    expect(code(() => importGlb(src(glb.slice(0, 40))))).toBe('T3D_IMPORT_GLB');
  });
  test('accessor past its view → T3D_IMPORT_GLB', () => {
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 12 }],
      bufferViews: [{ buffer: 0, byteLength: 12 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
    };
    expect(code(() => importGlb(src(packGlb(json, new Uint8Array(12)))))).toBe('T3D_IMPORT_GLB');
  });
  test('Draco-compressed → T3D_IMPORT_UNSUPPORTED', () => {
    const json = { asset: { version: '2.0' }, extensionsRequired: ['KHR_draco_mesh_compression'] };
    expect(code(() => importGlb(src(packGlb(json, new Uint8Array()))))).toBe(
      'T3D_IMPORT_UNSUPPORTED',
    );
  });
  test('no triangles → T3D_IMPORT_EMPTY', () => {
    const json = { asset: { version: '2.0' }, nodes: [{ name: 'empty' }] };
    expect(code(() => importGlb(src(packGlb(json, new Uint8Array()))))).toBe('T3D_IMPORT_EMPTY');
  });
  test('declared hash differs from the bytes → T3D_IMPORT_HASH', () => {
    const glb = writeMeshGlb([{ name: 'box', mesh: cube() }]);
    expect(code(() => importGlb(src(glb, { sha256: '0'.repeat(64) })))).toBe('T3D_IMPORT_HASH');
  });
  test('no bytes and not cached → T3D_IMPORT_MISSING', () => {
    expect(
      code(() =>
        importGlb({
          path: 'x.glb',
          license: 'CC0-1.0',
          author: 'a',
          url: 'u',
          sha256: 'a'.repeat(64),
        }),
      ),
    ).toBe('T3D_IMPORT_MISSING');
  });
  test('non-positive or non-finite sizes → T3D_IMPORT_UNSUPPORTED', () => {
    const glb = writeMeshGlb([{ name: 'box', mesh: cube() }]);
    expect(code(() => importGlb(src(glb), { height: -2 }))).toBe('T3D_IMPORT_UNSUPPORTED');
    expect(code(() => importGlb(src(glb), { scale: 0 }))).toBe('T3D_IMPORT_UNSUPPORTED');
    expect(code(() => importGlb(src(glb), { scale: Number.NaN }))).toBe('T3D_IMPORT_UNSUPPORTED');
    expect(code(() => importGlb(src(glb), { fit: [1, -1, 1] }))).toBe('T3D_IMPORT_UNSUPPORTED');
  });
  test('licences: unknown and non-commercial refused, NC opt-in warns', () => {
    const glb = writeMeshGlb([{ name: 'box', mesh: cube() }]);
    expect(code(() => importGlb(src(glb, { license: 'free for all' })))).toBe('T3D_IMPORT_LICENSE');
    expect(code(() => importGlb(src(glb, { license: 'CC-BY-NC-4.0' })))).toBe('T3D_IMPORT_LICENSE');
    expect(code(() => importGlb(src(glb, { author: '' })))).toBe('T3D_IMPORT_LICENSE');
    const nc = importGlb(src(glb, { license: 'CC-BY-NC-4.0', allowNonCommercial: true }));
    expect(nc.warnings.join()).toContain('may NOT be sold');
    expect(nc.credit).toContain('NON-COMMERCIAL');
    expect(importGlb(src(glb, { license: 'CC-BY-4.0' })).credit).toContain('ts23d tests');
  });
});

describe('importGlb: frames, transforms, fit', () => {
  const tall = cube([0.2, 1, 0.4]); // glTF: 0.2 wide (X = left), 1 up (Y), 0.4 deep (Z = front)
  test('glTF Y-up/+Z-front becomes Z-up/+X-front, base on the ground', () => {
    const r = importGlb(src(writeMeshGlb([{ name: 'post', mesh: tall }])));
    const b = boundsOf(r.mesh);
    expect(b.max[2] - b.min[2]).toBeCloseTo(1, 5);
    expect(b.max[0] - b.min[0]).toBeCloseTo(0.4, 5);
    expect(b.max[1] - b.min[1]).toBeCloseTo(0.2, 5);
    expect(b.min[2]).toBeCloseTo(0, 6);
    // The glTF +Y face's normal now points +Z.
    const n = r.mesh.normals;
    const up = [...Array(n.length / 3).keys()].filter((i) => (n[i * 3 + 2] ?? 0) > 0.99);
    expect(up.length).toBe(4);
  });
  test('node TRS is baked; mirrored scale keeps faces outward', () => {
    const r = importGlb(
      src(writeMeshGlb([{ name: 'box', mesh: cube(), translation: [5, 0, 0], scale: [-2, 1, 1] }])),
      { place: 'origin' },
    );
    const b = boundsOf(r.mesh);
    expect(b.max[1] - b.min[1]).toBeCloseTo(2, 5); // glTF X (scaled 2) → ts23d Y
    expect(b.min[1]).toBeCloseTo(4, 5);
    expect(r.report?.flipped).toBe(0);
    expect(r.report?.shells.map((s) => s.closed)).toEqual([true]);
    expect(volume(r.mesh)).toBeGreaterThan(0);
  });
  test('fit by height and by box scales uniformly', () => {
    const glb = writeMeshGlb([{ name: 'post', mesh: tall }]);
    expect(importGlb(src(glb), { height: 1.8 }).scale).toBeCloseTo(1.8, 6);
    const r = importGlb(src(glb), { fit: [0.1, 1, 1] });
    expect(r.scale).toBeCloseTo(0.25, 6);
    expect(triangleCount(r.mesh)).toBe(12);
  });
  test('Z-up files convert with up +z', () => {
    const r = importGlb(src(writeMeshGlb([{ name: 'post', mesh: tall }])), {
      up: '+z',
      front: '+x',
    });
    const b = boundsOf(r.mesh);
    expect(b.max[2] - b.min[2]).toBeCloseTo(0.4, 5);
    expect(
      code(() =>
        importGlb(src(writeMeshGlb([{ name: 'p', mesh: tall }])), { up: '+y', front: '+y' }),
      ),
    ).toBe('T3D_IMPORT_UNSUPPORTED');
  });
  test('deterministic: same bytes, same mesh', () => {
    const glb = writeMeshGlb([{ name: 'box', mesh: cube() }]);
    const a = importGlb(src(glb), { height: 2 }).mesh;
    const b = importGlb(src(new Uint8Array(glb)), { height: 2, place: 'ground' }).mesh;
    expect(Buffer.from(b.positions.buffer).equals(Buffer.from(a.positions.buffer))).toBe(true);
  });
});

function volume(m: Mesh): number {
  let v = 0;
  const P = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => (m.indices[t + k] ?? 0) * 3) as [number, number, number];
    v +=
      (P[a] ?? 0) * ((P[b + 1] ?? 0) * (P[c + 2] ?? 0) - (P[b + 2] ?? 0) * (P[c + 1] ?? 0)) -
      (P[a + 1] ?? 0) * ((P[b] ?? 0) * (P[c + 2] ?? 0) - (P[b + 2] ?? 0) * (P[c] ?? 0)) +
      (P[a + 2] ?? 0) * ((P[b] ?? 0) * (P[c + 1] ?? 0) - (P[b + 1] ?? 0) * (P[c] ?? 0));
  }
  return v / 6;
}
