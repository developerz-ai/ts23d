// Human outfit, sculpted into the bust like a collectible statue: the torso below the neckline
// painted as a blue tunic with fold creases, a standing leather collar rolled round the neck seam,
// a red mantle over the shoulders and back (the torso pushed out 16 mm in that region, a hemmed
// lip at its edge), and a brass brooch at the left collarbone (its own part, on `brass`).

import type { Field, SculptEdit } from '@developerz.ai/ts23d';
import { chain, creaseOn, onCurve, type Surface, spline, type V } from '../kit.ts';
import { baseZ, garment, neckSeam } from '../torso.ts';
import { C, H, L, TORSO } from './spec.ts';

export function outfitEdits(body: Field, skin: Surface, lod: number): SculptEdit[] {
  const seam = neckSeam(L);
  const box: [V, V] = [
    [-0.3, -0.35, 0],
    [0.3, 0.35, L.mz + 0.02],
  ];
  const out: SculptEdit[] = [];
  // Tunic: paint everything below the seam.
  out.push({
    field: (p) =>
      Math.max(
        Math.min(seam.field(p) + 0.004, 0.072 - Math.hypot(p[0] - seam.at[0], p[1])),
        p[2] - (L.mz - 0.12 * H),
      ),
    bounds: box,
    op: 'paint',
    blend: 0.002,
    color: C.tunic,
  });
  // Mantle: over the shoulders and down the back, open over the chest.
  out.push({
    field: garment(body, 0.016, mantleRegion, baseZ(TORSO)),
    bounds: box,
    color: C.mantle,
    // A hemmed edge: the mantle's lip meets the tunic in a soft fillet, not a knife-cut step.
    blend: 0.02,
  });
  // Collar: a leather roll round the seam (it also hides the head/bust split).
  const ring = collarRing(skin.field);
  out.push(
    chain([...ring, ring[0] ?? seam.at], 0.0085, { color: C.leather, join: 0.004, mirror: false }),
  );
  if (lod < 2)
    for (const fold of tunicFolds())
      out.push(creaseOn(skin, fold, 0.004, 0.0025, { color: C.tunicDark }));
  return out;
}

/** Mantle: over the shoulders and down the back, open over the chest (≤ 0 inside). */
export const mantleRegion: Field = (p) =>
  Math.max(
    L.mz - 0.95 * H - p[2],
    Math.min(p[0] - (L.gx - 0.33 * H), 0.125 - Math.abs(p[1])),
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
        seam.at[0] + 0.075 * Math.cos(a),
        0.075 * Math.sin(a),
        seam.at[2] - 0.3 * 0.075 * Math.cos(a),
      ];
    }),
  );
}

/** Tunic fold lines under the collar (left half, mirrored). */
export function tunicFolds(): V[][] {
  const seam = neckSeam(L);
  return [
    [0.05, 0],
    [0.085, 0.025],
  ].map(([y = 0, dz = 0]) =>
    spline(
      [
        [L.gx - 0.15 * H, y + 0.04, seam.at[2] - 0.02 - dz],
        [L.gx - 0.08 * H, y + 0.015, seam.at[2] - 0.06 - dz],
        [L.gx - 0.06 * H, y, seam.at[2] - 0.11 - dz],
      ],
      6,
    ),
  );
}

/** The brooch pinning the mantle at the left collarbone. */
export function brooch(skin: Surface): SculptEdit[] {
  const seam = neckSeam(L);
  const at = skin.off([L.gx - 0.12 * H, 0.08, seam.at[2] - 0.035], 0.008);
  return [
    { shape: 'torus', at, size: [0.012, 0.0035], rotate: [0, 70, 0] },
    { shape: 'sphere', at, size: 0.0065 },
  ];
}
