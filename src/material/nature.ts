// The nature library: eighteen ground, rock, vegetation, bark and liquid strips, each painted from
// a texture graph (`tex`) and laid out after the material library (trim-sheet.ts). Tint with
// `NATURAL`; derive wet/aged/worn looks with `weathered()` instead of new graphs.

import type { MaterialDef } from './material-def.ts';
import { barkBirch, barkOak, barkPine } from './nature-bark.ts';
import { grass, gravel, ice, leafLitter, moss, mud, sand, snow, soil } from './nature-ground.ts';
import { asphalt, cliff, cobblestone, lava, rockStrata, water } from './nature-rock.ts';
import type { NatureStripId } from './strip-ids.ts';

type Library = Readonly<Record<NatureStripId, MaterialDef & { readonly id: NatureStripId }>>;
const as = <T extends MaterialDef>(
  d: T,
  id: NatureStripId,
): T & { readonly id: NatureStripId } => ({
  ...d,
  id,
});

export const NATURE_LIBRARY: Library = {
  sand: as(sand, 'sand'),
  soil: as(soil, 'soil'),
  gravel: as(gravel, 'gravel'),
  mud: as(mud, 'mud'),
  rock_strata: as(rockStrata, 'rock_strata'),
  cliff: as(cliff, 'cliff'),
  moss: as(moss, 'moss'),
  grass: as(grass, 'grass'),
  snow: as(snow, 'snow'),
  ice: as(ice, 'ice'),
  bark_oak: as(barkOak, 'bark_oak'),
  bark_pine: as(barkPine, 'bark_pine'),
  bark_birch: as(barkBirch, 'bark_birch'),
  leaf_litter: as(leafLitter, 'leaf_litter'),
  cobblestone: as(cobblestone, 'cobblestone'),
  asphalt: as(asphalt, 'asphalt'),
  water: as(water, 'water'),
  lava: as(lava, 'lava'),
};
