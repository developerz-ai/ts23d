// defineModelCharacter: a character asset whose body is a rigged, textured model (riggedBody:
// the model's own skin, bones and clips, ONE skinned part per LOD), with a CPU fallback for a
// cache miss. `model(ctx)` returns the import (riggedChain, or importModel on bytes) or null;
// then `fallback(ctx, …)` builds instead. No CreatureSpec: the rig is the model's. The kind adds
// what every such recipe wired by hand: the whole-surface crease declaration (QA `connections`
// reads a model's folds and belts as seams), the density from `real.mass`, and the clips. Clips
// are only known inside `build` (they come with the model), and core reads an asset's `clips`
// after its build: the definition's clip list is rewritten in place by each build (as
// defineModelCreature does), so a compile always sees the clips of the body it just built: the
// model's on a hit, none on the fallback.

import type { Asset, AssetDefinition, BuildContext, Clip, RealDimensions } from '../core/index.ts';
import { defineAsset } from '../core/index.ts';
import type { ImportedModel } from '../neural/index.ts';
import { type RiggedBody, type RiggedBodyOptions, riggedBody } from './model-character-body.ts';

export interface ModelCharacterDefinition
  extends Omit<AssetDefinition, 'kind' | 'build' | 'clips' | 'real'> {
  /** Default 'character' (a humanoid: QA reads its eyes and grounding as one). */
  readonly kind?: string;
  /** Real box and the whole-figure mass, kg (the part's density is derived from it). */
  readonly real: RealDimensions & { readonly mass: number };
  /** The rigged model for this build, or null: build `fallback`. */
  readonly model: (ctx: BuildContext) => ImportedModel | null;
  /** The body part's name. Default 'body'. */
  readonly part?: string;
  /** `rename`: model clip → asset clip (unlisted clips are dropped); `loop`: asset clips that
   *  must loop; `lift`: asset clip → metres added to the root's height (QA `gait` names it). */
  readonly clips: {
    readonly rename: RiggedBodyOptions['clips'];
    readonly loop?: RiggedBodyOptions['loop'];
    readonly lift?: RiggedBodyOptions['lift'];
  };
  /** Bone renames, model name → asset name. */
  readonly boneNames?: RiggedBodyOptions['boneNames'];
  /** The CPU tier: emit a part named `part` weighing `mass`; no bones, no clips. */
  readonly fallback: (
    ctx: BuildContext,
    info: { readonly part: string; readonly mass: number },
  ) => void;
  /** Extra parts after the body; `body` is null when the fallback built. */
  readonly extra?: (ctx: BuildContext, body: RiggedBody | null) => void;
}

export function defineModelCharacter(d: ModelCharacterDefinition): Asset {
  const { kind, model, part = 'body', clips, boneNames, fallback, extra, ...rest } = d;
  const { height, mass } = d.real;
  const live: Clip[] = [];
  return defineAsset({
    ...rest,
    kind: kind ?? 'character',
    creases: [
      // The model's surface is its own: nothing on it is a seam between two code forms.
      {
        name: 'model_surface',
        part,
        at: [0, 0, height / 2],
        radius: 2 * height,
        why: "model-built surface (ADR 016): cloth folds, seams, belts and hair are the model's relief, not two code forms pushed together",
      },
      ...(d.creases ?? []),
    ],
    clips: live,
    build(ctx) {
      const got = model(ctx);
      live.length = 0;
      if (!got) {
        fallback(ctx, { part, mass });
        extra?.(ctx, null);
        return;
      }
      const body = riggedBody(ctx, {
        model: got,
        name: part,
        mass,
        clips: clips.rename,
        ...(clips.loop ? { loop: clips.loop } : {}),
        ...(clips.lift ? { lift: clips.lift } : {}),
        ...(boneNames ? { boneNames } : {}),
      });
      live.push(...body.clips);
      extra?.(ctx, body);
    },
  });
}
