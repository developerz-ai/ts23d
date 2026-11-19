// What the bear's maps get after the bake (_lib/creature/texture-paint.ts runs it as one `script`
// step, in the reposed rest): the generator's light taken out, the white ear caps and the bake
// holes repainted, the coat's grain sharpened and its locks raised in the normal map, a roughness
// map that tells fur from nose, claws and mud, and the wear of one animal's season.
// The story: a bear that fishes a muddy river bank. Wet black mud to the middle of the forearms
// and shanks, a pale dried crust above it to the elbows and stifles, the belly's fringe soaked
// and matted, splashes up the flanks; three parallel claw scars from another bear across the
// right shoulder, one older cut down the left flank and a nick over the muzzle; a patch rubbed
// to the skin on the right flank and thinner coat on the right hip and the rump, where it
// scratches against trees.

import type { Vec3 } from '@developerz.ai/ts23d';
import { offset, py, rgb } from '../_lib/creature/texture-paint.ts';

export interface RestBone {
  readonly head: Vec3;
  readonly tail: Vec3;
}

/** Seeds of the noise fields: change one and that effect re-rolls. */
const SEED = { coat: 11, mud: 23, splash: 37, rub: 41, scar: 53, lock: 67 } as const;

/** The paint body (Python, after KIT and RELIEF). `bone` reads the asset's rest skeleton. */
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
  // The patch rubbed bare: the right flank behind the ribs, at the height a trunk is leant on.
  const bare: Vec3 = offset(flank.head, [0.1 * h, -0.3 * h, -0.2 * h]);
  const seg = (n: string) => `(${py(bone(n).head)}, ${py(bone(n).tail)})`;
  const trunk = ['spine_0', 'spine_1', 'spine_2'].map(seg);
  return `
h = ${h}
# 1. The generator's light: blotches 16 cm wide pulled to the coat's value over 55 cm.
print('delight', delight(0.16 * h, 0.55 * h, 0.92, 0.75))
# The top light that is left: the back and shoulders paler than the flanks over half the body.
print('top light', delight(0.4 * h, 1.3 * h, 0.55, 0.3))
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
# 3b. The coat itself: hair against the gap between hairs (the bake's grain, sharpened), and
# locks 5 cm wide raised in the normal map so a low light rakes across clumps, not a smooth hide.
face = ball(${py(head.tail)}, 0.2 * h, 0.08 * h)
grain(0.8, 1 - 0.6 * face)
lock = locks(0.05 * h, ${SEED.lock})
furred = (1 - face) * sstep(0.05 * h, 0.12 * h, Z)
# Strands: guard hair 8 mm across in hanks 4 cm long, lighter and darker by a fifth.
shade(furred, 0.8 + 0.4 * vnoise(0.008 * h, ${SEED.lock + 5}, (1, 1, 5)))
# Grizzle: hanks 2 cm across with silver tips, thickest over the hump and back, and the shadow
# between hanks.
tips = locks(0.022 * h, ${SEED.lock + 9}, (1.6, 1, 4), 2.0) * (0.35 + 0.65 * sstep(0.4 * h, 0.8 * h, Z))
shade(furred * tips, 1.5)
shade(furred * (1 - locks(0.03 * h, ${SEED.lock + 11})) * sstep(0.45, 0.7, fbm(0.06 * h, ${SEED.lock + 12})), 0.72)
emboss(0.006 * h * lock * furred)
shade(furred * (1 - lock) * sstep(0.3, 0.6, fbm(0.2 * h, ${SEED.lock + 3})), 0.8)
# 4. Roughness: dry fur 0.8-0.95 (paler tips drier), a wet nose, polished claws.
coat = fbm(0.09 * h, ${SEED.coat})
ROUGH[:] = np.clip(0.86 + 0.10 * (coat - 0.5) + 0.10 * (DETAIL - 1), 0.7, 0.97)
nose = ball(${py(head.tail)}, 0.045 * h, 0.01 * h) * (1 - sstep(0.02, 0.06, lum()))
rough(nose, 0.28)
claw = (Z < 0.075 * h) * sstep(0.16, 0.3, lum())
rough(claw, 0.34)
# 5. Mud. Wet and black to the middle of the forearms and shanks, a pale dried crust above it to
# the elbows and stifles, the belly's fringe soaked, splashes up the flanks.
edge = Z + 0.2 * h * (fbm(0.08 * h, ${SEED.mud}) - 0.5)
caked = (1 - sstep(0.32 * h, 0.46 * h, edge)) * sstep(0.22, 0.42, fbm(0.11 * h, ${SEED.mud + 1}))
wet = 1 - sstep(0.13 * h, 0.23 * h, Z + 0.2 * h * (fbm(0.05 * h, ${SEED.mud + 3}) - 0.5))
spots = sstep(0.55, 0.61, fbm(0.03 * h, ${SEED.splash}, 3)) * (1 - sstep(0.4 * h, 0.72 * h, Z))
legs = np.zeros((S, S))
for p in ${`[${paws.map(py).join(', ')}]`}:
    legs = np.maximum(legs, ((X - p[0]) ** 2 + (Y - p[1]) ** 2 < (0.26 * h) ** 2).astype(float))
under = np.zeros((S, S))
for a, b in [${trunk.join(', ')}]:
    under = np.maximum(under, capsule(a, b, 0.6 * h))
fringe = under * (1 - legs) * (1 - sstep(0.47 * h, 0.56 * h, Z + 0.06 * h * (fbm(0.05 * h, ${SEED.mud + 2}) - 0.5)))
belly = under * (1 - sstep(0.5 * h, 0.7 * h, Z))
dried = np.clip(np.maximum(caked * legs, spots * np.maximum(legs, belly)), 0, 1)
crack = 0.7 + 0.6 * sstep(0.4, 0.6, fbm(0.014 * h, ${SEED.mud + 5}, 2))
print('mud', paint(dried * (1 - 0.55 * claw), ${rgb('#8b7960')}, keep=0.35, value=0.97))
shade(dried * (1 - wet), crack)
emboss(0.004 * h * dried * (1 - wet) * fbm(0.014 * h, ${SEED.mud + 9}, 2))
print('wet', paint(wet * legs * (1 - 0.6 * claw), ${rgb('#2c2118')}, keep=0.5, value=0.5))
# Soaked fur hangs in dark pointed locks: the fringe keeps the lock pattern, glossy.
soak = fringe * (0.55 + 0.45 * locks(0.035 * h, ${SEED.mud + 11}, (1, 1, 6)))
print('soaked', paint(soak, ${rgb('#34271b')}, keep=0.6, value=0.45))
plane(np.maximum(wet * legs, fringe), 0.45)
# 6. Scars: hairless skin, a darker lip each side.
for k, at in enumerate(${`[${scars.map(py).join(', ')}]`}):
    n = (0.86, 0.0, 0.5)
    lip = slab(at, n, 0.036 * h, (0.28 - 0.04 * k) * h, 0.01 * h, ${SEED.scar} + k) * (Y < 0)
    cut = slab(at, n, 0.015 * h, (0.27 - 0.04 * k) * h, 0.01 * h, ${SEED.scar} + k) * (Y < 0)
    shade(lip, 0.45)
    emboss(-0.006 * h * cut)
    plane(cut, 0.15)
    print('rake', paint(cut, ${rgb('#8a6b65')}, keep=0.3, value=0.45))
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
plane(worn, 0.5)
# Rubbed to the skin on the right flank: grey hide under sparse hair, a ragged edge.
patch = ball(${py(bare)}, 0.06 * h, 0.14 * h) * (Y < 0)
patch = sstep(0.3, 0.7, patch * (0.4 + 1.3 * fbm(0.06 * h, ${SEED.rub + 4})))
print('bare', paint(patch * 0.75, ${rgb('#857263')}, keep=0.5, value=0.55))
plane(patch, 0.3)
`;
}
