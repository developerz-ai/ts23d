import { describe, expect, it } from 'bun:test';
import { type Bone, compile, type Mesh, type Quat, type Vec3 } from '../core/index.ts';
import { inverseBind, poseJoints, skinPositions } from '../passes/index.ts';
import { deformFindings, romPoses } from '../qa/index.ts';
import { creaturePlan } from './creature.ts';
import { defineModelCreature } from './model-creature.ts';
import { type ExtraChain, extraBones, resolveExtra } from './model-extra.ts';
import { extraClips, strokeWave } from './model-extra-clips.ts';
import { capsuleCreature, FIXTURE_WOLF, fixtureModel, withLimb } from './model-fixtures.ts';
import { modelRig } from './model-rig.ts';

const { bones: plan } = creaturePlan(FIXTURE_WOLF);
const flesh = capsuleCreature(plan);
const bare = modelRig(flesh, FIXTURE_WOLF);
const back = bare.at('spine_2');
/** A spar standing off the back on each side: root in the trunk, tip up and out. */
const spar = (side: 1 | -1): [Vec3, Vec3, Vec3] => {
  const root: Vec3 = [back[0], back[1] + side * 0.03, back[2] + 0.02];
  const tip: Vec3 = [root[0] - 0.08, root[1] + side * 0.36, root[2] + 0.4];
  const mid: Vec3 = [(root[0] + tip[0]) / 2, (root[1] + tip[1]) / 2, (root[2] + tip[2]) / 2];
  return [root, mid, tip];
};
// Two tubes a side, so the joint in the middle has a ring of vertices to bend at.
const winged: Mesh = ([1, -1] as const).reduce((m, side) => {
  const [root, mid, tip] = spar(side);
  return withLimb(withLimb(m, root, mid, 0.035), mid, tip, 0.035);
}, flesh);
const wing = (side: 1 | -1, more: Partial<ExtraChain> = {}): ExtraChain => ({
  name: side > 0 ? 'wing_l' : 'wing_r',
  parent: 'spine_2',
  joints: spar(side),
  limits: [
    { axis: [side, 0, 0], min: -40, max: 20 },
    { axis: [side, 0, 0], min: -25, max: 25 },
  ],
  source: 'design value: a fixture',
  motion: {
    clip: 'flap',
    hz: 1.25,
    stroke: [
      [20, -40],
      [10, -25],
    ],
    idle: [2, 3],
    carry: [1.5, 2.5],
    source: 'design value: a fixture',
  },
  ...more,
});
const WINGS = [wing(1), wing(-1)];
const budget = { triangles: [150000, 40000, 8000], textureSets: { count: 1, size: 1024 } } as const;
const fit = { mesh: flesh, fitted: bare.fitted, height: bare.height, prefix: '' };

/** A clip's bone rotations at key `k`. */
function keyOf(
  tracks: readonly { bone?: string; path: string; values: Float32Array }[],
  k: number,
): Map<string, Quat> {
  const out = new Map<string, Quat>();
  for (const t of tracks)
    if (t.bone && t.path === 'rotation')
      out.set(t.bone, [...t.values.subarray(k * 4, k * 4 + 4)] as unknown as Quat);
  return out;
}

describe('extra chains: declaration', () => {
  it('refuses a chain with no source, the wrong limit count, an unknown parent or a taken name', () => {
    expect(() => resolveExtra([wing(1, { source: ' ' })], fit)).toThrow(
      /T3D_RECIPE_INVALID.*source/,
    );
    expect(() => resolveExtra([wing(1, { limits: [] })], fit)).toThrow(/3 joints and 0 limits/);
    expect(() => resolveExtra([wing(1), wing(1)], fit)).toThrow(/T3D_RECIPE_INVALID.*unique/);
    expect(() => extraBones([wing(1, { parent: 'keel' })], bare.fitted, '')).toThrow(
      /no bone 'keel' to hang from/,
    );
    expect(() => extraBones([wing(1, { name: 'tail' })], bare.fitted, '')).toThrow(
      /already has a bone 'tail_0'/,
    );
  });

  it('refuses a stroke outside the joint limit', () => {
    const m = wing(1).motion;
    if (!m) throw new Error('fixture');
    const wide = wing(1, {
      motion: {
        ...m,
        stroke: [
          [20, -70],
          [10, -25],
        ],
      },
    });
    expect(() => resolveExtra([wide], fit)).toThrow(/outside its limit -40..20/);
  });

  it('a function finds the chains on the fit', () => {
    const got = resolveExtra((f) => (f.fitted === bare.fitted ? WINGS : []), fit);
    expect(got.map((c) => c.name)).toEqual(['wing_l', 'wing_r']);
  });
});

