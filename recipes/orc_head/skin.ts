// Orc skin: the shared bust skin mesher (../_lib/bust/skin.ts) with the orc's painted palette and
// an 8 mm curvature stencil (the 0.30 m skull's mesh field rings in the default 4 mm one) and a
// pore-scale speckle: the weathered hide's colour breakup.

import type { Mesh, SculptEdit } from '@developerz.ai/ts23d';
import { skinMesh as bustSkin, type SkinOptions } from '../_lib/bust/skin.ts';
import { C } from './palette.ts';

export const ORC_TONE = { skin: C.skin, warm: C.skinWarm, cool: C.skinCool, cavity: C.cavity };

export function skinMesh(
  edits: readonly SculptEdit[],
  cell: number,
  o: Omit<SkinOptions, 'tone'>,
): Mesh {
  return bustSkin(edits, cell, { tone: ORC_TONE, stencil: 0.008, speckle: 0.22, ...o });
}
