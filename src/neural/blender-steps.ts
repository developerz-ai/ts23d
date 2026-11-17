// The Blender step program: a recipe says WHAT to do to a mesh as an ordered, typed list
// (`BlenderStep[]`); `blenderProgram` checks it and returns the canonical `t3d-blender-steps/1`
// JSON bytes the `blender` task takes as its `program` input (named by sha256, so every field is
// in the cache key). examples/blender/tasks/steps/ runs the ops headless. Frame: every coordinate
// in a step is in the ts23d asset frame (metres, Z up, +X front, +Y left); angles are radians.
// The input GLB is read as glTF (Y up, +Z front), which is the same space: asset (x, y, z) =
// glTF (z, x, y). Order rules live in blender-step-order.ts; field rules in blender-step-fields.ts.

import type { NeuralInput, Vec3 } from '../core/index.ts';
import { canonicalJson } from './adapter.ts';
import { normaliseStep } from './blender-step-fields.ts';
import { checkOrder } from './blender-step-order.ts';
import { sha256Hex } from './sha256.ts';

export const BLENDER_STEPS_CONTRACT = 't3d-blender-steps/1';
/** The contract of the JSON report the task returns as its second output. */
export const BLENDER_REPORT_CONTRACT = 't3d-blender-report/1';

/** Where a deform op acts: a height band or a ball, fading out over `feather` metres (0). */
export type BlenderMask =
  | { readonly kind: 'z'; readonly min: number; readonly max: number; readonly feather?: number }
  | { readonly kind: 'sphere'; readonly at: Vec3; readonly r: number; readonly feather?: number };

/** Keep more triangles in a ball (head, paws): about `weight` times the vertex density of the
 *  rest (1..16; calibrated on Blender 5.3's weighted Decimate). Fades out from `r` to 1.5 r. */
export interface BlenderFocus {
  readonly at: Vec3;
  readonly r: number;
  readonly weight: number;
}

export type BlenderBakeMap = 'albedo' | 'normal' | 'ao' | 'roughness';

/** Where a `weights` op acts: a deform mask, an axis-aligned box, or the half-space behind a
 *  plane (the side `normal` points away from). */
export type BlenderWeightMask =
  | BlenderMask
  | { readonly kind: 'box'; readonly min: Vec3; readonly max: Vec3; readonly feather?: number }
  | {
      readonly kind: 'plane';
      readonly point: Vec3;
      readonly normal: Vec3;
      readonly feather?: number;
    };

/** What a `review` step renders: Workbench clay (matcap + cavity), clay with the wireframe, a
 *  sheet of per-bone weight heat maps, the posed frames, a lit textured turnaround. */
export type BlenderReviewView = 'clay' | 'wire' | 'weights' | 'poses' | 'turnaround';

/** One posed frame of a review: `bone` turned `degrees` about its own `axis` (y runs along it). */
export interface BlenderPose {
  readonly bone: string;
  readonly axis: 'x' | 'y' | 'z';
  readonly degrees: number;
}

