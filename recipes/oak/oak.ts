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
  dmath,
  hex,
  type Mesh,
  materialVariant,
  merge,
  oak as oakPreset,
  type PartOptions,
  sweep,
  type TreeParams,
  translate,
  tree,
  treeReal,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { pineBark } from '../_lib/trees/bark.ts';
import { type Floor, floorPatch } from '../_lib/trees/floor.ts';
import { type CutoutOptions, clumpCards, STRAND, toCutout } from '../_lib/trees/leaf-cards.ts';
import { sunShade, type Tone } from '../_lib/trees/tone.ts';
import { lowTrunk } from '../_lib/trees/trunk.ts';
import { brokenLimb, deadLimb, fallenLimb, lichen, trunkAt } from '../_lib/trees/wear.ts';

const size = { height: 20, spread: 24, dbh: 1.3 };
/** Field grass under the crown, worn to bare soil and brown litter in patches near the bole. */
/** The moss strip's mean albedo (#4e6625, read off the sheet; grass has the same mean). */
const MOSS_MEAN = hex('#4e6625');
const FLOOR_MEAN = hex('#e5e2c6');
const FLOOR: Floor = {
  radius: 8,
  sides: [18, 12, 8],
  // Short turf seen from above: the isotropic `moss` strip. `grass` is painted side-on (blades
  // and dry tufts along V), which a ground plane showed as straight brown stripes.
  strip: materialVariant('moss', 3),
  far: [0, 1, 2].map((k) => (FLOOR_MEAN[k] ?? 0) * (MOSS_MEAN[k] ?? 0)) as unknown as Vec3,
  mix: [hex('#7c5e40'), hex('#a8885e'), hex('#d8d2a0'), hex('#f2f6e0')],
  rim: hex('#ffffff'),
  wobble: 0.12,
};
/** Skeleton seed: the most even crown of seeds 0–29 (centroid 0.1 m off the bole, spread within
 * ±1 m of centred both ways) with its lowest leaves 2 m up, so the dome is not lopsided. */
const SEED = 14;
const MOSS = 0.7;
/** Lichen on the sky-facing bark, 0..1. */
const LICHEN = 1;
/** LOD2: crown clumps (12 triangles each) and the limbs that carry them. */
export const FAR = { clumps: 15, limbs: 4, value: 0.72, spread: 2.6 } as const;

/**
 * The open-grown oak on top of the kind's preset: a lower crown base, more and longer first-order
 * limbs leaving almost level (72° → 42° up the bole) with an S-bend, heavier limbs (lower ratio
 * power), and many smaller strand cards that become cutout twigs.
 */
export const OAK: TreeParams = {
  ...oakPreset,
  shape: 'hemispherical',
  baseSize: 0.15,
  ratioPower: 0.95,
  taper: 0.34,
  levels: [
    { branches: 0, length: 0.5, downAngle: 0, curveVar: 6, segments: 8 },
    {
      branches: 11,
      length: 1.05,
      lengthVar: 0.12,
      downAngle: 78,
      downAngleV: -34,
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

/** Sun and shade: warm yellow-green on the sunny shoulder, cool dark green in the crown's cave. */
const TONE: Tone = { sunny: [1.18, 1.12, 0.72], shady: [0.62, 0.74, 0.86], sun: [0.5, -0.4, 0.8] };

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
    if (out && /trunk|roots|branches/.test(name)) {
      // Crown branches hang under the crown pivot: grade their bark and moss by world height,
      // or low-trunk moss lands on them (the pine had the same defect, D382).
      const origin = opts?.parent === 'crown' ? cap.crown.at : undefined;
      out = lichen(
        pineBark(out, 'bark_oak', MOSS, noise.moss, undefined, origin),
        noise.lichen,
        LICHEN,
      );
    }
    if (out && name === 'leaves') {
      // Keep every card 1.2 m over the ground: the crown's 2° sway dips its outer cards.
      const pivot = cap.crown.at ?? [0, 0, 0];
      out = sunShade(toCutout(out, { ...CARDS, floor: 1.2 - pivot[2] }), TONE);
      cap.leaves = out;
      cap.leavesOpts = { ...opts, surface: 'cutout' };
    }
    if (name === 'branches' && out && cap.trunk) out = merge([out, crownSnag(cap, lod)]);
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

/**
 * A dead limb up in the crown (crown frame): from the fork out over the hero side and up, bark
 * gone, silver-grey, broken off past the leaves so its bare end shows against the sky.
 */
function crownSnag(cap: Captured, lod: number): Mesh {
  const at = cap.crown.at ?? [0, 0, 0];
  const trunk = cap.trunk;
  if (!trunk) return merge([]);
  const { c } = trunkAt(trunk, at[2] - 0.3);
  const d = dmath.hypot(0.75, -0.55, 0.32);
  const limb = brokenLimb(c, [0.75 / d, -0.55 / d, 0.32 / d], 8, 0.22, lod === 0 ? 7 : 5);
  return translate(limb, [-at[0], -at[1], -at[2]]);
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
  const reach = (c: Vec3): number => dmath.hypot(c[0] - at[0], c[1] - at[1]) - 0.35 * c[2];
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
  // Low, so the dome reads wider than tall and the snag under the crown faces the lens.
  hero: { elDeg: 10 },
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
    const ground = valueNoise(ctx.rng.fork('ground'), { scale: 2.2, octaves: 2 });
    ctx.part('ground', floorPatch(FLOOR, lod, ground));
  },
});
