// Import demo: a "scanned" head brought in from a GLB and finished by ts23d — the hybrid answer to
// "we can never sculpt faces as well as a scan": import a licensed mesh (here a CC0 stand-in scan,
// ./scan.ts), clean it (weld, winding, holes, specks), QEM-simplify it to three LOD budgets, put
// its albedo into vertex colour on the shared trim sheet, and attach it with a checked neck joint
// to a code-built bust (torso, tunic, mantle, collar, brooch and plinth from the bust library).
// The own-texture path (baked albedo + normal map, one extra draw call) is `bun scripts/import.ts
// textured`. Dossier: ./README.md · design: docs/idea/21-import.md · ADR 011.

import { defineAsset } from '@developerz.ai/ts23d';
import { portrait } from '../_lib/bust/hero.ts';
import { skinFinish } from '../_lib/face/skin-strip.ts';
import { buildImportDemo } from './build.ts';
import { SCAN } from './source.ts';

export const import_demo = defineAsset({
  name: 'import_demo',
  kind: 'prop',
  description:
    'Hybrid bust: an imported, cleaned and QEM-simplified head scan (CC0 stand-in) on a code-built torso with tunic, mantle, collar and brooch, joined by a checked neck joint',
  tags: ['import', 'scan', 'bust', 'hybrid', 'lod'],
  license: 'CC0-1.0',
  sources: [
    'recipes/import_demo/README.md (pipeline, licence, how to swap in a real CC0 scan)',
    `import: ${SCAN.author} — ${SCAN.license} — ${SCAN.url}`,
  ],
  // A portrait: the bust fills the frame (the default orbit leaves the face a thumbnail).
  hero: portrait(0.554),
  finishes: {
    cornea: { clearcoat: 1, clearcoatRoughness: 0.04 },
    // The scan's skin: the pore strip's own roughness under a soft grazing sheen.
    skin: skinFinish('#8c7b72'),
  },
  // Inside the bust band (60k / 12k / 1.5k). Head 12k / 4k / 0.7k (source.ts) + torso and
  // outfit 12k / 4k / 0.6k + code eyes, collar, brooches, plinth. Draws: skin, corneas, the rest.
  budget: { triangles: [38000, 12000, 1500], draws: 3 },
  build(ctx) {
    buildImportDemo(ctx, 'sheet');
  },
});
