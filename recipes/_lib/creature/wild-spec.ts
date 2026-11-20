// What a recipe hands `defineWildCreature` (wild.ts): the animal's wear story, colour blocks the
// far mesh loses, its coat and groom layers, locks, the box no card may leave, whiskers, an ear
// nick, the coat's sheen and whether the fur cards carry the wear themselves (`cardWear`).

import type { CreatureInfo, Lod, Vec3 } from '@developerz.ai/ts23d';
import type { CardKeep } from './wild-marks.ts';
import type { Locks, WearSpec } from './wild-paint.ts';
import type { CoatOptions, GroomLayer, WhiskerOptions } from './wild-parts.ts';

export interface BasePoint {
  /** World point and normal of the vertex, its colour so far. */
  readonly p: Vec3;
  readonly n: Vec3;
  readonly c: Vec3;
  readonly lod: Lod;
  /** Part name without the prefix: body, fur, head, head_fur, jaw, claws. */
  readonly part: string;
}

export interface Wild {
  /** Wear layers; a function when they are placed from the skeleton (leg heights, flank zones). */
  readonly wear: WearSpec | ((info: CreatureInfo) => WearSpec);
  /** Coat colour corrections before wear (e.g. LOD2 colour blocks the coarse mesh loses). */
  readonly base?: (info: CreatureInfo) => (q: BasePoint) => Vec3;
  /** A dense short card layer over the body (LOD0/1), merged into the kind's `fur` part. */
  readonly coat?: (info: CreatureInfo) => CoatOptions;
  /**
   * The whole coat placed by the recipe (set `cards: false` on the spec): body layers in world
   * space, head layers and the head's `comb` in head-local space (+X to the nose, origin at the
   * atlas). Called per LOD: the recipe thins or swaps layers for the far meshes.
   */
  readonly groom?: (
    info: CreatureInfo,
    lod: Lod,
  ) => {
    readonly body?: readonly GroomLayer[];
    readonly head?: readonly GroomLayer[];
    readonly comb?: (p: Vec3) => Vec3;
    /**
     * The `groom` body layers only, applied as they are grown (|y| ≤ `y`, z ≤ `z`, metres). The
     * groom's head layers are not boxed; the top-level `box` still holds the body's whole `fur`.
     */
    readonly box?: { readonly y?: number; readonly z?: number };
  };
  /**
   * Clumped locks painted on the skin and the cards along the coat's lie (LOD0/1; the far mesh's
   * cells are wider than a lock). Without it the coat between the cards is a smooth shell.
   */
  readonly locks?: Locks;
  /**
   * No card of the `fur` part may pass |y| ≤ `y`, z ≤ `z` (metres, asset frame): the kind's own
   * body cards, the `coat` layer and the `groom` body layers alike. The kind's own head cards
   * (`head_fur`) are held to `y` only; the `groom` head layers are not boxed. A stray lock does not
   * grow the animal past its sourced width or height.
   */
  readonly box?: { readonly y?: number; readonly z?: number };
  readonly whiskers?: WhiskerOptions;
  /** Nick one ear: 1 = left, −1 = right. */
  readonly nick?: 1 | -1;
  /** How far the nick cuts in, × the ear height (default 0.32; a thin, narrow ear wants less, or
   *  the tip above the notch is left on a stalk). */
  readonly nickDepth?: number;
  /**
   * Sheen of the coat (KHR_materials_sheen on body, head and jaw): the soft rim a fur coat shows
   * against the light, in the guard hairs' tip colour, linear and faint (≈ 0.1: a strong sheen
   * hazes the whole coat and flattens the wear). Omitted = the plain strip's response.
   */
  readonly sheen?: Vec3;
  /**
   * Wear carried by the fur cards themselves (opt-in). Without it a card is painted per vertex
   * where it hangs, so it samples a stain in the air above the skin and hides the wear painted
   * under it. With it every card (the kind's, the `coat` layer, the groom's) takes its colour from
   * the skin under its root, and keeps this share of its length where the coat is caked with
   * mud, matted, or parted by a scar (e.g. `{ mud: 0.6, matted: 0.5, scar: 0.15 }`).
   */
  readonly cardWear?: CardKeep;
  /**
   * Value lift on every card vertex (the `fur` and `head_fur` parts, LOD0/1), applied last and
   * clamped to linear 1. The path-traced hero shades a card with the strand lobes, whose diffuse
   * term returns about 0.7 of a Lambertian skin's light, and the strand atlas averages ≈ 0.9: a
   * card coloured like the skin under it renders ≈ 0.6 of that skin's value, so a coat whose skin
   * shows between the cards reads as a hide stippled with dark dashes (D481). ≈ 1.3–1.5 brings
   * the cards back to the coat's value. Omitted = 1.
   */
  readonly cardLift?: number;
  /** Ground darkening band as a share of the shoulder height (default 0.3) and its strength. */
  readonly ground?: { readonly band?: number; readonly strength?: number };
}
