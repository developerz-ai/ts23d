// The opt-in lock style of scalp cards (`scalpCards({ locks })`, D461): every hair layer becomes
// three — a flat, dark under-layer of wide cards on the `mass` cells (the gaps between locks read
// as depth, not as a pale cap), the layer itself as narrower, denser, clumped cards on the `lock`
// cells (one or two pointed, streaked locks each), and a few lifted flyaways on the `fly` cells
// over the top (LOD0 only: a stray strand is sub-pixel further away). Beards narrow onto the
// `coarse` cells. Same scalp coverage: density rises as width falls. Without `locks` nothing here runs.

import type { StrandKind } from '../material/index.ts';
import type { CardLayer } from './head-cards.ts';

export interface HairLocks {
  /** Lock and beard card width × this, density ÷ it (default 0.5): more, narrower cards (never
   *  under 4 mm wide: brows and lashes keep theirs). */
  readonly narrow?: number;
  /** Under-layer cards per hair-layer card (default 0.4; a layer's own `under` wins; 0 = none). */
  readonly under?: number;
  /** Flyaways per hair-layer card at LOD0 (default 0.02; a layer's own `fly` wins; 0 = none). */
  readonly fly?: number;
}

/** The `hair_locks` cells a layer kind maps to. */
export const LOCK_CELLS: Readonly<Record<CardLayer['kind'], StrandKind>> = {
  hair: 'lock',
  mass: 'mass',
  wisp: 'fly',
  beard: 'coarse',
};

/** Narrowing stops at this card width (m): brows and lashes are already finer than a lock. */
const FINEST = 0.004;

const scaled = (l: CardLayer['length'], k: number): CardLayer['length'] =>
  typeof l === 'number' ? l * k : (p) => l(p) * k;

/** The layers of `layers` in the lock style at `lod`. */
export function lockLayers(layers: readonly CardLayer[], o: HairLocks, lod: number): CardLayer[] {
  const narrow = o.narrow ?? 0.5;
  const out: CardLayer[] = [];
  for (const l of layers) {
    const k = Math.min(1, Math.max(narrow, FINEST / l.width));
    if (l.kind === 'beard') {
      out.push({ ...l, width: l.width * k, density: l.density / k, fold: 0 });
      continue;
    }
    if (l.kind !== 'hair') {
      out.push(l);
      continue;
    }
    const [t0, t1] = l.tone ?? [0.7, 1.15];
    const under = l.under ?? o.under ?? 0.4;
    if (under > 0)
      out.push({
        name: `${l.name}_under`,
        kind: 'mass',
        region: l.region,
        density: l.density * under,
        length: scaled(l.length, 0.85),
        width: l.width,
        lift: Math.min(l.lift ?? 0.25, 0.03),
        bend: 0.9,
        droop: l.droop ?? 0.25,
        roll: 0.05,
        fold: 0,
        tone: [t0 * 0.8, t1 * 0.85],
        hug: 1,
        ...(l.tint ? { tint: l.tint } : {}),
      });
    out.push({
      ...l,
      width: l.width * k,
      density: l.density / k,
      fold: 0,
      clump: Math.max(2, l.clump ?? 1),
    });
    const fly = lod === 0 ? (l.fly ?? o.fly ?? 0.02) : 0;
    if (fly > 0)
      out.push({
        name: `${l.name}_fly`,
        kind: 'wisp',
        region: l.region,
        density: (l.density * fly) / k,
        length: l.length,
        width: l.width * k * 0.7,
        lift: Math.max(0.08, (l.lift ?? 0.25) * 1.5),
        bend: 0.6,
        droop: 0.15,
        roll: 0.5,
        fold: 0,
        tone: [t0 * 1.1, t1 * 1.1],
        hug: (l.hug ?? 0.6) * 0.3,
        ...(l.tint ? { tint: l.tint } : {}),
      });
  }
  return out;
}
