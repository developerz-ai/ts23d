// Scots pine (Pinus sylvestris), mature: 25 m tall, 9 m flat-topped crown in the top ~35%, 0.6 m
// DBH. Long clean bole turning orange-red up high, studded with the dead stubs of self-pruned
// whorls; near-level branches turning up at the tips, carrying clumped pads of dark blue-green
// needle sprays (alpha-cut cards on the `foliage_needles` cell) with sky between them; cones under
// the outer shoots, one dead branch in the lower crown.
// The `tree` kind grows the botany (species preset `pine`, overridden here for the old tree's
// flatter crown); this file re-materials the bark (bark.ts: bark_pine strip, moss, seam-safe), turns
// the needle brushes into cutout cards (../oak/leaf-cards.ts), adds the wear (wear.ts), lays the
// needle-litter floor, and swaps the kind's far-LOD foliage for THIS tree's LOD0 needles: LOD1 a
// thinned set (lod1.ts), LOD2 clumps of the same cards over a resampled trunk (trunk.ts), so
// neither switch pops in outline or colour. recipes/pine/README.md.

import {
  BUDGETS,
  type BuildContext,
  boundsOf,
  defineAsset,
  dmath,
  hex,
  type Mesh,
  materialVariant,
  merge,
  type PartOptions,
  pine as pinePreset,
  planar,
  type TreeParams,
  translate,
  tree,
  treeReal,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { reproject, tessellate } from '../_lib/finish/finish.ts';
import { type BarkGrade, pineBark } from '../_lib/trees/bark.ts';
import { type CutoutOptions, clumpCards, NEEDLE, toCutout } from '../_lib/trees/leaf-cards.ts';
import { squash } from '../_lib/trees/squash.ts';
import { lowTrunk } from '../_lib/trees/trunk.ts';
import { trunkAt } from '../_lib/trees/wear.ts';
import { thinTufts } from './lod1.ts';
import { boleStubs, cones, deadBranch, resinScar } from './wear.ts';

const size = { height: 25, spread: 10.5, dbh: 0.6 };
/** Crown depth kept by `squash`: the kind's ball crown → an old tree's shallow flat top. */
const CROWN_SQUASH = 0.6;
/** Needle-litter floor radius around the stem foot, m (inside the 9 m crown: `proportions`). */
const FLOOR_R = 3;
/** LOD2: clumps of needle cards (three crossed cards, 12 triangles each) and their value. */
export const FAR = { clumps: 20, value: 0.78, spread: 2.7 } as const;
/** LOD1: one LOD0 tuft per twig (of perStem = 6), grown to keep the crown's coverage. */
export const LOD1_TUFTS = { every: 6, scale: 2.1 };
/** Moss on the north side of the lower trunk, 0..1. */
const MOSS = 0.35;
/** Thick grey-brown plates on the low bole, orange flakes from ~13 m (Wikipedia: upper bark). */
const GRADE: BarkGrade = { z0: 6, z1: 14, tint: [0.42, 0.42, 0.56] };
/** Resin scar on the bole, facing the hero camera (az −35°): a lightning strip 0.6–8 m, ±34° of the girth. */
const SCAR = { azDeg: -35, z0: 0.6, z1: 8, half: 0.6 } as const;
/** Skeleton seed: the most even crown of seeds 0–29 (centroid and spread centred on the bole). */
const SEED = 5;

/**
 * The old tree on top of the kind's preset: crown base at 66% of height (crown ≈ 35% deep) and a
 * spherical envelope, so the whorls are longest in the middle of a short crown and the top reads
 * flat instead of a spire.
 */
export const PINE: TreeParams = {
  ...pinePreset,
  shape: 'cylindrical',
  baseSize: 0.72,
  ratioPower: 0.95,
  levels: [
    pinePreset.levels[0] ?? { branches: 0, length: 0.95, downAngle: 0, segments: 10 },
    {
      branches: 18,
      length: 0.22,
      lengthVar: 0.15,
      downAngle: 90,
      downAngleV: -4,
      curve: 16,
      curveVar: 8,
      segments: 5,
    },
    { branches: 7, length: 0.45, downAngle: 62, curve: 10, curveVar: 12, start: 0.35, segments: 2 },
  ],
  leaves: { ...pinePreset.leaves, perStem: 6, size: 1.7 },
};

const CARDS: CutoutOptions = {
  cell: 'foliage_needles',
  layout: NEEDLE,
  leaf: PINE.leaves.color,
  tint: [0.95, 1.1, 1.12],
  grow: 1.05,
  aspect: 0.9,
};

interface Captured {
  trunk: Mesh | null;
  /** The kind's needle brushes (crown frame), before the cutout swap. */
  tufts: Mesh | null;
  /** The cutout needle cards as emitted. */
  cards: Mesh | null;
  crown: PartOptions;
  leavesOpts: PartOptions;
}

interface Noise {
  readonly moss: (p: Vec3) => number;
}

/**
 * Grow the tree at `lod` through `ctx` with bark, wear and cutout needles finished on the way
 * out. `live` false = a dry run (nothing emitted). `swap` replaces the kind's brushes first.
 */
function grow(
  ctx: BuildContext,
  lod: 0 | 1,
  live: boolean,
  noise: Noise,
  swap?: (tufts: Mesh, here: Captured) => Mesh,
): Captured {
  const cap: Captured = { trunk: null, tufts: null, cards: null, crown: {}, leavesOpts: {} };
  const wrapped: BuildContext = Object.create(ctx);
  Object.defineProperty(wrapped, 'lod', { value: lod });
  wrapped.part = (name: string, mesh: Mesh | null, opts?: PartOptions) => {
    let out = mesh;
    let o = opts;
    if (name === 'trunk') cap.trunk = mesh;
    // The crown pulled up into a shallow umbrella under the same top (crown frame).
    if (out && o?.parent === 'crown')
      out = squash(out, size.height - (cap.crown.at?.[2] ?? 0), CROWN_SQUASH);
    if (out && /trunk|roots|branches/.test(name)) {
      // Branches hang under the crown pivot: grade them at their world height, not crown-local.
      const origin = o?.parent === 'crown' ? cap.crown.at : undefined;
      out = pineBark(out, 'bark_pine', MOSS, noise.moss, GRADE, origin);
      if (name === 'trunk')
        out = merge([out, resinScar(out, SCAR.azDeg, SCAR.z0, SCAR.z1, SCAR.half, lod)]);
    }
    if (out && name === 'branches' && cap.trunk) out = merge([out, crownWear(cap, lod)]);
    if (out && name === 'leaves') {
      cap.tufts = out;
      const brushes = swap ? swap(out, cap) : out;
      const pivot = cap.crown.at ?? [0, 0, 0];
      out = toCutout(brushes, { ...CARDS, floor: 1 - pivot[2] });
      cap.cards = out;
      o = { ...opts, surface: 'cutout' };
      cap.leavesOpts = o;
    }
    if (live) ctx.part(name, out, o);
  };
  wrapped.group = (name: string, opts?: PartOptions) => {
    if (name === 'crown') cap.crown = opts ?? {};
    if (live) ctx.group(name, opts);
  };
  tree(wrapped, { species: PINE, ...size, seed: SEED });
  return cap;
}

/** Crown-frame wear merged into `branches`: the dead branch at the crown base (and cones, LOD0). */
function crownWear(cap: Captured, lod: number): Mesh {
  const at = cap.crown.at ?? [0, 0, 0];
  const trunk = cap.trunk;
  if (!trunk) return merge([]);
  const { c, r } = trunkAt(trunk, at[2] + 0.4);
  return translate(deadBranch(c, r, 150, lod), [-at[0], -at[1], -at[2]]);
}

/**
 * LOD1: the kind's wood (trunk, roots, whorl branches) with a thinned set of LOD0's own tufts in
 * place of its flat cluster cards, moved into this LOD's crown frame (each LOD fits itself).
 */
function mid(ctx: BuildContext, noise: Noise): Captured {
  const near = grow(ctx, 0, false, noise);
  const tufts = near.tufts;
  return grow(ctx, 1, true, noise, (cards, here) => {
    if (!tufts) return cards;
    const a = near.crown.at ?? [0, 0, 0];
    const b = here.crown.at ?? [0, 0, 0];
    const thin = thinTufts(tufts, LOD1_TUFTS.every, LOD1_TUFTS.scale);
    return translate(thin, [a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
  });
}

/**
 * LOD2: the kind's lathe blob would pop (solid, wider, lighter than the open LOD0 crown). Instead
 * the LOD0 tree is grown dry, its needle cards clustered into clumps of crossed cards in the same
 * crown frame, and its trunk resampled to a pentagonal stem whose leader runs up into the top
 * clump (the crown provably holds on).
 */
function far(ctx: BuildContext, noise: Noise): void {
  const near = grow(ctx, 0, false, noise);
  const { trunk, cards } = near;
  if (!trunk || !cards) return;
  const at = near.crown.at ?? [0, 0, 0];
  const crown = clumpCards(cards, FAR.clumps, CARDS.cell, FAR.value, FAR.spread);
  const tip = topCentre(trunk);
  const top = leaderClump(crown.centres, [tip[0] - at[0], tip[1] - at[1], tip[2] - at[2]]);
  const apex: Vec3 = [top[0] + at[0], top[1] + at[1], Math.max(tip[2], top[2] + at[2])];
  // No resin scar at LOD2: a half-metre wound is under a pixel at the switch distance.
  ctx.part('trunk', pineBark(lowTrunk(trunk, apex), 'bark_pine', MOSS, noise.moss, GRADE));
  ctx.group('crown', { ...near.crown, clearOf: ['trunk'] });
  ctx.part('leaves', crown.mesh, near.leavesOpts);
}

/**
 * The clump the leader runs up into (crown frame): close in plan to the trunk tip `tip` and high,
 * scored by plan distance minus half the clump's height. `tip` itself when there are no clumps.
 */
export function leaderClump(centres: readonly Vec3[], tip: Vec3): Vec3 {
  let top: Vec3 = tip;
  let best = Infinity;
  for (const c of centres) {
    const d = dmath.hypot(c[0] - tip[0], c[1] - tip[1]) - 0.5 * c[2];
    if (d < best) {
      best = d;
      top = c;
    }
  }
  return top;
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
    'Scots pine (Pinus sylvestris), mature: tall bare bole, orange upper bark, high flat-topped crown of clumped needle pads',
  sources: [
    'https://en.wikipedia.org/wiki/Pinus_sylvestris (up to 35 m tall, trunk up to 1 m diameter; orange upper bark; cones 3–7.5 cm)',
    'https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/scots-pine/ (mature 35 m; flat-topped crown in age)',
    'https://bbr.nefu.edu.cn/EN/Y2006/V26/I4/490 (P. sylvestris var. mongolica crown: branch angle ≈ 45–50°, smaller in the upper crown; ~3.8 primary branches per whorl)',
  ],
  real: treeReal({ ...size, source: 'recipes/pine/README.md' }),
  // Low, so the flat crown's underside, its limbs and the scarred bole face the lens.
  hero: { elDeg: 8 },
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
    const noise: Noise = { moss: valueNoise(ctx.rng.fork('moss'), { scale: 0.4, octaves: 2 }) };
    if (lod === 2) far(ctx, noise);
    else {
      const near = lod === 1 ? mid(ctx, noise) : grow(ctx, 0, true, noise);
      if (lod === 0 && near.tufts) {
        // Cones ride with the crown's sway: their own part under it, LOD0 only (3–7.5 cm).
        ctx.part('cones', cones(near.tufts, 5, 0.55, 0.07), {
          parent: 'crown',
          connect: { as: 'rest', why: 'cones hang from a shoot by a stalk point' },
        });
      }
      if (near.trunk) {
        const r = ctx.rng.fork('stubs');
        ctx.part(
          'stubs',
          boleStubs(near.trunk, 3, 13.5, 7, lod, () => r.next()),
        );
      }
    }
    // Floor patch: a polygon split into small triangles and box-projected so the strip keeps
    // true scale (a cylinder cap or planar UV would wrap V inside a triangle).
    const n = ctx.pick([16, 10, 8]);
    // Same area at every LOD (a coarser polygon is pushed out), so the far silhouette keeps it.
    const r = FLOOR_R * Math.sqrt((Math.PI * 2) / (n * dmath.sin((Math.PI * 2) / n)));
    const disc = planar({
      points: Array.from({ length: n }, (_, k): Vec3 => {
        const a = (k / n) * Math.PI * 2;
        return [dmath.cos(a) * r, dmath.sin(a) * r, 0.005];
      }),
      color: hex('#a08670'),
      strip: materialVariant('leaf_litter', 5),
    });
    ctx.part('ground', lod === 2 ? disc : reproject(tessellate(disc, FLOOR_R / 3)));
  },
});
