// The Brinehound's bare steel (D595): track guards, rails, bolts, sprocket teeth, the gun's sleeve,
// every fitting authored in IRON. Worn by running and handling, it is polished where it rubs: a
// true metal at roughness 0.34 (the library's brushed `aluminium`, tinted down to steel), so it
// takes a highlight beside the matte enamel and the rough cast iron it used to sit on (0.68).
// A library strip because it already does the job; a project material would add a sheet row for
// no visible gain. (The faction ground's banding seen while this was tried was sampler bleed, D600.)

import { hex, type StripId, type Vec3 } from '@developerz.ai/ts23d';

export const STEEL_STRIP: StripId = 'aluminium';

/** Vertex colour on the bright strip: a mid steel, darker and warmer than raw aluminium. */
export const STEEL_TINT: Vec3 = hex('#7a7b7c');
