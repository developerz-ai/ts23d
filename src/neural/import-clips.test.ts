// Clips of an imported model: what is ignored says so, and a posed vertex lands where a direct
// glTF evaluation of the file puts it. The ts23d side poses with the QA / exporter convention
// (src/qa/clip-pose.ts `jointWorlds` + src/passes/skin-bind.ts `skinPositions`, restated here
// because /neural may not import its own tier or above): rest has no rotation, a rotation key is
// local and relative to rest, a translation key offsets the rest position in the parent frame.
import { describe, expect, test } from 'bun:test';
import {
  type Armature,
  type Clip,
  checkClip,
  type Mesh,
  type Quat,
  quatRotate,
  type Vec3,
} from '../core/index.ts';
import { at, type GltfJson, indices, list, readAccessor, readGlb } from './glb-read.ts';
import { localMatrix, type M4, mul } from './glb-scene.ts';
import { packGlb } from './glb-write.ts';
import { endsMeet, keys } from './import-clips.ts';
import { riggedGlb } from './import-fixture.ts';
import { type ImportModelOptions, importModel } from './import-model.ts';

const own = { license: 'own', author: 'test' };
const bytes = riggedGlb();

/** World positions of mesh 0's vertices with animation `anim` held at key `key` (−1: rest). */
function gltfPosed(file: Uint8Array, anim: number, key: number): Float32Array {
  const doc = readGlb(file);
  const nodes = list(doc.json, 'nodes').map((n) => ({ ...n }));
  if (key >= 0) {
    const a = at(doc, 'animations', anim);
    for (const ch of list(a, 'channels')) {
      const target = ch['target'] as GltfJson;
      const out = readAccessor(doc, Number(list(a, 'samplers')[Number(ch['sampler'])]?.['output']));
      const node = nodes[Number(target['node'])] as GltfJson;
      node[String(target['path'])] = [...out.data.subarray(key * out.width, (key + 1) * out.width)];
    }
  }
  const world = new Map<number, M4>();
  const walk = (i: number, above: M4 | undefined): void => {
    const local = localMatrix(nodes[i] as GltfJson);
    const w = above ? mul(above, local) : local;
    world.set(i, w);
    for (const c of indices(nodes[i] as GltfJson, 'children')) walk(c, w);
  };
  for (const r of indices(at(doc, 'scenes', 0), 'nodes')) walk(r, undefined);
  const skin = at(doc, 'skins', 0);
  const ibm = readAccessor(doc, Number(skin['inverseBindMatrices'])).data;
  const mats = indices(skin, 'joints').map((j, i) =>
    mul(world.get(j) as M4, Float64Array.from(ibm.subarray(i * 16, i * 16 + 16))),
  );
  const attrs = list(at(doc, 'meshes', 0), 'primitives')[0]?.['attributes'] as Record<
    string,
    number
  >;
  const [p, js, ws] = ['POSITION', 'JOINTS_0', 'WEIGHTS_0'].map(
    (k) => readAccessor(doc, Number(attrs[k])).data,
  ) as [Float32Array, Float32Array, Float32Array];
  const out = new Float32Array(p.length);
  for (let v = 0; v < p.length / 3; v++)
    for (let s = 0; s < 4; s++) {
      const m = mats[js[v * 4 + s] ?? 0] as M4;
      const w = ws[v * 4 + s] ?? 0;
      for (let r = 0; r < 3; r++)
        out[v * 3 + r] =
          (out[v * 3 + r] ?? 0) +
          w *
            ((m[r] ?? 0) * (p[v * 3] ?? 0) +
              (m[4 + r] ?? 0) * (p[v * 3 + 1] ?? 0) +
              (m[8 + r] ?? 0) * (p[v * 3 + 2] ?? 0) +
              (m[12 + r] ?? 0));
    }
  return out;
}

const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

