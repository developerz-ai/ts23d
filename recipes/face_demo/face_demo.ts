// Five busts from ONE anatomical base mesh: the MakeHuman hm08 head (CC0) warped by named
// landmarks (thin-plate spline, `tpsWarp`) into a human, an orc, an elf, a dwarf and a goblin —
// race presets declared as ratios against the measured human (recipes/_lib/face/races.ts), per
// character age / weight / seeded asymmetry. Base topology survives every warp, so the faces keep
// clean edge loops round eyes and mouth and have no blob seams. Dossier: recipes/face_demo/README.md.

import { type Asset, defineAsset } from '@developerz.ai/ts23d';
import { buildFaceBust, type FaceBust } from '../_lib/face/bust.ts';
import { faceCreases } from '../_lib/face/creases.ts';
import { CHARACTERS } from './characters.ts';

/** Overall size as built (L × W × H, metres): an invented character's design spec. */
const SIZE: Record<string, readonly [number, number, number]> = {
  human: [0.282, 0.461, 0.512],
  orc: [0.316, 0.552, 0.565],
  elf: [0.283, 0.443, 0.517],
  dwarf: [0.297, 0.519, 0.522],
  goblin: [0.259, 0.372, 0.443],
};

function faceBust(name: string, race: string, b: FaceBust, eyeSpacing: number): Asset {
  const [length, width, height] = SIZE[race] ?? [0, 0, 0];
  return defineAsset({
    name,
    kind: 'character',
    description: `${race} bust warped from the CC0 MakeHuman base head by landmarks: natural forms, clean edge loops, code eyes, sculpted hair`,
    tags: ['character', 'fantasy', race, 'bust', 'warp', 'face'],
    license: 'CC0-1.0',
    sources: [
      'recipes/face_demo/README.md (design dossier)',
      'docs/research/face-base.md (base mesh licence, landmarks, race ratios)',
      'MakeHuman hm08 base mesh, CC0 1.0 (makehumancommunity/makehuman @3c701a8, sha256 8e761e66…)',
    ],
    real: {
      length,
      width,
      height,
      measures: [
        {
          label: 'eye spacing (pupil to pupil)',
          value: eyeSpacing,
          axis: 'y',
          between: ['eye_l', 'eye_r'],
          source: 'base IPD 61.6 mm (MakeHuman hm08) × race eye spacing × head scale',
        },
      ],
    },
    // LOD0 is one Catmull–Clark level over the 5.7k-quad base plus sculpted hair (the dwarf's
    // beard is the heaviest); LOD1 the base topology itself; LOD2 a 1.4 cm re-mesh.
    budget: { triangles: [160000, 66000, 13000] },
    finishes: { cornea: { clearcoat: 1, clearcoatRoughness: 0.04 } },
    art: { focal: 'skin' },
    // Intended folds (lids, lips, ears, hair locks) from the same warped landmarks and lines.
    creases: faceCreases(b),
    build(ctx) {
      buildFaceBust(ctx, b);
    },
  });
}

const ipd = (b: FaceBust): number =>
  0.0616 * b.character.race.eyes.spacing * b.character.race.scale;

export const face_human = faceBust('face_human', 'human', CHARACTERS.human, ipd(CHARACTERS.human));
export const face_orc = faceBust('face_orc', 'orc', CHARACTERS.orc, ipd(CHARACTERS.orc));
export const face_elf = faceBust('face_elf', 'elf', CHARACTERS.elf, ipd(CHARACTERS.elf));
export const face_dwarf = faceBust('face_dwarf', 'dwarf', CHARACTERS.dwarf, ipd(CHARACTERS.dwarf));
export const face_goblin = faceBust(
  'face_goblin',
  'goblin',
  CHARACTERS.goblin,
  ipd(CHARACTERS.goblin),
);
