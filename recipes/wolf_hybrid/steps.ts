// The wolf's Blender program (task `blender`, examples/blender/README.md), built from the fit: it
// runs after `transform(fit)`, so every coordinate here is in the asset frame at real size, and
// the spheres, capsules and bones come from the rig TS fitted on the committed proxy (kinds
// `modelRig`). Every number is in the cache key. Each step and what it is for:
//   clean    weld the generator's 187 k duplicate vertices, drop its 25 loose shells
//   unweb    the tail hangs fused to the hocks and the fore paws touch: cut the bridges, 2 cm apart
//   script   HAUNCHES: the generator drew rib-like ridges across both thighs; they are smoothed
//            out of the source there (and the cut faces `unweb` left with them), so neither the
//            shell nor the baked normal map carries them
//   script   TUFTS: locks of coat raised out of the outline on the ruff, the back, the brisket,
//            the trousers and the tail's brush (never on the flanks: the width holds)
//   retopo   closed voxel shell → 30 k triangles, three times the density on the head, twice on
//            the paws (the silhouette and the ground contact are read there first) and twice
//            round the hips (edge loops where the haunch bends)
//   uv, bake fresh UVs; the model's colour, relief and AO baked from the 900 k source
//   bind     bone heat on the fitted skeleton (the pose the generator made)
//   isolate  the tail's skin takes only the tail's bones and the rump none of them: bone heat
//            reads nearness, and a tail on the hocks is as near the leg bones as its own. The
//            generator also laid the tail against the thighs, fused: `contact` blends the weights
//            over 4 cm round every edge that joins tail skin to thigh skin (CONTACT below)
//   repose   pose the bound mesh to the straight, symmetric rest (the head turned 27° comes onto
//            the sagittal plane with its own two sides; nothing is mirrored)
//   script   PAINT (wear.ts): the generator's light and orange cast out of the albedo, bake holes
//            and haunch stripes repainted, a roughness map, mud and scars, in the reposed rest
//   lods     10 k and 5 k triangles from the 30 k (same UVs, maps and weights)
//   export   one GLB: three LODs, albedo 2048², normal and ORM 1024², one skin

import type { BlenderStep, ModelRig, Vec3 } from '@developerz.ai/ts23d';
import { py, reliefStep, type TuftRegion, tuftStep } from '../_lib/creature/texture-paint.ts';
import { wolfPaint } from './wear.ts';

/** LOD triangles asked of Blender: budget.triangles (wolf_hybrid.ts). LOD 2 keeps 5 000: at
 *  2 500 the haunch's coarse triangles stretch ×4.1 at the hip's limits (QA `deform`, limit ×4). */
export const TRIANGLES = [30000, 10000, 5000] as const;

/** Gap `unweb` leaves between the tail and the hocks, metres: over 1.5 voxels of the shell
 *  (5.5 mm), so the remesh cannot fuse them again. */
const GAP = 0.02;

/** Band `isolate` blends round the edges that join tail skin to thigh skin, metres. The tail
 *  hangs fused to both thighs from 0.36 to 0.52 m up; with a hard tail / leg split those edges
 *  stretched ×8–10 at the hip's limits (QA `deform` read ×5.7 on LOD 1). Measured on the
 *  committed mesh: 3 cm gives ×2.6, 5 cm ×2.5, 8 cm ×2.5 but drops the stifle's volume to 0.73;
 *  4 cm keeps the stifle at 0.85 and leaves the tail below the thighs on its own bones. */
const CONTACT = 0.04;

/** Passes of neighbour averaging over the haunches. The ridges are 2–3 cm apart on a source
 *  whose edges are 1.7 mm: 80 passes leave under a tenth of a 3 cm ridge. */
const HAUNCH_PASSES = 80;

/** The haunch ridges smoothed out of the source (generator pose). The thigh's skin is what lies
 *  within 0.13 h of the hip → stifle bone and not within 0.08 h of a tail bone (the tail lies on
 *  the thighs: its fur relief stays). */
const haunches = (rig: ModelRig): BlenderStep => {
  const h = rig.height;
  const bones = new Map(rig.fitted.map((b) => [b.name, b]));
  const seg = (n: string): string => {
    const b = bones.get(n);
    return b ? `(${py(b.head)}, ${py(b.tail)})` : '';
  };
  const list = (names: readonly string[]) => names.map(seg).filter(Boolean).join(', ');
  const neck = rig.at('neck_0');
  // The mane's rear edge overhangs the back 0.19 h behind the neck's root.
  const pits: Vec3 = [neck[0] - 0.19 * h, neck[1], neck[2]];
  return {
    op: 'script',
    why: 'rib-like ridges across both thighs read as a starved animal, and a row of pits behind the ruff (wolf_hybrid critique: flank ridges): smoothed out of the source there',
    python: `
me = obj.data
co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
co = co.reshape(-1, 3).astype(np.float64)
P = np.stack([-co[:, 1], co[:, 0], co[:, 2]], axis=1)
h = ${h}
def reach(segments):
    out = np.full(len(P), 1e9)
    for a, b in segments:
        a, b = np.array(a), np.array(b); ab = b - a
        t = np.clip(((P - a) @ ab) / float(ab @ ab), 0, 1)
        out = np.minimum(out, np.linalg.norm(P - a - t[:, None] * ab, axis=1))
    return out
def ramp(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)
w = (1 - ramp(0.13 * h, 0.19 * h, reach([${list(['hind_l_0', 'hind_r_0'])}]))) * ramp(0.05 * h, 0.09 * h, reach([${list(['tail_1', 'tail_2', 'tail_3', 'tail_4'])}]))
# The pits behind the ruff (deep cracks under the rear edge of the generator's mane) close too.
pit = np.array(${py(pits)})
w = np.maximum(w, 1 - ramp(0.09 * h, 0.15 * h, np.linalg.norm(P - pit, axis=1)))
pick = np.nonzero(w > 0)[0]
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
verts = [bm.verts[int(i)] for i in pick]
for _ in range(${HAUNCH_PASSES}):
    bmesh.ops.smooth_vert(bm, verts=verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
moved = np.array([v.co[:] for v in verts], np.float64)
bm.free()
old = co[pick]
co[pick] = old + (moved - old) * w[pick, None]
print('haunches', len(pick), 'vertices, largest move', round(float(np.linalg.norm(co[pick] - old, axis=1).max()), 4))
me.vertices.foreach_set('co', co.astype(np.float32).ravel())
me.update()
`,
  };
};

