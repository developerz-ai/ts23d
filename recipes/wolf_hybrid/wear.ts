// What the wolf's maps get after the bake (one `script` step, _lib/creature/texture-paint.ts, in
// the reposed rest): the generator's light and its orange cast taken out, the bake holes and the
// rib-like stripes on the haunches repainted, a roughness map that tells coat from nose and mud,
// and the wear of one animal's autumn.
// The story: a wolf that has crossed a peat bog. Wet black mud to the pasterns, a paler dried
// crust to the wrists and hocks, splashes up the legs and under the belly and chest; three healed
// rakes from another wolf across the right shoulder and one cut across the right side of the
// muzzle (the side the hero shot shows).

import type { Vec3 } from '@developerz.ai/ts23d';
import { offset, py, rgb } from '../_lib/creature/texture-paint.ts';

export interface RestBone {
  readonly head: Vec3;
  readonly tail: Vec3;
}

/** Seeds of the noise fields: change one and that effect re-rolls. */
const SEED = { coat: 13, mud: 27, splash: 39, scar: 51, calm: 61 } as const;

/** The paint body (Python, after KIT and RELIEF). `bone` reads the asset's rest skeleton. */
export function wolfPaint(bone: (name: string) => RestBone, height: number): string {
  const h = height;
  const head = bone('head');
  const shoulder = bone('fore_r_0').head;
  const seg = (n: string) => `(${py(bone(n).head)}, ${py(bone(n).tail)})`;
  const thighs = ['hind_l_0', 'hind_r_0'].map(seg);
  const tail = ['tail_0', 'tail_1', 'tail_2', 'tail_3', 'tail_4'].map(seg);
  const trunk = ['spine_0', 'spine_1', 'spine_2'].map(seg);
  const paws = ['fore_l', 'fore_r', 'hind_l', 'hind_r'].map((l) => bone(`${l}_2`).head);
  const rake: Vec3 = offset(shoulder, [-0.02 * h, -0.09 * h, -0.02 * h]);
  const scars = [-1, 0, 1].map((k) => offset(rake, [k * 0.045 * h, 0, k * 0.012 * h]));
  const hocks = ['hind_l_1', 'hind_r_1', 'hind_l_2', 'hind_r_2'].map(seg);
  // The mane's rear edge overhangs the back 0.19 h behind the neck's root: pits under it.
  const withers: Vec3 = offset(bone('neck_0').head, [-0.19 * h, 0, 0]);
  return `
h = ${h}
# 1. The generator's light: blotches 16 cm x h wide pulled to the coat's value over 55 cm x h.
print('delight', delight(0.16 * h, 0.55 * h, 0.85, 0.7))
# The top light that is left: white streaks along the top of the back and the rump.
back = np.zeros((S, S))
for a, b in [${trunk.join(', ')}]:
    back = np.maximum(back, capsule(a, b, 0.3 * h))
shade(back * sstep(0.84 * h, 0.94 * h, Z) * sstep(0.4, 0.7, lum()), 0.62)
detail(0.03 * h)
# 2. Its orange cast (flank, ear, tail root): strong chroma pulled to the coat's tawny grey. The
# amber irises keep theirs.
mx = RGB.max(axis=2); mn = RGB.min(axis=2)
chroma = (mx - mn) / np.maximum(mx, 1e-4)
eyes = ((X > ${(head.head[0] + 0.04 * h).toFixed(4)}) & (X < ${(head.head[0] + 0.19 * h).toFixed(4)}) & (np.abs(Y) > 0.02 * h) & (np.abs(Y) < 0.1 * h) & (Z > ${(head.head[2] - 0.03 * h).toFixed(4)}) & (Z < ${(head.head[2] + 0.07 * h).toFixed(4)})).astype(float)
cast = sstep(0.42, 0.62, chroma) * sstep(0.02, 0.06, lum()) * (1 - eyes)
desat(cast, 0.55)
print('cast', paint(cast * 0.4, ${rgb('#9c8a6c')}, keep=0.9))
def near(segments, r, feather):
    out = np.zeros((S, S))
    for a, b in segments:
        out = np.maximum(out, capsule(a, b, r, feather))
    return out
tail = near([${tail.join(', ')}], 0.07 * h, 0.03 * h)
# The nose: the head bone runs past it, so it is found (the foremost skin on the midline).
k = np.unravel_index(int(np.argmax(np.where(OK & (np.abs(Y) < 0.03 * h), X, -1e9))), X.shape)
tip = (float(X[k]), 0.0, float(Z[k]))
# 3. Bake holes: texels the source left black where the tail was cut from the thighs and hocks
# (ragged at the right stifle and inside the hocks) and in the pits behind the ruff. Only there:
# the saddle's own black guard hair is as dark.
cuts = np.maximum(near([${hocks.join(', ')}], 0.1 * h, 0.03 * h), ball(${py(withers)}, 0.14 * h, 0.04 * h))
print('healed', heal(0.004, cuts * (Z > 0.035 * h), 0.04 * h))
# 4. The haunches: the generator drew rib-like stripes across both thighs (they read as a
# starved animal). The steps smooth them out of the surface; here they leave the colour.
# The stripes run level, 2-3 cm apart: colour is averaged 9 cm up and down, 2 cm along.
thigh = near([${thighs.join(', ')}], 0.11 * h, 0.04 * h) * (1 - tail) * (np.abs(Y) > 0.07 * h)
calm(0.85 * thigh, (0.02 * h, 0.02 * h, 0.09 * h), ${SEED.calm}, 0.3)
emboss(0.002 * locks(0.03 * h, ${SEED.calm + 1}) * thigh)
# 5. Roughness: dry winter coat 0.8-0.95 (paler guard hair drier), a wet nose.
coat = fbm(0.09 * h, ${SEED.coat})
ROUGH[:] = np.clip(0.87 + 0.10 * (coat - 0.5) + 0.10 * (DETAIL - 1), 0.72, 0.97)
nose = ball(tip, 0.04 * h, 0.01 * h) * (1 - sstep(0.02, 0.06, lum()))
rough(nose, 0.26)
# 6. Mud. Wet and black to the pasterns, a paler dried crust to the wrists and hocks, splashes
# up the legs, the belly and the chest.
edge = Z + 0.14 * h * (fbm(0.06 * h, ${SEED.mud}) - 0.5)
wet = 1 - sstep(0.07 * h, 0.12 * h, edge)
caked = 1 - sstep(0.2 * h, 0.3 * h, edge)
legs = np.zeros((S, S))
for p in ${`[${paws.map(py).join(', ')}]`}:
    legs = np.maximum(legs, ((X - p[0]) ** 2 + (Y - p[1]) ** 2 < (0.2 * h) ** 2).astype(float))
under = near([${trunk.join(', ')}], 0.4 * h, 0.0) * (1 - sstep(0.47 * h, 0.58 * h, Z))
chest = ball(${py([shoulder[0] + 0.06 * h, 0, shoulder[2] - 0.1 * h])}, 0.2 * h, 0.08 * h)
# Flecks a centimetre across, thick on the legs and thinning out upwards.
fleck = fbm(0.011 * h, ${SEED.splash}, 3) + 0.1 * (1 - sstep(0.1 * h, 0.7 * h, Z))
spots = sstep(0.61, 0.65, fleck) * (1 - sstep(0.4 * h, 0.78 * h, Z))
spots = spots * np.maximum(np.maximum(legs, under), chest)
dried = np.clip(caked * legs, 0, 1)
crack = 0.72 + 0.56 * sstep(0.4, 0.6, fbm(0.012 * h, ${SEED.mud + 5}, 2))
print('mud', paint(dried, ${rgb('#75644f')}, keep=0.3, value=0.96))
shade(dried * (1 - wet), crack)
print('splashes', paint(spots * (1 - wet), ${rgb('#4f4132')}, keep=0.3, value=0.9))
dried = np.maximum(dried, spots)
print('wet', paint(wet * legs, ${rgb('#2b2119')}, keep=0.4, value=0.5))
plane(wet * legs, 0.3)
emboss(0.002 * dried * fbm(0.012 * h, ${SEED.mud + 9}, 2))
# 7. Scars: hairless grey-pink skin in a groove, a darker lip each side.
def scar(at, n, half, reach, wobble, seed, side):
    lip = slab(at, n, 2.2 * half, 1.05 * reach, wobble, seed) * side
    cut = slab(at, n, half, reach, wobble, seed) * side
    shade(lip, 0.5)
    emboss(-0.003 * cut)
    plane(cut, 0.2)
    return paint(cut, ${rgb('#87675f')}, keep=0.25, value=0.5)
for k, at in enumerate(${`[${scars.map(py).join(', ')}]`}):
    print('rake', scar(at, (0.86, 0.0, 0.5), 0.009 * h, (0.16 - 0.025 * k) * h, 0.006 * h, ${SEED.scar} + k, Y < 0))
# Across the right side of the muzzle, from the bridge down towards the lip.
muzzle = (tip[0] - 0.085 * h, -0.03 * h, tip[2] + 0.015 * h)
print('muzzle', scar(muzzle, (0.7, 0.0, 0.7), 0.006 * h, 0.08 * h, 0.003 * h, ${SEED.scar + 9}, Y < -0.006 * h))
`;
}
