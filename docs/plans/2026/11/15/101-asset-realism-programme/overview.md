# 101 — Asset realism programme: CPU-first, GPU-boosted

## Goal
After this plan the flagship assets (wolf, amur_tiger, dragon, human/elf/goblin/orc heads) score
**≥ 8.5 / 10 on a calibrated critique** and the gate enforces it. Every asset still builds byte-
identical with no GPU (CPU tier). A user who plugs in any model through a `NeuralAdapter` gets a more
realistic version of the same recipe (GPU tier), cached by content hash so CI never needs a GPU.

## Roadmap
| Line | Milestone | Item | Effect |
|---|---|---|---|
| 96, 134, 303 | M2 / M5 / M6 | `photoMatch`, `--ref` overlays, camera solve | shipped by 02 |
| 156–157 | Autonomy | critique gate warn-only until 2027-01-15 | calibrated + enforced for flagships by 03 |
| 258 | Geometry maths | C2 blend kernels + fairing | 04 |
| 120, 232 | M4 / Surfaces | bones as parts, fur/feather cards, hair flow, hair cards | 05, 06, 07 |
| 261, 69 | Geometry maths / M2 | LSCM UVs; KTX2 | LSCM in 08; KTX2 stays planned |
| 249, 276, 132 | Gaps / Engines / M5 | skinning ≤ 4 influences, morph targets, deformation poses | 09, 10 |
| 138 | M5 | `localGenerator` HTTP adapter | superseded by `NeuralAdapter` (13) |
| 251, 212, 296, 209, 211 | Gaps / World / Real data | set coherence, OSM city, instancing | 16 |
| new | Light and surface | path-traced hero (`--quality path`) | 12 |
| new | Autonomy | concept sheets (`t3d concept`) | 15 |

## Decisions (owner delegated all; each becomes an ADR in slice 01)
| ADR | Decision |
|---|---|
| 012 | Opt-in per-asset **hero texture tier**: LOD0 only, one extra material, baked from a finer field; shared trim sheet stays the default |
| 013 | **Skinned meshes**: one draw per skinned body; `budget.bones` (default cap 64); weights must look right under linear blend (no dual-quaternion reliance); springs/IK are baked to keys, never runtime |
| 014 | **Neural outputs are cached inputs**, committed under `recipes/<name>/neural/<key>/` with `record.json`; size cap 8 MB per recipe; CI is offline; cache miss = CPU-tier fallback + `T3D_NEURAL_MISSING` notice, an error only with `--require-neural`. Supersedes the `.ts23d/neural` vs `.ts23d/finish` split |
| 015 | **Models are the user's choice** through adapters; licence is recorded, never gated, except: this repo's committed outputs must use a model whose licence allows publishing outputs. OSM data pinned with ODbL attribution; assets are Produced Works |
| — | Not built: shell fur (glTF cannot express it; cards + anisotropy instead), Gaussian-splat models as assets (not meshes) |

## Falsified
| Claim | Where | Found |
|---|---|---|
| Critique 6.0 for human_head is honest | `recipes/human_head/out/human_head/critique.json` | hero shows long thick neck, eyes forward of the orbits, helmet hair; a calibrated scale must read ~3–4 |
| "8³-cell block" | `src/primitives/sdf-grid.ts:3` | `BLOCK = 4` at :26 |
| Neural cache is committed | `docs/idea/08-neural-adapters.md:67` | `refine` says commit `.ts23d/neural`, finish uses gitignored `.ts23d/finish` (`.gitignore:14`); ADR 014 settles it |
| Creature emits named bones | roadmap :120 open | true: `creature.ts:109–168` emits only body/head/eyes/claws; bones in `creature-bones.ts` are discarded |
| A path tracer exists | — | `src/render/beauty.ts` is a rasteriser; no BVH in render (`src/qa/contact-bvh.ts` only) |
| glTF skins / morphs / instancing | — | none written anywhere in `src/export` |
| `CRITIQUE_MINIMUM = 8` is enforced | `src/qa/critique.ts:45` | `scripts/lib/critique.ts:14` `CRITIQUE_MODE='warn'` |

