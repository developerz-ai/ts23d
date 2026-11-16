// What each triangle IS to the path tracer: plain glTF PBR, a cutout foliage card (two-sided
// diffuse), a cutout hair/fur card (strand lobes), a thin see-through surface, or skin (Burley
// diffusion). Skin is a finish named `skin` / `skin_*` anywhere, and on characters and creatures
// also every plain opaque part whose name is not a hard or worn thing (eyes, claws, teeth, armour,
// cloth, plinth…). Hair is any cutout card on a character or creature.

import { type CompiledAsset, type Part, worldMeshes } from '../../core/index.ts';

export const CLS = { pbr: 0, foliage: 1, hair: 2, thin: 3, skin: 4 } as const;

/** Parts that are never skin even on a creature: hard, worn or wet things. */
const NOT_SKIN =
  /eye|iris|pupil|cornea|lens|claw|nail|tooth|teeth|tusk|horn|hoof|beak|armou?r|plate|helm|metal|plinth|base|stand|jewel|brooch|ring|chain|strap|buckle|belt|cloth|shirt|coat|tunic|robe|collar|hood|boot|glove|weapon|sword|axe|shield|bone|wood|stone|hair|fur|brow|lash|beard|garment|sleeve|scarf|cape|mantle|pauldron|spike|harness|necklace/;

/** A finish name that opts a part into skin shading (and the export's diffuse transmission). */
export const SKIN_FINISH = /^skin(_|$)/;

const living = (kind: string): boolean => kind === 'character' || kind === 'creature';

export function partClass(kind: string, p: Part): number {
  const s = p.surface ?? 'opaque';
  if (s === 'cutout') return living(kind) ? CLS.hair : CLS.foliage;
  if (s !== 'opaque') return CLS.thin;
  if (p.finish !== undefined && SKIN_FINISH.test(p.finish)) return CLS.skin;
  const plain = p.finish === undefined && p.paint === undefined;
  return living(kind) && plain && !NOT_SKIN.test(p.name) ? CLS.skin : CLS.pbr;
}

/** Class per triangle, in sceneOf's order (worldMeshes iteration, part by part). */
export function triangleClasses(asset: CompiledAsset, triangles: number): Uint8Array {
  const out = new Uint8Array(triangles);
  const byName = new Map(asset.parts.map((p) => [p.name, p]));
  let t = 0;
  for (const [name, m] of worldMeshes(asset.parts)) {
    const p = byName.get(name);
    const n = m.indices.length / 3;
    out.fill(p ? partClass(asset.kind, p) : CLS.pbr, t, t + n);
    t += n;
  }
  return out;
}
