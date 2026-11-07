// Head landmarks from params: where the cranium, eyes, brow, nose base, mouth, chin, jaw hinge and
// jaw angle sit, in head units (x front, y left, z up; z 0 = chin of an undropped jaw, x 0 ≈ ear
// canal). Every edit list reads this one table, so moving the eye line moves lids, brow and nose.

import type { Vec3 } from '../core/index.ts';
import type { HeadParams } from './head-params.ts';

export interface HeadLayout {
  /** Cranium ellipsoid centre and radii. */
  readonly cranium: { readonly at: Vec3; readonly r: Vec3 };
  /** Forehead front at the eye line. */
  readonly faceX: number;
  /** Left eye centre (mirror for the right) and eyeball radius. */
  readonly eye: Vec3;
  readonly eyeR: number;
  readonly browZ: number;
  readonly noseZ: number;
  readonly mouthZ: number;
  /** Front of the lips. */
  readonly mouthX: number;
  readonly chin: Vec3;
  /** Jaw hinge (x, z) — the jaw part's pivot. */
  readonly hinge: readonly [number, number];
  /** Left jaw angle (gonion). */
  readonly angle: Vec3;
  /** Top of the head, units. */
  readonly crown: number;
  /** Bottom of the bust (the asset's z = 0), units. */
  readonly base: number;
}

export function headLayout(p: HeadParams): HeadLayout {
  const L = p.eyes.line;
  const crH = p.cranium.height;
  const rx = p.cranium.depth / 2;
  const ry = p.cranium.width / 2;
  const rz = crH * 0.8;
  const cx = -0.02 - p.jaw.muzzle * 0.4;
  const cz = L + crH * 0.2;
  const faceX = cx + rx * 0.97;
  const jut = p.jaw.muzzle;
  const eyeR = p.eyes.radius;
  const eye: Vec3 = [faceX - eyeR - p.brow.overhang, p.eyes.spacing, L];
  const noseZ = L - p.nose.length;
  const mouthZ = noseZ - 0.1 - p.jaw.drop * 0.3;
  const chinZ = -p.jaw.drop;
  const mouthX = faceX - 0.01 + jut + p.jaw.underbite * 0.3;
  return {
    cranium: { at: [cx, 0, cz], r: [rx, ry, rz] },
    faceX,
    eye,
    eyeR,
    browZ: L + eyeR * 0.9 + p.brow.ridge * 0.6,
    noseZ,
    mouthZ,
    mouthX,
    chin: [faceX - 0.07 + jut + p.jaw.underbite, 0, chinZ + 0.07 * p.jaw.chin],
    hinge: [cx + 0.04, L - 0.09],
    angle: [cx - 0.02, p.jaw.width, 0.15 - p.jaw.drop * 0.6],
    crown: cz + rz,
    base: -0.85 - p.jaw.drop * 0.5,
  };
}
