# 014 — Neural outputs are cached inputs, committed with the recipe

Status: accepted
Date: 2026-11-15

## Context
Models (image, mesh, texture, rig, motion, hair, score) can make assets more realistic, but a GPU run
is not reproducible across drivers and hardware, and CI has no GPU. Two caches grew apart:
[08-neural-adapters](../idea/08-neural-adapters.md) says `refine` commits `.ts23d/neural/`, while
[22-ai-finish](../idea/22-ai-finish.md) caches finish results in the gitignored `.ts23d/finish/`.
A build then depends on whose machine ran the model.

## Decision
1. A model output is an **input** to the build, never a build step. It is cached by content hash
   and **committed** under `recipes/<name>/neural/<key>/` (outputs + `record.json`: model, licence,
   weights hash, request, output hashes, server version).
2. The cache is capped at **8 MB per recipe**.
3. **CI is offline.** A cache miss falls back to the CPU tier and emits a `T3D_NEURAL_MISSING`
   notice; it is an error only with `--require-neural`.
4. Every output passes task validation before use (`T3D_NEURAL_OUTPUT_INVALID`).
5. This **supersedes** the split between `.ts23d/neural` and `.ts23d/finish`: both move to the
   recipe cache. The cache text in idea docs 08 and 22 is superseded by this record.

## Alternatives considered
- **Run models in `t3d build`** — why not: non-deterministic, needs a GPU, breaks "same source + seed
  = same bytes".
- **Gitignored local cache** — why not: other machines and CI cannot reproduce the asset; the CPU
  and GPU variants would diverge silently.
- **Fail the build on a cache miss** — why not: a user without a GPU could not build any recipe that
  ever used a model; the CPU tier must always build.

## Consequences
- Easier: GPU variants rebuild byte-identically anywhere; CI never needs a GPU or network.
- Harder: the repository carries binary outputs (bounded by the 8 MB cap); regeneration is explicit.
- Revisit when: model outputs become bit-reproducible across hardware, or the cap proves too small
  for the flagship set.
