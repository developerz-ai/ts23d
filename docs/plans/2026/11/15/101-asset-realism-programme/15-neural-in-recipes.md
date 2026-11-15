# 15 — Hybrid recipes: neural outputs inside code-built assets (core ctx, primitives, finish, cli)

Rule: code owns skeleton, measures, rig and QA; a model may supply surface, texture, motion, hair or concept images. Without the cache the recipe builds its CPU version.

## Files
| Path | State | Why |
|---|---|---|
| `src/core/neural-ctx.ts` + `.test.ts` | new | `ctx.neural(task, req)` → cached result or `null`; reads from a provider the CLI injects (like `provideImports`) |
| `src/primitives/sculpt-mesh-field.ts` + `.test.ts` | new | mesh → sculpt edit: generalised winding number for sign + BVH unsigned distance, sampled to a quantised int16 brick SDF, Lipschitz-clamped; aligned to skeleton landmarks by a similarity fit |
| `src/finish/neural-texture.ts` + `.test.ts` | new | multi-view projection (default 12 views around the turnaround, per-part masks, visibility-weighted blend) or a model texture → our atlas by closest-point transfer; de-light by dividing by baked AO/irradiance; keep high-pass only over recipe colours (palette QA still passes) |
| `src/kinds/neural-motion.ts` + `.test.ts` | new | motion tracks → `Clip`, resampled to whole cycles, foot-locked by `gait.ts` IK (10) |
| `src/kinds/neural-hair.ts` + `.test.ts` | new | hair cards → our strand strip + springs baked by `springs.ts` (10) |
| `src/render/silhouette-sheet.ts` + `.test.ts` | new | CPU concept sheet: N seeded variants' silhouettes in a grid with scores |
| `src/cli/concept-cmd.ts` + `.test.ts` | new | `t3d concept <recipe|brief.md>`: CPU silhouette sheet; with an `image` adapter also thumbnails + orthographic turnaround + colour callout into `recipes/<name>/neural/` |
| `src/qa/ref-from-concept.ts` + `.test.ts` | new | turnaround views → `ref.json` (02) for invented assets |
| `src/render/part-masks.ts` + `.test.ts` | new | part-ID masks of the CPU block-out rendered at the concept's solved camera (02) |
| `src/finish/split-parts.ts` + `.test.ts` | new | **split-part generation**: crop the concept per part with those masks (+ margin), send each crop to `mesh`/`texture`, fit each result into its part's box and bone frame, then merge as sculpt fields so seams blend (no manual assembly) |

## Depends on
02, 07, 09, 10, 11, 13.

## Change
- Hybrid pattern in a recipe: `const surf = await ctx.neural('mesh', { image: concept.front, fit })` → `sculpt([...code edits, surf && meshField(surf, { blend: 0.01 })])`.
- `ctx.neural` is sync at compile by reading the pre-filled cache (`t3d neural run` fills it); compile never calls a network.
- Outputs re-validated; proportions/measures gates unchanged, so a model surface that breaks anatomy fails like code would.
- Input-image rules checked before any `mesh` request (`T3D_NEURAL_OUTPUT_INVALID` on our own generated images, notice on user images): plain background (corner flood covers ≥ 30 % of the frame), object fills ≥ 60 % of the frame and is not cropped at the edges, ¾ view for single-image mode. Turnaround mode (front/side/back) is the default, so the back is not guessed.
- Split-part mode (`neural: { split: 'parts' }`) automates the manual community workflow (concept → crop parts → image-to-3D per part → align/merge/repaint in a DCC → rig): we know every part's box and bone from code, so cropping, alignment, seam blending and rigging need no hand work. Per-part crops give the model more pixels per part, which is where the detail gain comes from.

## Tests
Failure first: mesh-field of a sphere mesh gives distance error < cell/2; texture transfer onto a cube reproduces the source within ΔE 3; motion with drifting root gets foot-locked (slide < 1 mm); cache miss returns null and the recipe still builds.

## Checks
`bun test` on the files above · `--only boundaries,determinism,recipes`

## Docs
`docs/idea/08-neural-adapters.md` (hybrid section), concept-artist skill (`t3d concept`), author-recipe skill loop step.

## Done when
`recipes/dragon` (invented) builds from its concept turnaround ref with GPU cache, and identically from cache on a GPU-less machine.
