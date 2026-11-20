// LOD levels of the face busts' skin: the ONE place the face library decimates. The skin is the
// imported CC0 MakeHuman hm08 base mesh (base.ts, base/LICENSE.md), warped, painted and sawn off
// with flat caps: nothing in it is code-built geometry, so ADR 011 lets it be QEM-simplified
// (hair, eyes, teeth and the plinth are code-built and stay LOD-gated by cell and segment
// counts). The base is not a GLB, so base.ts decodes it instead of `importGlb`; its provenance
// passes the same licence gate here (`checkLicence`: CC0, author and source declared).
//
// Why QEM and not the base's own levels: the base has one level (5.7k quads). One Catmull–Clark
// step is 40k triangles, most of them on the chest and shoulders where a quad is already flat;
// QEM keeps the edges where the surface bends (lids, nostrils, lips, ear rims) and thins the rest.

import { checkLicence, type ImportCredit, type Mesh, simplify } from '@developerz.ai/ts23d';
import { BASE_SOURCE } from './base.ts';

/** The base mesh's credit, as an import declares it. */
export const BASE_CREDIT: ImportCredit = {
  license: 'CC0-1.0',
  author: 'MakeHuman community (hm08 base mesh; Data Collection AB, Joel Palmius, Jonas Hauquier)',
  url: BASE_SOURCE.url,
};

/** Skin triangles per LOD: LOD0 from the subdivided base, LOD1 and LOD2 from the base itself. */
export const SKIN_TRIS = [25300, 5360, 920] as const;

/** The painted, shaded skin at `lod`: QEM-simplified to SKIN_TRIS (vertex colour weighs in the
 *  error, so the lips, brows and lid lines keep their edges). */
export function baseLod(skin: Mesh, lod: number): Mesh {
  checkLicence(BASE_CREDIT);
  return simplify(skin, { targetTris: SKIN_TRIS[lod] ?? 1000 }).mesh;
}
