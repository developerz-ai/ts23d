// The dragon's Blender program (task `blender`, examples/blender/README.md), built from the fit:
// it runs after `transform(fit)`, so every coordinate here is in the asset frame at real size,
// and the spheres, capsules and bones come from the rig TS fitted on the committed proxy (kinds
// `modelRig`). Every number is in the cache key. Each step and what it is for:
//   clean    weld the generator's duplicate vertices, drop its loose shells
//   script   BUILD: the wings scaled ×1.25 about their roots (the generator's were small for
//            the body), the upper and lower legs 10 % thicker, a torn notch cut out of the left
//            wing's trailing edge, a knuckle raised over each fore toe joint (they lay outside
//            the thin paws); on the source, so the shell and the bake carry all of it
//   unweb    the fore feet stand toe to toe: cut the bridges, 3.2 cm apart
//   retopo   closed voxel shell at 1.4 cm (the cut toes stay apart) → 30 k triangles, three
//            times the density on the head and round the hips, twice on the feet; the wing
//            membranes come through as closed slabs
//   uv, bake fresh UVs; the model's colour, relief and AO baked from the 900 k source
//   bind     bone heat on the fitted skeleton and the six wing bones (wings.ts): each wing
//            follows its own shoulder, wrist and finger
//   weights  the paw bone's weights smoothed round each wrist: the walk folds it 146°
//   repose   pose the bound mesh to the straight, symmetric rest (nothing is mirrored)
//   script   PAINT (wear.ts, bear_hybrid/paint.ts): the generator's light out of the albedo,
//            keratin horns, a roughness map, soot, dust, scars and scuffed wing leather
//   lods     10 k and 5 k triangles from the 30 k (same UVs, maps and weights)
//   export   one GLB: three LODs, albedo 2048², normal and ORM 1024², one skin

import type { BlenderStep, Bone, ModelRig } from '@developerz.ai/ts23d';
import { paintStep, py } from '../_lib/creature/texture-paint.ts';
import { drakePaint } from './wear.ts';
import { findWings, TRUNK, WING_SCALE, type Wing } from './wings.ts';

export { WING_SCALE } from './wings.ts';

/** LOD triangles asked of Blender: budget.triangles (dragon_hybrid.ts). LOD 2 keeps 5 000, as the
 *  wolf's and the bear's. */
export const TRIANGLES = [30000, 10000, 5000] as const;

/** The retopo shell's voxel, metres, and the gap `unweb` leaves between limbs that touch (D72).
 *  Left to itself the shell took 2.03 cm here (the wings' area sets it) and its closing pass
 *  (4 voxels, for the source's open seams) welded the 2 cm gap shut: the fore paws were joined
 *  by 30 triangles, bone heat gave 110 paw vertices both legs' weights, and in the walk each
 *  paw dragged the other's toes along. Measured window: at 1.8 cm the shell does not close,
 *  at 2.0 cm the paws fuse again, at 1.5–1.6 cm a hind claw sinks 2.7 cm under the ground at
 *  LOD 1–2 (± 2.6 cm), at 1.2 cm the toe joints fall outside the thinner paws. 1.4 cm passes. */
const VOXEL = 0.014;
const GAP = 0.032;

/** Upper and lower leg thickness (not the feet: the toes' gap is measured, see VOXEL). */
export const LEG_SCALE = 1.1;

const LEGS = ['fore_l', 'fore_r', 'hind_l', 'hind_r'];

/** Wings, legs and the torn membrane, on the source (generator pose, asset frame at real size).
 *  A wing is what stands more than 0.3 h off every trunk bone above the back; it is found, not
 *  placed, so a re-rolled mesh keeps the step. Each wing grows about the root wings.ts found on
 *  the proxy, the same centre its bones were scaled about, so the bones stay in the spars. */
