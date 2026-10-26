// Building helpers: masses, then details. A facade is a split-grammar line per floor and side;
// `win`/`door`/`arch` slots become inset glass/door panels, everything else stays wall.

import type { BuildContext, Vec3 } from '../core/index.ts';
import { split } from '../grammar/index.ts';
import { box } from '../primitives/index.ts';

export type Side = 'front' | 'back' | 'left' | 'right';

export interface FacadeOptions {
  readonly prefix: string;
  /** Centre of the mass's base. */
  readonly at: Vec3;
  /** Footprint width (X) and depth (Y) of the mass this facade wraps. */
  readonly footprint: readonly [number, number];
  readonly floors: number;
  readonly floorHeight: number;
  /** Grammar per floor; the same line for every floor unless `ground` overrides floor 0. */
  readonly grammar: string;
  readonly ground?: string;
  readonly sides: readonly Side[];
  readonly glass: Vec3;
  readonly frame?: Vec3;
  /** Window height as a fraction of the floor. */
  readonly windowRatio?: number;
}

const OPENINGS = new Set(['win', 'door', 'arch', 'shop']);

export function facade(ctx: BuildContext, o: FacadeOptions): void {
  const [w, d] = o.footprint;
  const ratio = o.windowRatio ?? 0.6;
  const depth = 0.08;
  for (const side of o.sides) {
    const along = side === 'front' || side === 'back' ? d : w;
    for (let f = 0; f < o.floors; f++) {
      const line = f === 0 && o.ground ? o.ground : o.grammar;
      const z = o.at[2] + f * o.floorHeight;
      split(line, along).forEach((slot, i) => {
        if (!OPENINGS.has(slot.symbol) || slot.size < 0.2) return;
        const isDoor = slot.symbol === 'door' || slot.symbol === 'shop';
        const h = isDoor ? o.floorHeight * 0.85 : o.floorHeight * ratio;
        const sill = isDoor ? 0 : (o.floorHeight - h) / 2;
        const c = slot.start + slot.size / 2 - along / 2;
        const inset = slot.size * 0.85;
        const pos: Vec3 =
          side === 'front'
            ? [o.at[0] + w / 2, o.at[1] + c, z + sill]
            : side === 'back'
              ? [o.at[0] - w / 2, o.at[1] - c, z + sill]
              : side === 'left'
                ? [o.at[0] - c, o.at[1] + d / 2, z + sill]
                : [o.at[0] + c, o.at[1] - d / 2, z + sill];
        const size: Vec3 =
          side === 'front' || side === 'back' ? [depth, inset, h] : [inset, depth, h];
        ctx.part(
          `${o.prefix}_${side}_${f}_${i}`,
          box({
            size,
            at: pos,
            color: isDoor ? (o.frame ?? o.glass) : o.glass,
            strip: 'glass',
            omit: ['bottom'],
          }),
        );
      });
    }
  }
}

export interface SetbackTier {
  readonly footprint: readonly [number, number];
  readonly floors: number;
}

/** Stack of shrinking masses (Empire State, Chrysler-style towers). Returns the top z. */
export function setbacks(
  ctx: BuildContext,
  o: {
    prefix: string;
    tiers: readonly SetbackTier[];
    floorHeight: number;
    color: Vec3;
    grammar: string;
    glass: Vec3;
    detail: boolean;
  },
): number {
  let z = 0;
  o.tiers.forEach((t, i) => {
    const h = t.floors * o.floorHeight;
    ctx.part(
      `${o.prefix}_${i}`,
      box({
        size: [t.footprint[0], t.footprint[1], h],
        at: [0, 0, z],
        color: o.color,
        strip: 'stone',
        omit: i === 0 ? ['bottom'] : [],
      }),
    );
    if (o.detail)
      facade(ctx, {
        prefix: `${o.prefix}_${i}_win`,
        at: [0, 0, z],
        footprint: t.footprint,
        floors: t.floors,
        floorHeight: o.floorHeight,
        grammar: o.grammar,
        sides: ['front', 'back', 'left', 'right'],
        glass: o.glass,
      });
    z += h;
  });
  return z;
}
