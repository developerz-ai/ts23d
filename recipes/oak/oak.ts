// English oak (Quercus robur), open-grown mature specimen: 22 m tall, crown as wide as it is tall,
// 1.3 m trunk at breast height (≈ 4.1 m girth). A short massive bole (~4.5 m) splitting low into
// many long, heavy, near-level sinuous limbs under a broad dome; leaves as alpha-cut twig cards
// (leaf-cards.ts), buttressed root flare. The `tree` kind grows the botany from the `oak` preset
// with this tree's overrides; this file re-materials the bark (../pine/bark.ts: bark_oak, moss),
// adds the age story (wear.ts: lichen, a snapped dead limb, a fallen limb in the litter) and
// replaces the kind's far-LOD lathe blob with clumps of the same leaf cards fitted to LOD0's crown
// over a visible trunk and main limbs, so the LOD2 switch keeps outline, value and the bole.
// recipes/oak/README.md.

import {
  BUDGETS,
  type BuildContext,
  boundsOf,
  defineAsset,
  hex,
  type Mesh,
  materialVariant,
  merge,
  oak as oakPreset,
  type PartOptions,
  planar,
  sweep,
  type TreeParams,
  tree,
  treeReal,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { reproject, tessellate } from '../_lib/finish/finish.ts';
import { pineBark } from '../pine/bark.ts';
import { lowTrunk } from '../pine/trunk.ts';
import { type CutoutOptions, clumpCards, STRAND, toCutout } from './leaf-cards.ts';
import { deadLimb, fallenLimb, lichen } from './wear.ts';

const size = { height: 22, spread: 22, dbh: 1.3 };
const FLOOR_R = 8;
/** Skeleton seed: the most even crown of seeds 0–29 (centroid 0.1 m off the bole, spread within
 * ±1 m of centred both ways) with its lowest leaves 2 m up, so the dome is not lopsided. */
const SEED = 14;
const MOSS = 0.7;
/** Lichen on the sky-facing bark, 0..1. */
const LICHEN = 0.75;
/** LOD2: crown clumps (12 triangles each) and the limbs that carry them. */
export const FAR = { clumps: 15, limbs: 4, value: 0.82, spread: 2.4 } as const;

/**
 * The open-grown oak on top of the kind's preset: a lower crown base, more and longer first-order
 * limbs leaving almost level (72° → 42° up the bole) with an S-bend, heavier limbs (lower ratio
 * power), and many smaller strand cards that become cutout twigs.
 */
export const OAK: TreeParams = {
  ...oakPreset,
  shape: 'hemispherical',
  baseSize: 0.2,
  ratioPower: 0.95,
  taper: 0.34,
  levels: [
    { branches: 0, length: 0.5, downAngle: 0, curveVar: 6, segments: 8 },
    {
      branches: 11,
      length: 1.05,
      lengthVar: 0.12,
      downAngle: 70,
      downAngleV: -30,
      curve: 6,
      curveBack: 22,
      curveVar: 16,
      segments: 7,
    },
    { branches: 6, length: 0.55, downAngle: 50, curve: 12, curveVar: 18, start: 0.2, segments: 4 },
    { branches: 5, length: 0.5, downAngle: 45, curveVar: 14, start: 0.15, segments: 2 },
  ],
  leaves: {
    ...oakPreset.leaves,
    shape: 'strand',
    size: 1.15,
    width: 1,
    perStem: 11,
    from: 0.15,
  },
};

const CARDS: CutoutOptions = {
  cell: 'foliage_broadleaf',
  layout: STRAND,
  leaf: OAK.leaves.color,
  tint: [0.82, 0.86, 0.72],
  grow: 1.1,
  aspect: 0.85,
};

interface Captured {
  trunk: Mesh | null;
  leaves: Mesh | null;
  crown: PartOptions;
  leavesOpts: PartOptions;
}

/** Grow the oak at `lod`, bark and cards finished on the way out; `live` false = dry run. */
function grow(
  ctx: BuildContext,
  lod: 0 | 1,
  live: boolean,
  noise: { moss: (p: Vec3) => number; lichen: (p: Vec3) => number },
): Captured {
  const cap: Captured = { trunk: null, leaves: null, crown: {}, leavesOpts: {} };
  const wrapped: BuildContext = Object.create(ctx);
  Object.defineProperty(wrapped, 'lod', { value: lod });
  wrapped.part = (name: string, mesh: Mesh | null, opts?: PartOptions) => {
    let out = mesh;
    if (out && /trunk|roots|branches/.test(name))
      out = lichen(pineBark(out, 'bark_oak', MOSS, noise.moss), noise.lichen, LICHEN);
    if (out && name === 'leaves') {
      // Keep every card 1.2 m over the ground: the crown's 2° sway dips its outer cards.
      const pivot = cap.crown.at ?? [0, 0, 0];
      out = toCutout(out, { ...CARDS, floor: 1.2 - pivot[2] });
      cap.leaves = out;
      cap.leavesOpts = { ...opts, surface: 'cutout' };
    }
    if (name === 'trunk' && out) {
      cap.trunk = out;
      // The snag merges into the bole it grows from (one static body, no seam to judge).
      out = merge([out, deadLimb(out, 2.3, lod)]);
    }
    if (live) ctx.part(name, out, name === 'leaves' ? { ...opts, surface: 'cutout' } : opts);
  };
  wrapped.group = (name: string, opts?: PartOptions) => {
    if (name === 'crown') cap.crown = opts ?? {};
    if (live) ctx.group(name, opts);
  };
  tree(wrapped, { species: OAK, ...size, seed: SEED });
  return cap;
}

/** LOD2 limbs: from the bole top out to the lowest, widest clumps (3-sided, tapered). */
function farLimbs(base: Vec3, ends: readonly Vec3[], r: number): Mesh {
  return merge(
    ends.map((e) =>
      sweep({
        section: { radius: 1, segments: 3 },
        path: [base, [(base[0] + e[0]) / 2, (base[1] + e[1]) / 2, (base[2] + e[2]) / 2 + 0.6], e],
        scale: [r, r * 0.6, r * 0.25],
        color: [0.72, 0.68, 0.62],
        // On `wood` like the kind's stems, so pineBark moves it onto bark_oak seam-safe.
        strip: 'wood',
        caps: 'end',
      }),
    ),
  );
}

/** LOD2: LOD0 grown dry; its cards clumped into crossed cutout cards over a resampled trunk. */
function far(
  ctx: BuildContext,
  noise: { moss: (p: Vec3) => number; lichen: (p: Vec3) => number },
): void {
  const near = grow(ctx, 0, false, noise);
  const { trunk, leaves } = near;
  if (!trunk || !leaves) return;
  const at = near.crown.at ?? [0, 0, 0];
  const top = boundsOf(trunk).max[2];
  const low = lowTrunk(trunk, [at[0], at[1], top + 1.5]);
  const bole = at[2] + 0.5;
  const crown = clumpCards(leaves, FAR.clumps, CARDS.cell, FAR.value, FAR.spread);
  // Clump centres in world space, the outermost low ones carried by limbs from the bole top.
  const centres = crown.centres.map((c): Vec3 => [c[0] + at[0], c[1] + at[1], c[2] + at[2]]);
  const reach = (c: Vec3): number => Math.hypot(c[0] - at[0], c[1] - at[1]) - 0.35 * c[2];
  const ends = [...centres].sort((a, b) => reach(b) - reach(a)).slice(0, FAR.limbs);
  const wood = merge([low, farLimbs([at[0], at[1], bole], ends, 0.32)]);
  ctx.part('trunk', pineBark(wood, 'bark_oak', MOSS, noise.moss));
  ctx.group('crown', { ...near.crown, clearOf: ['trunk'] });
  ctx.part('leaves', crown.mesh, near.leavesOpts);
}

export const oak = defineAsset({
  name: 'oak',
  kind: 'vegetation',
  tags: ['vegetation', 'tree', 'oak'],
  description:
    'English oak (Quercus robur), mature open-grown: broad domed crown on a short thick bole',
  sources: [
    'https://en.wikipedia.org/wiki/Quercus_robur (20–40 m; trunk girth 4–12 m)',
    'https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/english-oak/ (mature height 20–40 m, broad spreading crown)',
  ],
  real: treeReal({ ...size, source: 'recipes/oak/README.md' }),
  // The kind's tree budget plus the ground patch and dead wood (≤ 1000 / 300 / 16 triangles).
  budget: {
    triangles: [
      BUDGETS.tree.triangles[0] + 1000,
      BUDGETS.tree.triangles[1] + 300,
      BUDGETS.tree.triangles[2] + 16,
    ],
  },
  build(ctx: BuildContext) {
    const lod = ctx.lod;
    const noise = {
      moss: valueNoise(ctx.rng.fork('moss'), { scale: 0.4, octaves: 2 }),
      lichen: valueNoise(ctx.rng.fork('lichen'), { scale: 0.7, octaves: 2 }),
    };
    if (lod === 2) far(ctx, noise);
    else {
      grow(ctx, lod, true, noise);
      ctx.part('fallen_limb', fallenLimb([3.2, 2.6, 0], 205, lod));
    }
    const n = ctx.pick([18, 12, 8]);
    // Same area at every LOD (a coarser polygon is pushed out), so the far silhouette keeps it.
    const r = FLOOR_R * Math.sqrt((Math.PI * 2) / (n * Math.sin((Math.PI * 2) / n)));
    const disc = planar({
      points: Array.from({ length: n }, (_, k): Vec3 => {
        const a = (k / n) * Math.PI * 2;
        return [Math.cos(a) * r, Math.sin(a) * r, 0.005];
      }),
      color: hex('#a89884'),
      strip: materialVariant('leaf_litter', 5),
    });
    ctx.part('ground', lod === 2 ? disc : reproject(tessellate(disc, FLOOR_R / 3)));
  },
});
