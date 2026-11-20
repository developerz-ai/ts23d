// The bell's strip: weathered bell bronze (≈ 78 % copper, 22 % tin). Warm brown-gold metal under
// blotches of matte verdigris (the oxide painter makes oxide texels dielectric, so the green reads
// as crust, not as tinted metal). Vertex colour stays near-white so the strip's own colour shows;
// the recipe paints the rain-washed runs on top.

import { defineMaterial } from '@developerz.ai/ts23d';

export const BRONZE = defineMaterial({
  id: 'bell_bronze',
  kind: 'metal',
  scaleMetres: 0.5,
  roughness: 0.34,
  metalness: 1,
  albedo: '#c89a62',
  albedo2: '#5e9a80',
  params: { oxide: 0.4, relief: 1 },
  description: 'Weathered bell bronze: brown-gold metal under matte verdigris blotches.',
  sources: ['https://en.wikipedia.org/wiki/Bell_metal'],
});
