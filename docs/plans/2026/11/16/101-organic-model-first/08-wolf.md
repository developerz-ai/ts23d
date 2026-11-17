# 08 — wolf_hybrid, model-first (recipe)

Rule: delete the blend; keep the model.

## Files
`recipes/wolf_hybrid/**` (rewritten: `wolf_hybrid.ts`, `concept.ts`, `surface.ts`, `steps.ts` new, `README.md`, tests; `blend.ts`, `masks.ts`, `ride.ts`, `wrap.ts`, `register.ts`, `head.ts` removed once unused) · `recipes/wolf_hybrid/neural/**` · `recipes/wolf_hybrid/out/**`.

## Depends on
01–07.

## Change
- Chain: existing concept (z-image) → existing mesh (pixal3d, committed 60 k GLB) → `blender` steps: `transform(fit)`, `clean`, `retopo(decimate, budget lod0)`, `uv(smart)`, `bake(albedo 2048, normal 1024, ao)`, `lods`, `export`. Run the bake from the full-resolution lab mesh when present (`~/workspace/lab/neural-models/out/best/wolf_pixal3d_best.glb` → re-commit only what fits the 12 MB cap; record which source was used).
- If the committed concept's turned head defeats the skeleton fit: re-roll the concept with a square neutral stand (GPU, one model at a time), new mesh, same steps.
- Budget: triangles [30000, 10000, 2500]; `textureSets: { count: 1, size: 2048 }`; clips idle, look, walk, trot, gallop.
- Fallback on a miss: the code wolf (unchanged behaviour).
- Loop until QA PASS, then `t3d shot` + `t3d hero`, READ them, visual-reviewer pass against the dossier photos; iterate steps (cage, angle, smoothing) from what is seen.

## Tests
`wolf_hybrid.test.ts`: measures, clip names, texture set present on all LODs with the cache, CPU fallback without it.

## Checks
`bun run t3d build recipes/wolf_hybrid/wolf_hybrid.ts --out out` PASS · `bun run shots wolf_hybrid` · PNGs read.

## Docs
Recipe README (chain, steps, honest state, re-roll).

## Done when
Hero reads as the Pixal3D wolf at 30 k triangles and walks without visible tearing (pose strip read).
