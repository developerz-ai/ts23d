// Butt or piano hinge, laid open flat: knuckles round a vertical pin on the Z axis, the fixed leaf
// to −Y, the swinging leaf to +Y. Pieces: `fixed` (leaf, even knuckles, pin caps) and `leaf` (odd
// knuckles) which sways 90° about the pin when `swing` is on. Origin = pin bottom.
// Real butt hinge: 75–100 mm tall, 2–2.5 mm leaves; piano hinge: 1–2 m long, 1 mm leaves.

import { box, cylinder, definePart, type Mesh, merge, type PartPiece } from '@developerz.ai/ts23d';
import { BRASS } from './shape.ts';

export const hinge = definePart({
  name: 'hinge',
  description: 'butt or piano hinge, open flat; the +Y leaf swings about the pin',
  tags: ['hardware', 'door', 'moving'],
  params: {
    style: 'butt' as 'butt' | 'piano',
    height: 0.1,
    leafWidth: 0.035,
    thickness: 0.0025,
    swing: true,
  },
  schema: {
    style: { oneOf: ['butt', 'piano'], doc: 'butt: 3–5 knuckles; piano: one knuckle per ~4 cm' },
    height: { min: 0.03, max: 3, unit: 'm', doc: 'length along the pin' },
    leafWidth: { min: 0.01, max: 0.2, unit: 'm', doc: 'each leaf, pin centre to edge' },
    thickness: { min: 0.0008, max: 0.008, unit: 'm' },
    swing: { doc: 'bake a 90° one-way sway on the leaf' },
  },
  build(b, p) {
    const knuckles = p.style === 'butt' ? 5 : Math.max(3, Math.round(p.height / 0.04) | 1);
    const kr = p.thickness * 1.6;
    const kl = p.height / knuckles;
    const seg = b.pick([12, 8, 6]);
    const gap = Math.min(0.0005, kl * 0.05);
    const fixed: Mesh[] = [];
    const leaf: Mesh[] = [];
    for (let i = 0; i < knuckles; i++) {
      const k = cylinder({
        radius: kr,
        length: kl - gap,
        at: [0, 0, (i + 0.5) * kl],
        segments: seg,
        color: BRASS,
        strip: 'brass',
      });
      (i % 2 === 0 ? fixed : leaf).push(k);
    }
    const plate = (side: number): Mesh =>
      box({
        size: [p.thickness, p.leafWidth - kr * 0.6, p.height],
        at: [0, side * (kr * 0.6 + (p.leafWidth - kr * 0.6) / 2), 0],
        color: BRASS,
        strip: 'brass',
        bevel: b.lod === 0 ? p.thickness * 0.3 : 0,
      });
    fixed.push(plate(-1));
    leaf.push(plate(1));
    if (b.lod === 0) {
      const cap = (z: number) =>
        cylinder({
          radius: kr * 0.9,
          length: 0.002,
          at: [0, 0, z],
          segments: seg,
          color: BRASS,
          strip: 'brass',
        });
      fixed.push(cap(-0.001 + 0.0002), cap(p.height + 0.001 - 0.0002));
    }
    const pieces: PartPiece[] = [
      { name: 'fixed', mesh: merge(fixed) },
      {
        name: 'leaf',
        mesh: merge(leaf),
        // The knuckles interleave round one pin: the leaf turns inside the fixed knuckles' gaps.
        clearOf: ['fixed'],
        ...(p.swing
          ? {
              motion: {
                kind: 'sway',
                axis: [0, 0, 1],
                degrees: 90,
                hz: 0.25,
                oneWay: true,
              } as const,
            }
          : {}),
      },
    ];
    return pieces;
  },
});
