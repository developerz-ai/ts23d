// The `mass` gate: an asset that declares `real.mass` must weigh that much (± `real.massTolerance`)
// when its geometry is filled with real densities. Runs only when a mass is declared, at LOD0.

import { massFindings, massProperties } from '../physics/index.ts';
import { codeOf, type Finding, type Gate } from './types.ts';

export const mass: Gate = (asset): Finding[] =>
  asset.lod === 0 && asset.real?.mass !== undefined
    ? massFindings(asset, massProperties(asset)).map((f) => ({
        ...f,
        code: codeOf(f.gate, f.message),
      }))
    : [];
