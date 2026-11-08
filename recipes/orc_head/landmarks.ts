// Orc bust landmarks: the one table every sculpt module reads (metres, Z up, +X front, left = +Y;
// right is the mirror). Head = chin (menton) 0.285 → crown 0.585: 0.30 m, ≈ 1.3 × a human head.
// Proportions follow the stylised fantasy-MMO orc idiom (see README): low sloped cranium, eye line
// high (0.57 of the head), face and jaw as the dominant mass, underbite, head carried low and
// forward between trapezius that rise to the ears.

import type { V } from '../_lib/bust/kit.ts';

export const HEAD_H = 0.3;

export const L = {
  // Cranium: an egg, bigger at the back, sides flattened (scrape) to the temple planes.
  cranium: { at: [-0.015, 0, 0.497] as V, r: [0.1, 0.09, 0.082] as V },
  occiput: { at: [-0.055, 0, 0.472] as V, r: 0.065 },
  crown: 0.585,
  temple: [0.045, 0.084, 0.49] as V,
  // Brow ridge bar: a shelf across the face just above the eyes, scowling down at the centre.
  glabella: [0.108, 0, 0.468] as V,
  browOuter: [0.07, 0.083, 0.482] as V,
  // Eyes: small, deep, close under the brow.
  eye: [0.074, 0.0465, 0.452] as V,
  eyeR: 0.0158,
  // Cheekbones (zygomatic body) and arch back to the ear.
  zygoma: [0.07, 0.078, 0.425] as V,
  zygion: [0.03, 0.099, 0.432] as V,
  // Ear: canal and root of the pointed ear.
  ear: [-0.03, 0.098, 0.43] as V,
  // Nose: broad, flat, upturned nostrils.
  noseRoot: [0.104, 0, 0.446] as V,
  noseTip: [0.142, 0, 0.402] as V,
  subnasale: [0.128, 0, 0.388] as V,
  ala: [0.118, 0.032, 0.395] as V,
  // Mouth: upper lip over a wide teeth cylinder; the lower jaw juts past it (underbite).
  mouth: [0.132, 0, 0.36] as V,
  mouthCorner: [0.098, 0.058, 0.358] as V,
  upperLip: [0.134, 0, 0.368] as V,
  lowerLip: [0.153, 0, 0.346] as V,
  teeth: { axis: [0.06, 0, 0.358] as V, r: 0.072 },
  // Chin: square, massive.
  chin: [0.142, 0, 0.305] as V,
  menton: [0.112, 0, 0.285] as V,
  // Jaw angle (gonion): wider than the temples, the head's widest bone.
  gonion: [-0.008, 0.118, 0.33] as V,
  // Neck: thick, leaning forward.
  neckBase: [-0.07, 0, 0.25] as V,
  neckTop: [-0.035, 0, 0.4] as V,
  neckR: 0.098,
  // Shoulder girdle.
  c7: [-0.095, 0, 0.37] as V,
  trapPeak: [-0.085, 0.085, 0.375] as V,
  acromion: [-0.03, 0.215, 0.31] as V,
  deltoid: [-0.005, 0.255, 0.255] as V,
  sternum: [0.085, 0, 0.25] as V,
  pec: [0.07, 0.092, 0.19] as V,
  // The hidden seam between the `head` and `bust` parts (under the fur collar): keep
  // 0.35·x + z ≥ seamZ for the head (higher at the back, under the chin at the front).
  seamN: [0.35, 0, 1] as V,
  seamZ: 0.318,
  // Bust cut + plinth.
  cutZ: 0.115,
  plinthTop: 0.115,
};
