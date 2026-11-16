// Creature fur as strand cards: the coat combed along the skeleton (tailward on the trunk, away
// from the head down the neck, distal down the legs and tail, gravity on the flanks) in two
// layers: a dense short undercoat lying almost flat (≤ 10°) and sparse agouti guard hair in
// clumps (5 cards share a tip), curved across their width (V section, `fold`). Guard
// lengths follow the grey wolf's winter coat ×(coat ÷ 0.03): 60–110 mm on the mane and back,
// 20–40 mm on the flanks, 10–15 mm on legs and face; zones per family (mane, throat ruff, cheeks, elbows, breeches, tail). `creatureHeadFur` coats the head
// in its own frame (creature-head-fur.ts).
// LOD0 dense (wolf ≈ 3k cards, each ≤ ⅓ as wide as long, D59), LOD1 ¼ the cards ×1.5 wider, LOD2
// none (the sculpt carries it).

import { type Mesh, merge, type Rng, type Vec3 } from '../core/index.ts';
import { CREATURE_MATERIALS, defineMaterial, strandCells } from '../material/index.ts';
import { type CardZone, chainSeed, type FlowChain, hairCards, hairFlow } from '../passes/index.ts';
import type { Bones } from './creature-bones.ts';
import type { Family } from './creature-family.ts';
import type { CreatureSpec } from './creature-spec.ts';
import type { FurLie } from './creature-surface.ts';

export type FurZoneName = 'mane' | 'throat' | 'cheeks' | 'elbows' | 'breeches' | 'tail';

/** A region where the coat is long: a sphere (or the tail chain) in world space. */
export interface FurZone {
  readonly name: FurZoneName;
  readonly at: Vec3;
  readonly radius: number;
  /** Guard-hair length here, metres, for a wolf-thick coat (scaled by `coat` ÷ 0.03). */
  readonly length: number;
}

/** Which long-fur zones each family grows (unlisted families: base coat + guard hair only). */
export const FUR_ZONES: Readonly<Record<Family, readonly FurZoneName[]>> = {
  canid: ['mane', 'throat', 'cheeks', 'elbows', 'breeches', 'tail'],
  felid: ['throat', 'cheeks', 'breeches'],
  ursid: ['mane', 'breeches', 'elbows'],
  equid: ['mane', 'tail'],
  bovid: ['throat'],
  cervid: ['throat'],
  suid: ['mane'],
};

/** Guard-hair length per zone, metres, for a wolf-thick coat (`coat` 0.03). */
const LENGTH: Readonly<Record<FurZoneName, number>> = {
  mane: 0.1,
  throat: 0.08,
  cheeks: 0.065,
  elbows: 0.045,
  breeches: 0.07,
  tail: 0.09,
};
/** Back (upward-facing) and flank guard hair, legs below the elbow, metres at `coat` 0.03. */
const BACK = 0.065;
const FLANK = 0.03;
const LEG = 0.012;

const mid = (a: Vec3, b: Vec3, t = 0.5): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** The long-fur zones of a family, placed on its skeleton. */
export function furZones(b: Bones, family: Family | undefined): FurZone[] {
  const names = family ? FUR_ZONES[family] : [];
  const neck = b.neck.map((n) => n.at);
  const nr = b.neck[0]?.r ?? b.limbR;
  const withers = b.spine[b.spine.length - 1] ?? b.head.atlas;
  const neckMid =
    neck.length > 0 ? mid(neck[0] ?? withers, neck[neck.length - 1] ?? withers) : withers;
  const fore = b.legs.find((l) => l.name === 'fore');
  const hind = b.legs.find((l) => l.name === 'hind');
  const out: FurZone[] = [];
  const add = (name: FurZoneName, at: Vec3 | undefined, radius: number): void => {
    if (at && names.includes(name)) out.push({ name, at, radius, length: LENGTH[name] });
  };
  add('mane', mid(withers, b.head.atlas, 0.35), b.height * 0.32);
  add('throat', [neckMid[0], 0, neckMid[2] - nr * 0.9], nr * 1.6);
  add('cheeks', [b.head.atlas[0], 0, b.head.atlas[2] - b.head.height * 0.25], b.head.width * 0.9);
  const elbow = fore?.joints[1];
  if (elbow) add('elbows', [elbow[0] - (fore?.radii[1] ?? 0), elbow[1], elbow[2]], b.limbR * 1.6);
  const hip = hind?.joints[0];
  const stifle = hind?.joints[1];
  if (hip && stifle) {
    const thigh = mid(hip, stifle, 0.6);
    add('breeches', [thigh[0] - b.limbR, thigh[1], thigh[2]], b.limbR * 2.2);
  }
  const tail = b.tail.map((n) => n.at);
  add('tail', tail[Math.floor(tail.length * 0.6)], Math.max(...b.tail.map((n) => n.r), 0) * 3);
  return out;
}

