// What the ranger's maps get after the bake (bear_hybrid/paint.ts runs it as one `script` step):
// the wear of a man who walks forest tracks for a living, and a roughness map that tells his
// wool from his leather. Positions are where the hosted rig stands the figure (metres, feet on
// z = 0, +X front, 1.78 m): bands by height, materials by colour (the jerkin is the only green,
// the belts and boots the only saturated brown).
// The story: wet mud on the soles and welts, dried mud caked up the boots and splashed to the
// trouser legs; dust on the jerkin's hem; the belt and baldric scuffed pale where hands, buckle
// and scabbard rub; the jerkin's leather rubbed matt on the elbows and the shoulder capes.

import { py, rgb } from '../_lib/creature/texture-paint.ts';

/** Seeds of the noise fields: change one and that effect re-rolls. */
const SEED = { mud: 19, splash: 31, scuff: 47, rub: 61, dust: 73 } as const;

/** Heights read on the model (README.md "Proportions" and the review sheets), metres. */
export const BANDS = {
  /** Top of the boot cuffs. */
  boot: 0.5,
  /** The jerkin's hem. */
  hem: 0.82,
  /** The waist belt. */
  belt: [0.98, 1.1],
  /** Elbows of the a-pose, left (the right mirrors). */
  elbow: [-0.02, 0.31, 1.17],
  /** Outer edge of the shoulder capes. */
  cape: [-0.01, 0.2, 1.44],
} as const;

/** The paint body (Python, after the kit). */
export function rangerPaint(): string {
  const b = BANDS;
  return `
detail(0.03)
r, g, bl = RGB[..., 0], RGB[..., 1], RGB[..., 2]
# Linear green over red: the jerkin reads 1.9 (median), the olive-brown wool 1.0, boots 0.56.
green = sstep(1.35, 1.65, g / np.maximum(r, 1e-4))
brown = sstep(1.25, 1.6, r / np.maximum(bl, 1e-4)) * (1 - green) * (1 - sstep(0.12, 0.3, lum()))
legs = (np.abs(Y) < 0.3) * (Z < 0.95)
boots = legs * (1 - sstep(${b.boot} - 0.02, ${b.boot} + 0.01, Z))
wool = legs * sstep(${b.boot} - 0.01, ${b.boot} + 0.02, Z) * (1 - green) * (1 - sstep(0.9, 0.97, Z))
# 1. Roughness: wool is matt and stays matt, boot leather is waxed.
ROUGH[:] = np.where(wool > 0.5, np.maximum(ROUGH, 0.93), ROUGH)
ROUGH[:] = ROUGH * (1 - boots) + np.clip(ROUGH * 0.8, 0.36, 0.55) * boots
# 2. Mud: wet on the soles and welts, caked and drying up the boots, splashed to the knees.
edge = Z + 0.09 * (fbm(0.03, ${SEED.mud}) - 0.5)
caked = (1 - sstep(0.08, 0.2, edge)) * legs
wet = (1 - sstep(0.03, 0.08, edge)) * legs
spots = sstep(0.61, 0.66, fbm(0.011, ${SEED.splash}, 3)) * (1 - sstep(0.14, 0.46, Z)) * legs * 0.75
crack = 0.75 + 0.5 * sstep(0.4, 0.6, fbm(0.01, ${SEED.mud + 5}, 2))
dried = np.clip(np.maximum(caked, spots), 0, 1)
print('mud', paint(dried, ${rgb('#857460')}, keep=0.3, value=0.97))
shade(dried * (1 - wet), crack)
print('wet', paint(wet, ${rgb('#34281d')}, keep=0.4, value=0.5))
# 3. Dust: the trouser legs above the boots and the jerkin's hem, heavier low.
dusty = (1 - sstep(${b.boot}, ${b.hem} + 0.08, Z)) * sstep(0.3, 0.8, fbm(0.03, ${SEED.dust})) * (np.abs(Y) < 0.33) * (Z > ${b.boot} - 0.05)
print('dust', paint(dusty * 0.24, ${rgb('#8d8068')}, keep=0.8, value=0.95))
# 4. Belt and baldric: scuffed pale along their length, the grain worn open.
strap = brown * (Z > 0.9) * (Z < 1.55)
waist = strap * sstep(${b.belt[0]} - 0.02, ${b.belt[0]}, Z) * (1 - sstep(${b.belt[1]}, ${b.belt[1]} + 0.02, Z))
scuff = sstep(0.56, 0.72, 0.6 * vnoise(0.006, ${SEED.scuff}, (6, 6, 0.5)) + 0.4 * fbm(0.03, ${SEED.scuff + 1}))
print('belt', paint(np.maximum(waist, 0.6 * strap) * scuff * 0.6, ${rgb('#94735a')}, keep=0.8, value=0.82))
# 5. Jerkin: leather rubbed matt and pale on the elbows and the shoulder capes' edges.
rub = np.zeros((S, S))
for s in (1, -1):
    e = ${py(b.elbow)}; c = ${py(b.cape)}
    rub = np.maximum(rub, ball((e[0] - 0.03, s * e[1], e[2]), 0.04, 0.04))
    rub = np.maximum(rub, 0.8 * ball((c[0], s * c[1], c[2]), 0.05, 0.05))
rub = rub * green * sstep(0.4, 0.6, fbm(0.009, ${SEED.rub}))
print('rub', paint(rub * 0.38, ${rgb('#6f7d68')}, keep=0.8, value=0.85))
`;
}
