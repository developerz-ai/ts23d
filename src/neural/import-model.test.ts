// importModel: every refusal names its way out, then a Blender-shaped GLB (LOD nodes, PNG maps,
// a skin) comes back whole: LOD meshes with the file's UVs, one texture set, the same frame as
// importGlb. Skin and clip details: import-skin.test.ts, import-clips.test.ts.
import { describe, expect, test } from 'bun:test';
import { checkTextureSet, encodePng, type Mesh, Ts23dError } from '../core/index.ts';
import { cube } from './fixtures.ts';
import { type GltfJson, readGlb } from './glb-read.ts';
import { packGlb, writeMeshGlb } from './glb-write.ts';
import { riggedGlb } from './import-fixture.ts';
import { importGlb } from './import-glb.ts';
import { importModel } from './import-model.ts';
import { sha256Hex } from './sha256.ts';

const own = { license: 'own', author: 'test' };
const caught = (f: () => unknown): Ts23dError | null => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  return null;
};
const png = (v: number): Uint8Array => encodePng(2, 2, new Uint8Array(16).fill(v));

/** The fixture with its JSON edited (the BIN chunk untouched). */
function edited(
  change: (json: Record<string, GltfJson[]>) => void,
  base = riggedGlb(),
): Uint8Array {
  const doc = readGlb(base);
  const json = structuredClone(doc.json) as Record<string, GltfJson[]>;
  change(json);
  return packGlb(json, doc.bin as Uint8Array);
}

describe('importModel: refusals', () => {
  test('a JPEG texture → T3D_IMPORT_UNSUPPORTED naming the PNG export', () => {
    const jpeg = {
      mime: 'image/jpeg',
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70]),
    };
    const e = caught(() => importModel({ bytes: riggedGlb({ albedo: jpeg }), ...own }));
    expect(e?.code).toBe('T3D_IMPORT_UNSUPPORTED');
    expect(e?.message).toContain('image/jpeg');
    expect(e?.fix).toContain('`export` step');
  });
  test('LOD node names that do not all exist → error listing the mesh nodes found', () => {
    const bytes = riggedGlb({ lodNames: ['lod0', 'lod1', 'low'] });
    const e = caught(() => importModel({ bytes, ...own }));
    expect(e?.code).toBe('T3D_IMPORT_UNSUPPORTED');
    expect(e?.message).toContain('found 2 of 3');
    expect(e?.message).toContain("'low'");
    expect(e?.fix).toContain('lodNodes');
    const named = caught(() =>
      importModel({ bytes: riggedGlb({ lodNames: [] }), ...own }, { lodNodes: ['a', 'b', 'c'] }),
    );
    expect(named?.message).toContain("'body'");
  });
  test('a skin on LOD 0 only → refused: the other LODs would get all-zero weights', () => {
    // Strip `skin` from every mesh node that is not under lod0.
    const bytes = edited((json) => {
      const nodes = json['nodes'] ?? [];
      const names = new Map(nodes.map((n, i) => [i, String((n as { name?: string }).name ?? '')]));
      const under = (root: string): Set<number> => {
        const out = new Set<number>();
        const walk = (i: number): void => {
          out.add(i);
          for (const c of ((nodes[i] as { children?: number[] }).children ?? []) as number[])
            walk(c);
        };
        for (const [i, n] of names) if (n === root) walk(i);
        return out;
      };
      const keep = under('lod0');
      nodes.forEach((n, i) => {
        if (!keep.has(i)) delete (n as Record<string, unknown>)['skin'];
      });
    });
    const e = caught(() => importModel({ bytes, ...own }));
    expect(e?.code).toBe('T3D_IMPORT_UNSUPPORTED');
    expect(e?.message).toMatch(/LOD 1, 2 has no skin/);
    expect(e?.fix).toContain('`lods` step');
  });
  test('two different textured materials → error listing them', () => {
    const bytes = writeMeshGlb([
      { name: 'a', mesh: cube(), png: png(10) },
      { name: 'b', mesh: cube(), png: png(200), translation: [2, 0, 0] },
    ]);
    const e = caught(() => importModel({ bytes, ...own }));
    expect(e?.code).toBe('T3D_IMPORT_UNSUPPORTED');
    expect(e?.message).toContain('material_0, material_1');
    expect(e?.fix).toContain('`bake` step');
  });
  test('the licence gate and the size checks are importGlb’s', () => {
    expect(
      caught(() => importModel({ bytes: riggedGlb(), license: 'free', author: 'x' }))?.code,
    ).toBe('T3D_IMPORT_LICENSE');
    expect(caught(() => importModel({ bytes: riggedGlb(), ...own }, { height: -1 }))?.code).toBe(
      'T3D_IMPORT_UNSUPPORTED',
    );
    const empty = edited((j) => {
      j['meshes'] = (j['meshes'] ?? []).map((m) => ({ ...m, primitives: [] }));
    });
    expect(caught(() => importModel({ bytes: empty, ...own }))?.code).toBe('T3D_IMPORT_EMPTY');
  });
  test('a metallicRoughness image without a shared occlusion map is dropped unless asked for', () => {
    const bytes = edited((j) => {
      j['materials'] = (j['materials'] ?? []).map(({ occlusionTexture: _, ...m }) => m);
    });
    const dropped = importModel({ bytes, ...own });
    expect(dropped.textures?.orm).toBeUndefined();
    expect(dropped.textures?.roughness).toBeUndefined();
    expect(dropped.warnings.some((w) => /metallicRoughness image dropped/.test(w))).toBe(true);
    const kept = importModel({ bytes, ...own }, { ormWithoutOcclusion: 'keep' });
    expect(kept.textures?.orm?.length).toBeGreaterThan(0);
  });
});

