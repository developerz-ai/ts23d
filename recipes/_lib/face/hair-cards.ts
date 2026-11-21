// Card hair for the busts: a recipe's card hairstyle (cap field, comb, layers) → strand cards on
// the shared `hair_clumps` cutout strip as ONE `hair` part (one draw). LOD0 dense, LOD1 ¼ the
// cards ×2 wider, LOD2 a handful of wide cards (`farStyle`) over the sculpted mass, so the far
// head keeps the near LODs' broken outline and tones instead of a smooth cap. Use with the recipe's
// `hairBaseEdits` as the bust's `hair` so the sculpted cap (painted hair colour) sits under the
// cards. `bustHairFields` gives a style the skull scalp (`bustScalp`) for the cap and the finished
// bust the head is meshed from, to root on and collide with; `skullHairline` draws a hairline
// from the skull's own landmarks (`SK`), clear of the ears. `hugStyle` lays a style's cards onto
// the far LODs' hair shell (D585–D589): flat, bent round the skull, never standing off it;
// `hairValue` is the colour a LOD's hair renders, so the LODs can be held to one another.

import {
  type BuildContext,
  type CompiledAsset,
  dmath,
  type Field,
  type Mesh,
  renderBeauty,
  type ScalpCardOptions,
  scalpCards,
  sculptField,
  type Vec3,
} from '@developerz.ai/ts23d';
import { type BustRecipe, bustEdits, bustScalp } from '../bust/bust.ts';
import { segDist } from './relief.ts';
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

/**
 * A style whose cards lie ON the hair (LOD1 and the far LOD's silhouette cards, D585/D586):
 * flat to the root surface (lift ≤ `lift`, pressed down by `hug`, default 1, little roll),
 * `segments` along each so a card bends round the skull instead of leaving it as a straight
 * shard, only the `keep` layers
 * (default every layer but the stray `wisp`s), `density` × as many, `width` × as wide and
 * `length` × as long. `scalpCards` then applies its LOD1 rule (¼ the cards, ×2 wide, half the
 * segments) at LOD1 and LOD2.
 */
export function hugStyle(
  style: CardHairStyle,
  o: {
    readonly keep?: readonly string[];
    readonly density?: number;
    readonly width?: number;
    readonly length?: number;
    readonly lift?: number;
    readonly hug?: number;
    readonly segments?: number;
  } = {},
): CardHairStyle {
  const keep = o.keep;
  const k = o.length ?? 1;
  return {
    ...style,
    ...(o.segments ? { segments: o.segments } : {}),
    layers: style.layers
      .filter((l) => (keep ? keep.includes(l.name) : l.kind !== 'wisp'))
      .map((l) => ({
        ...l,
        density: l.density * (o.density ?? 1),
        width: l.width * (o.width ?? 1),
        length: (p: Vec3) => (typeof l.length === 'number' ? l.length : l.length(p)) * k,
        lift: Math.min(l.lift ?? 0.25, o.lift ?? 0.03),
        roll: Math.min(l.roll ?? 0.5, 0.1),
        hug: o.hug ?? 1,
      })),
  };
}

/** A style without the lock style: today's cards. */
const plain = ({ locks: _locks, ...st }: CardHairStyle): CardHairStyle => st;

/** Emit `part` (default 'hair') as cutout strand cards rooted on the style's cap. `scalpCards`
 *  has no far level (it returns null at LOD2), so the far LOD runs its LOD1 rule on the thinned
 *  `far` style; a lock-style hairdo (`locks`) has no far cards. */
export function cardHair(
  ctx: BuildContext,
  style: CardHairStyle,
  part = 'hair',
  o: CardHairOptions = {},
): void {
  const far = ctx.lod === 2;
  // The lock style (`style.locks`) keeps the far head's hair as the sculpted mass and its
  // hairline (a few wide far cards over it read as chips), unless the recipe asks for far cards
  // (`far`: a long fall the far mass lacks); those are plain wide cards.
  if (far && (o.far === false || (style.locks && !o.far))) return;
  const st = far ? plain(o.far ? o.far(style) : farStyle(style)) : style;
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

/** Hairline (≤ 0 where hair grows) from skull landmarks: forehead → crown → nape, temples
 *  receding, never within `ear` of an ear (lobe → top → helix tip), mirrored across Y. */
export function skullHairline(k: SkullLandmarks, s: HairlineShape): Field {
  const g = k.glabella;
  const zF = g[2] + s.front;
  const zB = k.nape[2] + s.nape;
  const span = g[0] - k.occiput[0];
  const wide = Math.abs(k.euryon[1]);
  const ear = earClear(k, s.ear);
  return (p) => {
    const t = Math.min(1.2, Math.max(0, (g[0] - p[0]) / span));
    // Temples: the front line climbs toward the sides (an M), fading out behind the ear line.
    const side = Math.min(1, Math.abs(p[1]) / wide);
    const temple = (s.temple ?? 0) * side * side * Math.max(0, 1 - t * 2.5);
    const line = zF + (zB - zF) * t * t + temple;
    // Never outside the skull's own width: the back of a long ear's blade is further than `ear`
    // from the lobe → top → tip line, and a lock rooted on it hangs in the air beside the head.
    return Math.max(line - p[2], ear(p), Math.abs(p[1]) - wide - 0.006);
  };
}

/** Negative farther than `d` from either ear (lobe → top → helix tip), mirrored across Y. */
export function earClear(k: SkullLandmarks, d: number): Field {
  return (p) => {
    const q: Vec3 = [p[0], Math.abs(p[1]), p[2]];
    return d - Math.min(segDist(q, k.earLobe, k.earTop), segDist(q, k.earTop, k.earTip));
  };
}

/**
 * The colour the hair renders at a LOD (D587): the mean sRGB (0–255) of the middle third of a
 * narrow (6°) beauty render aimed at `target` from 0.7 m along `dir`, cards over the shell as the
 * strip shows them (their texture and cut-out, the shell's skin strip and finish).
 */
export function hairValue(asset: CompiledAsset, target: Vec3, dir: Vec3): Vec3 {
  const n = dmath.hypot(dir[0], dir[1], dir[2]) || 1;
  const eye: Vec3 = [
    target[0] + (dir[0] / n) * 0.7,
    target[1] + (dir[1] / n) * 0.7,
    target[2] + (dir[2] / n) * 0.7,
  ];
  const size = 90;
  const r = renderBeauty(asset, { eye, target, fovDeg: 6, width: size, height: size });
  const sum = [0, 0, 0];
  let k = 0;
  for (let y = size / 3; y < (2 * size) / 3; y++)
    for (let x = size / 3; x < (2 * size) / 3; x++) {
      const i = y * size + x;
      if ((r.mask[i] ?? 0) < 255) continue;
      for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (r.rgba[i * 4 + c] ?? 0);
      k++;
    }
  const m = Math.max(1, k);
  return [(sum[0] ?? 0) / m, (sum[1] ?? 0) / m, (sum[2] ?? 0) / m];
}