describe('extra chains: rig and clips', () => {
  const rig = modelRig(winged, FIXTURE_WOLF, { extra: WINGS });
  const names = ['wing_l_0', 'wing_l_1', 'wing_r_0', 'wing_r_1'];

  it('appends the bones after the plan’s, with the declared limits, parents first', () => {
    expect(bare.bones.some((b) => b.name.startsWith('wing'))).toBe(false);
    expect(rig.fitted.slice(-4).map((b) => b.name)).toEqual(names);
    const by = new Map(rig.bones.map((b) => [b.name, b]));
    expect(by.get('wing_l_0')?.parent).toBe('spine_2');
    expect(by.get('wing_l_1')?.parent).toBe('wing_l_0');
    expect(by.get('wing_r_0')?.limit).toEqual({ axis: [-1, 0, 0], min: -40, max: 20 });
    expect(rig.at('wing_l_1')).toEqual(spar(1)[1]);
    // Helpers stay last.
    const firstMid = rig.bones.findIndex((b) => b.name.endsWith('_mid'));
    expect(rig.bones.findIndex((b) => b.name === 'wing_r_1')).toBeLessThan(firstMid);
  });

  it('a clip without the chains keys no wing bone; with them flap, idle and walk do', () => {
    const keyed = (r: typeof rig, clip: string): string[] =>
      (r.clips.find((c) => c.name === clip)?.tracks ?? []).flatMap((t) =>
        'bone' in t && t.bone.startsWith('wing') ? [t.bone] : [],
      );
    expect(bare.clips.map((c) => c.name)).not.toContain('flap');
    expect(keyed(bare, 'idle')).toEqual([]);
    expect(keyed(rig, 'flap')).toEqual(names);
    expect(keyed(rig, 'idle')).toEqual(names);
    expect(keyed(rig, 'walk')).toEqual(names);
    expect(keyed(rig, 'look')).toEqual([]);
    const flap = rig.clips.find((c) => c.name === 'flap');
    expect(flap?.seconds).toBeCloseTo(0.8, 9);
    expect(flap?.loop).toBe(true);
    // Only the wings move in flap: the body stands.
    expect(flap?.tracks.length).toBe(4);
  });

  it('flap swings each bone between the ends of its stroke, the tip trailing the root', () => {
    const flap = rig.clips.find((c) => c.name === 'flap');
    const angle = (bone: string): number[] => {
      const t = flap?.tracks.find((x) => 'bone' in x && x.bone === bone);
      if (!t) throw new Error(`no track for ${bone}`);
      // About +x for the left wing: the signed angle is 2·atan2(x, w).
      return Array.from(
        { length: t.times.length },
        (_, k) => (2 * Math.atan2(t.values[k * 4] ?? 0, t.values[k * 4 + 3] ?? 1) * 180) / Math.PI,
      );
    };
    const [root, tip] = [angle('wing_l_0'), angle('wing_l_1')];
    expect(Math.max(...root)).toBeCloseTo(20, 1);
    expect(Math.min(...root)).toBeCloseTo(-40, 0);
    expect(Math.min(...tip)).toBeCloseTo(-25, 0);
    expect(root[0]).toBeCloseTo(root[root.length - 1] ?? Number.NaN, 5);
    expect(tip.indexOf(Math.min(...tip))).toBeGreaterThan(root.indexOf(Math.min(...root)));
    expect(strokeWave(0)).toBe(0);
    expect(strokeWave(0.3, 0.3)).toBeCloseTo(1, 12);
  });

  it('refuses a motion clip named like a creature clip, and two hz in one clip', () => {
    const m = wing(1).motion;
    if (!m) throw new Error('fixture');
    const bones: Bone[] = [...rig.bones];
    expect(() =>
      extraClips(bones, [wing(1, { motion: { ...m, clip: 'idle' } })], bare.clips),
    ).toThrow(/T3D_RECIPE_INVALID.*already has a clip/);
    expect(() =>
      extraClips(bones, [wing(1), wing(-1, { motion: { ...m, hz: 2 } })], bare.clips),
    ).toThrow(/different hz/);
  });
});

