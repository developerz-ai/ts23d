// The cast letters' strip: polished brass, the sign-maker's finish that is buffed bright on the
// raised faces. The library `brass` strip is a brushed fitting (roughness 0.28) with tarnish
// patches; this one is smoother and cleaner, so the letter faces catch a highlight. Vertex colour
// stays the brass tone.

import { defineMaterial } from '@developerz.ai/ts23d';

export const POLISHED_BRASS = defineMaterial({
  id: 'sign_brass',
  kind: 'metal',
  scaleMetres: 0.5,
  roughness: 0.16,
  metalness: 1,
  albedo: '#f5e5ae',
  albedo2: '#6b5a3a',
  params: { brush: 0.1, oxide: 0.04, relief: 0.5 },
  description: 'Polished sign brass: bright, smooth, a trace of tarnish.',
  sources: ['https://physicallybased.info/'],
});
