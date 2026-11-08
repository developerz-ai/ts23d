// Elf outfit, sculpted on: a green tunic with gold-trimmed edges and a high collar rolled round the
// neck seam, and a teal cloak over the shoulders and back, its front edges trimmed gold; a silver
// leaf clasp at the throat (its own part).

import type { Field, SculptEdit } from '@developerz.ai/ts23d';
import { chain, onCurve, type Surface, type V } from '../_lib/bust/kit.ts';
import { baseZ, garment, neckSeam } from '../_lib/bust/torso.ts';
import { C, H, L, TORSO } from './spec.ts';

export function outfitEdits(body: Field, skin: Surface, _lod: number): SculptEdit[] {
  const seam = neckSeam(L);
  const box: [V, V] = [
    [-0.3, -0.35, 0],
    [0.3, 0.35, L.mz + 0.02],
  ];
  const plan = (p: V): number => Math.hypot(p[0] - seam.at[0], p[1]);
  const out: SculptEdit[] = [];
  out.push({
    field: (p) =>
      Math.max(Math.min(seam.field(p) + 0.004, 0.064 - plan(p)), p[2] - (L.mz - 0.12 * H)),
    bounds: box,
    op: 'paint',
    blend: 0.002,
    color: C.tunic,
  });
  out.push({
    field: garment(body, 0.012, cloakRegion, baseZ(TORSO)),
    bounds: box,
    color: C.cloak,
    // A hemmed edge: the cloak's lip meets the tunic in a soft fillet, not a knife-cut step.
    blend: 0.022,
  });
  // High collar: a tall rolled band round the seam.
  const ring = collarRing(skin.field);
  out.push(
    chain([...ring, ring[0] ?? seam.at], 0.0075, { color: C.trim, mirror: false, blend: 0.01 }),
  );
  out.push(
    chain(
      [...ring, ring[0] ?? seam.at].map((p): V => [p[0], p[1] * 1.04, p[2] + 0.012]),
      0.0065,
      // Blended into the gold roll below: one tall collar, not two tubes with a groove between.
      { color: C.tunic, mirror: false, blend: 0.01 },
    ),
  );
  return out;
}

/** The cloak: over the shoulders and back, open at the front (≤ 0 inside). */
export const cloakRegion: Field = (p) =>
  Math.max(
    L.mz - 1.0 * H - p[2],
    Math.min(p[0] - (L.gx - 0.36 * H), 0.11 - Math.abs(p[1])),
    neckSeam(L).field(p) + 0.01,
  );

/** The collar roll's centre line: the skin round the neck seam. */
export function collarRing(skin: Field): V[] {
  const seam = neckSeam(L);
  return onCurve(
    skin,
    seam.field,
    Array.from({ length: 28 }, (_, i): V => {
      const a = (i / 28) * Math.PI * 2;
      return [
        seam.at[0] + 0.065 * Math.cos(a),
        0.065 * Math.sin(a),
        seam.at[2] - 0.3 * 0.065 * Math.cos(a),
      ];
    }),
  );
}

/** A silver leaf clasp at the throat. */
export function clasp(skin: Surface): SculptEdit[] {
  const seam = neckSeam(L);
  const at = skin.off([L.gx - 0.12 * H, 0, seam.at[2] - 0.03], 0.004);
  return [
    { shape: 'ellipsoid', at, size: [0.004, 0.009, 0.016], rotate: [0, 0, 0] },
    {
      shape: 'capsule',
      at: [at[0] + 0.002, 0, at[2] - 0.014],
      to: [at[0] + 0.002, 0, at[2] + 0.014],
      size: 0.0015,
    },
  ];
}
