// defineModelCreature: a creature asset that is model-first with the code creature as its CPU
// fallback. `model(ctx)` returns the imported Blender-steps output (modelChain, or importModel on
// bytes) or null on a cache miss; then `creature(ctx, spec)` builds as before. Clips depend on
// which one built (the fitted skeleton is only known inside `build`), and core reads an asset's
// `clips` and `creases` after its build: the clip list starts as the plan's, the crease list as
// the model body's, and each build rewrites both in place, so a compile always sees the clips and creases of the body it built.

import type {
  Asset,
  AssetDefinition,
  BuildContext,
  Check,
  Clip,
  IntendedCrease,
} from '../core/index.ts';
import { defineAsset } from '../core/index.ts';
import type { ImportedModel } from '../neural/index.ts';
import { type CreatureInfo, type CreatureOptions, creature, creaturePlan } from './creature.ts';
import { balanced, foreShareCheck } from './creature-biology.ts';
import { creatureClips } from './creature-clips.ts';
import { creatureCreases } from './creature-creases.ts';
import type { CreatureSpec } from './creature-spec.ts';
import {
  type ModelBodyInfo,
  type ModelBodyOptions,
  modelBody,
  modelBodyName,
} from './model-body.ts';
import type { ChainedModel } from './model-chain.ts';

export interface ModelCreatureDefinition extends Omit<AssetDefinition, 'kind' | 'build' | 'clips'> {
  readonly spec: CreatureSpec;
  /** The code creature's options (the fallback) and its part prefix for both. */
  readonly options?: CreatureOptions;
  /** The model for this build, or null: build the code creature. */
  readonly model: (ctx: BuildContext) => ImportedModel | ChainedModel | null;
  readonly body?: Pick<ModelBodyOptions, 'name' | 'clips' | 'drop' | 'symmetric' | 'joints'>;
  /** Extra clips on either body (must only name bones both have). */
  readonly clips?: readonly Clip[];
  /** Extra parts after the body; `info` says which one was built. */
  readonly extra?: (
    ctx: BuildContext,
    info: { readonly model: ModelBodyInfo } | { readonly creature: CreatureInfo },
  ) => void;
}

/** True when the compiled asset carries a model body (a textured part). */
const modelBuilt = (a: Parameters<Check>[0]): boolean => a.parts.some((x) => x.textures);

export function defineModelCreature(d: ModelCreatureDefinition): Asset {
  const { spec, options, model, body, extra, clips: more = [], ...rest } = d;
  const prefix = options?.prefix ?? '';
  const { bones } = creaturePlan(spec);
  const coded = creatureClips(bones, spec, prefix);
  const live: Clip[] = [...coded, ...more];
  const set = (clips: readonly Clip[]): void => {
    live.length = 0;
    live.push(...clips, ...more);
  };
  // Balance and fore share judge the code creature's sculpted masses; a model body is judged by
  // QA `model` (ground contact, skeleton inside the mesh).
  const codeOnly =
    (c: Check): Check =>
    (a) =>
      modelBuilt(a) ? [] : c(a);
  // The model's surface is its own (fur relief, folds): nothing on it is a seam of ours. Declared
  // only while the model body is built, so it never excuses the code creature's part of that name.
  const surface: IntendedCrease = {
    name: 'model_surface',
    part: body?.name ?? modelBodyName(spec, prefix),
    at: [0, 0, spec.height / 2],
    radius: 2 * Math.max(spec.length, spec.height),
    why: "model-built surface (ADR 016): its relief is the model's, not two code forms pushed together",
  };
  const creases: IntendedCrease[] = [];
  const declare = (modelled: boolean): void => {
    creases.length = 0;
    creases.push(...creatureCreases(spec, prefix), ...(modelled ? [surface] : []));
    creases.push(...(d.creases ?? []));
  };
  declare(true);
  return defineAsset({
    ...rest,
    kind: 'creature',
    creases,
    checks: [...[balanced, ...foreShareCheck(spec, bones)].map(codeOnly), ...(d.checks ?? [])],
    art: d.art ?? { grounded: true },
    clips: live,
    build(ctx) {
      const got = model(ctx);
      declare(got !== null);
      if (got) {
        const info = modelBody(ctx, { model: got, spec, prefix, ...body });
        set(info.clips);
        extra?.(ctx, { model: info });
      } else {
        set(coded);
        const info = creature(ctx, spec, options);
        extra?.(ctx, { creature: info });
      }
    },
  });
}
