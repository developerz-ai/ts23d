# 11 — Hero bake tier (ADR 012): fine field → LOD0 maps (passes + finish)

Rule: an asset may opt into one LOD0 texture set baked from a finer version of its own field; detail moves from triangles into maps.

## Files
| Path | State | Why |
|---|---|---|
| `src/passes/bake-normals.ts` | changed | `:40` high source may be a field: normal = ∇f at the sphere-traced hit from the cage; header no longer imported-only |
| `src/passes/bake-height.ts` + `.test.ts` | new | height/displacement from the same trace |
| `src/finish/hero.ts` + `.test.ts` | new | `heroTier(asset, { size, cell })`: LSCM atlas (08), bake normal + AO + height + field maps (08) + albedo from vertex colour, 4–8 texel dilation |
| `src/finish/hero-qa.ts` + `.test.ts` | new | ray-miss < 1% (`T3D_BAKE_FAILED`), texel density ± 20%, `budget.heroTextures` |
| `src/export/finish-glb.ts` | changed | hero material on LOD0 only; LOD1/2 keep the trim sheet |
| `src/cli/finish-cmd.ts` | changed | `t3d finish --hero` |
| `src/finish/finish.ts` | changed | pass each part's strip height (`graphHeight`) into `deriveMaps` (slice 08 left the detail normal flat until wired) |

## Depends on
01, 04 (detail cells), 08 (LSCM + field maps).

## Change
- Recipe opt-in: `hero: { size: 2048, cell: 0.0015 }`. Fine field evaluated in sparse bricks only near the surface (never meshed).
- Wolf target: LOD0 139k → ≤ 40k triangles with more visible detail.
- Deterministic on CPU (fixed texel order); optional GPU path is a cached adapter result (13), never required.

## Tests
Failure first: cage too tight → ray-miss gate fires; baked normal of a known sphere bump matches analytic within 2°.

## Checks
`bun test src/passes/bake-*.test.ts src/finish/hero*.test.ts` · wolf `t3d finish --hero` then `t3d hero` READ

## Docs
ADR 012 (01); `docs/idea/22-ai-finish.md` hero tier section.

## Done when
Wolf and heads have hero variants whose detail row ≥ 9 predicted.