describe('importModel: a Blender-shaped GLB comes back whole', () => {
  const bytes = riggedGlb();
  const m = importModel({ bytes, ...own });
  test('three LODs by node name, highest detail first, all skinned', () => {
    expect(m.lods.map((l) => l.indices.length / 3)).toEqual([6, 4, 2]);
    expect(m.lods.every((l) => l.joints?.length === (l.positions.length / 3) * 4)).toBe(true);
    expect(m.sha256).toBe(sha256Hex(bytes));
  });
  test('UVs are the file’s (V down, not reprojected) and vertex colour is white', () => {
    const lod0 = m.lods[0] as Mesh;
    expect([...lod0.uvs.subarray(0, 6)]).toEqual([0, 0, 1, 0, 0, Math.fround(1 / 3)]);
    expect(lod0.colors.every((c) => c === 1)).toBe(true);
  });
  test('one texture set: PNG bytes as stored, ORM from the shared occlusion image, credit', () => {
    const t = m.textures;
    expect(t?.name).toBe('wolf_body');
    expect(t && [...t.albedo]).toEqual([...png(200)]);
    expect(t?.normal && t.orm && t.normal.length > 0 && t.orm.length > 0).toBe(true);
    expect(t?.credit).toBe('test — own — inline bytes');
    expect(t?.roughness).toBeUndefined();
    expect(() => t && checkTextureSet('fixture', t)).not.toThrow();
    expect(importModel({ bytes, ...own }, { textureName: 'hide' }).textures?.name).toBe('hide');
  });
  test('grounded and centred like importGlb; `scale` reports the fit', () => {
    const tall = importModel({ bytes, ...own }, { height: 2 });
    const z = [...(tall.lods[0] as Mesh).positions].filter((_, i) => i % 3 === 2);
    expect(Math.min(...z)).toBeCloseTo(0, 6);
    expect(Math.max(...z)).toBeCloseTo(2, 5);
    expect(tall.scale).toBeGreaterThan(1);
  });
  test('memoised by content and options', () => {
    expect(importModel({ bytes, ...own })).toBe(m);
    expect(importModel({ bytes, ...own }, { place: 'centre' })).not.toBe(m);
  });
  test('no LOD nodes → one LOD of the whole scene', () => {
    const one = importModel({ bytes: riggedGlb({ lodNames: [] }), ...own });
    expect(one.lods.length).toBe(1);
    expect(one.armature?.bones.length).toBe(5);
  });
});

describe('importModel: an unskinned textured mesh', () => {
  const bytes = writeMeshGlb([
    { name: 'low', mesh: cube([1, 2, 3]), png: png(90), rotation: [0, 0.6, 0, 0.8] },
  ]);
  const m = importModel({ bytes, ...own }, { height: 1.5 });
  test('same positions and UVs as importGlb without cleaning; no armature, no clips', () => {
    const ref = importGlb(
      { path: 'low.glb', sha256: sha256Hex(bytes), bytes, ...own, url: 'test' },
      { height: 1.5, clean: false },
    );
    const lod = m.lods[0] as Mesh;
    expect(m.lods.length).toBe(1);
    expect([...lod.positions]).toEqual([...ref.mesh.positions]);
    expect([...lod.uvs]).toEqual([...ref.mesh.uvs]);
    expect(m.scale).toBe(ref.scale);
    expect(m.armature).toBeUndefined();
    expect(m.clips).toEqual([]);
    expect(m.boneNames).toEqual({});
  });
  test('its factors come from the material when there is no ORM image', () => {
    expect(m.textures?.name).toBe('material_0');
    expect(m.textures?.roughness).toBeCloseTo(0.6, 6);
    expect(m.textures?.metallic).toBe(0);
  });
  test('bit-identical vertices are welded, seams are not', () => {
    const twice = writeMeshGlb([
      { name: 'a', mesh: cube(), png: png(90) },
      { name: 'b', mesh: cube(), png: png(90) },
    ]);
    const w = importModel({ bytes: twice, ...own });
    expect((w.lods[0] as Mesh).positions.length / 3).toBe(24);
    expect((w.lods[0] as Mesh).indices.length / 3).toBe(24);
  });
});
