// The bear's Blender program (task `blender`, examples/blender/README.md), built from the fit: it
// runs after `transform(fit)`, so every coordinate here is in the asset frame at real size, and
// the spheres, capsules and bones come from the rig TS fitted on the committed proxy (kinds
// `modelRig`). Every number is in the cache key. Each step and what it is for:
//   clean    weld the generator's duplicate vertices, drop its loose shells
//   script   EARS: the generator drew cub's ears; both are scaled to 85 % about their roots, on
//            the source, so the bake and the shell carry it
//   unweb    the stub tail lies on the hind legs: cut the bridges, 2 cm apart
//   script   TUFTS: locks of coat raised out of the outline on the hump, the back, the throat,
//            the belly's fringe, the rump and the backs of the upper legs (never on the flanks:
//            the width holds)
//   retopo   closed voxel shell → 28.8 k triangles (the claws are code, claws.ts), three times the density on the head and round
//            the hips (edge loops where the haunch bends), twice on the paws
//   uv, bake fresh UVs; the model's colour, relief and AO baked from the 890 k source
//   bind     bone heat on the fitted skeleton (the pose the generator made)
//   isolate  the tail's skin takes only the tail's bones and the rump none of them
//   weights  the paw bone's weights smoothed round each wrist: the plantigrade walk folds it 84°
//   repose   pose the bound mesh to the straight, symmetric rest (nothing is mirrored)
//   script   PAINT (wear.ts): the generator's light out of the albedo, ear caps and bake holes
//            repainted, the coat's locks in the normal map, a roughness map, mud, scars and
//            rubbed coat, in the reposed rest
//   lods     9.5 k and 5 k triangles from the 28.8 k (same UVs, maps and weights)
//   export   one GLB: three LODs, albedo 2048², normal and ORM 1024², one skin

import type { BlenderStep, ModelRig, Vec3 } from '@developerz.ai/ts23d';
import { py, reliefStep, type TuftRegion, tuftStep } from '../_lib/creature/texture-paint.ts';
import { bearPaint } from './wear.ts';

/** The asset's budget (bear_hybrid.ts): the playbook's model-tier band. */
export const BUDGET = [30000, 10000, 5000] as const;

/** LOD triangles asked of Blender for the body: the budget less the code-built claws (claws.ts:
 *  about 1 100 triangles at LOD 0, 400 at LOD 1, none at LOD 2). LOD 2 keeps 5 000, as the
 *  wolf's: coarser, the haunch's triangles stretch past ×4 at the hip's limits (QA `deform`), so
 *  the critique's "3 k at LOD 2" is not taken. */
export const TRIANGLES = [28800, 9500, 5000] as const;

/** Ear scale. A brown bear's ear is 9–12 cm on a 35–40 cm head; the generator's stood 14 cm
 *  above the crown, a cub's proportion (critique 2026-11-19: "~15 % too large"). */
const EAR_SCALE = 0.85;

/** Both ears scaled about their roots, on the source (Blender frame inside; asset frame in the
 *  comments). An ear is found, not placed: the highest point over the head, then the highest one
 *  at least 0.12 h away from it. */
const ears = (head: readonly number[], h: number): BlenderStep => ({
  op: 'script',
  why: `the generator's ears are a cub's: scaled to ${EAR_SCALE * 100} % about their roots (bear_hybrid critique: ears ~15 % too large)`,
  python: `
me = obj.data
co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
co = co.reshape(-1, 3).astype(np.float64)
X, Y, Z = -co[:, 1], co[:, 0], co[:, 2]
h = ${h}
hx, hy, hz = ${py(head)}
near = (np.hypot(X - hx, Y - hy) < 0.3 * h) & (Z > hz)
tips = []
for _ in range(2):
    free = near.copy()
    for t in tips:
        free &= np.hypot(X - t[0], Y - t[1]) > 0.12 * h
    k = int(np.argmax(np.where(free, Z, -1e9)))
    tips.append((X[k], Y[k], Z[k]))
for tx, ty, tz in tips:
    d = np.sqrt((X - tx) ** 2 + (Y - ty) ** 2 + (Z - (tz - 0.045 * h)) ** 2)
    t = np.clip((d - 0.06 * h) / (0.045 * h), 0, 1)
    w = 1 - t * t * (3 - 2 * t)
    s = 1 - ${(1 - EAR_SCALE).toFixed(3)} * w
    root = np.array([tx, ty, tz - 0.09 * h])
    X, Y, Z = root[0] + (X - root[0]) * s, root[1] + (Y - root[1]) * s, root[2] + (Z - root[2]) * s
    print('ear tip', round(tx, 4), round(ty, 4), round(tz, 4), 'vertices', int((w > 0).sum()))
co[:, 0], co[:, 1], co[:, 2] = Y, -X, Z
me.vertices.foreach_set('co', co.astype(np.float32).ravel())
me.update()
`,
});

/** Gap `unweb` leaves between the tail and the hind legs, metres: over 1.5 voxels of the shell
 *  (5.5 mm), so the remesh cannot fuse them again. */
const GAP = 0.02;

/** Locks of coat on the outline, in the source's pose: lock height as a share of the shoulder
 *  height per region. A brown bear's guard hair is 8–12 cm on the hump and the belly. */