/** Locks of coat on the outline, in the source's pose: lock height in metres per region. */
const tufts = (rig: ModelRig): BlenderStep => {
  const h = rig.height;
  const bones = new Map(rig.fitted.map((b) => [b.name, b]));
  const span = (from: string, to: string): [Vec3, Vec3] | null => {
    const [a, b] = [bones.get(from), bones.get(to)];
    return a && b ? [a.head, b.tail] : null;
  };
  const skull = bones.get('head');
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const region = (
    s: [Vec3, Vec3] | null,
    r: number,
    amp: number,
    face: TuftRegion['face'],
  ): TuftRegion[] => (s ? [{ a: s[0], b: s[1], r: r * h, amp: amp * h, face }] : []);
  return tuftStep(
    [
      ...region(span('neck_0', 'neck_1'), 0.3, 0.03, 'up'),
      ...region(span('neck_0', 'neck_1'), 0.3, 0.032, 'down'),
      ...region(span('spine_0', 'spine_2'), 0.3, 0.02, 'up'),
      ...region(span('spine_1', 'spine_2'), 0.42, 0.028, 'down'),
      ...region(span('hind_l_0', 'hind_l_0'), 0.22, 0.02, 'back'),
      ...region(span('hind_r_0', 'hind_r_0'), 0.22, 0.02, 'back'),
      ...region(span('tail_1', 'tail_4'), 0.12, 0.026, 'back'),
    ],
    {
      cell: 0.065 * h,
      seed: 7,
      droop: 0.7,
      flow: [-0.5, 0, -1],
      avoid: skull ? [{ at: mid(skull.head, skull.tail), r: 0.24 * h }] : [],
      why: 'the outline was one smooth hull (wolf_hybrid critique: tufted ruff, strand pass on ruff, back and tail): locks of coat raised on the source, so the shell and the bake carry them',
    },
  );
};

export const steps = (rig: ModelRig): readonly BlenderStep[] => {
  const h = rig.height;
  const rest = new Map((rig.target ?? rig.fitted).map((b) => [b.name, b]));
  const bone = (name: string) => {
    const b = rest.get(name);
    if (!b) throw new Error(`wolf_hybrid steps: the rig has no bone '${name}'`);
    return b;
  };
  const paw = (leg: string) => ({ at: rig.at(`${leg}_3`), r: h * 0.11, weight: 2 });
  // Edge loops where the haunch bends: a coarse triangle across the hip stretches past ×4 at the
  // joint's limits on LOD 1 and 2 (QA `deform`); twice the density round both hips holds it.
  const hip = (leg: string) => ({ at: rig.at(`${leg}_0`), r: h * 0.16, weight: 2 });
  const focus = [
    { at: rig.at('head'), r: h * 0.28, weight: 3 },
    ...['fore_l', 'fore_r', 'hind_l', 'hind_r'].map(paw),
    ...['hind_l', 'hind_r'].map(hip),
  ];
  return [
    { op: 'clean' },
    ...(rig.limbs.length > 1 ? [{ op: 'unweb', limbs: rig.limbs, gap: GAP } as const] : []),
    haunches(rig),
    tufts(rig),
    { op: 'retopo', triangles: TRIANGLES[0], focus },
    { op: 'uv', kind: 'smart' },
    { op: 'bake', size: 2048, maps: ['albedo', 'normal', 'ao'] },
    { op: 'bind' },
    ...(rig.tail ? [{ op: 'isolate', ...rig.tail, contact: CONTACT } as const] : []),
    ...(rig.target ? [{ op: 'repose', to: rig.target } as const] : []),
    reliefStep(
      wolfPaint(bone, h),
      "the generator's baked light, orange cast, bake holes and haunch stripes leave the albedo; roughness, mud and scars go into the maps (a textured part takes no grime pass)",
    ),
    { op: 'lods', triangles: [TRIANGLES[1], TRIANGLES[2]], focus },
    { op: 'export', normalSize: 1024, ormSize: 1024 },
  ];
};
