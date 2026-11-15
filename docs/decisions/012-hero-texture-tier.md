# 012 — Opt-in hero texture tier on LOD0; the shared trim sheet stays the default

Status: accepted
Date: 2026-11-15

## Context
The shared trim sheet ([003](003-shared-trim-sheet.md), [008](008-surface-materials.md)) keeps every
asset to one material and batches distant copies, but it cannot carry per-asset surface detail: the
pores of a face, the folds of a hide, the cavity shading of a sculpted creature. Plan 101 sculpts
flagship assets from fine signed-distance fields; that field already holds the detail a texture bake
needs. [010](010-ai-finish-layer.md) and [011](011-imported-meshes-may-be-decimated.md) each opened
one narrow per-asset texture path; code-built hero assets have none.

## Decision
1. A recipe may opt in per asset with `budget.heroTextures: { size: 1024 | 2048 | 4096 }`.
2. The tier is **LOD0 only**: normal, AO and height (and later albedo) are baked from the finer field
   onto LOD0's UVs into **one extra material**. LOD1 and LOD2 keep the trim sheet.
3. Without `heroTextures` nothing changes: the shared trim sheet stays the default for every asset.
4. Bake QA fails the build when the bake misses rays or the cage is too far (`T3D_BAKE_FAILED`),
   when texel density drifts, or when the declared size is exceeded.

## Alternatives considered
- **Per-asset textures on every LOD** — why not: breaks shared-sheet batching for distant copies,
  where the detail cannot be seen anyway (same reasoning as 010).
- **More trim-sheet strips for organic detail** — why not: strips tile; a face or hide is unique
  surface and would repeat visibly.
- **Keep detail in geometry only** — why not: LOD0 triangle budgets cannot hold pore-level relief.

## Consequences
- Easier: hero assets carry baked relief at close range at the cost of one material and draw.
- Harder: assets with the tier cost texture memory; scene budgets (plan 101 slice 16) count it.
  Reviewers check that only hero assets opt in.
- Revisit when: a texture-array / virtual-texture path makes per-asset detail free to batch.
