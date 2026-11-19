// Vegetation kind: `tree(ctx, …)` grows a Weber–Penn skeleton from species params and emits a
// game tree — `trunk`, `roots` (buttress flare), and a swaying group `crown` holding `branches`
// (merged) and `leaves` (merged cards) — then fits it onto its real height (ground z = 0 to the
// top), crown spread and DBH at every LOD (vegetation-fit.ts).
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
} from '../core/index.ts';
import { clampToGround, fitTree, liftCards, widen } from './vegetation-fit.ts';
import { frondLeaflets, fruit } from './vegetation-fronds.ts';
import { blob, frondCards } from './vegetation-impostor.ts';
import { clusterCards, crownShade, leafCards } from './vegetation-leaves.ts';
import { barkTint, radialSegments, rootsMesh, stemsMesh, trunkMesh } from './vegetation-mesh.ts';
import { needleTufts } from './vegetation-needles.ts';
import { OUTLINES, type TreeParams } from './vegetation-params.ts';
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
  const ground = trunkStem.pts[0]?.[2] ?? 0;
  // Double-sided cards: 2 × outline vertices each, the first one the card's root on the bark.
  const perCard = 2 * OUTLINES[p.leaves.shape === 'frond' ? 'oval' : p.leaves.shape].length;
  const cards = (m: Mesh): Mesh => liftCards(m, perCard, ground);
  let trunk: (r: number) => Mesh;
  let roots: ((r: number) => Mesh) | null = null;
  let branches: Mesh | null = null;
  let leaves: Mesh;
  if (lod === 2) {
    const imp =
      p.impostor === 'cards' ? frondCards(stems, p, 1) : blob(stems, p, rng.fork('impostor'));
    // The impostor trunk is built once at the skeleton's radius: widen it like the real one.
    trunk = (r) => barkTint(widen(imp.trunk, trunkStem, r), p, top, rng.fork('bark'));
    leaves = p.impostor === 'cards' ? imp.leaves : clampToGround(imp.leaves, ground);
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
    const shape = p.leaves.shape;
    leaves =
      shape === 'frond'
        ? frondLeaflets(
            stems,
            deepest,
            p.leaves,
            lod === 0 ? p.leaves.perStem : Math.ceil(p.leaves.perStem / 2),
            shade,
            lr,
          )
        : hi !== deepest
          ? cards(clusterCards(stems, deepest, p.leaves, shade, lr))
          : shape === 'needles'
            ? needleTufts(stems, deepest, p.leaves, shade, lr)
            : cards(leafCards(stems, deepest, radialSegments(deepest, lod), p.leaves, shade, lr));
  }
  const fitted = fitTree({
    trunk,
    roots,
    crown: branches ? [branches, leaves] : [leaves],
    spread,
    height: o.height,
    dbh,
  });
  const fit = fitted.mesh;
  const pivot = fitted.point(
    trunkStem.pts[Math.round(p.baseSize * (trunkStem.pts.length - 1))] ?? [0, 0, 0],
  );
  const back = [-pivot[0], -pivot[1], -pivot[2]] as const;
  ctx.part(parts.trunk, fitted.trunk);
  if (fitted.roots) ctx.part(parts.roots, fitted.roots);
  ctx.group(parts.crown, {
    at: pivot,
    motion: { kind: 'sway', axis: [1, 0, 0], degrees: 2, hz: 0.4 },
    // The crown grows out of the trunk: they meet by design, and the clash gate's conservative
    // full-turn sway volume would otherwise flag the wood that holds it.
    clearOf: roots ? [parts.trunk, parts.roots] : [parts.trunk],
  });
  if (branches && triangleCount(branches) > 0)
    ctx.part(parts.branches, translate(fit(branches), back), { parent: parts.crown });
  ctx.part(parts.leaves, translate(fit(leaves), back), {
    parent: parts.crown,
    // Geometric leaf cards (not alpha cards), each rooted on one twig vertex: a point is the design.
    connect: { as: 'rest', why: 'leaf cards attach at a twig/petiole point' },
  });
  return { parts, height: o.height, spread, dbh };
}

/**
 * `real` for a tree recipe: overall envelope plus DBH (trunk across Y) and total height (ground to
 * top: the trunk stands on z = 0, the root flare is buried). Only parts every tree has as a mesh
 * at LOD0, where `measures` runs: the `crown` group has none and not every species has `roots`.
 */
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
        parts: [`${pre}trunk`, `${pre}branches`, `${pre}leaves`],
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
