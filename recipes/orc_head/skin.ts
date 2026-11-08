// Orc skin: the shared bust skin mesher (../_lib/bust/skin.ts) with the orc's painted palette.

import type { Mesh, SculptEdit } from '@developerz.ai/ts23d';
import { skinMesh as bustSkin, type SkinOptions } from '../_lib/bust/skin.ts';
import { C } from './palette.ts';

export const ORC_TONE = { skin: C.skin, warm: C.skinWarm, cool: C.skinCool, cavity: C.cavity };

export function skinMesh(
  edits: readonly SculptEdit[],
  cell: number,
  o: Omit<SkinOptions, 'tone'>,
): Mesh {
  return bustSkin(edits, cell, { tone: ORC_TONE, ...o });
}
