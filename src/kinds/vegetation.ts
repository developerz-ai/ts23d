// Vegetation kind: `tree(ctx, …)` grows a Weber–Penn skeleton from species params and emits a
// game tree — `trunk`, `roots` (buttress flare), and a swaying group `crown` holding `branches`
// (merged) and `leaves` (merged cards) — then fits it onto its real height and crown spread.
// LOD policy: LOD0 every level and every leaf card; LOD1 one level fewer (trees with ≥ 3 levels),
// halved path resolution, twigs replaced by cluster cards; LOD2 an impostor under 300 triangles.

import {
  BUDGETS,
  type BuildContext,
  defineFamily,
  type Mesh,
  merge,
  type RealDimensions,
  Ts23dError,
  translate,
  triangleCount,
  type Vec3,
} from '../core/index.ts';
import { frondLeaflets, fruit } from './vegetation-fronds.ts';
import { blob, frondCards } from './vegetation-impostor.ts';
import { clusterCards, crownShade, leafCards } from './vegetation-leaves.ts';
import {
  barkTint,
  fitFactors,
  radialSegments,
  rootsMesh,
  scaleMesh,
  stemsMesh,
  trunkMesh,
} from './vegetation-mesh.ts';
import type { TreeParams } from './vegetation-params.ts';
import { SPECIES } from './vegetation-presets.ts';
import { grow } from './vegetation-skeleton.ts';

export interface TreeOptions {
  /** A preset name (`oak`, `pine`, `palm`, `birch`, `willow`) or a full parameter set. */
  readonly species?: string | TreeParams;
  /** Overrides on top of the species. */
  readonly params?: Partial<TreeParams>;
  /** Total height, metres (ground to crown top). */
  readonly height: number;
  /** Crown spread (X and Y), metres. Default: the species' typical ratio to height. */
  readonly spread?: number;
  /** Trunk diameter at breast height (1.3 m), metres. Default: the species' typical ratio. */
  readonly dbh?: number;
  readonly seed?: number;
  /** Part-name prefix: `oak_3` → `oak_3_trunk`, `oak_3_crown`, … */
  readonly prefix?: string;
}

export interface TreeInfo {
  readonly parts: { trunk: string; crown: string; branches: string; leaves: string; roots: string };
  readonly height: number;
  readonly spread: number;
  readonly dbh: number;
}

export function treeParams(o: Pick<TreeOptions, 'species' | 'params'>): TreeParams {
  const s = o.species ?? 'oak';
  const base = typeof s === 'string' ? SPECIES[s as keyof typeof SPECIES] : s;
  if (!base) {
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `unknown tree species '${String(s)}'`,
      fix: `use one of ${Object.keys(SPECIES).join(', ')} or pass a TreeParams object (spread a preset and override)`,
    });
  }
  return { ...base, ...o.params };
}

