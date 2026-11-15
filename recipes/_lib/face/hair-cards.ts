// Card hair for the busts: a recipe's card hairstyle (cap field, comb, layers) → strand cards on
// the shared `hair_clumps` cutout strip as ONE `hair` part (one draw). LOD0 dense, LOD1 ¼ the
// cards ×2 wider, LOD2 none (the sculpted mass is the far LOD). Use with the recipe's
// `hairBaseEdits` as the bust's `hair` so the sculpted locks give way to the cards.
// Pass `collide` (the bust skin field, `bustEdits(recipe, 2, lod).skin.field`) for long hair.

import { type BuildContext, type ScalpCardOptions, scalpCards } from '@developerz.ai/ts23d';

export type CardHairStyle = Omit<ScalpCardOptions, 'lod' | 'rng'>;

/** Emit `part` (default 'hair') as cutout strand cards rooted on the style's cap. */
export function cardHair(ctx: BuildContext, style: CardHairStyle, part = 'hair'): void {
  const mesh = scalpCards({ ...style, lod: ctx.lod, rng: ctx.rng.fork(part) });
  if (mesh) ctx.part(part, mesh, { surface: 'cutout' });
}