/** The mesh under clip key `key` (undefined clip: rest), by the ts23d convention. */
function ts23dPosed(mesh: Mesh, sk: Armature, clip: Clip | undefined, key: number): Float32Array {
  const keyOf = (bone: string, path: string, n: number): number[] | undefined => {
    const t = clip?.tracks.find((x) => 'bone' in x && x.bone === bone && x.path === path);
    return t ? [...t.values.subarray(key * n, key * n + n)] : undefined;
  };
  const world = new Map<string, { head: Vec3; rot: Quat }>();
  const rest = new Map(sk.bones.map((b) => [b.name, b.head]));
  for (const b of sk.bones) {
    const r = (keyOf(b.name, 'rotation', 4) ?? [0, 0, 0, 1]) as unknown as Quat;
    const d = keyOf(b.name, 'translation', 3) ?? [0, 0, 0];
    const p = b.parent === undefined ? undefined : world.get(b.parent);
    const ph = (b.parent === undefined ? undefined : rest.get(b.parent)) ?? [0, 0, 0];
    const local: Vec3 = [
      b.head[0] - ph[0] + (d[0] ?? 0),
      b.head[1] - ph[1] + (d[1] ?? 0),
      b.head[2] - ph[2] + (d[2] ?? 0),
    ];
    const o = p ? quatRotate(p.rot, local) : local;
    world.set(b.name, {
      head: p ? [p.head[0] + o[0], p.head[1] + o[1], p.head[2] + o[2]] : local,
      rot: p ? qmul(p.rot, r) : r,
    });
  }
  const out = new Float32Array(mesh.positions.length);
  for (let v = 0; v < out.length / 3; v++)
    for (let s = 0; s < 4; s++) {
      const b = sk.bones[mesh.joints?.[v * 4 + s] ?? 0];
      const w = mesh.weights?.[v * 4 + s] ?? 0;
      const j = b ? world.get(b.name) : undefined;
      if (!b || !j || w === 0) continue;
      const q = quatRotate(
        j.rot,
        [0, 1, 2].map(
          (k) => (mesh.positions[v * 3 + k] ?? 0) - (b.head[k] ?? 0),
        ) as unknown as Vec3,
      );
      for (let k = 0; k < 3; k++)
        out[v * 3 + k] = (out[v * 3 + k] ?? 0) + w * ((j.head[k] ?? 0) + (q[k] ?? 0));
    }
  return out;
}

/** Largest distance between ts23d's pose and the file's, the file mapped by the import frame. */
function poseError(
  o: ImportModelOptions,
  clipName: string,
  anim: number,
  key: number,
  ownKey = key,
): number {
  const m = importModel({ bytes, ...own }, o);
  const lod0 = m.lods[0] as Mesh;
  const sk = m.armature as Armature;
  // glTF world (x, y, z) → asset (z, x, y) × scale + offset; the offset read off rest vertex 0.
  const restFile = gltfPosed(bytes, 0, -1);
  const toAsset = (p: Float32Array, v: number): number[] => [
    (p[v * 3 + 2] ?? 0) * m.scale,
    (p[v * 3] ?? 0) * m.scale,
    (p[v * 3 + 1] ?? 0) * m.scale,
  ];
  const offset = toAsset(restFile, 0).map((x, k) => (lod0.positions[k] ?? 0) - x);
  const want = key < 0 ? restFile : gltfPosed(bytes, anim, key);
  const got = ts23dPosed(
    lod0,
    sk,
    key < 0 ? undefined : m.clips.find((c) => c.name === clipName),
    Math.max(ownKey, 0),
  );
  let worst = 0;
  for (let v = 0; v < 8; v++) {
    const w = toAsset(want, v).map((x, k) => x + (offset[k] ?? 0));
    worst = Math.max(worst, Math.hypot(...w.map((x, k) => x - (got[v * 3 + k] ?? 0))));
  }
  return worst;
}

describe('importClips: what cannot be carried is reported', () => {
  const m = importModel({ bytes, ...own });
  test('a channel on a non-joint node is ignored with a warning', () => {
    expect(m.warnings.some((w) => /Walk Cycle.*non-joint.*Armature/.test(w))).toBe(true);
    expect(m.clips.flatMap((c) => c.tracks).every((t) => 'bone' in t)).toBe(true);
  });
  test("'run' is reserved: the clip is renamed, and says so", () => {
    expect(m.clips.map((c) => c.name)).toEqual(['walk_cycle', 'run_anim']);
    expect(m.warnings).toContain("clip 'run' imported as 'run_anim'");
  });
  test('a clip that moves no bone is dropped with a warning', () => {
    const doc = readGlb(bytes);
    const json = structuredClone(doc.json) as { animations: { channels: GltfJson[] }[] };
    for (const a of json.animations)
      a.channels = a.channels.filter((c) => (c['target'] as GltfJson)['node'] === 1);
    const none = importModel({ bytes: packGlb(json, doc.bin as Uint8Array), ...own });
    expect(none.clips).toEqual([]);
    expect(none.warnings.some((w) => /moves no bone/.test(w))).toBe(true);
  });
});