export function tree(ctx: BuildContext, o: TreeOptions): TreeInfo {
  const p = treeParams(o);
  if (!(o.height > 0) || p.levels.length < 2 || p.levels.length > 4) {
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `tree height ${o.height} m with ${p.levels.length} branch levels`,
      fix: 'height must be > 0 and levels must hold the trunk plus 1–3 branch levels',
    });
  }
  const k = o.height / p.typical.height;
  const spread = o.spread ?? p.typical.spread * k;
  const dbh = o.dbh ?? p.typical.dbh * k;
  const pre = o.prefix ? `${o.prefix}_` : '';
  const parts = {
    trunk: `${pre}trunk`,
    crown: `${pre}crown`,
    branches: `${pre}branches`,
    leaves: `${pre}leaves`,
    roots: `${pre}roots`,
  };
  const rng = ctx.rng.fork(`tree:${o.prefix ?? ''}:${o.seed ?? 0}`);
  const stems = grow(p, { height: o.height, dbh }, rng.fork('skeleton'));
  const trunkStem = stems[0];
  if (!trunkStem) return { parts, height: o.height, spread, dbh };
  const deepest = p.levels.length - 1;
  const lod = ctx.lod;
  const top = trunkStem.pts[trunkStem.pts.length - 1]?.[2] ?? o.height;
  const shade = crownShade(stems, 1);
  let trunk: (r: number) => Mesh;
  let roots: ((r: number) => Mesh) | null = null;
  let branches: Mesh | null = null;
  let leaves: Mesh;
  if (lod === 2) {
    const imp =
      p.impostor === 'cards' ? frondCards(stems, p, 1) : blob(stems, p, rng.fork('impostor'));
    trunk = () => barkTint(imp.trunk, p, top, rng.fork('bark'));
    leaves = imp.leaves;
  } else {
    const hi = lod === 0 || deepest < 2 ? deepest : deepest - 1;
    trunk = (r) => trunkMesh(trunkStem, p, lod, r, rng.fork('bark'));
    if (p.roots) roots = (r) => rootsMesh(trunkStem, p, lod, r, rng.fork('roots'));
    const wood = [
      barkTint(stemsMesh(stems, 1, hi, lod, p.bark), p, top, rng.fork('bark:branches')),
    ];
    if (p.fruit && lod === 0)
      wood.push(fruit(trunkStem, p.baseSize - 0.01, p.fruit, rng.fork('fruit')));
    branches = merge(wood);
    const lr = rng.fork('leaves');
    leaves =
      p.leaves.shape === 'frond'
        ? frondLeaflets(
            stems,
            deepest,
            p.leaves,
            lod === 0 ? p.leaves.perStem : Math.ceil(p.leaves.perStem / 2),
            shade,
            lr,
          )
        : hi === deepest
          ? leafCards(stems, deepest, radialSegments(deepest, lod), p.leaves, shade, lr)
          : clusterCards(stems, deepest, p.leaves, shade, lr);
  }
  // Fit onto the real envelope; the trunk is rebuilt thinner by 1/sy so DBH (across Y) is exact.
  const s = fitFactors(
    [trunk(1), branches, leaves, roots?.(1) ?? null].filter((m): m is Mesh => m !== null),
    [spread, spread, o.height],
  );
  const fit = (m: Mesh): Mesh => scaleMesh(m, s);
  const base = trunkStem.pts[Math.round(p.baseSize * (trunkStem.pts.length - 1))] ?? [0, 0, 0];
  const pivot: Vec3 = [base[0] * s[0], base[1] * s[1], base[2] * s[2]];
  const back: Vec3 = [-pivot[0], -pivot[1], -pivot[2]];
  ctx.part(parts.trunk, fit(trunk(1 / s[1])));
  if (roots) ctx.part(parts.roots, fit(roots(1 / s[1])));
  ctx.group(parts.crown, {
    at: pivot,
    motion: { kind: 'sway', axis: [1, 0, 0], degrees: 2, hz: 0.4 },
    // The crown grows out of the trunk: they meet by design, and the clash gate's conservative
    // full-turn sway volume would otherwise flag the wood that holds it.
    clearOf: roots ? [parts.trunk, parts.roots] : [parts.trunk],
  });
  if (branches && triangleCount(branches) > 0)
    ctx.part(parts.branches, translate(fit(branches), back), { parent: parts.crown });
  ctx.part(parts.leaves, translate(fit(leaves), back), { parent: parts.crown });
  return { parts, height: o.height, spread, dbh };
}

/** `real` for a tree recipe: overall envelope plus DBH (trunk across Y) and total height. */
export function treeReal(o: {
  height: number;
  spread: number;
  dbh: number;
  prefix?: string;
  source?: string;
}): RealDimensions {
  const pre = o.prefix ? `${o.prefix}_` : '';
  const src = o.source ? { source: o.source } : {};
  return {
    length: o.spread,
    width: o.spread,
    height: o.height,
    measures: [
      {
        label: 'trunk diameter at breast height',
        value: o.dbh,
        axis: 'y',
        parts: [`${pre}trunk`],
        ...src,
      },
      {
        label: 'total height',
        value: o.height,
        axis: 'z',
        parts: [`${pre}trunk`, `${pre}crown`, `${pre}branches`, `${pre}leaves`, `${pre}roots`],
        ...src,
      },
    ],
  };
}

export type TreeFamilyParams = Omit<TreeOptions, 'prefix'>;

/** One family, many species: `trees.variant({ name: 'oak', params: { species: 'oak', height: 22 } })`. */
export const trees = defineFamily<TreeFamilyParams>({
  kind: 'vegetation',
  tags: ['vegetation', 'tree'],
  budget: BUDGETS.tree,
  defaults: { species: 'oak', height: 22 },
  build: (ctx, p) => {
    tree(ctx, p);
  },
});
