// What the bear's maps get after the bake (paint.ts runs it as one `script` step, in the reposed
// rest): the generator's light taken out, the white ear caps and the bake holes repainted, a
// roughness map that tells fur from nose, claws and mud, and the wear of one animal's season.
// The story: a bear that fishes a muddy river bank. Wet mud to the wrists and hocks, dried splashes
// up the legs and under the belly; three parallel claw scars from another bear across the right
// shoulder, one older cut down the left flank and a nick over the muzzle; the coat rubbed thin on the right hip and the rump,
// where it scratches against trees.

import type { Vec3 } from '@developerz.ai/ts23d';
import { offset, py, rgb } from '../_lib/creature/texture-paint.ts';

export interface RestBone {
  readonly head: Vec3;
  readonly tail: Vec3;
}

/** Seeds of the noise fields: change one and that effect re-rolls. */
const SEED = { coat: 11, mud: 23, splash: 37, rub: 41, scar: 53 } as const;

/** The paint body (Python, after paint.ts KIT). `bone` reads the asset's rest skeleton. */
export function bearPaint(bone: (name: string) => RestBone, height: number): string {
  const h = height;
  const head = bone('head');
  const shoulder = bone('fore_r_0').head;
  const flank = bone('spine_1');
  const hip = bone('hind_r_0').head;
  const croup = bone('spine_0').head;
  const paws = ['fore_l', 'fore_r', 'hind_l', 'hind_r'].map((l) => bone(`${l}_3`).head);
  // Three rakes across the right shoulder (the side the hero shot shows), 4.5 cm apart, cut by
  // planes leaning back; one long cut on the left flank.
  const rake: Vec3 = offset(shoulder, [-0.04 * h, -0.1 * h, -0.08 * h]);
  const scars = [-1, 0, 1].map((k) => offset(rake, [k * 0.045 * h, 0, k * 0.015 * h]));
  const old: Vec3 = offset(flank.head, [0.2 * h, 0.2 * h, -0.2 * h]);
  return `
h = ${h}
# 1. The generator's light: blotches 16 cm wide pulled to the coat's value over 55 cm.
print('delight', delight(0.16 * h, 0.55 * h, 0.85, 0.7))
detail(0.05 * h)
# 2. Bake holes (black cracks on the neck and the thighs), not the soles, nose, eyes or ears.
keep_dark = np.maximum(ball(${py(head.tail)}, 0.2 * h), (Z < 0.06 * h).astype(float))
keep_dark = np.maximum(keep_dark, ((Z > ${(head.head[2]).toFixed(4)} + 0.06 * h) & (X > ${head.head[0].toFixed(4)} - 0.25 * h)).astype(float))
print('healed', heal(0.002, 1 - keep_dark, 0.05 * h))
# 3. Ears: the generator capped them white (studio light on thin fur). Body brown, grain kept.
for side in (1, -1):
    tip = peak((X > ${head.head[0].toFixed(4)} - 0.25 * h) & (Y * side > 0.04 * h))
    cap = ball((tip[0], tip[1], tip[2] - 0.03 * h), 0.085 * h, 0.03 * h)
    pale = sstep(0.10, 0.30, lum())
    print('ear', tip, paint(cap * pale, ${rgb('#5a4028')}, keep=0.7))
    paint(cap * (1 - pale) * 0.5, ${rgb('#3a2a1c')}, keep=0.8)
# 4. Roughness: dry fur 0.8-0.95 (paler tips drier), a wet nose, polished claws.
coat = fbm(0.09 * h, ${SEED.coat})
ROUGH[:] = np.clip(0.86 + 0.10 * (coat - 0.5) + 0.10 * (DETAIL - 1), 0.7, 0.97)
nose = ball(${py(head.tail)}, 0.045 * h, 0.01 * h) * (1 - sstep(0.02, 0.06, lum()))
rough(nose, 0.28)
claw = (Z < 0.075 * h) * sstep(0.16, 0.3, lum())
rough(claw, 0.34)
# 5. Mud. Wet and dark to the wrists and hocks, a paler dried crust above it, splashes to the belly.
edge = Z + 0.16 * h * (fbm(0.07 * h, ${SEED.mud}) - 0.5)
caked = 1 - sstep(0.17 * h, 0.24 * h, edge)
wet = 1 - sstep(0.06 * h, 0.13 * h, edge)
spots = sstep(0.58, 0.64, fbm(0.024 * h, ${SEED.splash}, 3)) * (1 - sstep(0.22 * h, 0.6 * h, Z))
legs = np.zeros((S, S))
for p in ${`[${paws.map(py).join(', ')}]`}:
    legs = np.maximum(legs, ((X - p[0]) ** 2 + (Y - p[1]) ** 2 < (0.24 * h) ** 2).astype(float))
belly = (1 - sstep(0.42 * h, 0.55 * h, Z))
dried = np.clip(np.maximum(caked * legs, spots * np.maximum(legs, belly)), 0, 1)
crack = 0.75 + 0.5 * sstep(0.4, 0.6, fbm(0.012 * h, ${SEED.mud + 5}, 2))
print('mud', paint(dried * (1 - 0.55 * claw), ${rgb('#8a7862')}, keep=0.3, value=0.97))
shade(dried * (1 - wet), crack)
print('wet', paint(wet * legs * (1 - 0.6 * claw), ${rgb('#33271c')}, keep=0.45, value=0.58))
# 6. Scars: hairless skin, a darker lip each side.
for k, at in enumerate(${`[${scars.map(py).join(', ')}]`}):
    n = (0.86, 0.0, 0.5)
    lip = slab(at, n, 0.03 * h, (0.23 - 0.03 * k) * h, 0.008 * h, ${SEED.scar} + k) * (Y < 0)
    cut = slab(at, n, 0.014 * h, (0.22 - 0.03 * k) * h, 0.008 * h, ${SEED.scar} + k) * (Y < 0)
    shade(lip, 0.55)
    print('rake', paint(cut, ${rgb('#80625a')}, keep=0.25, value=0.5))
long = slab(${py(old)}, (0.55, 0.0, -0.83), 0.012 * h, 0.2 * h, 0.01 * h, ${SEED.scar + 5}) * (Y > 0)
shade(slab(${py(old)}, (0.55, 0.0, -0.83), 0.026 * h, 0.21 * h, 0.01 * h, ${SEED.scar + 5}) * (Y > 0), 0.6)
print('flank', paint(long, ${rgb('#80625a')}, keep=0.25, value=0.5))
nick = slab(${py(offset(head.tail, [-0.11 * h, 0, 0.04 * h]))}, (0.5, 0.8, 0.2), 0.005 * h, 0.07 * h, 0.003 * h, ${SEED.scar + 9}) * (Z > ${(head.tail[2]).toFixed(4)})
print('scar', paint(nick, ${rgb('#80625a')}, keep=0.25, value=0.5))
# 7. Rubbed coat on the right hip and the rump: thin, flattened, a little greasy.
worn = np.maximum(ball(${py(offset(hip, [-0.04 * h, -0.16 * h, -0.08 * h]))}, 0.16 * h, 0.1 * h),
                  ball(${py(offset(croup, [-0.05 * h, 0, 0.02 * h]))}, 0.13 * h, 0.1 * h))
worn = worn * sstep(0.3, 0.5, fbm(0.05 * h, ${SEED.rub}))
print('rub', paint(worn * 0.65, ${rgb('#6b5a4a')}, keep=0.8, value=0.6))
`;
}
