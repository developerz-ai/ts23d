# 013 — Skinned meshes: one draw per skinned body, linear-blend weights, baked motion

Status: accepted
Date: 2026-11-15

## Context
Until now every moving thing is a rigid part on a pivot with a baked `Motion` (the `run` clip).
Creatures and characters cannot bend that way: a neck, a spine, a tail and a jaw deform. glTF 2.0
expresses deformation as skins (`JOINTS_0` / `WEIGHTS_0`, ≤ 4 influences per vertex in the core
attribute set) plus morph targets. Engines differ in what else they support (dual-quaternion
skinning, runtime IK, spring bones), and ts23d ships assets, never runtime code.

## Decision
1. A skeleton is part of the IR: `ctx.bone(name, { parent?, head, tail, limit? })` in the asset
   frame (metres, Z up); duplicate names, unknown parents and cycles are `T3D_RECIPE_INVALID`.
2. **One draw per skinned body.** A skinned asset is one skinned mesh (plus any rigid parts);
   `budget.bones` caps the bones, **default 64**; over the cap is `T3D_SKIN_INVALID`.
3. A mesh carries `joints` + `weights` (exactly 4 per vertex, both or neither) and optional `morphs`
   (displacements per vertex). Weights must sum to 1 and **must look right under linear blend
   skinning**; no reliance on dual-quaternion skinning.
4. Springs, IK and gaits are **baked to keys** (named `Clip`s of tracks on bones or parts), never
   evaluated at runtime. A part's existing `Motion` still exports as the `run` clip; recipes may not
   declare a clip named `run`.

## Alternatives considered
- **Rigid parts only** — why not: organic forms crease and gap at every joint; the result never
  reads as a living body.
- **Dual-quaternion skinning** — why not: not in core glTF; engines that lack it would show
  different deformation from the one QA judged.
- **Runtime springs / IK constraints** — why not: engine-specific runtime code; contradicts
  "generate assets, not engines".
- **More than 4 influences (JOINTS_1)** — why not: optional in glTF, unsupported or slow in many
  engines, and rarely needed with good bone placement.

## Consequences
- Easier: creatures and characters bend, breathe and walk in any glTF engine.
- Harder: deformation needs its own QA (volume, self-intersection, stretch at joint limits) and the
  export path grows skins, inverse bind matrices, morph targets and named clips.
- Revisit when: a glTF extension for dual-quaternion or corrective skinning is broadly supported.