const tufts = (rig: ModelRig): BlenderStep => {
  const h = rig.height;
  const bones = new Map(rig.fitted.map((b) => [b.name, b]));
  const span = (from: string, to: string): [Vec3, Vec3] | null => {
    const [a, b] = [bones.get(from), bones.get(to)];
    return a && b ? [a.head, b.tail] : null;
  };
  const skull = bones.get('head');
  const stub = bones.get('tail_1');
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const region = (
    s: [Vec3, Vec3] | null,
    r: number,
    amp: number,
    face: TuftRegion['face'],
  ): TuftRegion[] => (s ? [{ a: s[0], b: s[1], r: r * h, amp: amp * h, face }] : []);
  return tuftStep(
    [
      ...region(span('spine_0', 'spine_2'), 0.45, 0.045, 'up'),
      ...region(span('neck_0', 'neck_1'), 0.4, 0.022, 'up'),
      ...region(span('neck_0', 'neck_1'), 0.4, 0.045, 'down'),
      ...region(span('spine_1', 'spine_2'), 0.6, 0.06, 'down'),
      ...region(span('spine_0', 'spine_0'), 0.45, 0.035, 'back'),
      ...['fore_l_0', 'fore_r_0', 'hind_l_0', 'hind_r_0'].flatMap((b) =>
        region(span(b, b), 0.24, 0.035, 'back'),
      ),
    ],
    {
      cell: 0.1 * h,
      seed: 3,
      droop: 1,
      flow: [-0.4, 0, -1],
      // Not the head (a lock under the jaw is a second outline to QA `model`), nor the stub
      // tail (its bones are 1–3 cm long: the skin round them stays as generated).
      avoid: [
        ...(skull ? [{ at: mid(skull.head, skull.tail), r: 0.26 * h }] : []),
        ...(stub ? [{ at: stub.head, r: 0.14 * h }] : []),
      ],
      why: 'the outline was a smooth hull (bear_hybrid critique: no fur clumps break it on the back, belly fringe or legs): locks of coat raised on the source, so the shell and the bake carry them',
    },
  );
};

export const steps = (rig: ModelRig): readonly BlenderStep[] => {
  const h = rig.height;
  const paw = (leg: string) => ({ at: rig.at(`${leg}_3`), r: h * 0.11, weight: 2 });
  // Edge loops where the haunch bends: a coarse triangle across the hip stretched ×4.3–5.0 at
  // the joint's limits (QA `deform`, limit ×4) at twice the density; three times holds it.
  const hip = (leg: string) => ({ at: rig.at(`${leg}_0`), r: h * 0.22, weight: 3 });
  const focus = [
    { at: rig.at('head'), r: h * 0.28, weight: 3 },
    ...['fore_l', 'fore_r', 'hind_l', 'hind_r'].map(paw),
    ...['hind_l', 'hind_r'].map(hip),
  ];
  // The stub tail's four bones span 6 cm: at the body's density one of them (`tail_2`, 1.3 cm)
  // was left without a vertex once the rump's locks moved the shell (QA `skin`). Denser there
  // on the 28.8 k shell only: the LODs keep its weights.
  const dense = [...focus, { at: rig.at('tail_2'), r: h * 0.09, weight: 4 }];
  const rest = new Map((rig.target ?? rig.fitted).map((b) => [b.name, b]));
  const bone = (name: string) => {
    const b = rest.get(name);
    if (!b) throw new Error(`bear_hybrid steps: the rig has no bone '${name}'`);
    return b;
  };
  // A flat sole costs a collapse nothing: at 5 k the left fore paw kept no vertex on the ground
  // within the toe bone's 4.5 cm (QA `model` read its skin 5.1 cm up). The LODs keep six times
  // the density in a 6 cm ball on the ground under each fore toe joint (rest pose: after `repose`).
  const soles = (['fore_l_3', 'fore_r_3'] as const).map((toe) => {
    const at = bone(toe).head;
    return { at: [at[0], at[1], 0] as Vec3, r: h * 0.06, weight: 6 };
  });
  return [
    { op: 'clean' },
    ears(rig.at('head'), h),
    ...(rig.limbs.length > 1 ? [{ op: 'unweb', limbs: rig.limbs, gap: GAP } as const] : []),
    tufts(rig),
    { op: 'retopo', triangles: TRIANGLES[0], focus: dense },
    { op: 'uv', kind: 'smart' },
    { op: 'bake', size: 2048, maps: ['albedo', 'normal', 'ao'] },
    { op: 'bind' },
    ...(rig.tail ? [{ op: 'isolate', ...rig.tail } as const] : []),
    // The plantigrade walk folds the wrist 84° back in swing. Bone heat puts a hard line across a
    // thick furred paw there, and the fold passes through the forearm: the weights of the paw
    // bone are smoothed round each wrist so the bend spreads over the joint. 50 passes in 24 cm:
    // with 30 in 20 cm the 28.8 k shell's LOD 2 crossed 36 triangle pairs of 542 at the left
    // wrist's limit (QA `deform`, 6 %).
    ...(['fore_l_2', 'fore_r_2'] as const).map(
      (bone): BlenderStep => ({
        op: 'weights',
        kind: 'smooth',
        bone,
        mask: { kind: 'sphere', at: rig.at(bone), r: h * 0.24, feather: h * 0.06 },
        iterations: 50,
      }),
    ),
    ...(rig.target ? [{ op: 'repose', to: rig.target } as const] : []),
    reliefStep(
      bearPaint(bone, h),
      "the generator's baked light, white ear caps and bake holes leave the albedo; the coat's locks, roughness, mud, scars and rubbed coat go into the maps (a textured part takes no grime pass)",
    ),
    { op: 'lods', triangles: [TRIANGLES[1], TRIANGLES[2]], focus: [...focus, ...soles] },
    { op: 'export', normalSize: 1024, ormSize: 1024 },
  ];
};
