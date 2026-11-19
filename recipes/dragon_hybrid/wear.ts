// What the drake's maps get after the bake (bear_hybrid/paint.ts runs it as one `script` step, in
// the reposed rest): the generator's light taken out, the chalk-grey horns repainted as ringed
// keratin (dark root, pale tip), a roughness map that tells scales from belly plates, wing
// leather, horn and claw, and the wear of an animal that burns what it eats.
// The story: soot round the mouth, nostrils and down the throat; three claw scars from a rival
// across the right flank (the side the hero shot shows); pale dust on the feet, the belly's underside and the dragging tail;
// the wing leather scuffed pale where the fingers fold it.

import type { Vec3 } from '@developerz.ai/ts23d';
import { offset, py, rgb } from '../_lib/creature/texture-paint.ts';

export interface RestBone {
  readonly head: Vec3;
  readonly tail: Vec3;
}

/** Seeds of the noise fields: change one and that effect re-rolls. */
const SEED = { scales: 5, soot: 17, dust: 29, scar: 43, wing: 59 } as const;

/** The paint body (Python, after the kit). `bone` reads the asset's rest skeleton. */
export function drakePaint(bone: (name: string) => RestBone, height: number): string {
  const h = height;
  const head = bone('head');
  const loin = bone('spine_1');
  const flank: Vec3 = offset(loin.head, [0.3 * h, -0.14 * h, -0.1 * h]);
  const scars = [-1, 0, 1].map((k) => offset(flank, [k * 0.05 * h, 0, k * 0.015 * h]));
  const trunk = ['spine_0', 'spine_1', 'spine_2', 'neck_0', 'neck_1', 'head', 'tail_0', 'tail_1']
    .map((n) => bone(n))
    .map((b) => `(${py(b.head)}, ${py(b.tail)})`);
  return `
h = ${h}
# 1. The generator's light: blotches 16 cm x h wide pulled to the hide's value over 55 cm x h.
print('delight', delight(0.16 * h, 0.55 * h, 0.8, 0.5))
detail(0.04 * h)
mx = RGB.max(axis=2); mn = RGB.min(axis=2)
grey = 1 - (mx - mn) / np.maximum(mx, 1e-4)
# The wings: what stands off the trunk, above the back (the membranes and their fingers).
off = np.full((S, S), 1e9)
for a, b in [${trunk.join(', ')}]:
    a, b = np.array(a), np.array(b); ab = b - a
    t = np.clip(((X - a[0]) * ab[0] + (Y - a[1]) * ab[1] + (Z - a[2]) * ab[2]) / float(ab @ ab), 0, 1)
    off = np.minimum(off, np.sqrt((X - a[0] - t * ab[0]) ** 2 + (Y - a[1] - t * ab[1]) ** 2 + (Z - a[2] - t * ab[2]) ** 2))
wing = sstep(0.3 * h, 0.4 * h, off) * (Z > 0.8 * h)
# 2. Horns and face spikes: chalk grey out of the generator. Keratin: dark at the root, bone
# pale at the tip, growth rings 2.5 cm x h apart.
skull = ${py(offset(head.head, [0.02 * h, 0, 0.02 * h]))}
out = np.sqrt((X - skull[0]) ** 2 + (Y - skull[1]) ** 2 + (Z - skull[2]) ** 2)
horn = ball(skull, 0.42 * h, 0.05 * h) * sstep(0.72, 0.86, grey) * sstep(0.08, 0.2, lum())
reach = out[OK & (horn > 0.5)]
near, far = (float(np.quantile(reach, 0.05)), float(np.quantile(reach, 0.95))) if reach.size else (0.0, 1.0)
t = sstep(near, far, out)
ring = 0.86 + 0.14 * np.sin(out / (0.025 * h) * 2 * np.pi)
for k, (root, tip) in enumerate(zip(lin(${rgb('#2e221b')}), lin(${rgb('#dccca6')}))):
    c = (root + (tip - root) * t ** 1.6) * ring * (0.75 + 0.25 * DETAIL)
    RGB[..., k] = RGB[..., k] * (1 - horn) + c * horn
print('horn', float(horn[OK].mean()), 'root to tip', round(near, 3), round(far, 3))
# 3. Roughness: scales catch light on their crowns (paler = smoother), belly plates waxy, wing
# leather matt, horn and claws polished.
ROUGH[:] = np.clip(0.62 - 0.22 * (DETAIL - 1) + 0.08 * (fbm(0.1 * h, ${SEED.scales}) - 0.5), 0.38, 0.8)
plate = sstep(0.25, 0.45, lum()) * sstep(0.3, 0.5, grey) * (1 - wing) * (1 - horn)
rough(plate, 0.5)
rough(wing, 0.78)
rough(horn, 0.42 - 0.12 * t)
claw = (Z < 0.09 * h) * (1 - sstep(0.03, 0.08, lum()))
rough(claw, 0.3)
# 4. Soot: round the mouth and nostrils, fading down the throat and up to the horn roots.
k = np.unravel_index(int(np.argmax(np.where(OK & (Z > ${head.head[2].toFixed(4)} - 0.3 * h) & (np.abs(Y) < 0.1 * h), X, -1e9))), X.shape)
muzzle = (float(X[k]) - 0.04 * h, 0.0, float(Z[k]))
soot = np.maximum(ball(muzzle, 0.1 * h, 0.2 * h), 0.7 * capsule(muzzle, ${py(offset(head.head, [0.05 * h, 0, -0.35 * h]))}, 0.1 * h, 0.14 * h))
soot = soot * (1 - wing) * (0.35 + 0.65 * sstep(0.3, 0.7, fbm(0.05 * h, ${SEED.soot})))
shade(soot * (1 - horn), 0.14)
shade(soot * horn, 0.6)
rough(soot, 0.9)
print('soot', muzzle, float(soot[OK].mean()))
# 5. Dust: feet and shanks, the underside of the belly and the tail that drags.
edge = Z + 0.2 * h * (fbm(0.08 * h, ${SEED.dust}) - 0.5)
low = 1 - sstep(0.06 * h, 0.22 * h, edge)
drag = (X < ${bone('tail_1').tail[0].toFixed(4)}) * (1 - sstep(0.1 * h, 0.3 * h, edge))
speck = sstep(0.6, 0.68, fbm(0.03 * h, ${SEED.dust + 3}, 3)) * (1 - sstep(0.3 * h, 0.6 * h, Z))
dust = np.clip(np.maximum(np.maximum(low, drag), 0.8 * speck), 0, 1) * (1 - wing)
print('dust', paint(dust * 0.62 * (1 - 0.7 * claw), ${rgb('#a39274')}, keep=0.75, value=0.93))
# 6. Scars across the right flank: pale, smooth, a dark lip.
for k, at in enumerate(${`[${scars.map(py).join(', ')}]`}):
    n = (0.8, 0.0, 0.6)
    lip = slab(at, n, 0.02 * h, (0.2 - 0.03 * k) * h, 0.006 * h, ${SEED.scar} + k) * (Y < 0) * (1 - wing)
    cut = slab(at, n, 0.009 * h, (0.19 - 0.03 * k) * h, 0.006 * h, ${SEED.scar} + k) * (Y < 0) * (1 - wing)
    shade(lip, 0.5)
    print('rake', paint(cut, ${rgb('#c9a08c')}, keep=0.2, value=0.4))
# 7. Wing leather: scuffed pale in streaks along the span, darker and thin toward the hem.
streak = sstep(0.55, 0.75, 0.5 * vnoise(0.03 * h, ${SEED.wing}, (8, 8, 1)) + 0.5 * fbm(0.12 * h, ${SEED.wing + 1}))
print('scuff', paint(wing * streak * 0.55, ${rgb('#c4907c')}, keep=0.7, value=0.88))
`;
}