/** Chains the coat lies along: spine front → rear, neck head → shoulders, legs and tail distal. */
export function furChains(b: Bones): FlowChain[] {
  const orient = (pts: Vec3[], from: Vec3): Vec3[] => {
    const a = pts[0];
    const z = pts[pts.length - 1];
    const d = (p: Vec3 | undefined): number =>
      p ? Math.hypot(p[0] - from[0], p[1] - from[1], p[2] - from[2]) : 0;
    return d(a) <= d(z) ? pts : [...pts].reverse();
  };
  const legs = b.legs.flatMap((l) => {
    const pts = [...l.joints, [l.foot[0], l.foot[1], l.foot[2] + l.footSize[2]] as Vec3];
    return [pts, pts.map((p): Vec3 => [p[0], -p[1], p[2]])];
  });
  return [
    { points: [...b.spine].reverse() },
    {
      points: orient(
        b.neck.map((n) => n.at),
        b.head.atlas,
      ),
    },
    {
      points: orient(
        b.tail.map((n) => n.at),
        b.tailRoot,
      ),
    },
    ...legs.map((points) => ({ points, weight: 1.5 })),
  ].filter((c) => c.points.length >= 2);
}

/** On a head in its own frame (+X to the nose) hair lies back from the nose along the muzzle. */
export const headLie = (): Vec3 => [-1, 0, -0.15];

/** The coat's lie for the sculpted relief under the cards (`relief(…, furLie(bones, family))`). */
export function furLie(b: Bones, family: Family | undefined): FurLie {
  // A wide blend: the relief's phase follows the lie, so hand-overs between chains must be smooth.
  const seed = chainSeed(furChains(b), { gravity: 0.35, blend: 0.1 });
  const zones = furZones(b, family);
  return {
    dir: (p) => seed(p, [0, 0, 1]),
    amp: (p) =>
      1 +
      Math.max(
        0,
        ...zones.map(
          (z) =>
            1 -
            (Math.hypot(p[0] - z.at[0], Math.abs(p[1]) - Math.abs(z.at[1]), p[2] - z.at[2]) /
              z.radius) **
              2,
        ),
      ) *
        0.6,
  };
}

export interface FurOptions {
  readonly lod: 0 | 1 | 2;
  readonly rng: Rng;
  /** The body's SDF (negative inside): cards follow the curvature and stay out of the skin. */
  readonly field?: (p: Vec3) => number;
  /** Undercoat cards per m² at LOD0 (default 1800) and guard hairs per m² (default 520). */
  readonly density?: number;
  readonly guard?: number;
}

export interface CreatureFur {
  readonly mesh: Mesh;
  readonly zones: readonly FurZone[];
  readonly roots: readonly Vec3[];
  readonly counts: Readonly<Record<string, number>>;
}