describe('importClips: keys against the ts23d rest pose', () => {
  const m = importModel({ bytes, ...own });
  const walk = m.clips[0] as Clip;
  test('times start at 0, rest-valued and dropped-joint tracks are gone, the clip is valid', () => {
    expect(walk.seconds).toBe(1);
    expect(walk.loop).toBe(true);
    expect(walk.tracks.map((t) => ('bone' in t ? `${t.bone}:${t.path}` : ''))).toEqual([
      'spine_upper:rotation',
      'hip_root:translation',
    ]);
    expect([...(walk.tracks[0]?.times ?? [])]).toEqual([0, 0.5, 1]);
    for (const c of m.clips) expect(() => checkClip('fixture', c)).not.toThrow();
  });
  test('a key equal to the rest rotation is the identity', () => {
    const v = walk.tracks[0]?.values as Float32Array;
    for (const k of [0, 8]) {
      expect(Math.hypot(v[k] ?? 1, v[k + 1] ?? 1, v[k + 2] ?? 1)).toBeLessThan(1e-6);
      expect(v[k + 3]).toBeCloseTo(1, 6);
    }
    expect(Math.hypot(v[4] ?? 0, v[5] ?? 0, v[6] ?? 0)).toBeGreaterThan(0.1);
  });
  test('a STEP hold far from 0 stays strictly between its neighbours (float32 cannot subtract 1e-4 at 4096 s)', () => {
    const k = keys(Float32Array.of(0, 4096), Float32Array.of(1, 2), 1, 0, true);
    expect([...k.times].every((t, i, a) => i === 0 || t > (a[i - 1] ?? 0))).toBe(true);
    expect([k.times.length, (k.times[1] ?? 0) < 4096, [...k.values]]).toEqual([3, true, [1, 1, 2]]);
  });
  test('a full turn ends on −q and still closes; a half turn does not', () => {
    const turn = (end: readonly number[]) => ({
      path: 'rotation',
      times: Float32Array.of(0, 1),
      values: Float32Array.of(0, 0, 0, 1, ...end),
    });
    expect(endsMeet(turn([0, 0, 0, -1]))).toBe(true);
    expect(endsMeet(turn([0, 0, 1, 0]))).toBe(false);
    expect(endsMeet({ ...turn([0, 0, 0, -1]), path: 'translation' })).toBe(false);
  });
  test('STEP keys hold their value until the next key', () => {
    const t = m.clips[1]?.tracks[0];
    expect(t?.times.length).toBe(5);
    expect([...(t?.values.subarray(0, 4) ?? [])]).toEqual([...(t?.values.subarray(4, 8) ?? [1])]);
    expect(t?.times[1]).toBeCloseTo(0.4999, 5);
  });
  test('the posed mesh matches a direct glTF evaluation of the file', () => {
    expect(poseError({ place: 'origin' }, 'walk_cycle', 0, -1)).toBeLessThan(1e-5);
    // The check can fail: the clip really moves the mesh away from rest.
    const moved = gltfPosed(bytes, 0, 1).some(
      (x, i) => Math.abs(x - (gltfPosed(bytes, 0, -1)[i] ?? 0)) > 0.05,
    );
    expect(moved).toBe(true);
    expect(poseError({ place: 'origin' }, 'walk_cycle', 0, 1)).toBeLessThan(1e-5);
    // STEP adds a hold key before each change: the file's key 1 is the import's key 2.
    expect(poseError({ place: 'origin' }, 'run_anim', 1, 1, 2)).toBeLessThan(1e-5);
  });
  test('…and still does after a fit and a placement', () => {
    expect(poseError({ height: 3 }, 'walk_cycle', 0, 1)).toBeLessThan(3e-5);
    expect(poseError({ scale: 0.01, place: 'centre' }, 'walk_cycle', 0, 1)).toBeLessThan(1e-6);
  });
});
