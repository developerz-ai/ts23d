// What `ctx.use` carries from a child's declarations into the parent (D558): glow rules, intended
// gaps and creases keep their meaning under the prefixed part names, and the child's own checks
// still run. A crease point moves with the instance; a check runs on the child's parts seen in the
// child's frame, under their own names, so a `touches('lamp', 'post')` written for the child
// still finds them (other fields of the asset it reads stay the parent's).

import type { Check, CompiledAsset, Glow } from './definition.ts';
import type { IntendedCrease, IntendedGap } from './intended.ts';
import type { Part } from './part.ts';
import { toWorld, type WorldTransform } from './world.ts';

/** The child's declarations, renamed and moved for the parent. */
export interface UsedDeclarations {
  readonly glow: readonly Glow[];
  readonly gaps: readonly IntendedGap[];
  readonly creases: readonly IntendedCrease[];
  readonly checks: readonly Check[];
}

/** The parent's parts under `prefix`, renamed and re-rooted as the child built them. */
function childView(asset: CompiledAsset, prefix: string): CompiledAsset {
  const head = `${prefix}_`;
  const own = (name: string): string | null =>
    name.startsWith(head) ? name.slice(head.length) : null;
  const parts: Part[] = asset.parts.flatMap((p) => {
    const name = own(p.name);
    if (name === null) return [];
    const parent = p.parent === null || p.parent === prefix ? null : own(p.parent);
    return [{ ...p, name, parent }];
  });
  return { ...asset, parts };
}

export function useDeclarations(
  sub: CompiledAsset,
  prefix: string,
  xf: WorldTransform,
): UsedDeclarations {
  const named = (selector: string): string => `${prefix}_${selector}`;
  return {
    glow: (sub.glow ?? []).map((g) => ({ ...g, parts: g.parts.map(named) })),
    gaps: (sub.gaps ?? []).map((g) => ({
      ...g,
      parts: g.parts.length === 1 ? [named(g.parts[0])] : [named(g.parts[0]), named(g.parts[1])],
    })),
    creases: (sub.creases ?? []).map((c) => ({
      // The name stays: a reserved one ('model_surface') keeps its meaning.
      ...c,
      part: named(c.part),
      at: toWorld(xf, c.at),
    })),
    checks: sub.checks.map(
      (check): Check =>
        (asset) =>
          check(childView(asset, prefix)),
    ),
  };
}