export const smooth = (e0: number, e1: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Undercoat + clumped guard-hair zones; `len(p, n)` is the guard length there (metres). */
export function layers(
  o: FurOptions,
  scale: number,
  len: (p: Vec3, n: Vec3) => number,
  guardBoost: (p: Vec3) => number,
): CardZone[] {
  // LOD1: a quarter of the cards, 1.5× wider — wider still and a card's strands squash into a chip.
  const k = o.lod === 0 ? 1 : 0.25;
  const wide = o.lod === 0 ? 1 : 1.5;
  // Buried just enough to hide the root; with a deeper sink a card lying at ~15° only clears the
  // skin near its tip and shows as a fleck.
  const sink = Math.min(0.0025, 0.003 * scale);
  return [
    {
      name: 'undercoat',
      density: () => (o.density ?? 1800) * k,
      length: (p, n) => Math.min(0.025 * scale, len(p, n) * 0.6),
      // ≤ ⅓ of its length wide: the atlas cell is ~11:1, a squarer card squashes it into a chip.
      width: 0.0075 * scale * wide,
      // Leaves the skin at ~17° and lies down to ~7° by the tip: a few mm of loft, so the cards
      // stand over the coat (shadowed roots, lit tips) instead of sitting flush in it.
      lift: 0.3,
      bend: 0.6,
      droop: 0.02,
      roll: 0.3,
      cells: strandCells('fur_clumps', 'fur'),
      // Root → tip, × the atlas ramp (≈ 0.9 mean): the cards carry the skin's value, not a
      // darker one (dark cards over the coat read as scratches, not fur).
      tone: [0.95, 1.25],
      hug: 0.6,
      sink,
    },
    {
      name: 'guard',
      density: (p) => (o.guard ?? 520) * k * guardBoost(p),
      length: len,
      width: 0.01 * scale * wide,
      lift: 0.38,
      bend: 0.55,
      droop: 0.12,
      roll: 0.8,
      clump: 5,
      cells: strandCells('fur_clumps', 'guard'),
      tone: [1, 1.25],
      // Guard locks are curved across their width (LOD0): a lock, not a chip, from every side.
      fold: o.lod === 0 ? 0.6 : 0,
      // The coat lies along the body where the body holds it up (back, flanks), hangs under it.
      hug: 0.6,
      sink,
    },
  ];
}

/** Fur cards over a body mesh (world space), or null at LOD2 or for a non-fur surface. */
export function creatureFur(
  body: Mesh,
  b: Bones,
  spec: CreatureSpec,
  o: FurOptions,
): CreatureFur | null {
  if (o.lod === 2 || (spec.surface ?? 'fur') !== 'fur') return null;
  defineMaterial(CREATURE_MATERIALS.fur_clumps);
  const scale = Math.max(0.3, (spec.coat ?? 0.02) / 0.03);
  const zones = furZones(b, spec.family);
  /** Strongest zone membership at p (0..1) and its guard length. */
  const inZone = (p: Vec3): { w: number; len: number } => {
    let best = { w: 0, len: 0 };
    for (const z of zones) {
      const d = Math.hypot(p[0] - z.at[0], Math.abs(p[1]) - Math.abs(z.at[1]), p[2] - z.at[2]);
      const w = Math.max(0, 1 - (d / z.radius) ** 2);
      if (w > best.w) best = { w, len: z.length };
    }
    return best;
  };
  // Legs below the elbow carry short, tight fur.
  const elbowZ = b.legs.find((l) => l.name === 'fore')?.joints[1]?.[2] ?? 0;
  const leg = (p: Vec3): number => (elbowZ > 0 ? smooth(elbowZ * 0.55, elbowZ * 1.05, p[2]) : 1);
  const len = (p: Vec3, n: Vec3): number => {
    const z = inZone(p);
    const coat = FLANK + (BACK - FLANK) * smooth(0.35, 0.85, n[2]);
    const body = Math.max(coat, z.len * z.w + coat * (1 - z.w));
    return scale * (LEG + (body - LEG) * leg(p));
  };
  const flow = hairFlow(body, chainSeed(furChains(b), { gravity: 0.35 }));
  // One pass per layer (zone rng forks are per name, so the cards match a combined pass): the
  // short undercoat needs 2 quads at LOD0, the long guard hair 3.
  const outs = layers(o, scale, len, (p) => (0.6 + 1.6 * inZone(p).w) * (0.15 + 0.85 * leg(p))).map(
    (z) =>
      hairCards({
        surface: body,
        flow,
        zones: [z],
        rng: o.rng.fork('fur'),
        segments: o.lod === 0 && z.name === 'guard' ? 3 : 2,
        ...(o.field ? { field: o.field } : {}),
      }),
  );
  return {
    mesh: merge(outs.map((x) => x.mesh)),
    zones,
    roots: outs.flatMap((x) => x.roots),
    counts: Object.assign({}, ...outs.map((x) => x.counts)) as Record<string, number>,
  };
}
