# 016 — A part may carry its own texture set on every LOD; the trim sheet stays the default

Status: accepted
Date: 2026-11-16

## Context
The shared trim sheet ([003](003-shared-trim-sheet.md), [008](008-surface-materials.md)) keeps an
asset to one material, and [012](012-hero-texture-tier.md) allows one extra baked set on **LOD0
only**. Both assume the surface is built by code. Organic assets are not: measured on 2026-11-16
([plan 101](../plans/2026/11/16/101-organic-model-first/overview.md)), an image-to-3D wolf cleaned,
unwrapped and baked by headless Blender reads as a wolf, while the same model shrink-wrapped onto a
code body with its colour pushed into vertex colour does not. The look of a model-built body lives
in its albedo and normal maps; dropping them at LOD1 and LOD2 swaps the animal for a blob exactly
where most copies are seen. [011](011-imported-meshes-may-be-decimated.md) already treats imported
meshes as the one case with no recipe to gate.

## Decision
1. A part may carry a `TextureSet` (`PartOptions.textures`, `src/core/texture-set.ts`): PNG bytes
   for albedo and optionally normal and ORM, a stable `name`, optional factors and a `credit`. It
   is a first-class IR value: `compile` keeps it at every LOD and `ctx.use` carries it unrenamed.
2. It is **opt-in and counted**: any textured part needs `budget.textureSets: { count, size }`.
   `count` caps the distinct set names; every map is a square power-of-two PNG of at most `size`².
   Parts sharing a name share one material, so one draw per pivot still holds per set.
3. A textured part is plain: `opaque` or `cutout` only, no `paint`, no `finish`. Its UVs address
   its own set; its vertex colour multiplies the albedo (white = unchanged).
4. One name means one set of bytes within an asset. Core reads the PNG header only and compares
   maps by identity, then length and a content key computed once per array.
5. Every violation is `T3D_TEXTURE_INVALID` with the option to drop or the budget line to declare.
6. This supersedes the LOD0-only limit of [012](012-hero-texture-tier.md) for **model-built and
   imported parts only**. Code-built parts keep the trim sheet, and 012 still governs their hero
   bake. Hard-surface assets are untouched.

## Alternatives considered
- **Project the model's colour into vertex colour** (the `wolf_hybrid` route) — why not: at game
  triangle counts vertex colour cannot hold fur or skin detail; this is the measured quality loss.
- **Own textures on LOD0 only, trim sheet below** (extend 012 as is) — why not: a model mesh has no
  trim-sheet UVs and no code-built form to fall back to; LOD1 and LOD2 would need a second, worse
  asset.
- **Pack every asset's maps into a shared atlas** — why not: a per-asset bake at 2048² does not fit
  a shared sheet at usable texel density, and the atlas would change whenever any asset does.
- **Keep it a post-process script** (`scripts/import-textured.ts`) — why not: QA, renderers and
  the manifest never see the textures, so nothing checks or shows what ships.

## Consequences
- Easier: organic assets ship with the surface the model and Blender produced; renderers, the GLB
  writer and QA read one typed value instead of a side channel.
- Harder: each set costs a material, texture memory and repository bytes (plan cap: 12 MB per
  recipe). Passes that merge parts must keep texture sets apart (`mergeToPivots` gains a layer per
  set); texel-density and trim-sheet UV checks must skip or special-case textured parts.
- Revisit when: a texture-array or virtual-texture path batches per-asset maps, or a KTX2 /
  Basis encoder lands and the PNG-only rule can relax.
