// The shark's skin strip: near-white so vertex colour sets the hue, a fine dermal-denticle tooth.

import { defineMaterial } from '@developerz.ai/ts23d';

export const SKIN = defineMaterial({
  id: 'shark_skin',
  kind: 'noise',
  scaleMetres: 3,
  roughness: 0.58,
  albedo: '#ececec',
  params: { tone: 0.96, mottle: 0.1, relief: 0.0003 },
  description: 'Shark skin: matte, faintly toothed by dermal denticles (vertex colour tints).',
});