export type BlenderStep =
  /** Move the mesh: 16 numbers, row-major, column vectors (translation in 3, 7, 11). */
  | { readonly op: 'transform'; readonly matrix: readonly number[] }
  /** Merge by distance `weld` (1e-5 m), drop shells under `minShell` of the faces (0.002), fill
   *  holes up to `fillHoles` edges (64), and with `manifold` (true) drop loose geometry and make
   *  normals consistent. */
  | {
      readonly op: 'clean';
      readonly weld?: number;
      readonly minShell?: number;
      readonly fillHoles?: number;
      readonly manifold?: boolean;
    }
  /** Mirror the `side` ('+') half across the plane normal to `axis` ('y': left ↔ right). */
  | { readonly op: 'symmetrize'; readonly axis?: 'x' | 'y' | 'z'; readonly side?: '+' | '-' }
  /** After `bind` (and the bake): pose the bound mesh from the skeleton it was bound in to the
   *  target rest `to` (asset frame), keep the result as the new rest shape and rest armature, same
   *  weights. Straightens a turned head and evens left and right without mirroring. */
  | {
      readonly op: 'repose';
      readonly to: readonly { readonly name: string; readonly head: Vec3; readonly tail: Vec3 }[];
      /** Then mirror the kept half ('+': the animal's left) over the other, if the reposed
       *  mesh's mirror image lies within `mirrorLimit` metres (0.05) of it over head, neck and
       *  spine; else nothing is mirrored (the report says which). */
      readonly mirror?: '+' | '-';
      readonly mirrorLimit?: number;
    }
  /** Delete the geometry inside the given limbs' capsules (asset frame) and close the stumps: the
   *  far legs of a profile model, before `symmetrize` mirrors the good half over them. */
  | {
      readonly op: 'amputate';
      readonly limbs: readonly (readonly {
        readonly head: Vec3;
        readonly tail: Vec3;
        readonly r: number;
      }[])[];
    }
  /** Cut geometry bridging two limbs that are separate in the animal (a tail fused to the hocks):
   *  each limb is a list of capsules (asset frame, after `transform`); a face holding vertices of
   *  two limbs is deleted, each side capped, and the limbs pushed `gap` metres apart (0.02). Runs
   *  on the source, before `retopo`, whose voxel must stay under `gap` / 1.5. */
  | {
      readonly op: 'unweb';
      readonly limbs: readonly (readonly {
        readonly head: Vec3;
        readonly tail: Vec3;
        readonly r: number;
      }[])[];
      readonly gap?: number;
    }
  /** One watertight surface at `voxel` metres (fuses shells, drops UVs and materials). */
  | { readonly op: 'voxelRemesh'; readonly voxel: number; readonly adaptivity?: number }
  | {
      readonly op: 'smooth';
      readonly iterations: number;
      readonly factor: number;
      readonly kind?: 'laplacian' | 'corrective';
    }
  /** Push vertices along their normals by a procedural field: `strength` metres at most, feature
   *  size `scale` metres; `seed` offsets the field. */
  | {
      readonly op: 'displace';
      readonly strength: number;
      readonly scale: number;
      readonly kind?: 'noise' | 'voronoi' | 'musgrave';
      readonly seed?: number;
      readonly mask?: BlenderMask;
    }
  /** Move vertices `distance` metres along their normals (negative shrinks). */
  | { readonly op: 'inflate'; readonly distance: number; readonly mask?: BlenderMask }
  /** Build a body with no input mesh: a Skin modifier over bone segments (radius r0 → r1). */
  | {
      readonly op: 'skinBody';
      readonly bones: readonly {
        readonly head: Vec3;
        readonly tail: Vec3;
        readonly r0: number;
        readonly r1: number;
      }[];
      readonly subdiv?: number;
    }
  /** Build a body with no input mesh: a metaball union polygonised at `resolution` metres. */
  | {
      readonly op: 'metaballs';
      readonly balls: readonly {
        readonly at: Vec3;
        readonly r: number;
        readonly stiffness?: number;
        readonly negative?: boolean;
      }[];
      readonly resolution: number;
    }
  /** The LOD0 shell at `triangles`; the mesh before it becomes the bake source. Strategy 'shell'
   *  (default) voxel-remeshes first (`voxel` metres, else sized from the target) and reduces that
   *  clean watertight surface, so fur noise and internal layers never reach the collapse; the
   *  detail returns through the normal bake. 'decimate' collapses the surface as it is. `reduce`
   *  'quadriflow' asks for even quads first (falls back to the collapse, reported). */
  | {
      readonly op: 'retopo';
      readonly strategy?: 'shell' | 'decimate';
      readonly reduce?: 'decimate' | 'quadriflow';
      readonly triangles: number;
      readonly voxel?: number;
      /** Closing radius in voxels for a leaky source (a crust with tunnels): dilate, fill, erode.
       *  Absent: 0, 1, 2, 4 are tried until the shell is one filled surface. */
      readonly close?: number;
      /** Voxels the closed shell stays fatter than the source, so sheets thinner than a voxel
       *  (wing membranes, ears, cloth) survive. Absent: 0, then 0.75 when over 1 % of the source
       *  surface is missing from the shell. */
      readonly skin?: number;
      /** Smoothing passes on the voxel shell before it is reduced (0). */
      readonly smooth?: number;
      readonly preserveSymmetry?: boolean;
      readonly focus?: readonly BlenderFocus[];
    }
  /** Fresh UVs: Smart UV Project (`angle` limit, 1.45 rad), or its islands unwrapped with minimum
   *  stretch; projected on a copy smoothed `smooth` times (30) so a noisy surface gives few, large
   *  islands; packed with `margin` (0.003 of the square). */
  | {
      readonly op: 'uv';
      readonly kind?: 'smart' | 'unwrap';
      readonly angle?: number;
      readonly margin?: number;
      readonly smooth?: number;
    }
  /** Cycles source → shell bake at `size`² (2048): maps default ['albedo', 'normal']; 'ao' and
   *  'roughness' fill the ORM map. Rays start `cage` metres outside the shell (2 % of the bbox
   *  diagonal) and reach twice that inward; `margin` px (16). */
  | {
      readonly op: 'bake';
      readonly size?: number;
      readonly maps?: readonly BlenderBakeMap[];
      readonly cage?: number;
      readonly maxRay?: number;
      readonly samples?: number;
      readonly aoSamples?: number;
      readonly margin?: number;
    }
  /** Skin the shell. `from` 'skeleton' (default): to the request's skeleton, by bone heat, else a
   *  voxel proxy + weight transfer. 'source': the input GLB is already rigged (a Meshy humanoid):
   *  its armature and clips are kept, its weights are transferred onto the shell (and so onto
   *  every LOD), and `export` writes the skin and every animation; no skeleton input, no
   *  `transform` in the program. */
  | {
      readonly op: 'bind';
      readonly from?: 'skeleton' | 'source';
      readonly maxInfluences?: number;
      readonly proxyVoxel?: number;
    }
  /** Move a bone's `head` and / or `tail` (asset frame, metres) before `bind`. */
  | { readonly op: 'joint'; readonly bone: string; readonly head?: Vec3; readonly tail?: Vec3 }
  /** Edit one bone's weights after `bind`, inside `mask`: 'assign' sets them to `value` (1),
   *  'scale' multiplies them by `value`, 'smooth' relaxes them `iterations` times (2). The other
   *  bones give way; every vertex is limited and normalised again. */
  | {
      readonly op: 'weights';
      readonly kind: 'assign' | 'smooth' | 'scale';
      readonly bone: string;
      readonly mask: BlenderWeightMask;
      readonly value?: number;
      readonly iterations?: number;
    }
  /** After `bind`: a free chain (tail, ear) gets its own weights. Its skin is what connects to
   *  the vertex nearest `from` (its tip) within `r` metres of `bones` and beyond the cut plane
   *  (`point`, `normal` along the chain): there only `bones` keep weight (the others fade out
   *  over `feather` m, 0.03), elsewhere `bones` lose theirs. Fails when over `maxShare` (0.25) of
   *  the mesh is reached: the chain is fused to the body. */
  | {
      readonly op: 'isolate';
      readonly bones: readonly string[];
      readonly from: Vec3;
      readonly point: Vec3;
      readonly normal: Vec3;
      readonly r: number;
      readonly feather?: number;
      readonly maxShare?: number;
    }
  /** Run `python` (bpy source text) on the working mesh, with `obj`, `source`, `arm`, `bpy`,
   *  `bmesh`, `mathutils` and `np` in scope; `why` says what it fixes and is required. The text
   *  is in the program JSON, so in the cache key; the result is gated like any step. */
  | { readonly op: 'script'; readonly python: string; readonly why: string }
  /** Render what an artist would look at, as PNG outputs after the GLB and the report: `views`
   *  (['clay', 'wire']; 'weights' and 'poses' need a `bind` before), `size` px (1024), `poses`
   *  for the 'poses' view. Changes nothing; may appear more than once. */
  | {
      readonly op: 'review';
      readonly views?: readonly BlenderReviewView[];
      readonly size?: number;
      readonly poses?: readonly BlenderPose[];
    }
  /** Decimated copies named lod1 (and lod2), keeping UVs, maps and weights; each is gated (no new
   *  open edges, no shard faces, same bounds, UVs not collapsed) and fails the job otherwise. */
  | {
      readonly op: 'lods';
      readonly triangles: readonly number[];
      readonly focus?: readonly BlenderFocus[];
    }
  /** Write the GLB (always last); sizes downscale a baked map on the way out. */
  | {
      readonly op: 'export';
      readonly albedoSize?: number;
      readonly normalSize?: number;
      readonly ormSize?: number;
    };

export type BlenderOp = BlenderStep['op'];

/** The steps checked and with every default filled in (what Blender will read). */
export function checkBlenderSteps(steps: readonly BlenderStep[]): readonly BlenderStep[] {
  const out = steps.map((s, i) => normaliseStep(s, i));
  checkOrder(out);
  return out as unknown as readonly BlenderStep[];
}

/** Canonical `t3d-blender-steps/1` JSON bytes of a checked program: the `program` input. */
export function blenderProgram(steps: readonly BlenderStep[]): Uint8Array {
  const doc = { contract: BLENDER_STEPS_CONTRACT, frame: 'asset', steps: checkBlenderSteps(steps) };
  return new TextEncoder().encode(canonicalJson(doc));
}

/** Names JSON bytes (a program, a skeleton) as a request input. */
export const jsonInput = (bytes: Uint8Array): NeuralInput => ({
  sha256: sha256Hex(bytes),
  mime: 'application/json',
});
