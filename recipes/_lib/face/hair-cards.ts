// Card hair for the busts: a recipe's card hairstyle (cap field, comb, layers) → strand cards on
// the shared `hair_clumps` cutout strip as ONE `hair` part (one draw). LOD0 dense, LOD1 ¼ the
// cards ×2 wider, LOD2 a handful of wide cards (`farStyle`) over the sculpted mass, so the far
// head keeps the near LODs' broken outline and tones instead of a smooth cap. Use with the recipe's
// `hairBaseEdits` as the bust's `hair` so the sculpted cap (painted hair colour) sits under the
// cards. `bustHairFields` gives a style the skull scalp (`bustScalp`) for the cap and the finished
// bust the head is meshed from, to root on and collide with; `skullHairline` draws a hairline
// from the skull's own landmarks (`SK`), clear of the ears.

import {
  type BuildContext,
  dmath,
  type Field,
  type Mesh,
  type ScalpCardOptions,
  scalpCards,
  sculptField,
  type Vec3,
} from '@developerz.ai/ts23d';
import { type BustRecipe, bustEdits, bustScalp } from '../bust/bust.ts';
import type { SkullLandmarks } from './skull.ts';

export type CardHairStyle = Omit<ScalpCardOptions, 'lod' | 'rng'>;

export interface CardHairOptions {
  /** Applied to the cards before they are emitted (a bust lifted onto its plinth). */
  readonly move?: (m: Mesh) => Mesh;
  /** The far LOD's style from the near one (default `farStyle`); `false`: no cards at LOD2. */
  readonly far?: false | ((style: CardHairStyle) => CardHairStyle);
}

/** The far LOD's cards from a style: its locks only (no wisps: a stray strand is sub-pixel at
 *  that distance), `density` × as many and `width` × as wide, in the same tones. `keep` names
 *  the layers that stay instead. `cardHair` then meshes them by the LOD1 rule (¼, ×2 wide, flat),
 *  so the defaults leave about 1 card in 16, 3.6 × as wide. */
export function farStyle(
  style: CardHairStyle,
  o: { readonly keep?: readonly string[]; readonly density?: number; readonly width?: number } = {},
): CardHairStyle {
  const keep = o.keep;
  return {
    ...style,
    // The roots' surface at twice the cell: a far card does not need a 4 mm root lattice.
    cell: style.cell * 2,
    layers: style.layers
      .filter((l) => (keep ? keep.includes(l.name) : l.kind !== 'wisp'))
      .map((l) => ({
        ...l,
        density: l.density * (o.density ?? 0.25),
        width: l.width * (o.width ?? 1.8),
      })),
  };
}

/** Emit `part` (default 'hair') as cutout strand cards rooted on the style's cap. `scalpCards`
 *  has no far level (it returns null at LOD2), so the far LOD runs its LOD1 rule on the thinned
 *  `far` style. */
export function cardHair(
  ctx: BuildContext,
  style: CardHairStyle,
  part = 'hair',
  o: CardHairOptions = {},
): void {
  const far = ctx.lod === 2;
  if (far && o.far === false) return;
  const st = far ? (o.far ? o.far(style) : farStyle(style)) : style;
  if (st.layers.length === 0) return;
  const mesh = scalpCards({ ...st, lod: Math.min(ctx.lod, 1), rng: ctx.rng.fork(part) });
  if (mesh) ctx.part(part, o.move ? o.move(mesh) : mesh, { surface: 'cutout' });
}

/** The skull scalp the hair cap is sculpted on (`bustScalp`), and the finished bust (stage 4: skin
 *  with its planes and features, the cap, ears, outfit) the cards root on and fall around: the
 *  head is meshed from that same field, so no root is buried under a stroke the scalp lacks. */
export function bustHairFields(b: BustRecipe, lod: number): { scalp: Field; skin: Field } {
  const opts = { color: b.spec.skin, mirror: 'y' as const };
  return { scalp: bustScalp(b, lod), skin: sculptField(bustEdits(b, 4, lod).edits, opts).field };
}

export interface HairlineShape {
  /** Front hairline (trichion) height above the glabella, metres. */
  readonly front: number;
  /** Hairline height above the nape landmark at the back, metres. */
  readonly nape: number;
  /** Bare skin kept round each ear (root to tip), metres. */
  readonly ear: number;
  /** How far the temples recede: the line climbs this much at the sides of the forehead, metres. */
  readonly temple?: number;
}

const segDist = (p: Vec3, a: Vec3, b: Vec3): number => {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
  const t = Math.min(
    1,
    Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2),
  );
  return dmath.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
};

/** Hairline (≤ 0 where hair grows) from skull landmarks: forehead → crown → nape, temples
 *  receding, never within `ear` of an ear (lobe → top → helix tip), mirrored across Y. */
export function skullHairline(k: SkullLandmarks, s: HairlineShape): Field {
  const g = k.glabella;
  const zF = g[2] + s.front;
  const zB = k.nape[2] + s.nape;
  const span = g[0] - k.occiput[0];
  const wide = Math.abs(k.euryon[1]);
  const lobe = k.earLobe;
  const top = k.earTop;
  const tip = k.earTip;
  return (p) => {
    const t = Math.min(1.2, Math.max(0, (g[0] - p[0]) / span));
    // Temples: the front line climbs toward the sides (an M), fading out behind the ear line.
    const side = Math.min(1, Math.abs(p[1]) / wide);
    const temple = (s.temple ?? 0) * side * side * Math.max(0, 1 - t * 2.5);
    const line = zF + (zB - zF) * t * t + temple;
    const q: Vec3 = [p[0], Math.abs(p[1]), p[2]];
    const ear = s.ear - Math.min(segDist(q, lobe, top), segDist(q, top, tip));
    // Never outside the skull's own width: the back of a long ear's blade is further than `ear`
    // from the lobe → top → tip line, and a lock rooted on it hangs in the air beside the head.
    return Math.max(line - p[2], ear, q[1] - wide - 0.006);
  };
}