describe('extra chains: the skin', () => {
  const asset = (name: string, extra?: readonly ExtraChain[]) =>
    defineModelCreature({
      name,
      spec: FIXTURE_WOLF,
      budget,
      model: () => fixtureModel(winged),
      ...(extra ? { body: { extra } } : {}),
    });

  it('one pass: the spar follows its own bones, and the tip moves in flap', () => {
    const plain = compile(asset('extra_none'), { lod: 2 });
    expect(plain.skeleton?.bones.some((b) => b.name.startsWith('wing'))).toBe(false);
    const c = compile(asset('extra_wings', WINGS), { lod: 2 });
    const sk = c.skeleton;
    const mesh = c.parts.find((p) => p.textures)?.mesh;
    if (!sk || !mesh?.joints || !mesh.weights) throw new Error('no skinned body');
    const tipBone = sk.bones.findIndex((b) => b.name === 'wing_l_1');
    const tip = spar(1)[2];
    // The vertex nearest the left tip.
    let [v, d] = [0, Infinity];
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      const e = Math.hypot(
        (mesh.positions[i * 3] ?? 0) - tip[0],
        (mesh.positions[i * 3 + 1] ?? 0) - tip[1],
        (mesh.positions[i * 3 + 2] ?? 0) - tip[2],
      );
      if (e < d) [v, d] = [i, e];
    }
    const share = [0, 1, 2, 3].reduce(
      (s, k) => s + (mesh.joints?.[v * 4 + k] === tipBone ? (mesh.weights?.[v * 4 + k] ?? 0) : 0),
      0,
    );
    expect(share).toBeGreaterThan(0.6);
    const flap = c.clips?.find((x) => x.name === 'flap');
    if (!flap) throw new Error('no flap clip');
    const ibm = inverseBind(sk);
    let reach = 0;
    for (let k = 0; k < (flap.tracks[0]?.times.length ?? 0); k++) {
      const P = skinPositions(mesh, poseJoints(sk, keyOf(flap.tracks, k)), ibm);
      reach = Math.max(
        reach,
        Math.hypot(
          (P[v * 3] ?? 0) - (mesh.positions[v * 3] ?? 0),
          (P[v * 3 + 1] ?? 0) - (mesh.positions[v * 3 + 1] ?? 0),
          (P[v * 3 + 2] ?? 0) - (mesh.positions[v * 3 + 2] ?? 0),
        ),
      );
    }
    // 0.54 m of spar swung 40° down and the outer half 25° more: over 0.3 m at the tip.
    expect(reach).toBeGreaterThan(0.3);
  }, 60_000);

  it('QA deform poses the skin at the extra joints’ limits, and fails one set too wide', () => {
    const c = compile(asset('extra_deform', WINGS), { lod: 2 });
    const labels = romPoses(c.skeleton ?? { bones: [] }).map((p) => p.label);
    for (const l of ['wing_l_0 -40°', 'wing_l_0 +20°', 'wing_r_1 -25°', 'wing_r_1 +25°'])
      expect(labels).toContain(l);
    const wingFindings = (a: typeof c): string[] =>
      deformFindings(a)
        .filter((f) => /at wing_/.test(f.message))
        .map((f) => f.code);
    expect(wingFindings(c)).toEqual([]);
    // The same skin with the root limit at 170°: the spar is folded through the trunk.
    const wide = WINGS.map((w) => ({
      ...w,
      limits: [
        { ...(w.limits[0] ?? { axis: [1, 0, 0] as Vec3 }), min: -170, max: 20 },
        w.limits[1],
      ],
    })) as ExtraChain[];
    expect(
      wingFindings(compile(asset('extra_deform_wide', wide), { lod: 2 })).length,
    ).toBeGreaterThan(0);
  }, 60_000);

  it('two passes: a Blender skin on the declared bones is used; an undeclared bone is refused', () => {
    const rig = modelRig(winged, FIXTURE_WOLF, { extra: WINGS });
    const real = rig.bones.filter((b) => !b.name.endsWith('_mid'));
    const n = winged.positions.length / 3;
    const weights = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) weights[v * 4] = 1;
    // Everything on the import's bone 0, which is the rig's last real bone: wing_r_1.
    const bound: Mesh = { ...rig.mesh, joints: new Uint16Array(n * 4), weights };
    const model = { ...fixtureModel(bound), armature: { bones: [...real].reverse() } };
    const make = (name: string, r: typeof rig) =>
      defineModelCreature({ name, spec: FIXTURE_WOLF, budget, model: () => ({ model, rig: r }) });
    const c = compile(make('extra_own_skin', rig), { lod: 2 });
    const part = c.parts.find((p) => p.textures);
    expect(c.skeleton?.bones[part?.mesh?.joints?.[0] ?? -1]?.name).toBe('wing_r_1');
    expect(c.clips?.map((x) => x.name)).toContain('flap');
    // The same skin on a rig that declares no wings: its wing bones are unknown.
    const plain = modelRig(winged, FIXTURE_WOLF);
    expect(() => compile(make('extra_undeclared', plain), { lod: 2 })).toThrow(
      /T3D_MODEL_SKELETON.*4 bone\(s\) the fitted rig lacks: wing_r_1, wing_r_0, wing_l_1, wing_l_0/,
    );
  });
});
