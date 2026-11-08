# 011 — Imported meshes may be decimated; code-built assets stay LOD-gated

Status: accepted
Date: 2026-11-07

## Context
The house rule is "LOD-gate, never decimate": a recipe reads `ctx.lod` and chooses what to emit, so LOD2 keeps the silhouette and the named parts on purpose instead of whatever an edge-collapse leaves. That rule assumes a recipe. An imported mesh — a photogrammetry head, a CC0 MakeHuman/MPFB export, a local generator's output ([21-import](../idea/21-import.md)) — has no recipe: one dense surface, its own UV layout, nothing to gate. Without decimation it cannot meet an LOD1/LOD2 budget at all. Imported surfaces also cannot map onto the shared trim sheet's strips meaningfully (a face's UV layout is not a strip).

## Decision
1. **Decimation is allowed only for imported meshes**: `simplify` (QEM, `src/passes`) runs on what `importGlb` returns. Code-built geometry stays LOD-gated; `simplify` is never a fix for a recipe over budget.
2. **Default material path keeps the one-material rule**: the import's albedo is projected into vertex colour and its UVs replaced with true-scale UVs on one trim-sheet strip (`onSheet`). One material, one draw call.
3. **Opt-in own texture set**: a part may carry its own baked albedo + normal map (`bakeNormals` → `withOwnTextures`), costing one extra material and draw call, recorded in the GLB's `extras.ts23d.ownMaterials` so engines, QA and reviewers see the exception.

## Alternatives considered
- **No decimation; imported meshes ship at one density** — why not: a 60k-triangle head at LOD2 breaks every budget; the import path would be useless for games.
- **Decimate everything, recipes included** — why not: loses the deliberate LOD design (silhouette-first, named parts kept, detail chosen per LOD) that ADR-era recipes rely on; LOD2s get mush.
- **Remesh imports through Blender** ([12](../idea/12-blender-bridge.md)) — why not now: non-deterministic across versions, needs an install; stays an optional, cached input later.
- **Force imported parts onto the trim sheet only** — why not: fine for stylised use (that is the default), but a face loses its baked detail; hero imports need the own-texture option.

## Consequences
- Easier: scans and base meshes become game assets with three LODs, QA and joints to code-built bodies.
- Harder: two LOD philosophies coexist; reviewers must check that `simplify` touches only imported meshes. Assets with own texture sets cost an extra draw call per such part.
- CLAUDE.md "LOD-gate, never decimate" gains one sentence pointing here.
- Revisit when: the CLI/QA can tell imported parts apart automatically (a gate refusing `simplify` on code-built parts), or if a per-asset texture set becomes common enough to warrant a third material path in `/export`.
