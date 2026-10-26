// Foliage cell dispatch: FoliageCellId → painter. Each paints colour + alpha mask (cutout leaf
// cards), anchor at the cell's bottom-centre, growth toward +V.

import type { FoliageCellId } from '../trim-sheet.ts';
import type { Canvas } from './canvas.ts';
import { paintBirch, paintBroadleaf, paintMaple, paintMapleAutumn } from './foliage-broad.ts';
import { paintAcacia, paintPalm, paintWillow } from './foliage-compound.ts';
import { paintNeedles, paintReeds, paintSpruce, paintSpruceSnow } from './foliage-conifer.ts';

export const FOLIAGE_PAINTERS: Readonly<Record<FoliageCellId, (c: Canvas, seed: number) => void>> =
  {
    foliage_broadleaf: paintBroadleaf,
    foliage_maple: paintMaple,
    foliage_maple_autumn: paintMapleAutumn,
    foliage_birch: paintBirch,
    foliage_acacia: paintAcacia,
    foliage_palm: paintPalm,
    foliage_spruce: paintSpruce,
    foliage_spruce_snow: paintSpruceSnow,
    foliage_willow: paintWillow,
    foliage_reeds: paintReeds,
    foliage_needles: paintNeedles,
  };