const build = (bones: readonly Bone[], h: number, wings: readonly Wing[]): BlenderStep => {
  const knuckles = bones.filter((b) => /^fore_[lr]_3$/.test(b.name)).map((b) => b.head);
  const by = new Map(bones.map((b) => [b.name, b]));
  const seg = (n: string) => {
    const b = by.get(n);
    return b ? [`(${py(b.head)}, ${py(b.tail)})`] : [];
  };
  return {
    op: 'script',
    why: `wings ×${WING_SCALE} about their roots, legs ×${LEG_SCALE} thick, one torn notch in the left wing (dragon_hybrid critique: wings small for the body, legs thin, no torn membrane)`,
    python: `
me = obj.data
co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
co = co.reshape(-1, 3).astype(np.float64)
P = np.stack([-co[:, 1], co[:, 0], co[:, 2]], axis=1)
h = ${h}
def axis(a, b):
    a, b = np.array(a), np.array(b); ab = b - a
    t = np.clip(((P - a) @ ab) / float(ab @ ab), 0, 1)
    foot = a + t[:, None] * ab
    return t, foot, np.linalg.norm(P - foot, axis=1)
def ramp(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)
off = np.full(len(P), 1e9)
for a, b in [${TRUNK.flatMap(seg).join(', ')}]:
    off = np.minimum(off, axis(a, b)[2])
wing = ramp(0.3 * h, 0.45 * h, off) * ramp(0.72 * h, 0.88 * h, P[:, 2])
# Legs first (they are near the trunk, the wings are not): thicker about each bone's axis,
# fading in below the hip and out above the foot.
for a, b, top in [${LEGS.flatMap((l) => [
      ...seg(`${l}_0`).map((s) => `(*${s}, 1)`),
      ...seg(`${l}_1`).map((s) => `(*${s}, 0)`),
    ]).join(', ')}]:
    t, foot, d = axis(a, b)
    along = ramp(0.15, 0.5, t) if top else 1 - ramp(0.6, 0.95, t)
    w = along * (1 - ramp(0.16 * h, 0.24 * h, d)) * (1 - wing) * ((t > 0) & (t < 1))
    P = foot + (P - foot) * (1 + ${(LEG_SCALE - 1).toFixed(3)} * w)[:, None]
# Knuckles: a fore toe joint must lie inside the skin with 2 cm to spare (the shell's voxel
# shaves 1.4 cm; QA 'model' refuses a joint outside the mesh). The skin nearest the joint is
# raised along its normal by what is missing, fading out over 7 cm.
no = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('normal', no)
no = no.reshape(-1, 3).astype(np.float64)
N = np.stack([-no[:, 1], no[:, 0], no[:, 2]], axis=1)
for J in [${knuckles.map(py).join(', ')}]:
    J = np.array(J)
    d = np.linalg.norm(P - J, axis=1)
    k = int(np.argmin(d))
    above = float((J - P[k]) @ N[k])
    lift = max(0.0, 0.02 + above)
    w = 1 - ramp(0.02, 0.07, np.linalg.norm(P - P[k], axis=1))
    P = P + (w * lift)[:, None] * N[k]
    print('knuckle', np.round(J, 3), 'skin at', round(float(d[k]), 4), 'joint above it', round(above, 4), 'raised', round(lift, 4))
for side, root in [${wings.map((w) => `(${w.side}, np.array(${py(w.root)}))`).join(', ')}]:
    m = wing * (P[:, 1] * side > 0)
    P = root + (P - root) * (1 + ${(WING_SCALE - 1).toFixed(3)} * m)[:, None]
    print('wing', side, 'root', np.round(root, 3), 'vertices', int((m > 0.5).sum()))
co[:, 0], co[:, 1], co[:, 2] = P[:, 1], -P[:, 0], P[:, 2]
me.vertices.foreach_set('co', co.astype(np.float32).ravel())
# The tear: a notch up from the trailing edge of the left wing, between two fingers.
left = (wing > 0.9) & (P[:, 1] > 0)
xs = P[left, 0]
x0 = float(np.quantile(xs, 0.3))
band = left & (np.abs(P[:, 0] - x0) < 0.04 * h)
k = int(np.argmin(np.where(band, P[:, 2], 1e9)))
edge = P[k]
centre = P[left].mean(axis=0)
up = centre - edge; up = up / np.linalg.norm(up)
rel = P - edge
t = rel @ up
d = np.linalg.norm(rel - t[:, None] * up, axis=1)
length, width = 0.34 * h, 0.075 * h
gone = left & (t > -0.05 * h) & (t < length) & (d < width * (1 - np.clip(t / length, 0, 1)) + 0.012 * h)
bm = bmesh.new(); bm.from_mesh(me)
bm.verts.ensure_lookup_table()
dead = [f for f in bm.faces if all(gone[v.index] for v in f.verts)]
print('tear at', np.round(edge, 3), 'faces', len(dead))
bmesh.ops.delete(bm, geom=dead, context='FACES')
bm.to_mesh(me); bm.free()
me.update()
`,
  };
};

export const steps = (rig: ModelRig): readonly BlenderStep[] => {
  const h = rig.height;
  const paw = (leg: string) => ({ at: rig.at(`${leg}_3`), r: h * 0.11, weight: 2 });
  // Edge loops where the haunch bends (as the bear's: three times the density round the hips).
  const hip = (leg: string) => ({ at: rig.at(`${leg}_0`), r: h * 0.22, weight: 3 });
  const focus = [
    { at: rig.at('head'), r: h * 0.28, weight: 3 },
    ...['fore_l', 'fore_r', 'hind_l', 'hind_r'].map(paw),
    ...['hind_l', 'hind_r'].map(hip),
  ];
  const rest = new Map((rig.target ?? rig.fitted).map((b) => [b.name, b]));
  const bone = (name: string) => {
    const b = rest.get(name);
    if (!b) throw new Error(`dragon_hybrid steps: the rig has no bone '${name}'`);
    return b;
  };
  return [
    { op: 'clean' },
    build(rig.fitted, h, findWings({ mesh: rig.mesh, fitted: rig.fitted, height: h, prefix: '' })),
    ...(rig.limbs.length > 1 ? [{ op: 'unweb', limbs: rig.limbs, gap: GAP } as const] : []),
    { op: 'retopo', triangles: TRIANGLES[0], focus, voxel: VOXEL },
    { op: 'uv', kind: 'smart' },
    { op: 'bake', size: 2048, maps: ['albedo', 'normal', 'ao'] },
    { op: 'bind' },
    // The walk folds the wrist 146°. Bone heat puts a hard line across the joint and the fold
    // loses the joint's volume: the paw bone's weights are smoothed round each wrist so the bend
    // spreads over it.
    ...(['fore_l_2', 'fore_r_2'] as const).map(
      (bone): BlenderStep => ({
        op: 'weights',
        kind: 'smooth',
        bone,
        mask: { kind: 'sphere', at: rig.at(bone), r: h * 0.3, feather: h * 0.08 },
        iterations: 60,
      }),
    ),
    ...(rig.target ? [{ op: 'repose', to: rig.target } as const] : []),
    paintStep(
      drakePaint(bone, h),
      "the generator's baked light and chalk-grey horns leave the albedo; roughness, soot, dust, scars and scuffed wing leather go into the maps (a textured part takes no grime pass)",
    ),
    { op: 'lods', triangles: [TRIANGLES[1], TRIANGLES[2]], focus },
    { op: 'export', normalSize: 1024, ormSize: 1024 },
  ];
};
