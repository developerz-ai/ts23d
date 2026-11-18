// The body-plan contract: bodies the creature kind cannot describe (a shark, an octopus, a
// many-necked hydra) as a tree of bone chains. A recipe writes a BodyPlanSpec; `bodyPlan`
// (body-plan.ts) resolves it to a BodyPlan; the mesh, skin and motion builders all read that.
// Types only, so those builders share one definition. Asset frame: metres, Z up, +X front.

import type { Bone, Vec3 } from '../core/index.ts';

/** Copies of one chain: mirrored across y = 0, or spaced round `axis` through `about`. */
export type ChainRepeat =
  | { readonly kind: 'mirror' }
  | {
      readonly kind: 'radial';
      readonly count: number;
      readonly axis: Vec3;
      readonly about: Vec3;
      /** Turn of the first copy from the authored path, radians (0). */
      readonly start?: number;
    };

/** One point of a chain's skin, handed to `relief` and `tint`. Asset frame, before relief. */
export interface SurfacePoint {
  /** Arc fraction, 0 root to 1 tip. */
  readonly u: number;
  /** Round the section, radians: 0 on +`bend` (up on a level chain), π/2 on +`pitch`. */
  readonly angle: number;
  /** Arc distance from the root, metres. */
  readonly s: number;
  /** Section radius here, metres. */
  readonly radius: number;
  /** The chain copy: `arm_3`, `fin_l`. */
  readonly chain: string;
  /** LOD being built: a far skin wants broad colour, not detail its vertices cannot hold. */
  readonly lod: 0 | 1 | 2;
  readonly p: Vec3;
  readonly n: Vec3;
  /** Where the swept skin was before a fillet moved it; set only on a filleted point. A membrane
   *  anchored here stays rooted inside the fillet instead of riding its folds. */
  readonly swept?: Vec3;
}

/** Skin resolution of one chain per LOD; omitted entries keep the kind's default. */
export interface ChainDetail {
  /** Rings per link. */
  readonly rings?: readonly [number, number, number];
  /** Sides per ring. */
  readonly sides?: readonly [number, number, number];
}

export interface ChainSpec {
  /** snake_case. Bones: `<name>_<i>`; mirrored `<name>_l_<i>` / `_r_`; radial `<name>_<k>_<i>`. */
  readonly name: string;
  /** Centreline stations, root first (a trunk runs head → tail). At least 2. */
  readonly path: readonly Vec3[];
  /** Half-width at each station: one per `path` entry, metres. */
  readonly radius: readonly number[];
  /** Bones along the path, spaced by arc length unless `bias` moves them. */
  readonly links: number;
  /** Over 1 packs links toward the tip, where a swimming wave bends most (1). */
  readonly bias?: number;
  /** Height ÷ width of the section (1 = round). */
  readonly flatten?: number;
  /** Chain and link this one hangs from; omitted only on the root chain. */
  readonly parent?: { readonly chain: string; readonly link: number };
  readonly repeat?: ChainRepeat;
  /** Fillet radius into the parent's skin, metres: the two skins meet with no crease line. */
  readonly blend?: number;
  /** Chain names this one also fillets into, at `blend` (necks sharing a shoulder). */
  readonly blendWith?: readonly string[];
  /** Outward offset of the skin, metres: muscle, ridges, warts. Normals follow it. */
  readonly relief?: (q: SurfacePoint) => number;
  /** Final skin colour, linear RGB, from the countershaded `base`. */
  readonly tint?: (q: SurfacePoint, base: Vec3) => Vec3;
  readonly detail?: ChainDetail;
  /** Mirrored repeats of the material strip round the section (1), for scales on a wide body. */
  readonly uvBands?: number;
  /** Pull the inside of tight bends in so the section never folds over itself (a knee, a curl). */
  readonly antiFold?: boolean;
  /** Chains whose bones this skin may also follow: leaf ring joints of a pulsing mantle. */
  readonly weightWith?: readonly string[];
  /** false: bones only, the recipe's `detail` supplies this chain's surface (a sculpted head). */
  readonly skin?: boolean;
}

export interface BodyPlanSpec {
  readonly name: string;
  /** Length along the trunk, metres: the `L` every motion number is a fraction of. */
  readonly length: number;
  /** The chains, parents before children; the first is the root chain. */
  readonly chains: readonly ChainSpec[];
}

/** One resolved bone and how motion turns it. Axes are unit vectors in the asset frame. */
export interface PlanLink {
  readonly bone: Bone;
  /** Arc position of the bone's head on its chain: 0 at the root, under 1 at the last bone. */
  readonly s: number;
  /** Rest length of the bone, metres. */
  readonly length: number;
  /** Rotation axis of the main bend (a fish's side-to-side). */
  readonly bend: Vec3;
  /** Rotation axis of the bend across it (a fish's up-and-down). */
  readonly pitch: Vec3;
  /** The bone's own direction: the twist axis. */
  readonly twist: Vec3;
}

/** One chain copy. `copy` is 'l' / 'r', the radial index, or null for a single chain. */
export interface PlanChain {
  /** The bone prefix: `arm_3`, `fin_l`, `spine`. */
  readonly id: string;
  /** The ChainSpec it came from. */
  readonly spec: string;
  readonly copy: 'l' | 'r' | number | null;
  readonly links: readonly PlanLink[];
  /** Arc length of the chain, metres. */
  readonly length: number;
}

export interface BodyPlan {
  readonly name: string;
  readonly length: number;
  /** Every bone, parents first: what `ctx.bone` receives. */
  readonly bones: readonly Bone[];
  readonly chains: readonly PlanChain[];
  /** The root chain's first bone: root motion goes on it. */
  readonly root: string;
  /** The spec it was resolved from: the mesh and skin read its radii. Set by `bodyPlan`. */
  readonly spec?: BodyPlanSpec;
}
