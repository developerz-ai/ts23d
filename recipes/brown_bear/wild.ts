// The boar bear's season (`Wild`, recipes/_lib/creature/wild.ts): river mud, wet fur, the rubbed
// shoulder, fight scars, matted flanks, the face's colour and the LOD2 colour blocks.

import { dmath, hex, type Vec3 } from '@developerz.ai/ts23d';
import type { Wild } from '../_lib/creature/wild.ts';
import { mix, smooth } from '../_lib/creature/wild-paint.ts';
import { bearGroom } from './groom.ts';
import { BEAR } from './spec.ts';

/**
 * A boar bear at the end of the salmon run: river mud to the elbows and hocks and smeared along
 * the belly, wet fur above it, the shoulder rubbed pale and thin on its marking tree, old fight
 * scars raked across the muzzle and the right shoulder, the coat on the flanks and breeches
 * matted. The coat itself is groom.ts.
 */
export const BEAR_WILD: Wild = {
  wear: (info) => {
    const H = info.bones.height;
    const fore = info.bones.legs.find((x) => x.name === 'fore');
    const hind = info.bones.legs.find((x) => x.name === 'hind');
    const shoulder = fore?.joints[0] ?? [0.82, 0.19, 0.7];
    const hip = hind?.joints[0] ?? [-0.53, 0.19, 0.85];
    const l = info.head;
    const muzzle = l.L - l.lc;
    const h = info.bones.head;
    const [c, s] = [dmath.cos(h.pitch), dmath.sin(h.pitch)];
    const onHead = (p: readonly [number, number, number]): [number, number, number] => [
      h.atlas[0] + c * p[0] + s * p[2],
      h.atlas[1] + p[1],
      h.atlas[2] - s * p[0] + c * p[2],
    ];
    const side = -(shoulder[1] + 0.12);
    return {
      seed: 36341,
      // Old scars on a dark coat: the fur parted to the dark grey-brown skin along each rake, a
      // shade under the coat (a grey-pink #a98678 read as pale painted bars on the chest).
      scarColour: hex('#4a3a31'),
      // River clay: wet and near-black on the paws, drying to a dark grey-brown up the forearms
      // and shanks, splashed to the belly fringe. Darker than the legs' own brown at its edge: a
      // paler clay on these near-black legs read as chalky blotches.
      mud: { top: H * 0.34, colour: hex('#4e4034'), strength: 0.9 },
      // Wet, matted fur up the legs and along the belly fringe.
      damp: { top: H * 0.42, belly: H * 0.6, strength: 0.55 },
      matted: {
        zones: [
          { at: [(shoulder[0] + hip[0]) / 2, 0.25, H * 0.62], radius: H * 0.3 },
          { at: [hip[0] - 0.05, 0.25, H * 0.6], radius: H * 0.28 },
        ],
        strength: 0.7,
        width: 0.03,
      },
      patches: [
        // Rubbed on the marking tree: guard hair broken off, the warmer underfur showing through
        // it, blended into the coat (a pale flat disc read as a hole in the texture).
        {
          at: [shoulder[0] - 0.02, side, shoulder[2] + 0.16],
          radius: 0.3,
          colour: hex('#8c6c4a'),
          strength: 0.5,
        },
        // River mud smeared along the belly and up the brisket where it lay in the shallows.
        {
          at: [(shoulder[0] + hip[0]) / 2, 0, H * 0.4],
          radius: H * 0.32,
          colour: hex('#2e2419'),
          strength: 0.7,
        },
      ],
      scars: [
        {
          a: [shoulder[0] + 0.16, side, shoulder[2] + 0.02],
          b: [shoulder[0] - 0.04, side, shoulder[2] - 0.16],
          width: 0.02,
          axis: 1,
          reach: 0.14,
        },
        {
          a: [shoulder[0] + 0.2, side, shoulder[2] - 0.05],
          b: [shoulder[0] + 0.04, side, shoulder[2] - 0.2],
          width: 0.015,
          axis: 1,
          reach: 0.14,
        },
        {
          a: onHead([l.lc + muzzle * 0.05, -l.rt * 0.9, l.zt + l.rt]),
          b: onHead([l.lc + muzzle * 0.75, -l.rt * 0.25, l.zt + l.rt]),
          width: 0.008,
          axis: 2,
          reach: 0.07,
        },
        {
          a: onHead([l.lc + muzzle * 0.0, -l.rt * 0.45, l.zt + l.rt]),
          b: onHead([l.lc + muzzle * 0.5, l.rt * 0.1, l.zt + l.rt]),
          width: 0.008,
          axis: 2,
          reach: 0.07,
        },
      ],
    };
  },
  base: (info) => {
    const H = info.bones.height;
    const col = BEAR.colours;
    const [back, belly, legs] = [col.back ?? col.coat, col.belly ?? col.coat, col.legs ?? col.coat];
    const h = info.bones.head;
    const [cs, sn] = [dmath.cos(h.pitch), dmath.sin(h.pitch)];
    const lc = info.head.lc;
    return ({ p, n, c, lod, part }) => {
      if (part === 'head' || part === 'jaw' || part === 'head_fur') {
        // The face is the coat's brown; only the muzzle is paler (the kind's pale cheek and
        // brow zones made the whole head one tan). Head-local x: along the skull from the atlas.
        const d: Vec3 = [p[0] - h.atlas[0], p[1] - h.atlas[1], p[2] - h.atlas[2]];
        const x = cs * d[0] - sn * d[2];
        const lum = (c[0] + c[1] + c[2]) / 3;
        // Leather (nose, lips, eye rims) and the ears' dark hollows stay as painted.
        const fur = smooth(0.03, 0.08, lum);
        const face = fur * smooth(lc * 1.02, lc * 0.82, x);
        const k = mix(c, [col.coat[0] * 0.92, col.coat[1] * 0.9, col.coat[2] * 0.88], face * 0.75);
        // The muzzle, bridge included, is the paler tan a brown bear's face shows.
        return mix(k, col.muzzle ?? col.coat, fur * smooth(lc * 0.98, lc * 1.12, x) * 0.7);
      }
      if (lod !== 2 || part !== 'body') return c;
      // The far mesh's cells are 16 cm: the sculpt's per-vertex tone lands as angular light and
      // dark patches. Its coat is the bear's blocks: the grizzled back and hump, brown flanks,
      // the darker underside, near-black legs from the elbow and stifle down.
      let k = mix(col.coat, back, smooth(0.1, 0.6, n[2]) * smooth(H * 0.78, H * 0.92, p[2]));
      k = mix(k, belly, smooth(-0.1, -0.6, n[2]));
      const leg = smooth(H * 0.58, H * 0.4, p[2]) * smooth(0.05, 0.12, Math.abs(p[1]));
      k = mix(k, [legs[0] * 0.6, legs[1] * 0.6, legs[2] * 0.6], leg);
      return mix(k, c, 0.08);
    };
  },
  groom: bearGroom,
  // The groom's locks carry the wear: clotted short in the river clay, parted to the skin along
  // the scars (matted locks stay full length: shortened, they stood off the coat as dark stubs).
  cardWear: { mud: 0.5, scar: 0.12 },
  // Locks 6 cm across (2.5 body cells), along the coat's lie, under the cards.
  locks: { size: 0.06, strength: 0.45, seed: 36341 },
  // The cards back at the coat's value in the path-traced hero: the strand texture averages
  // about 0.9, and the guard hairs are painted darker than the skin (D481; the renderer's own
  // part, strand shading at 0.7 of a matte surface, is fixed in D476).
  cardLift: 1.45,
  // Grizzled tips: the pale sheen a brown bear's coat shows against the light.
  sheen: [0.09, 0.07, 0.05],
};
