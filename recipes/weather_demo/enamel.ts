// The drums' strip: factory-enamelled sheet steel. The library `steel_painted` strip paints its own
// chips and streaks into the texture, which would wear the pristine drum too; this one is the same
// paint over steel with none of that, so the NEW drum is new and every mark on the WEATHERED one
// comes from `weather()`. Vertex colour = paint colour.

import { defineMaterial } from '@developerz.ai/ts23d';

export const ENAMEL = defineMaterial({
  id: 'drum_enamel',
  kind: 'metal',
  scaleMetres: 0.5,
  // Baked enamel: a soft satin sheen, not a plastic gloss.
  roughness: 0.5,
  metalness: 1,
  albedo: '#eeeeee',
  albedo2: '#5a3b2a',
  params: { paint: 1, paintRough: 0.5, chips: 0, streaks: 0, grime: 0.05, relief: 1, film: 0.0005 },
  description: 'Factory enamel on sheet steel: satin paint, no chips (vertex colour = paint).',
  sources: ['https://en.wikipedia.org/wiki/Drum_(container)'],
});
