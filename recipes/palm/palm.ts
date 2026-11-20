// Coconut palm (Cocos nucifera), mature: 20 m bowed stem of 0.35 m, ~22 pinnate fronds 4–6 m
// long forming a 9 m crown, a hand of coconuts under the frond bases. The `tree` kind grows the
// botany (species preset `palm`, a heavier hand of coconuts here); this file rebuilds the stem with
// its leaf-scar rings and crown shaft of fibrous frond boots (stem.ts), flares the root ball, browns
// the oldest low fronds and hangs two dead ones under the crown (fronds.ts), lays the sand, and
// replaces the kind's far-LOD blades with one cutout card per LOD0 frond along its own rachis, so
// the far crown keeps its lacy outline and colour. recipes/palm/README.md.

import {
  BUDGETS,
  type BuildContext,
  defineAsset,
  dmath,
  type Mesh,
  materialVariant,
  merge,
  type PartOptions,
  palm as palmPreset,
  planar,
  type TreeParams,
  tree,
  treeReal,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { reproject, tessellate } from '../_lib/finish/finish.ts';
import { pineBark } from '../_lib/trees/bark.ts';
import { lowTrunk } from '../_lib/trees/trunk.ts';
import { deadFrond, dryLowFronds, frondCards, frondsOf } from './fronds.ts';
import { coconuts } from './nuts.ts';
import { boots, ringedStem, rings } from './stem.ts';

const size = { height: 20, spread: 9, dbh: 0.35 };
const FLOOR_R = 3.5;
/** Root-ball flare: the kind's buttress lobes widened about the stem axis. */
const FLARE = 1.3;
/** Leaf scars: a ring every 0.22 m (LOD0 grooved, LOD1 colour bands every 0.5 m). */
const SCARS = [
  { spacing: 0.22, groove: 0.07, segments: 8 },
  { spacing: 0.5, groove: 0, segments: 6 },
] as const;
/** LOD2: card value against the fronds' mean leaflet colour, and width over the leaflet span. */
export const FAR = { value: 1.3, wide: 1.25 } as const;

/**
 * The kind's fruit hugs the stem inside the boots, unseen: one token nut is left to it and the
 * real hands of coconuts hang out on stalks (nuts.ts).
 */
export const PALM: TreeParams = {
  ...palmPreset,
  fruit: { count: 1, radius: 0.12, color: [0.46, 0.3, 0.14] },
};
/** Coconut hands under the frond bases: bunches, nut radius (husk ~0.3 m across). */
const NUTS = { bunches: 4, radius: 0.17, below: 0.85 } as const;
const PAIRS = PALM.leaves.perStem;

interface Captured {
  trunk: Mesh | null;
  leaves: Mesh | null;
  crown: PartOptions;
  leavesOpts: PartOptions;
}

const widen = (m: Mesh, axis: Vec3, k: number): Mesh => {
  const positions = new Float32Array(m.positions);
  for (let i = 0; i < positions.length / 3; i++) {
    positions[i * 3] = axis[0] + ((positions[i * 3] ?? 0) - axis[0]) * k;
    positions[i * 3 + 1] = axis[1] + ((positions[i * 3 + 1] ?? 0) - axis[1]) * k;
  }
  return { ...m, positions };
};

/** Grow the palm at `lod` with stem, roots and fronds finished on the way out. */
function grow(ctx: BuildContext, lod: 0 | 1, live: boolean, moss: (p: Vec3) => number): Captured {
  const cap: Captured = { trunk: null, leaves: null, crown: {}, leavesOpts: {} };
  const wrapped: BuildContext = Object.create(ctx);
  Object.defineProperty(wrapped, 'lod', { value: lod });
  const bark = (m: Mesh): Mesh => pineBark(m, 'bark_oak', 0, moss);
  wrapped.part = (name: string, mesh: Mesh | null, opts?: PartOptions) => {
    let out = mesh;
    if (out && name === 'trunk') {
      cap.trunk = out;
      out = bark(merge([ringedStem(out, SCARS[lod]), boots(out, 1.3, 1.55, lod)]));
    } else if (out && name === 'roots') {
      const base = cap.trunk ? stemFoot(cap.trunk) : [0, 0, 0];
      out = bark(widen(out, base as Vec3, FLARE));
    } else if (out && name === 'branches') {
      const dead = deadFronds(cap, lod);
      out = merge([bark(merge([out, ...dead.map((d) => d.rachis)])), hands(cap, lod)]);
    } else if (out && name === 'leaves') {
      cap.leaves = out;
      cap.leavesOpts = opts ?? {};
      const dead = deadFronds(cap, lod);
      out = merge([dryLowFronds(out, lowFrondZ(out), 3), ...dead.map((d) => d.leaflets)]);
    }
    if (live) ctx.part(name, out, opts);
  };
  wrapped.group = (name: string, opts?: PartOptions) => {
    if (name === 'crown') cap.crown = opts ?? {};
    if (live) ctx.group(name, opts);
  };
  tree(wrapped, { species: PALM, ...size });
  return cap;
}

/** Three dead fronds hanging from the boots under the crown (crown frame). */
function deadFronds(cap: Captured, lod: number): { rachis: Mesh; leaflets: Mesh }[] {
  if (!cap.trunk) return [];
  const at = cap.crown.at ?? [0, 0, 0];
  const top = stemTop(cap.trunk);
  // From the boots at the crown base, hanging below the live fronds' drooping tips (a skirt).
  const root: Vec3 = [top[0] - at[0], top[1] - at[1], top[2] - at[2] - 1.1];
  return [
    deadFrond(root, 205, 0.7, 5.2, lod === 0 ? 24 : 10),
    deadFrond(root, 110, 0.6, 4.4, lod === 0 ? 22 : 9),
    deadFrond(root, 270, 0.65, 4.8, lod === 0 ? 22 : 9),
  ];
}

/** The coconut hands under the frond bases, crown frame. */
function hands(cap: Captured, lod: number): Mesh {
  if (!cap.trunk) return merge([]);
  const at = cap.crown.at ?? [0, 0, 0];
  const top = stemTop(cap.trunk);
  const r = rings(cap.trunk).at(-1)?.r ?? 0.15;
  const base: Vec3 = [top[0] - at[0], top[1] - at[1], top[2] - at[2] - NUTS.below];
  return coconuts(base, r, NUTS.bunches, NUTS.radius, lod);
}

/** Height below which the lowest fronds brown: 45% up the crown's leaflet span. */
function lowFrondZ(leaves: Mesh): number {
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 2; i < leaves.positions.length; i += 3) {
    const z = leaves.positions[i] ?? 0;
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return z0 + (z1 - z0) * 0.45;
}

function stemTop(trunk: Mesh): Vec3 {
  let best: Vec3 = [0, 0, -Infinity];
  for (let i = 0; i < trunk.positions.length / 3; i++) {
    const z = trunk.positions[i * 3 + 2] ?? 0;
    if (z > best[2]) best = [trunk.positions[i * 3] ?? 0, trunk.positions[i * 3 + 1] ?? 0, z];
  }
  return best;
}

function stemFoot(trunk: Mesh): Vec3 {
  let [x, y, n] = [0, 0, 0];
  for (let i = 0; i < trunk.positions.length / 3; i++) {
    if ((trunk.positions[i * 3 + 2] ?? 0) > 0.3) continue;
    x += trunk.positions[i * 3] ?? 0;
    y += trunk.positions[i * 3 + 1] ?? 0;
    n++;
  }
  return n > 0 ? [x / n, y / n, 0] : [0, 0, 0];
}

/** LOD2: the LOD0 palm grown dry; its stem resampled, every frond one bent cutout card. */
function far(ctx: BuildContext, moss: (p: Vec3) => number): void {
  const near = grow(ctx, 0, false, moss);
  const { trunk, leaves } = near;
  if (!trunk || !leaves) return;
  const at = near.crown.at ?? [0, 0, 0];
  const top = stemTop(trunk);
  ctx.part('trunk', pineBark(lowTrunk(trunk, top), 'bark_oak', 0, moss));
  ctx.group('crown', { ...near.crown, clearOf: ['trunk'] });
  const root: Vec3 = [top[0] - at[0], top[1] - at[1], top[2] - at[2] - 0.15];
  const fronds = frondsOf(dryLowFronds(leaves, lowFrondZ(leaves), 3), PAIRS);
  ctx.part('leaves', frondCards(fronds, root, PALM.leaves.color, FAR.value, FAR.wide), {
    ...near.leavesOpts,
    surface: 'cutout',
  });
}

export const palm = defineAsset({
  name: 'palm',
  kind: 'vegetation',
  tags: ['vegetation', 'tree', 'palm'],
  description:
    'Coconut palm (Cocos nucifera): slender bowed ringed stem, crown of drooping pinnate fronds, coconuts and dead fronds',
  sources: [
    'https://en.wikipedia.org/wiki/Coconut (up to 30 m; pinnate leaves 4–6 m long)',
    'https://en.wikipedia.org/wiki/Cocos_nucifera',
  ],
  real: treeReal({ ...size, source: 'recipes/palm/README.md' }),
  // Low, looking up under the frond bases at the coconut hands and boots.
  hero: { elDeg: 3 },
  // The kind's tree budget plus the ground patch, stem rings and dead fronds.
  budget: {
    triangles: [
      BUDGETS.tree.triangles[0] + 400,
      BUDGETS.tree.triangles[1] + 200,
      BUDGETS.tree.triangles[2] + 16,
    ],
  },
  build(ctx: BuildContext) {
    const lod = ctx.lod;
    const moss = valueNoise(ctx.rng.fork('moss'), { scale: 0.4, octaves: 2 });
    if (lod === 2) far(ctx, moss);
    else grow(ctx, lod, true, moss);
    const n = ctx.pick([16, 10, 6]);
    const disc = planar({
      points: Array.from({ length: n }, (_, k): Vec3 => {
        const a = (k / n) * Math.PI * 2;
        return [dmath.cos(a) * FLOOR_R, dmath.sin(a) * FLOOR_R, 0.005];
      }),
      color: [1, 1, 1],
      strip: materialVariant('sand', 5),
    });
    ctx.part('ground', lod === 2 ? disc : reproject(tessellate(disc, FLOOR_R / 3)));
  },
});
