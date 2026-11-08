// Scots pine (Pinus sylvestris), mature: 25 m tall, 9 m crown in the top ~45%, 0.6 m DBH. Long
// clean bole turning orange-red up high; whorls of near-level branches turning up at the tips,
// carrying clumped, layered pads of dark blue-green needle tufts with sky between them.
// The `tree` kind grows the botany (species preset `pine`); this file re-materials the bark
// (bark.ts: bark_pine strip, moss, seam-safe), lays the needle-litter floor, and swaps the kind's
// far-LOD foliage for THIS tree's LOD0 tufts: LOD1 a thinned set (lod1.ts), LOD2 needle pads
// clustered and silhouette-fitted from them (impostor.ts, fit.ts) on a resampled trunk (trunk.ts),
// so neither switch pops in outline or colour. recipes/pine/README.md.

import {
  BUDGETS,
  type BuildContext,
  boundsOf,
  defineAsset,
  hex,
  type Mesh,
  materialVariant,
  type PartOptions,
  planar,
  translate,
  tree,
  treeReal,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { reproject, tessellate } from '../_lib/finish/finish.ts';
import { pineBark } from './bark.ts';
import { fitPads } from './fit.ts';
import { type PadOptions, padMesh, padsOf } from './impostor.ts';
import { thinTufts } from './lod1.ts';
import { lowTrunk } from './trunk.ts';

const size = { height: 25, spread: 9, dbh: 0.6 };
/** Needle-litter floor radius around the stem foot, m (inside the 9 m crown: `proportions`). */
const FLOOR_R = 3;
/** LOD2 needle pads: 20 hexagonal bipyramids (12 triangles each) at 0.7 × the tufts' mean colour:
 * measured to match LOD0's rendered crown colour on the matte strip (impostor.ts). */
export const PADS: PadOptions = { pads: 20, cover: 0.85, sides: 6, rings: 1, value: 0.7 };
/** LOD1: one LOD0 tuft per twig (of perStem = 4), grown to keep the crown's coverage. */
export const LOD1_TUFTS = { every: 4, scale: 1.9 };
/** Moss on the north side of the lower trunk, 0..1. */
const MOSS = 0.35;

interface Captured {
  /** Kind meshes as emitted (trunk in world space, leaves in the crown's frame), before bark. */
  trunk: Mesh | null;
  leaves: Mesh | null;
  crown: PartOptions;
  leavesOpts: PartOptions;
}

/**
 * Grow the tree at `lod` through `ctx` with the bark re-materialed on the way out, capturing the
 * trunk, the leaves and the crown/leaves options. `live` false = a dry run (nothing emitted).
 */
function grow(
  ctx: BuildContext,
  lod: 0 | 1,
  live: boolean,
  noise: (p: Vec3) => number,
  swap?: (leaves: Mesh, here: Captured) => Mesh,
): Captured {
  const cap: Captured = { trunk: null, leaves: null, crown: {}, leavesOpts: {} };
  const wrapped: BuildContext = Object.create(ctx);
  Object.defineProperty(wrapped, 'lod', { value: lod });
  wrapped.part = (name: string, mesh: Mesh | null, opts?: PartOptions) => {
    if (name === 'trunk') cap.trunk = mesh;
    if (name === 'leaves') {
      cap.leaves = mesh;
      cap.leavesOpts = opts ?? {};
    }
    let out = mesh;
    if (out && /trunk|roots|branches/.test(name)) out = pineBark(out, 'bark_pine', MOSS, noise);
    if (out && name === 'leaves' && swap) out = swap(out, cap);
    if (live) ctx.part(name, out, opts);
  };
  wrapped.group = (name: string, opts?: PartOptions) => {
    if (name === 'crown') cap.crown = opts ?? {};
    if (live) ctx.group(name, opts);
  };
  tree(wrapped, { species: 'pine', ...size });
  return cap;
}

/**
 * LOD1: the kind's wood (trunk, roots, whorl branches) with a thinned set of LOD0's own tufts in
 * place of its flat cluster cards, moved into this LOD's crown frame (each LOD fits itself).
 */
function mid(ctx: BuildContext, noise: (p: Vec3) => number): void {
  const near = grow(ctx, 0, false, noise);
  const tufts = near.leaves;
  grow(ctx, 1, true, noise, (cards, here) => {
    if (!tufts) return cards;
    const a = near.crown.at ?? [0, 0, 0];
    const b = here.crown.at ?? [0, 0, 0];
    const thin = thinTufts(tufts, LOD1_TUFTS.every, LOD1_TUFTS.scale);
    return translate(thin, [a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
  });
}

/**
 * LOD2: the kind's lathe blob would pop (solid, wider, lighter than the open LOD0 crown). Instead
 * the LOD0 tree is grown dry, its tufts clustered into needle pads in the same crown frame, and its
 * trunk resampled to a pentagonal stem whose apex the leader pad peaks on.
 */
function far(ctx: BuildContext, noise: (p: Vec3) => number): void {
  const near = grow(ctx, 0, false, noise);
  const { trunk, leaves } = near;
  if (!trunk || !leaves) return;
  const at = near.crown.at ?? [0, 0, 0];
  const b = boundsOf(leaves);
  const top = boundsOf(trunk);
  // The leader: straight above the trunk's top, peaking just under the crown's highest tuft.
  const tip = topCentre(trunk);
  const apex: Vec3 = [tip[0], tip[1], Math.max(top.max[2], at[2] + b.max[2] - 0.3)];
  ctx.part('trunk', pineBark(lowTrunk(trunk, apex), 'bark_pine', MOSS, noise));
  ctx.group('crown', { ...near.crown, clearOf: ['trunk'] });
  const anchor: Vec3 = [apex[0] - at[0], apex[1] - at[1], apex[2] - at[2]];
  const { pads } = fitPads(padsOf(leaves, { ...PADS, anchor }), leaves, PADS);
  ctx.part('leaves', padMesh(pads, PADS), near.leavesOpts);
}

/** Centre of the highest ring of a trunk mesh (its top). */
function topCentre(m: Mesh): Vec3 {
  const b = boundsOf(m);
  let n = 0;
  const c: [number, number, number] = [0, 0, b.max[2]];
  for (let i = 0; i < m.positions.length; i += 3) {
    if ((m.positions[i + 2] ?? 0) < b.max[2] - 0.05) continue;
    c[0] += m.positions[i] ?? 0;
    c[1] += m.positions[i + 1] ?? 0;
    n++;
  }
  return n > 0 ? [c[0] / n, c[1] / n, c[2]] : c;
}

export const pine = defineAsset({
  name: 'pine',
  kind: 'vegetation',
  tags: ['vegetation', 'tree', 'pine'],
  description:
    'Scots pine (Pinus sylvestris), mature: tall bare bole, orange upper bark, high layered crown of clumped needle pads',
  sources: [
    'https://en.wikipedia.org/wiki/Pinus_sylvestris (up to 35 m tall, trunk up to 1 m diameter; orange upper bark)',
    'https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/scots-pine/ (mature 35 m; flat-topped crown in age)',
    'https://bbr.nefu.edu.cn/EN/Y2006/V26/I4/490 (P. sylvestris var. mongolica crown: branch angle ≈ 45–50°, smaller in the upper crown; ~3.8 primary branches per whorl)',
  ],
  real: treeReal({ ...size, source: 'recipes/pine/README.md' }),
  // The kind's tree budget plus the ground patch (≤ 400 / 200 / 16 triangles).
  budget: {
    triangles: [
      BUDGETS.tree.triangles[0] + 400,
      BUDGETS.tree.triangles[1] + 200,
      BUDGETS.tree.triangles[2] + 16,
    ],
  },
  build(ctx: BuildContext) {
    const lod = ctx.lod;
    const noise = valueNoise(ctx.rng.fork('moss'), { scale: 0.4, octaves: 2 });
    if (lod === 2) far(ctx, noise);
    else if (lod === 1) mid(ctx, noise);
    else grow(ctx, 0, true, noise);
    // Floor patch: a polygon split into small triangles and box-projected so the strip keeps
    // true scale (a cylinder cap or planar UV would wrap V inside a triangle).
    const n = ctx.pick([16, 10, 8]);
    // Same area at every LOD (a coarser polygon is pushed out), so the far silhouette keeps it.
    const r = FLOOR_R * Math.sqrt((Math.PI * 2) / (n * Math.sin((Math.PI * 2) / n)));
    const disc = planar({
      points: Array.from({ length: n }, (_, k): Vec3 => {
        const a = (k / n) * Math.PI * 2;
        return [Math.cos(a) * r, Math.sin(a) * r, 0.005];
      }),
      color: hex('#a08670'),
      strip: materialVariant('leaf_litter', 5),
    });
    ctx.part('ground', lod === 2 ? disc : reproject(tessellate(disc, FLOOR_R / 3)));
  },
});
