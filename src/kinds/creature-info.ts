// What a recipe passes to and gets back from `creature(ctx, spec, options)`: the options (part
// prefix, strip, hero tier, sculpt cell multipliers) and the info record (skeleton, head layout,
// biology, part names, and the rig and bare-skin map a recipe needs to groom its own cards with
// the kind's skinning and the kind's head fur).

import type { StripId } from '../material/index.ts';
import type { Biology } from './creature-biology.ts';
import type { Bones } from './creature-bones.ts';
import type { HeadLayout } from './creature-head.ts';
import type { HeadBare } from './creature-head-fur.ts';
import type { CreatureCellOptions } from './creature-lod.ts';
import type { CreatureRig } from './creature-rig.ts';

export interface CreatureOptions {
  /** Part-name prefix (`wolf_` → `wolf_body`, `wolf_head` …). Default none. */
  readonly prefix?: string;
  /** Trim-sheet strip of the skin/coat (e.g. a neutral fur strip registered by the recipe). */
  readonly strip?: StripId;
  /** Hero tier (ADR 012): lighter LOD0 tagged with its fine field (creature-hero.ts). */
  readonly hero?: boolean;
  /** Sculpt cell multipliers for the body and the head (creature-lod.ts): density set directly. */
  readonly cells?: CreatureCellOptions;
}

export interface CreatureInfo {
  readonly bones: Bones;
  readonly head: HeadLayout;
  readonly biology: Biology;
  readonly parts: {
    body: string;
    head: string;
    jaw: string;
    eyeL: string;
    eyeR: string;
    claws: string | null;
  };
  /** The kind's skinning: `rig.pieces(cards, 'body' | 'head', partOffset)` binds a recipe's own
   *  cards, whiskers or scutes rigidly per piece at their roots, as the kind binds its fur. */
  readonly rig: CreatureRig;
  /** Where the head stays bare (nose leather, lips, eye rims, above the ear roots), head-local:
   *  the map `creatureHeadFur(head, spec, info.bare, …)` grows the kind's head fur with. */
  readonly bare: HeadBare;
}
