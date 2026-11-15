# 08 — Texture maps: field maps, flow texture, measured roughness, LSCM (passes, material, finish)

Rule: every map is derived from the geometry or the height graph that made it; nothing is guessed from albedo.

## Files
| Path | State | Why |
|---|---|---|
| `src/passes/bake-field.ts` + `.test.ts` | new | per vertex / texel: mean curvature (finite-difference Laplacian of the SDF at 1 cell), cavity (clamp(−κ) blurred), thickness (inward sphere trace / r), AO; fallback `ray-grid.ts` for non-SDF meshes |
| `src/material/tex/lic.ts` + `.test.ts` | new | line-integral convolution node: seeded noise smeared along a flow vector field → strand albedo breakup + strand normal + anisotropy direction |
| `src/material/tex/graph.ts` | changed | register `lic` node |
| `src/finish/maps.ts` | changed | roughness/normal sampled from the strip's height graph (triplanar, world metres) instead of albedo heuristics |
| `src/finish/lscm.ts` + `.test.ts` | new | seams at curvature ridges + part borders, least-squares conformal map via conjugate gradient, shelf pack |
| `src/finish/atlas.ts` | changed | `:1–6` box projection → LSCM charts (box stays as fallback) |
| `src/kinds/creature-tone.ts`, `src/kinds/creature-coat.ts` | changed | drive tone from field maps: cavity darkening, thin-ear translucency tint, dirt pooling, belly wear |

## Depends on
01, 07 (flow field for LIC).

## Change
- `bakeField(mesh, field, { maps: ['curvature','cavity','thickness','ao'] })` → per-vertex channels; at hero tier (11) the same per texel.
- `edgeWear`, `cavity` tex nodes read baked channels when present.
- Export: anisotropy direction texture with `KHR_materials_anisotropy` (already written, `pbr.ts:11`).
- LSCM gate: L2 stretch < 1.25, no overlap (raster test).

## Tests
Failure first: sphere curvature = 1/r ± 2%; flat plane cavity 0; thin plate thickness < thick block; LSCM stretch on a cylinder < 1.05; box fallback still deterministic.

## Checks
`bun test src/passes/bake-field.test.ts src/material/tex/lic.test.ts src/finish/lscm.test.ts src/finish` · `--only determinism,recipes`

## Docs
`docs/idea/11-materials-authoring.md`, `22-ai-finish.md` (LSCM); roadmap :261.

## Done when
Wolf coat shows strand direction and sheen, ears glow thin against light, folds darker; materials ≥ 8 predicted.
