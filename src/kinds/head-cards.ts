// Hair and beards as strand-card layers over a sculpted cap (the cap is the dense base layer and
// the LOD2 helmet; the cards break its outline): roots meshed from the cap field, combed by the
// style's flow, optional clumps, and a `collide` solid (face, ears, torso) sampled on a lazy
// lattice so long hair falls around the head, never through it. One `hair_clumps` cutout part.

import type { Mesh, Rng, Vec3 } from '../core/index.ts';
import { CREATURE_MATERIALS, defineMaterial, strandCells } from '../material/index.ts';
import { type CardZone, type FlowSeed, hairCards, hairFlow } from '../passes/index.ts';
import { sdf } from '../primitives/index.ts';
import { type HairLocks, LOCK_CELLS, lockLayers } from './head-locks.ts';

/** One card layer of a hairstyle or beard: where it grows, how dense, how long, how it lies. */
export interface CardLayer {
  readonly name: string;
  /** Atlas cells: hair (locks), wisp (stray strands: flyaways, outline), beard (wiry), mass (an
   *  under-layer: the lock style's dark `mass` cells, the hair cells otherwise). */
  readonly kind: 'hair' | 'wisp' | 'beard' | 'mass';
  /** Negative where the layer grows (a hairline or beardline field). */
  readonly region: (p: Vec3) => number;
  /** Cards per m² at LOD0. */
  readonly density: number;
  readonly length: number | ((p: Vec3) => number);
  readonly width: number;
  readonly lift?: number;
  readonly bend?: number;
  readonly droop?: number;
  readonly roll?: number;
  /** Tone at root and tip (× the hair colour). */
  readonly tone?: readonly [number, number];
  /** Cards per clump sharing a tip (locks; default 1). */
  readonly clump?: number;
  /** V section across the card (`CardZone.fold`; default 0.5: a lock, not a ribbon). */
  readonly fold?: number;
  /** Colour multiplier reached at the tip (hue shift; default none). */
  readonly tint?: Vec3;
  /** How hard the layer lies on the head where it holds the hair up (`CardZone.hug`; default 0.6). */
  readonly hug?: number;
  /** Lock style only (`ScalpCardOptions.locks`): this hair layer's under-layer and flyaway shares. */
  readonly under?: number;
  readonly fly?: number;
}

export interface ScalpCardOptions {
  /** The surface the cards root on (hair cap ∪ skin), negative inside. */
  readonly field: (p: Vec3) => number;
  readonly bounds: readonly [Vec3, Vec3];
  /** Meshing cell of the root surface, metres (≈ 4 mm). */
  readonly cell: number;
  /** Which way the hair lies at a point (`chainSeed`, or a swept-back comb). */
  readonly comb: FlowSeed;
  readonly layers: readonly CardLayer[];
  readonly color: Vec3;
  readonly lod: number;
  readonly rng: Rng;
  /** The whole head and torso (negative inside): long hair falls around it, never through it. */
  readonly collide?: (p: Vec3) => number;
  /** Quads along each card at LOD0 (default 4; long hair 6–8 to drape); LOD1 uses half. */
  readonly segments?: number;
  /** Opt-in lock style (head-locks.ts): narrower, denser, clumped cards over a dark under-layer,
   *  flyaways on top, on the `hair_locks` strip. Omitted: today's cards on `hair_clumps`. */
  readonly locks?: HairLocks;
}

/** A field sampled on a lazy `cell` lattice and blended trilinearly: a whole-bust sculpt is far
 *  too slow to query at every card step, its lattice nodes are shared by neighbouring cards. */
function lattice(f: (p: Vec3) => number, cell: number): (p: Vec3) => number {
  const memo = new Map<string, number>();
  const node = (i: number, j: number, k: number): number => {
    const key = `${i},${j},${k}`;
    let v = memo.get(key);
    if (v === undefined) {
      v = f([i * cell, j * cell, k * cell]);
      memo.set(key, v);
    }
    return v;
  };
  return (p) => {
    const x = p[0] / cell;
    const y = p[1] / cell;
    const z = p[2] / cell;
    const [i, j, k] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const [u, v, w] = [x - i, y - j, z - k];
    let out = 0;
    for (let c = 0; c < 8; c++) {
      const a = c & 1;
      const b = (c >> 1) & 1;
      const d = (c >> 2) & 1;
      out += node(i + a, j + b, k + d) * (a ? u : 1 - u) * (b ? v : 1 - v) * (d ? w : 1 - w);
    }
    return out;
  };
}

/** Strand cards for every layer on the `hair_clumps` strip, or `hair_locks` in the lock style
 *  (surface 'cutout'); null at LOD2. */
export function scalpCards(o: ScalpCardOptions): Mesh | null {
  if (o.lod >= 2) return null;
  const strip = o.locks ? 'hair_locks' : 'hair_clumps';
  defineMaterial(CREATURE_MATERIALS[strip]);
  const layers = o.locks ? lockLayers(o.layers, o.locks, o.lod) : o.layers;
  const root = sdf({ field: o.field, bounds: o.bounds, resolution: o.cell, color: () => o.color });
  const k = o.lod === 0 ? 1 : 0.25;
  const wide = o.lod === 0 ? 1 : 2;
  // A margin (half a card width, ≤ 4 mm) inside the region keeps roots off the hairline edge.
  const zones: CardZone[] = layers.map((l) => ({
    name: l.name,
    density: (p) => (l.region(p) < -Math.min(l.width * 0.5, 0.004) ? l.density * k : 0),
    length: l.length,
    width: l.width * wide,
    lift: l.lift ?? 0.25,
    bend: l.bend ?? 0.8,
    droop: l.droop ?? 0.25,
    roll: l.roll ?? 0.5,
    sink: 0.003,
    cells: strandCells(strip, o.locks ? LOCK_CELLS[l.kind] : l.kind === 'mass' ? 'hair' : l.kind),
    tone: l.tone ?? [0.7, 1.15],
    // LOD1's cards are twice as wide and few: flat (half the triangles, no folded half turned away).
    fold: o.lod === 0 ? (l.fold ?? 0.5) : 0,
    hug: l.hug ?? 0.6,
    ...(l.clump ? { clump: l.clump } : {}),
    ...(l.tint ? { tint: l.tint } : {}),
  }));
  const out = hairCards({
    surface: root,
    flow: hairFlow(root, o.comb),
    zones,
    rng: o.rng.fork('scalp-cards'),
    segments: o.lod === 0 ? (o.segments ?? 4) : Math.max(2, Math.round((o.segments ?? 4) / 2)),
    field: o.field,
    ...(o.collide ? { collide: lattice(o.collide, 0.004) } : {}),
  });
  return out.roots.length > 0 ? out.mesh : null;
}
