// Orc bust landmarks the torso, gear, hair and plinth modules read (metres, Z up, +X front, left =
// +Y; right is the mirror). The head itself is the warped skull (spec.ts `SK`); the few head
// points here are its values (menton 0.284 → crown 0.585: H 0.30 m) for modules that cannot import
// the skull. The body: a neck leaning forward into trapezius that rise to the ears, deltoids,
// pectorals, the seam the fur collar hides, the bust cut on the plinth.

import type { V } from '../_lib/bust/kit.ts';

export const L = {
  // Head points from the skull (spec.ts SK): ear canal, mouth corner, chin front, chin bottom.
  ear: [0.018, 0.097, 0.426] as V,
  mouthCorner: [0.122, 0.046, 0.373] as V,
  chin: [0.156, 0, 0.306] as V,
  menton: [0.115, 0, 0.284] as V,
  // Neck: thick, leaning forward.
  neckBase: [-0.07, 0, 0.25] as V,
  neckTop: [-0.035, 0, 0.4] as V,
  neckR: 0.098,
  // Shoulder girdle.
  trapPeak: [-0.085, 0.085, 0.375] as V,
  acromion: [-0.03, 0.215, 0.31] as V,
  deltoid: [-0.005, 0.255, 0.255] as V,
  sternum: [0.085, 0, 0.25] as V,
  pec: [0.07, 0.092, 0.19] as V,
  // The hidden seam between the `head` and `bust` parts (under the fur collar and necklace):
  // keep 0.6·x + z ≥ seamZ for the head — high at the nape, under the massive jaw at the front.
  seamN: [0.6, 0, 1] as V,
  seamZ: 0.3,
  // Bust cut + plinth.
  cutZ: 0.115,
  plinthTop: 0.115,
};
