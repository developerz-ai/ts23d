// The face (head-local frame: level skull, origin at the atlas, +X along the skull, left = +Y),
// sculpted like a portrait in stages on a big-cat skull:
//   planes     a broad flat forehead, the nose bridge sloping to the nose, the muzzle's front plane
//   features   brow ridges shading the eyes, sunken orbits with lids that follow the eyeball (the
//              shared bust eye kit), the cheekbone (zygomatic) ridge, the whisker pads as two
//              domes either side of the philtrum, the triangular nose leather with flared nostrils,
//              the upper lip draping into the flews, the sagittal line on the crown
//   creases    the stop between brow and bridge, the nose-pad fold, the lip line

import type { SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { type EyeSpec, lidEdits } from '../_lib/bust/eye.ts';
import { skin } from '../_lib/creature/skin.ts';
import { C } from './palette.ts';
import { HEAD } from './skeleton.ts';

const E = HEAD.eye;
const N = HEAD.nose;
const M = HEAD.mouthZ;

/** The eye spec shared by the lids (here) and the eyeballs (eyes.ts). */
export const EYE: EyeSpec = {
  centre: E,
  r: HEAD.eyeR,
  // A cat's iris fills nearly all of the visible eye.
  iris: HEAD.eyeR * 0.86,
  upper: 0.15,
  lower: 0.08,
  lid: 0.0026,
  tilt: 14,
  scowl: 6,
  gaze: [1.6, 0, 0.0],
  pupil: 'round',
  colours: {
    sclera: C.sclera,
    iris: C.iris,
    pupil: C.pupil,
    limbus: C.irisRim,
    wet: C.lip,
    caruncle: C.lip,
  },
};

/** Planes: the broad forehead, the bridge, the muzzle front. */
export function facePlanes(): SculptEdit[] {
  return [
    // Forehead: broad and flat between the ears, sloping to the stop.
    {
      shape: 'roundBox',
      at: [0.12, 0, 0.255],
      size: [0.36, 0.3, 0.12],
      rotate: [0, 12, 0],
      round: 0.02,
      op: 'subtract',
      blend: 0.05,
    },
    // Cheek planes: the sides of the muzzle, shaved so the face reads as a wedge from above.
    {
      shape: 'roundBox',
      at: [0.31, 0.16, 0.0],
      size: [0.2, 0.08, 0.2],
      rotate: [0, 0, -14],
      op: 'subtract',
      blend: 0.035,
    },
  ];
}

/** Features of the upper face. */
export function faceFeatures(lod: number): SculptEdit[] {
  const out: SculptEdit[] = [
    // Nose bridge: a broad flat ridge from the stop to the nose leather.
    {
      shape: 'capsule',
      at: [0.2, 0.016, 0.083],
      to: [0.296, 0.013, 0.045],
      size: 0.026,
      blend: 0.045,
    },
    // Whisker pads: two domes either side of the philtrum, the muzzle's signature shape.
    {
      shape: 'ellipsoid',
      at: [0.288, 0.042, -0.032],
      size: [0.05, 0.05, 0.035],
      rotate: [0, 0, 12],
      blend: 0.022,
    },
    // Nose leather: a broad triangular pad on the tip.
    {
      shape: 'ellipsoid',
      at: [N[0] - 0.006, 0, N[2] + 0.004],
      size: [0.022, 0.04, 0.024],
      blend: 0.014,
      color: C.nose,
    },
    // Nostrils: bored outward and down at the sides of the pad.
    {
      shape: 'ellipsoid',
      at: [N[0] + 0.004, 0.017, N[2] - 0.006],
      size: [0.008, 0.007, 0.005],
      rotate: [0, 0, 35],
      op: 'subtract',
      blend: 0.004,
      color: C.noseRim,
    },
    // Brow ridge over the eye: the supraorbital shelf that shades it.
    skin(
      [
        { at: [E[0] + 0.022, E[1] - 0.026, E[2] + 0.026], r: 0.012 },
        { at: [E[0] + 0.002, E[1] + 0.002, E[2] + 0.03], r: 0.017 },
        { at: [E[0] - 0.03, E[1] + 0.022, E[2] + 0.024], r: 0.016 },
      ],
      { blend: 0.022 },
    ),
    // Cheekbone (zygomatic arch): under and behind the eye toward the ear.
    skin(
      [
        { at: [E[0] - 0.005, E[1] + 0.02, E[2] - 0.035], r: 0.016 },
        { at: [0.15, 0.092, 0.0], r: 0.024 },
        { at: [0.09, 0.098, 0.01], r: 0.024 },
      ],
      { blend: 0.03 },
    ),
    // Upper lip and flews: drape from the philtrum down and back to the mouth corner.
    skin(
      [
        { at: [N[0] - 0.006, 0.006, M + 0.022], r: 0.008 },
        { at: [0.3, 0.034, M - 0.004], r: 0.013 },
        { at: [0.26, 0.052, M - 0.016], r: 0.014 },
        { at: [0.2, 0.058, M - 0.01], r: 0.012 },
        { at: [0.16, 0.054, M + 0.004], r: 0.01 },
      ],
      { blend: 0.012, color: C.lip },
    ),
    // Eye socket: sunk round the ball, then the lids wrap it (bust eye kit).
    {
      shape: 'sphere',
      at: [E[0] + 0.004, E[1], E[2]],
      size: HEAD.eyeR * 1.15,
      op: 'subtract',
      blend: 0.006,
      color: C.lip,
    },
    ...lidEdits(EYE),
  ];
  if (lod < 2)
    out.push(
      // Sagittal line: a low crest down the crown under the fur (Mazák: 27–46 mm in old males).
      { shape: 'capsule', at: [0.02, 0, 0.15], to: [0.16, 0, 0.15], size: 0.018, blend: 0.04 },
      // Philtrum: the groove from the nose to the lip.
      {
        shape: 'capsule',
        at: [N[0] + 0.004, 0, N[2] - 0.018],
        to: [N[0] - 0.004, 0, M + 0.012],
        size: 0.0035,
        op: 'subtract',
        blend: 0.004,
        color: C.lip,
      },
    );
  return out;
}

/** Whisker spots on the pads: 4 rows, dark follicle dots (painted as tiny dimples at LOD0). */
export function whiskerSpots(): Vec3[] {
  const out: Vec3[] = [];
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 5 - (row === 0 ? 1 : 0); i++) {
      const x = 0.272 + i * 0.011 - row * 0.004;
      const z = -0.016 - row * 0.01 - i * 0.002;
      out.push([x, 0.06 - i * 0.005 - row * 0.001, z]);
    }
  return out;
}