## Coordinator-owned files (no slice edits them)
`src/index.ts` · every `src/<module>/index.ts` barrel · `src/qa/gates.ts` (`DEFAULT_GATES`) ·
`package.json` · `docs/plans/roadmap.md` · `CHANGELOG.md`. Slices list the exports / gate entries
they need in `## Change`; the coordinator adds them between waves.

## Slices
| Wave | Slice | One line |
|---|---|---|
| 1 | [01-core-contracts](01-core-contracts.md) | error codes, skeleton/clip/skin IR, budget fields, ADRs 012–015 |
| 1 | [02-reference-match](02-reference-match.md) | reference fingerprints, `photoMatch` + camera solve, `silhouetteIoU` |
| 1 | [03-critique-calibration](03-critique-calibration.md) | golden set, calibrated score, ratchet, enforce ≥ 8.5 on flagships |
| 1 | [04-sculpt-engine](04-sculpt-engine.md) | C2 kernel, crease/clay strokes, detail regions, fairing |
| 2 | [05-creature-forms](05-creature-forms.md) | muscle/bone trunk, neck into skull, bones as named parts |
| 2 | [06-head-forms](06-head-forms.md) | skull planes, neck, orbits, jaw; four head recipes rebuilt |
| 2 | [07-hair-fur-cards](07-hair-fur-cards.md) | surface flow field, fur/guard-hair/hair/beard cards, strand atlas |
| 2 | [08-texture-maps](08-texture-maps.md) | field maps (curvature/cavity/thickness/AO), LIC fur texture, measured roughness, LSCM |
| 3 | [09-skinning-export](09-skinning-export.md) | weights from bone fields, glTF skins, morph targets, named clips |
| 3 | [10-motion-deform-qa](10-motion-deform-qa.md) | procedural gait, baked springs, deformation checks |
| 3 | [11-hero-bake-tier](11-hero-bake-tier.md) | field → LOD0 normal/AO/height bake, hero material |
| 3 | [12-path-tracer](12-path-tracer.md) | deterministic CPU path tracer with SSS + fur lobes |
| 4 | [13-neural-adapters](13-neural-adapters.md) | `NeuralAdapter` per task, `t3d-neural/1` HTTP, config, recipe cache |
| 4 | [14-reference-server](14-reference-server.md) | example Python server with model plug-ins (not shipped in the package) |
| 4 | [15-neural-in-recipes](15-neural-in-recipes.md) | mesh-as-field, texture transfer, motion, hair, `t3d concept` |
| 4 | [16-scale](16-scale.md) | style bible, set coherence, scene budgets, OSM city, instancing |
| 5 | [17-flagships-showcase](17-flagships-showcase.md) | flagship recipes to ≥ 8.5, GPU variants, site CPU/GPU toggle |
| 5 | [18-docs-release](18-docs-release.md) | docs true to code, roadmap ticks, release, Pages |

## Done when
- `bun run verify` green on the CPU tier, no GPU on the machine.
- `calibratedScore` ≥ 8.5 for each flagship, enforced by the `recipes` step; no other recipe's
  calibrated score drops more than 0.5 below `critique-baseline.json`.
- A recipe built with `t3d.config.ts` pointing at the reference server produces a cached GPU variant;
  deleting the GPU and rebuilding gives byte-identical output from the cache.
- Release published; GitHub Pages gallery shows CPU and GPU variants with model credits.

## Risks / open questions
- **Scope.** Weeks of work. Ship a release after wave 2 (forms + fur + measurement) so improvement is visible early; waves 3–5 follow.
- **Calibration honesty.** If the golden set is small, scores can be overfitted. Slice 03 holds leave-one-out Spearman ≥ 0.7 and keeps the golden metric vectors in the repo.
- **Re-render churn.** C2 kernel and trunk rebuild change most committed outputs; run `bun run shots` once per wave, not per slice.
- **CI time.** Path tracer only for critique renders of stale recipes, capped resolution; 12-shard budget < 5 min.
- **GPU reproducibility.** Model outputs differ across drivers; that is why they are cached inputs, never build steps.
- **Neutral positioning.** Docs and gallery never compare against named products.
