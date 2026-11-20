// The skin of an imported model: too many influences are cut with a warning, a corrupt skin is one
// T3D_IMPORT_GLB, and the armature is valid ts23d (snake_case names, parents first, real tails).
import { describe, expect, test } from 'bun:test';
import { type Armature, checkSkeleton, dmath, type Mesh, Ts23dError } from '../core/index.ts';
import { type GltfJson, readGlb } from './glb-read.ts';
import { packGlb } from './glb-write.ts';
import { riggedGlb } from './import-fixture.ts';
import { importModel } from './import-model.ts';

const own = { license: 'own', author: 'test' };
const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? e.code : `not a Ts23dError: ${String(e)}`;
  }
  return 'no error';
};

/** Influences of vertex `v` as bone name → weight. */
const byName = (m: Mesh, sk: Armature, v: number): Record<string, number> => {
  const out: Record<string, number> = {};
  for (let s = 0; s < 4; s++) {
    const w = m.weights?.[v * 4 + s] ?? 0;
    const name = sk.bones[m.joints?.[v * 4 + s] ?? -1]?.name ?? '?';
    if (w > 0) out[name] = (out[name] ?? 0) + w;
  }
  return out;
};

describe('importModel skin: failure cases', () => {
  test('five influences: the four heaviest stay, renormalised, with a warning', () => {
    const m = importModel({ bytes: riggedGlb({ fiveInfluences: true }), ...own });
    expect(m.warnings.some((w) => /1 vertices had more than 4 bone influences/.test(w))).toBe(true);
    const got = byName(m.lods[0] as Mesh, m.armature as Armature, 0);
    // File: hip 0.4, spine 0.2, tail 0.2, arm_l 0.1, arm_r 0.1 → the tie drops the later joint.
    expect(Object.keys(got).sort()).toEqual(['arm_l', 'hip_root', 'spine_upper', 'tail']);
    expect(got['hip_root']).toBeCloseTo(0.4 / 0.9, 6);
    expect(Object.values(got).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  test('a weight on a joint the skin does not have is a corrupt file', () => {
    const doc = readGlb(riggedGlb());
    const json = structuredClone(doc.json) as { skins: GltfJson[] };
    (json.skins[0] as GltfJson)['joints'] = [2, 3];
    const bytes = packGlb(json, doc.bin as Uint8Array);
    expect(code(() => importModel({ bytes, ...own }))).toBe('T3D_IMPORT_GLB');
  });
  test('an unskinned mesh beside a skinned one is refused with the way out', () => {
    const doc = readGlb(riggedGlb({ lodNames: [] }));
    const json = structuredClone(doc.json) as { nodes: GltfJson[] };
    json.nodes.push({ name: 'loose', mesh: 0 });
    (json.nodes[0] as GltfJson)['children'] = [1, json.nodes.length - 1];
    const bytes = packGlb(json, doc.bin as Uint8Array);
    expect(code(() => importModel({ bytes, ...own }))).toBe('T3D_IMPORT_UNSUPPORTED');
  });
});

describe('importModel skin: armature and weights', () => {
  const m = importModel({ bytes: riggedGlb(), ...own }, { place: 'origin' });
  const sk = m.armature as Armature;
  test('bones are snake_case, parents first, and the name map is returned', () => {
    expect(() => checkSkeleton('fixture', sk)).not.toThrow();
    expect(sk.bones.map((b) => `${b.name}<${b.parent ?? ''}`)).toEqual([
      'hip_root<',
      'spine_upper<hip_root',
      'arm_l<spine_upper',
      'arm_r<spine_upper',
      'tail<hip_root',
    ]);
    expect(m.boneNames).toEqual({
      'Hip.Root': 'hip_root',
      SpineUpper: 'spine_upper',
      'Arm.L': 'arm_l',
      'Arm.R': 'arm_r',
      Tail: 'tail',
    });
  });
  test('an unweighted leaf joint is dropped and named in a warning', () => {
    expect(m.warnings.some((w) => /1 unweighted joints dropped \(Head End\)/.test(w))).toBe(true);
  });
  test('heads are the joints rest positions in the asset frame (armature turn and scale baked)', () => {
    // Hip.Root: Armature (t [0.2, 0, -0.1], turn 0.4 about Y, ×0.5) · [0, 1, 0] = [0.2, 0.5, -0.1]
    // in glTF axes → asset (z, x, y).
    const hip = sk.bones[0]?.head ?? [0, 0, 0];
    expect(hip[0]).toBeCloseTo(-0.1, 6);
    expect(hip[1]).toBeCloseTo(0.2, 6);
    expect(hip[2]).toBeCloseTo(0.5, 6);
  });
  test('a leaf bone points into the flesh it moves; a joint with one usable child at that child', () => {
    const lod0 = m.lods[0] as Mesh;
    const arm = sk.bones.find((b) => b.name === 'arm_l');
    const v6 = [0, 1, 2].map((k) => lod0.positions[6 * 3 + k] ?? 0);
    const along = [0, 1, 2].map((k) => (arm?.tail[k] ?? 0) - (arm?.head[k] ?? 0));
    const toFlesh = v6.map((x, k) => x - (arm?.head[k] ?? 0));
    const cos =
      along.reduce((t, x, k) => t + x * (toFlesh[k] ?? 0), 0) /
      (dmath.norm(along) * dmath.norm(toFlesh));
    expect(cos).toBeGreaterThan(0.7);
    for (const b of sk.bones)
      expect(dmath.norm(b.tail.map((x, k) => x - (b.head[k] ?? 0)))).toBeGreaterThan(1e-3);
  });
  test('weights survive by bone name and sum to 1 on every LOD', () => {
    const lod0 = m.lods[0] as Mesh;
    expect(byName(lod0, sk, 3)).toEqual({ spine_upper: 1 });
    expect(byName(lod0, sk, 0)).toEqual({
      hip_root: 0.5,
      spine_upper: 0.25,
      arm_l: 0.125,
      arm_r: 0.125,
    });
    for (const lod of m.lods)
      for (let v = 0; v < lod.positions.length / 3; v++)
        expect(Object.values(byName(lod, sk, v)).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});
